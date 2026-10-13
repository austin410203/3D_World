// road.js - the transcontinental highway ribbon (4 lanes, 16 m) built from the exported route profile
import * as THREE from 'three';

function markingTexture(renderer) {
  const W = 512, Hh = 1024, c = document.createElement('canvas'); c.width = W; c.height = Hh;
  const g = c.getContext('2d');
  g.fillStyle = '#2a2a2b'; g.fillRect(0, 0, W, Hh);
  // aggregate speckle
  const img = g.getImageData(0, 0, W, Hh);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 26; img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
  const px = (s) => (s + 8) / 16 * W, py = (m) => m / 24 * Hh;
  // tyre-worn lane centres
  g.fillStyle = 'rgba(0,0,0,0.18)';
  for (const s of [-5.3, -1.9, 1.9, 5.3]) for (const o of [-0.8, 0.8]) g.fillRect(px(s + o - 0.35), 0, px(0.7) - px(0), Hh);
  g.fillStyle = '#e8e8e2';
  for (const s of [-6.95, 6.95]) g.fillRect(px(s - 0.09), 0, px(0.18) - px(0), Hh);          // edge lines
  for (const s of [-3.6, 3.6]) for (const m of [0, 12]) g.fillRect(px(s - 0.075), py(m), px(0.15) - px(0), py(3));   // dashes
  g.fillStyle = '#e0a514';
  for (const s of [-0.2, 0.2]) g.fillRect(px(s - 0.06), 0, px(0.12) - px(0), Hh);            // double yellow
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.ClampToEdgeWrapping; t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return t;
}

export function buildRoad(scene, d, renderer) {
  const mat = new THREE.MeshStandardMaterial({ map: markingTexture(renderer), roughness: 0.82, metalness: 0,
                                               polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
  const n = d.rx.length, PIECE = 400;
  const offs = [-9.6, -8, 8, 9.6], dz = [-1.4, 0, 0, -1.4], us = [0, 0, 1, 1];
  const group = new THREE.Group();
  for (let i0 = 0; i0 < n - 1; i0 += PIECE) {
    const i1 = Math.min(i0 + PIECE, n - 1), m = i1 - i0 + 1;
    const ox = d.rx[i0], oy = d.ry[i0];
    const pos = new Float32Array(m * 4 * 3), uv = new Float32Array(m * 4 * 2);
    for (let k = 0; k < m; k++) {
      const i = i0 + k, a = Math.max(i - 1, 0), b = Math.min(i + 1, n - 1);
      let tx = d.rx[b] - d.rx[a], ty = d.ry[b] - d.ry[a]; const L = Math.hypot(tx, ty); tx /= L; ty /= L;
      const nx = -ty, ny = tx;
      for (let c = 0; c < 4; c++) {
        const q = (k * 4 + c);
        const bx = d.rx[i] + nx * offs[c], by = d.ry[i] + ny * offs[c];
        pos[q * 3] = bx - ox; pos[q * 3 + 1] = d.rz[i] + dz[c]; pos[q * 3 + 2] = -(by - oy);
        uv[q * 2] = us[c]; uv[q * 2 + 1] = d.rs[i] / 24;
      }
    }
    const idx = [];
    for (let k = 0; k < m - 1; k++) for (let c = 0; c < 3; c++) {
      const a = k * 4 + c, b = (k + 1) * 4 + c;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals(); g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, mat);
    mesh.position.set(ox, 0, -oy); mesh.receiveShadow = true;
    group.add(mesh);
  }
  scene.add(group);
  return group;
}
