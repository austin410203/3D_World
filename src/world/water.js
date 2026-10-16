// water.js - ocean, bay, lake and rivers with an animated procedural normal map
import * as THREE from 'three';
import { graded } from '../theme.js';
import { ASSET, fetchBin, fetchJSON } from '../data.js';
import { decodeEntry } from './static.js';

function waterNormals() {
  const N = 256, c = document.createElement('canvas'); c.width = c.height = N;
  const g = c.getContext('2d'), img = g.createImageData(N, N);
  const H = new Float32Array(N * N);
  const waves = Array.from({ length: 14 }, () => ({
    kx: Math.round((Math.random() - 0.5) * 16), ky: Math.round((Math.random() - 0.5) * 16), p: Math.random() * 6.28, a: Math.random() }));
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let h = 0; for (const w of waves) h += w.a * Math.sin((w.kx * x + w.ky * y) / N * 6.2832 + w.p);
    H[y * N + x] = h;
  }
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const dx = H[y * N + (x + 1) % N] - H[y * N + (x + N - 1) % N], dy = H[((y + 1) % N) * N + x] - H[((y + N - 1) % N) * N + x];
    const nx = -dx * 0.6, ny = -dy * 0.6, L = Math.hypot(nx, ny, 1), k = (y * N + x) * 4;
    img.data[k] = (nx / L * 0.5 + 0.5) * 255; img.data[k + 1] = (ny / L * 0.5 + 0.5) * 255; img.data[k + 2] = (1 / L * 0.5 + 0.5) * 255; img.data[k + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.NoColorSpace;
  return t;
}

export class Water {
  constructor(scene) { this.scene = scene; }

  async init() {
    const [entries, buf] = await Promise.all([fetchJSON(ASSET + 'water.json'), fetchBin(ASSET + 'water.bin.gz')]);
    this.nmap = waterNormals();
    this.mats = {
      ocean: graded(new THREE.MeshStandardMaterial({ color: 0x0b3350, roughness: 0.06, metalness: 0.0, normalMap: this.nmap, normalScale: new THREE.Vector2(0.55, 0.55) })),
      fresh: graded(new THREE.MeshStandardMaterial({ color: 0x123d3c, roughness: 0.05, metalness: 0.0, normalMap: this.nmap, normalScale: new THREE.Vector2(0.25, 0.25) })),
    };
    this.meshes = [];
    for (const e of entries) {
      const g = decodeEntry(buf, e);
      const p = g.attributes.position, uv = new Float32Array(p.count * 2);
      for (let i = 0; i < p.count; i++) { uv[i * 2] = (p.getX(i) + e.origin[0]) / 45; uv[i * 2 + 1] = (p.getZ(i) + e.origin[2]) / 45; }
      g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      g.deleteAttribute('color'); g.deleteAttribute('matId'); g.computeVertexNormals();
      const salt = /Ocean|Bay/.test(e.key);
      const mesh = new THREE.Mesh(g, salt ? this.mats.ocean : this.mats.fresh);
      mesh.position.set(e.origin[0], e.origin[1], e.origin[2]);
      mesh.receiveShadow = true;
      this.scene.add(mesh); this.meshes.push(mesh);
    }
  }

  update(t) {
    this.nmap.offset.set(t * 0.012, t * 0.007);
  }
}
