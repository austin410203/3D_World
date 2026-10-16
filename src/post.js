// post.js - line-art outline post process for the sketch style:
// colour pass (with depth) + normal pass -> edges from depth & normal discontinuities, drawn as soft graphite lines.
import * as THREE from 'three';

export class OutlinePost {
  constructor(renderer, scene, camera, { color = [0.22, 0.24, 0.27], strength = 0.85 } = {}) {
    Object.assign(this, { renderer, scene, camera });
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    this.rtColor = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
    this.rtColor.depthTexture = new THREE.DepthTexture(size.x, size.y);
    this.rtNormal = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType });
    this.normalMat = new THREE.MeshNormalMaterial();
    this.mat = new THREE.ShaderMaterial({
      uniforms: { tColor: { value: this.rtColor.texture }, tNormal: { value: this.rtNormal.texture }, tDepth: { value: this.rtColor.depthTexture },
                  res: { value: size.clone() }, lineColor: { value: new THREE.Vector3(...color) }, strength: { value: strength } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: `
        uniform sampler2D tColor, tNormal, tDepth; uniform vec2 res; uniform vec3 lineColor; uniform float strength;
        varying vec2 vUv;
        float D(vec2 uv){ return texture2D(tDepth, uv).x; }
        vec3 N(vec2 uv){ return texture2D(tNormal, uv).xyz * 2.0 - 1.0; }
        void main(){
          vec2 px = 1.0 / res;
          vec4 c = texture2D(tColor, vUv);
          float d0 = D(vUv);
          vec3 n0 = N(vUv);
          float de = 0.0, ne = 0.0;
          for (int i = 0; i < 4; i++) {
            vec2 o = i == 0 ? vec2(px.x, 0.0) : i == 1 ? vec2(-px.x, 0.0) : i == 2 ? vec2(0.0, px.y) : vec2(0.0, -px.y);
            float d1 = D(vUv + o);
            de = max(de, abs(d1 - d0) / max(1e-4, 1.0 - d0));      // log-depth jump, relative to distance
            ne = max(ne, 1.0 - dot(n0, N(vUv + o)));
          }
          float far = smoothstep(0.985, 0.999, d0);                // fade lines toward the horizon
          float edge = max(smoothstep(0.18, 0.42, de), smoothstep(0.22, 0.55, ne)) * (1.0 - far);
          if (d0 >= 0.99999) edge = 0.0;
          gl_FragColor = vec4(mix(c.rgb, lineColor * c.rgb * 0.6 + lineColor * 0.25, edge * strength), 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      depthTest: false, depthWrite: false,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat);
    this.quad.frustumCulled = false;
    this.postScene = new THREE.Scene(); this.postScene.add(this.quad);
    this.postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    addEventListener('resize', () => this.resize());
  }

  resize() {
    const s = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.rtColor.setSize(s.x, s.y); this.rtNormal.setSize(s.x, s.y); this.mat.uniforms.res.value.copy(s);
  }

  render() {
    const r = this.renderer, sc = this.scene;
    r.setRenderTarget(this.rtColor); r.render(sc, this.camera);
    const bg = sc.background, fog = sc.fog;
    sc.overrideMaterial = this.normalMat; sc.background = null; sc.fog = null;
    r.setRenderTarget(this.rtNormal); r.setClearColor(0x8080ff, 1); r.clear(); r.render(sc, this.camera);
    sc.overrideMaterial = null; sc.background = bg; sc.fog = fog;
    r.setRenderTarget(null); r.render(this.postScene, this.postCam);
  }
}
