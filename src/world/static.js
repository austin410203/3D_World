// static.js - streamed static geometry (cities, towns, landmarks, bridges, signs) + window-grid facade shader
import * as THREE from 'three';
import { ASSET, fetchBin, fetchJSON } from '../data.js';
import { STYLE, T } from '../theme.js';

// material ids written by tools/export_web.py:
// 0 plain, 1 office (window grid), 2 house windows, 3 glass curtain wall, 4 metal, 5 neon/emissive, 6 roof
// terrain heightmap as a texture, so facade shaders can tell roofs (well above ground) from streets
let HTEX = null;
export function setHeightTexture(world) {
  const n = world.NX * world.NY, a = new Float32Array(n), s = world.meta.H_SCALE, o = world.meta.H_OFF;
  for (let i = 0; i < n; i++) a[i] = world.hq[i] / s - o;
  HTEX = new THREE.DataTexture(a, world.NX, world.NY, THREE.RedFormat, THREE.FloatType);
  HTEX.magFilter = HTEX.minFilter = THREE.NearestFilter; HTEX.needsUpdate = true;
  HTEX.userData.map = new THREE.Vector4(world.X0, world.Y0, world.X1 - world.X0, world.Y1 - world.Y0);
}

export function buildingMaterial() {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0 });   // per-face vertices -> exact flat normals
  const P = T.palette || {};
  const c3 = (h) => { const c = new THREE.Color(h); return `vec3(${c.r.toFixed(3)}, ${c.g.toFixed(3)}, ${c.b.toFixed(3)})`; };
  m.onBeforeCompile = (sh) => {
    sh.uniforms.hTex = { value: HTEX }; sh.uniforms.hMap = { value: HTEX ? HTEX.userData.map : new THREE.Vector4(0, 0, 1, 1) };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float matId;\nvarying float vMat;\nvarying vec3 vWP;')
      .replace('#include <color_vertex>', '#include <color_vertex>\nvColor.rgb = pow(vColor.rgb, vec3(2.2));\nvMat = matId;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        #define STYLE_${STYLE.toUpperCase()}
        varying float vMat; varying vec3 vWP;
        uniform sampler2D hTex; uniform vec4 hMap;
        float h12(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          int mid = int(vMat + 0.5);
          vec3 wN = normalize((vec4(normal, 0.0) * viewMatrix).xyz);
          float vert = step(abs(wN.y), 0.5);
          vec3 base = diffuseColor.rgb;
          float bay = 3.0, flo = 3.8, wr = 0.62, h0 = 0.22, hr = 0.6, mg = 0.5;
          vec3 g1 = vec3(0.04, 0.06, 0.08), g2 = vec3(0.25, 0.3, 0.35);
          if (mid == 2) { bay = 3.6; flo = 3.1; wr = 0.36; h0 = 0.3; hr = 0.42; mg = 0.2; g1 = vec3(0.05, 0.06, 0.07); g2 = vec3(0.18, 0.2, 0.22); }
          if (mid == 3) { bay = 1.6; flo = 3.9; wr = 0.9; h0 = 0.08; hr = 0.86; mg = 0.8; g1 = vec3(0.05, 0.09, 0.13); g2 = vec3(0.15, 0.25, 0.33); }
          float hc = vWP.x * abs(wN.z) + (-vWP.z) * abs(wN.x);
          float hb = hc / bay, vb = vWP.y / flo, u = fract(hb), v = fract(vb);
          float isWin = (mid >= 1 && mid <= 3) ? 1.0 : 0.0;
          float win = isWin * step(abs(u - 0.5), wr * 0.5) * step(h0, v) * step(v, h0 + hr) * vert;
          float rnd = h12(vec2(floor(hb), floor(vb)));
          float gh = texture2D(hTex, vec2((vWP.x - hMap.x) / hMap.z, (-vWP.z - hMap.y) / hMap.w)).r;
          float above = vWP.y - gh;                                     // height above the terrain
        #if defined(STYLE_SKETCH)
          // paper walls with a faint pastel of the original colour, darker small windows, pastel roofs
          float l = dot(base, vec3(0.3, 0.59, 0.11));
          vec3 wall = mix(vec3(0.95, 0.955, 0.95), mix(vec3(l), base, 0.6) * 0.5 + 0.5, 0.25);
          float roof = step(0.5, wN.y);
          float pr = fract(h12(floor(base.rg * 37.0 + base.b * 11.0)) + h12(floor(vWP.xz / 13.0)));   // varies house to house
          vec3 pastel = pr < 0.2 ? vec3(0.93, 0.70, 0.70) : pr < 0.4 ? vec3(0.74, 0.86, 0.76) : pr < 0.6 ? vec3(0.72, 0.80, 0.91) : pr < 0.8 ? vec3(0.94, 0.88, 0.68) : vec3(0.82, 0.76, 0.90);
          if (mid == 6) wall = pastel;
          else if (roof > 0.5 && above > 1.5) wall = vec3(0.975);
          float win2 = isWin * step(abs(u - 0.5), wr * 0.32) * step(h0 + hr * 0.15, v) * step(v, h0 + hr * 0.85) * vert;
          diffuseColor.rgb = mix(wall, vec3(0.5, 0.54, 0.6), win2);
          if (mid == 5) diffuseColor.rgb = mix(wall, base, 0.6);
          roughnessFactor = 1.0; metalnessFactor = 0.0;
        #elif defined(STYLE_COZY)
          // warm brick / mustard / teal palette per building, cream framed windows, dark flat roofs
          if (mid == 6) discard;                                 // flat roofs only (gable prisms hidden)
          float pick = h12(floor(base.rg * 31.0 + base.b * 17.0));
          vec3 wall = pick < 0.34 ? ${c3(P.brick)} : pick < 0.5 ? ${c3(P.brick2)} : pick < 0.66 ? ${c3(P.mustard)} : pick < 0.82 ? ${c3(P.teal)} : ${c3(P.cream)};
          if (mid == 3) wall = ${c3(P.slate)};
          if (mid == 0 || mid == 4) wall = base * vec3(1.04, 1.0, 0.9) + vec3(0.02);    // streets, props keep their own colour
          float top = step(0.5, wN.y);
          if (top > 0.5 && above > 2.5 && mid != 4 && mid != 5) wall = ${c3(P.roof)};      // dark flat roofs
          float frame = isWin * step(abs(u - 0.5), 0.5 * min(0.62, wr + 0.12)) * step(h0 - 0.05, v) * step(v, h0 + hr + 0.06) * vert;
          float glass = isWin * step(abs(u - 0.5), 0.5 * min(0.5, wr)) * step(h0 + 0.03, v) * step(v, h0 + hr - 0.02) * vert;
          float ledge = vert * step(abs(v - 0.02), 0.02) * isWin;                          // floor lines
          vec3 col = mix(wall, wall * 0.82, ledge);
          col = mix(col, ${c3(P.cream)}, frame);
          col = mix(col, mix(vec3(0.16, 0.2, 0.23), vec3(0.32, 0.38, 0.4), rnd), glass);
          diffuseColor.rgb = col;
          roughnessFactor = mix(0.85, 0.25, glass); metalnessFactor = 0.0;
          if (mid == 5) totalEmissiveRadiance += base * 1.5;
        #else
          if (isWin > 0.5) {
            diffuseColor.rgb = mix(diffuseColor.rgb, mix(g1, g2, rnd), win);
            roughnessFactor = mix(roughnessFactor, 0.08, win);
            metalnessFactor = mix(metalnessFactor, mg, win);
          }
          if (mid == 4) { metalnessFactor = 0.85; roughnessFactor = 0.32; }
          if (mid == 5) { totalEmissiveRadiance += diffuseColor.rgb * 2.5; }
          if (mid == 6) { roughnessFactor = 0.9; }
        #endif
        }`);
  };
  return m;
}

export function decodeEntry(buf, e, float = false) {
  const g = new THREE.BufferGeometry();
  const nv = e.v;
  let pos;
  if (e.float) pos = new Float32Array(buf, e.pOff, nv * 3).slice();
  else {
    const q = new Uint16Array(buf, e.pOff, nv * 3); pos = new Float32Array(nv * 3);
    const s = e.size;
    for (let i = 0; i < nv; i++) {
      pos[i * 3] = q[i * 3] / 65535 * s[0]; pos[i * 3 + 1] = q[i * 3 + 1] / 65535 * s[1]; pos[i * 3 + 2] = q[i * 3 + 2] / 65535 * s[2];
    }
  }
  const c = new Uint8Array(buf, e.cOff, nv * 4);
  const col = new Uint8Array(nv * 3), mat = new Float32Array(nv);
  for (let i = 0; i < nv; i++) { col[i * 3] = c[i * 4]; col[i * 3 + 1] = c[i * 4 + 1]; col[i * 3 + 2] = c[i * 4 + 2]; mat[i] = c[i * 4 + 3]; }
  const idx = e.u32 ? new Uint32Array(buf, e.iOff, e.i).slice() : new Uint16Array(buf, e.iOff, e.i).slice();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3, true));
  g.setAttribute('matId', new THREE.BufferAttribute(mat, 1));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  // flat shading derives face normals in the fragment shader, but the vertex stage (shadow normal bias)
  // still needs a valid normal attribute, otherwise normalize(0) -> NaN -> speckled lighting
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

export class StaticWorld {
  constructor(scene) {
    this.scene = scene; this.mat = buildingMaterial(); this.regions = []; this.loading = 0;
  }

  async init() {
    const idx = await fetchJSON(ASSET + 'static_regions.json');
    this.regions = idx.map((r) => ({ ...r, state: 'idle', group: null }));
  }

  async loadRegion(r) {
    r.state = 'loading'; this.loading++;
    try {
      const [entries, buf] = await Promise.all([fetchJSON(ASSET + r.file + '.json'), fetchBin(ASSET + r.file + '.bin.gz')]);
      const grp = new THREE.Group();
      for (const e of entries) {
        const mesh = new THREE.Mesh(decodeEntry(buf, e), this.mat);
        mesh.position.set(e.origin[0], e.origin[1], e.origin[2]);
        mesh.castShadow = true; mesh.receiveShadow = true;
        mesh.matrixAutoUpdate = false; mesh.updateMatrix();
        grp.add(mesh);
      }
      if (r.state === 'loading') { this.scene.add(grp); r.group = grp; r.state = 'loaded'; }
    } catch (err) { console.error(err); r.state = 'idle'; }
    this.loading--;
  }

  unload(r) {
    if (r.group) { this.scene.remove(r.group); r.group.traverse((o) => o.geometry && o.geometry.dispose()); }
    r.group = null; r.state = 'idle';
  }

  // stream regions within reach of the player (blender x)
  update(bx, near = 9000, far = 16000) {
    const waits = [];
    for (const r of this.regions) {
      const d = bx < r.x0 ? r.x0 - bx : bx > r.x1 ? bx - r.x1 : 0;
      if (d < near && r.state === 'idle') waits.push(this.loadRegion(r));
      else if (d > far && r.state === 'loaded') this.unload(r);
    }
    return Promise.all(waits);
  }
}
