// vegetation.js - 618k trees / cacti / shrubs / rocks / wheat as streamed InstancedMesh cells around the player
import * as THREE from 'three';
import { graded } from '../theme.js';
import { ASSET, fetchBin, fetchJSON } from '../data.js';
import { decodeEntry } from './static.js';

const CELL = 500;
const SHADOW_DIST = 380;

export class Vegetation {
  constructor(scene, data) { this.scene = scene; this.d = data; this.cells = new Map(); this.radius = 2600; }

  async init() {
    const [pIdx, pBuf, vIdx, vBuf] = await Promise.all([
      fetchJSON(ASSET + 'protos.json'), fetchBin(ASSET + 'protos.bin.gz'), fetchJSON(ASSET + 'veg.json'), fetchBin(ASSET + 'veg.bin.gz')]);
    this.mat = graded(new THREE.MeshLambertMaterial({ vertexColors: true }));
    this.geoms = {};
    for (const e of pIdx) {
      const g = decodeEntry(pBuf, e);
      g.translate(e.origin[0], e.origin[1], e.origin[2]);
      const c = g.attributes.color, lin = new Float32Array(c.count * 3);
      for (let i = 0; i < c.count; i++) for (let k = 0; k < 3; k++) lin[i * 3 + k] = Math.pow(c.array[i * 3 + k] / 255, 2.2);
      g.setAttribute('color', new THREE.BufferAttribute(lin, 3)); g.deleteAttribute('matId');
      g.computeVertexNormals(); g.computeBoundingSphere();
      this.geoms[e.key] = g;
    }
    // bucket instances into 500 m cells
    this.bins = new Map();
    for (const e of vIdx) {
      const xy = new Float32Array(vBuf, e.xyOff, e.n * 2), s = new Uint8Array(vBuf, e.sOff, e.n), r = new Uint8Array(vBuf, e.rOff, e.n);
      const kind = e.proto;
      for (let i = 0; i < e.n; i++) {
        const bx = xy[i * 2], by = xy[i * 2 + 1];
        const key = (Math.floor(bx / CELL) + 100) * 1000 + Math.floor((by + 50000) / CELL);
        let b = this.bins.get(key); if (!b) this.bins.set(key, (b = {}));
        (b[kind] || (b[kind] = [])).push(bx, by, s[i] / 8, r[i] / 255 * Math.PI * 2);
      }
    }
  }

  buildCell(key) {
    const b = this.bins.get(key); if (!b) return null;
    const ci = Math.floor(key / 1000) - 100, cj = key % 1000;
    const ox = ci * CELL, oy = cj * CELL - 50000;
    const grp = new THREE.Group(); grp.position.set(ox, 0, -oy);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), p = new THREE.Vector3(), sc = new THREE.Vector3(), col = new THREE.Color();
    for (const [kind, a] of Object.entries(b)) {
      const g = this.geoms[kind]; if (!g) continue;
      const n = a.length / 4, im = new THREE.InstancedMesh(g, this.mat, n);
      for (let i = 0; i < n; i++) {
        const bx = a[i * 4], by = a[i * 4 + 1], s = a[i * 4 + 2], r = a[i * 4 + 3];
        p.set(bx - ox, this.d.H(bx, by) - 0.015 * s - 0.15, -(by - oy));
        q.setFromAxisAngle(up, r); sc.setScalar(s);
        im.setMatrixAt(i, m4.compose(p, q, sc));
        const h = Math.sin(bx * 12.9898 + by * 78.233) * 43758.5453; const v = 0.78 + 0.44 * (h - Math.floor(h));
        im.setColorAt(i, col.setRGB(v, v, v));
      }
      im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere();
      im.receiveShadow = true;
      grp.add(im);
    }
    this.scene.add(grp);
    return { grp, near: false };
  }

  update(bx, by) {
    const R = this.radius, ci0 = Math.floor((bx - R) / CELL), ci1 = Math.floor((bx + R) / CELL);
    const cj0 = Math.floor((by - R + 50000) / CELL), cj1 = Math.floor((by + R + 50000) / CELL);
    const want = new Set(); let built = 0;
    for (let i = ci0; i <= ci1; i++) for (let j = cj0; j <= cj1; j++) {
      const cx = i * CELL + CELL / 2, cy = j * CELL - 50000 + CELL / 2;
      const d = Math.hypot(cx - bx, cy - by);
      if (d > R) continue;
      const key = (i + 100) * 1000 + j; want.add(key);
      let c = this.cells.get(key);
      if (!c && built < 4) { c = this.buildCell(key) || { grp: null }; this.cells.set(key, c); built++; }
      if (c && c.grp) {
        const near = d < SHADOW_DIST;
        if (near !== c.near) { c.grp.children.forEach((m) => (m.castShadow = near)); c.near = near; }
      }
    }
    for (const [key, c] of this.cells) if (!want.has(key)) {
      if (c.grp) { this.scene.remove(c.grp); c.grp.children.forEach((m) => m.dispose()); }
      this.cells.delete(key);
    }
  }
}
