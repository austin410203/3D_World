// terrain.js - 3 km terrain tiles from the 30 m heightfield with distance LOD + skirts, and the distant backdrop
import * as THREE from 'three';
import { ASSET, fetchBin } from '../data.js';
import { STYLE, graded } from '../theme.js';

// sketch style: dashed survey grid every 14 m + elevation contours every 40 m (fade with distance)
const SKETCH_TERRAIN = STYLE !== 'sketch' ? '' : `
  {
    float dcam = length(vGWP - cameraPosition);
    vec2 gf = abs(fract(vGWP.xz / 14.0) - 0.5);
    float lx = step(0.486, gf.x) * step(0.45, fract(vGWP.z / 2.4));
    float lz = step(0.486, gf.y) * step(0.45, fract(vGWP.x / 2.4));
    float grid = max(lx, lz) * (1.0 - smoothstep(220.0, 1100.0, dcam));
    float ct = abs(fract(vGWP.y / 40.0) - 0.5);
    float contour = smoothstep(0.47, 0.495, ct) * (1.0 - smoothstep(1500.0, 9000.0, dcam));
    diffuseColor.rgb *= 1.0 - 0.1 * grid - 0.18 * contour;
  }`;

const TILE_CELLS = 100;
const STEPS = [1, 2, 5, 10, 25];

