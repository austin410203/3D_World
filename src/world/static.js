// static.js - streamed static geometry (cities, towns, landmarks, bridges, signs) + window-grid facade shader
import * as THREE from 'three';
import { ASSET, fetchBin, fetchJSON } from '../data.js';

// material ids written by tools/export_web.py:
// 0 plain, 1 office (window grid), 2 house windows, 3 glass curtain wall, 4 metal, 5 neon/emissive, 6 roof
export function buildingMaterial() {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0 });   // per-face vertices -> exact flat normals
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float matId;\nvarying float vMat;\nvarying vec3 vWP;')
      .replace('#include <color_vertex>', '#include <color_vertex>\nvColor.rgb = pow(vColor.rgb, vec3(2.2));\nvMat = matId;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying float vMat; varying vec3 vWP;
        float h12(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          int mid = int(vMat + 0.5);
          vec3 wN = normalize((vec4(normal, 0.0) * viewMatrix).xyz);
          float vert = step(abs(wN.y), 0.5);
          float bay = 3.0, flo = 3.8, wr = 0.62, h0 = 0.22, hr = 0.6, mg = 0.5;
          vec3 g1 = vec3(0.04, 0.06, 0.08), g2 = vec3(0.25, 0.3, 0.35);
          if (mid == 2) { bay = 3.6; flo = 3.1; wr = 0.36; h0 = 0.3; hr = 0.42; mg = 0.2; g1 = vec3(0.05, 0.06, 0.07); g2 = vec3(0.18, 0.2, 0.22); }
          if (mid == 3) { bay = 1.6; flo = 3.9; wr = 0.9; h0 = 0.08; hr = 0.86; mg = 0.8; g1 = vec3(0.05, 0.09, 0.13); g2 = vec3(0.15, 0.25, 0.33); }
          if (mid >= 1 && mid <= 3) {
            float hc = vWP.x * abs(wN.z) + (-vWP.z) * abs(wN.x);
            float hb = hc / bay, vb = vWP.y / flo;
            float u = fract(hb), v = fract(vb);
            float win = step(abs(u - 0.5), wr * 0.5) * step(h0, v) * step(v, h0 + hr) * vert;
            vec3 gl = mix(g1, g2, h12(vec2(floor(hb), floor(vb))));
            diffuseColor.rgb = mix(diffuseColor.rgb, gl, win);
            roughnessFactor = mix(roughnessFactor, 0.08, win);
            metalnessFactor = mix(metalnessFactor, mg, win);
          }
          if (mid == 4) { metalnessFactor = 0.85; roughnessFactor = 0.32; }
          if (mid == 5) { totalEmissiveRadiance += diffuseColor.rgb * 2.5; }
          if (mid == 6) { roughnessFactor = 0.9; }
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