function detailTexture() {
  const N = 256, c = document.createElement('canvas'); c.width = c.height = N;
  const g = c.getContext('2d'), img = g.createImageData(N, N);
  // value noise, tileable
  const grid = (s) => { const a = new Float32Array(s * s); for (let i = 0; i < a.length; i++) a[i] = Math.random(); return a; };
  const layers = [[8, 0.45], [32, 0.35], [128, 0.2]].map(([s, w]) => [s, w, grid(s)]);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let v = 0;
    for (const [s, w, a] of layers) {
      const fx = x / N * s, fy = y / N * s, i = fx | 0, j = fy | 0, tx = fx - i, ty = fy - j;
      const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
      const A = a[(j % s) * s + (i % s)], B = a[(j % s) * s + ((i + 1) % s)], C = a[((j + 1) % s) * s + (i % s)], D = a[((j + 1) % s) * s + ((i + 1) % s)];
      v += w * (A + (B - A) * sx + (C - A) * sy + (A - B - C + D) * sx * sy);
    }
    const k = (y * N + x) * 4, b = Math.round(150 + (v - 0.5) * 160);
    img.data[k] = img.data[k + 1] = img.data[k + 2] = b; img.data[k + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.NoColorSpace;
  return t;
}

function terrainMaterial(map, detail) {
  const m = new THREE.MeshStandardMaterial({ map, roughness: 0.96, metalness: 0 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.detailMap = { value: detail };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP;\nuniform sampler2D detailMap;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        float d1 = texture2D(detailMap, vWP.xz * 0.11).r;
        float d2 = texture2D(detailMap, vWP.xz * 0.013).r;
        float dist = length(vWP - cameraPosition);
        float k = 1.0 - smoothstep(150.0, 1400.0, dist);
        diffuseColor.rgb *= mix(1.0, (d1 / 0.588) * 0.6 + 0.4, 0.55 * k) * mix(1.0, d2 / 0.588, 0.35);`);
  };
  return graded(m, { extra: SKETCH_TERRAIN });
}

export class Terrain {
  constructor(scene, data, renderer) {
    this.scene = scene; this.d = data; this.tiles = [];
    this.group = new THREE.Group(); scene.add(this.group);
    this.renderer = renderer;
  }

  async init(progress) {
    const loader = new THREE.TextureLoader();
    const [colTex, bdTex, bdBuf] = await Promise.all([
      loader.loadAsync(ASSET + 'terrain_col.jpg'), loader.loadAsync(ASSET + 'backdrop_col.jpg'), fetchBin(ASSET + 'backdrop_h.bin.gz')]);
    for (const t of [colTex, bdTex]) {
      t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
      t.anisotropy = this.renderer.capabilities.getMaxAnisotropy(); t.generateMipmaps = true;
    }
    this.detail = detailTexture();
    this.mat = terrainMaterial(colTex, this.detail);
    const d = this.d;
    const ntx = (d.NX - 1) / TILE_CELLS, nty = (d.NY - 1) / TILE_CELLS;
    for (let tj = 0; tj < nty; tj++) for (let ti = 0; ti < ntx; ti++) {
      const ox = d.X0 + ti * TILE_CELLS * d.CELL, oy = d.Y0 + tj * TILE_CELLS * d.CELL;
      const mesh = new THREE.Mesh(undefined, this.mat);
      mesh.position.set(ox, 0, -oy);
      mesh.receiveShadow = true; mesh.matrixAutoUpdate = false; mesh.updateMatrix();
      const t = { ti, tj, mesh, step: -1, geoms: new Map(), cx: ox + TILE_CELLS * d.CELL / 2, cy: oy + TILE_CELLS * d.CELL / 2 };
      this.tiles.push(t); this.group.add(mesh);
      this.setStep(t, 25);
    }
    this.buildBackdrop(new Uint16Array(bdBuf), bdTex);
    progress && progress('地形');
  }

  geom(t, step) {
    let g = t.geoms.get(step); if (g) return g;
    const d = this.d, n = TILE_CELLS / step + 1, i0 = t.ti * TILE_CELLS, j0 = t.tj * TILE_CELLS;
    const ox = d.X0 + i0 * d.CELL, oy = d.Y0 + j0 * d.CELL;
    const nv = n * n, border = 4 * (n - 1);
    const pos = new Float32Array((nv + border) * 3), nor = new Float32Array((nv + border) * 3), uv = new Float32Array((nv + border) * 2);
    const hs = (i, j) => d.hRaw(Math.min(Math.max(i, 0), d.NX - 1), Math.min(Math.max(j, 0), d.NY - 1));
    for (let b = 0; b < n; b++) for (let a = 0; a < n; a++) {
      const i = i0 + a * step, j = j0 + b * step, k = b * n + a;
      const h = d.hRaw(i, j);
      pos[k * 3] = (i - i0) * d.CELL; pos[k * 3 + 1] = h; pos[k * 3 + 2] = -(j - j0) * d.CELL;
      const dx = (hs(i + step, j) - hs(i - step, j)) / (2 * step * d.CELL);
      const dy = (hs(i, j + step) - hs(i, j - step)) / (2 * step * d.CELL);
      const L = Math.hypot(dx, 1, dy);
      nor[k * 3] = -dx / L; nor[k * 3 + 1] = 1 / L; nor[k * 3 + 2] = dy / L;
      uv[k * 2] = (i + 0.5) / d.NX; uv[k * 2 + 1] = (j + 0.5) / d.NY;
    }
    const idx = [];
    for (let b = 0; b < n - 1; b++) for (let a = 0; a < n - 1; a++) {
      const p = b * n + a;
      idx.push(p, p + 1, p + n, p + 1, p + n + 1, p + n);
    }
    // skirts hide cracks between tiles of different LOD
    const ring = [];
    for (let a = 0; a < n - 1; a++) ring.push(a);
    for (let b = 0; b < n - 1; b++) ring.push(b * n + n - 1);
    for (let a = n - 1; a > 0; a--) ring.push((n - 1) * n + a);
    for (let b = n - 1; b > 0; b--) ring.push(b * n);
    const drop = 6 + 4 * step;
    ring.forEach((v, r) => {
      const k = nv + r;
      pos[k * 3] = pos[v * 3]; pos[k * 3 + 1] = pos[v * 3 + 1] - drop; pos[k * 3 + 2] = pos[v * 3 + 2];
      nor[k * 3] = nor[v * 3]; nor[k * 3 + 1] = nor[v * 3 + 1]; nor[k * 3 + 2] = nor[v * 3 + 2];
      uv[k * 2] = uv[v * 2]; uv[k * 2 + 1] = uv[v * 2 + 1];
    });
    for (let r = 0; r < ring.length; r++) {
      const a = ring[r], b = ring[(r + 1) % ring.length], a2 = nv + r, b2 = nv + (r + 1) % ring.length;
      idx.push(a, b, a2, b, b2, a2, a, a2, b, b, a2, b2);   // both windings
    }
    g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(nv + border > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
    g.computeBoundingSphere();
    t.geoms.set(step, g);
    return g;
  }

  setStep(t, step) {
    if (t.step === step) return;
    t.mesh.geometry = this.geom(t, step);
    // free fine LODs we left behind
    for (const [s, g] of t.geoms) if (s !== step && s <= 2) { g.dispose(); t.geoms.delete(s); }
    t.step = step;
  }

  update(camBX, camBY, camH, budget = 4) {
    const todo = [];
    for (const t of this.tiles) {
      const dist = Math.hypot(Math.max(0, Math.abs(camBX - t.cx) - 1500), Math.max(0, Math.abs(camBY - t.cy) - 1500), camH * 0.3);
      const step = dist < 1200 ? 1 : dist < 4500 ? 2 : dist < 10000 ? 5 : dist < 22000 ? 10 : 25;
      if (step > t.step) this.setStep(t, step);          // coarsening is cheap (cached)
      else if (step < t.step) todo.push([dist, t, step]);
    }
    todo.sort((a, b) => a[0] - b[0]);                    // refine nearest tiles first, a few per call
    for (let k = 0; k < Math.min(budget, todo.length); k++) this.setStep(todo[k][1], todo[k][2]);
  }

  buildBackdrop(q, tex) {
    const d = this.d, B = d.meta.backdrop, nx = B.nx, ny = B.ny, s = d.meta.H_SCALE, o = d.meta.H_OFF;
    const pos = new Float32Array(nx * ny * 3), uv = new Float32Array(nx * ny * 2);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const k = j * nx + i, bx = B.x0 + i * B.cell, by = B.y0 + j * B.cell;
      pos[k * 3] = bx; pos[k * 3 + 1] = q[k] / s - o; pos[k * 3 + 2] = -by;
      uv[k * 2] = (i + 0.5) / nx; uv[k * 2 + 1] = (j + 0.5) / ny;
    }
    const idx = [];
    for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
      const by0 = B.y0 + j * B.cell, by1 = by0 + B.cell;
      if (by0 >= d.Y0 && by1 <= d.Y1) continue;    // playable area is covered by tiles
      const p = j * nx + i;
      idx.push(p, p + 1, p + nx, p + 1, p + nx + 1, p + nx);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    const m = graded(new THREE.MeshStandardMaterial({ map: tex, roughness: 1 }));
    this.backdrop = new THREE.Mesh(g, m);
    this.scene.add(this.backdrop);
  }
}
