// decor.js - streamed street furniture & rooftop kit generated from the exported building boxes and city grids.
//   all styles : crosswalks, street lamps, traffic lights, parked cars at city intersections / curbs
//   cozy style : parapets, rooftop AC units, stair huts, NYC water tanks and fire escapes on building boxes
import * as THREE from 'three';
import { STYLE, T, graded } from '../theme.js';
import { trafficCarGeometry } from '../actors/carModel.js';
import { pixelNoise } from '../pixel.js';

const CELL = 400;
// city street grids from the Blender generator (s6_cities.py): centre, angle, block pitch (block + street), extents
export const GRIDS = [
  { cx: 3000, cy: 300, ang: 0, pu: 126, pv: 80, rx: 2600, ry: 2300, street: 10 },
  { cx: 75500, cy: 0, ang: 0, pu: 113, pv: 113, rx: 1300, ry: 1500, street: 12 },
  { cx: 97300, cy: 1200, ang: 29 * Math.PI / 180, pu: 248, pv: 80, rx: 2900, ry: 2500, street: 12 },
];

function boxGeo(w, h, d, x, y, z, rgb) {
  const g = new THREE.BoxGeometry(w, h, d).translate(x, y, z).toNonIndexed();
  const c = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < c.length; i += 3) { c[i] = rgb[0]; c[i + 1] = rgb[1]; c[i + 2] = rgb[2]; }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}
function mergeList(list) {
  const n = list.reduce((a, g) => a + g.attributes.position.count, 0);
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), uv = new Float32Array(n * 2); let o = 0;
  for (const g of list) { pos.set(g.attributes.position.array, o * 3); col.set(g.attributes.color.array, o * 3); uv.set(g.attributes.uv.array, o * 2); o += g.attributes.position.count; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

export function decorProtos() {
  const W = [1, 1, 1], dark = [0.16, 0.17, 0.18], grey = [0.62, 0.64, 0.66], light = [0.86, 0.87, 0.86];
  return {
    box: mergeList([boxGeo(1, 1, 1, 0, 0.5, 0, W)]),                                  // tinted & scaled per instance
    ac: mergeList([boxGeo(1.3, 0.8, 1.0, 0, 0.4, 0, light), boxGeo(0.7, 0.05, 0.7, 0, 0.82, 0, dark), boxGeo(1.3, 0.12, 0.2, 0, 0.6, 0.52, grey)]),
    hut: mergeList([boxGeo(2.6, 2.4, 2.6, 0, 1.2, 0, [0.85, 0.82, 0.74]), boxGeo(2.8, 0.2, 2.8, 0, 2.5, 0, [0.3, 0.33, 0.34]), boxGeo(0.9, 1.8, 0.05, 0, 0.9, 1.31, [0.45, 0.3, 0.2])]),
    tank: mergeList([boxGeo(2.4, 2.4, 2.4, 0, 2.8, 0, [0.55, 0.38, 0.25]), boxGeo(2.6, 0.9, 2.6, 0, 4.4, 0, [0.35, 0.25, 0.18]),
                     ...[[-0.9, -0.9], [0.9, -0.9], [0.9, 0.9], [-0.9, 0.9]].map(([x, z]) => boxGeo(0.15, 1.6, 0.15, x, 0.8, z, dark))]),
    escape: mergeList([boxGeo(4.0, 0.08, 1.2, 0, 0, 0.6, dark), boxGeo(4.0, 0.9, 0.05, 0, 0.45, 1.18, dark), boxGeo(0.05, 0.9, 1.2, -2.0, 0.45, 0.6, dark),
                       boxGeo(0.05, 0.9, 1.2, 2.0, 0.45, 0.6, dark), ...Array.from({ length: 6 }, (_, k) => boxGeo(0.6, 0.05, 0.25, 1.2 - k * 0.12, -k * 0.5, 0.75, dark))]),
    lamp: mergeList([boxGeo(0.16, 5.2, 0.16, 0, 2.6, 0, dark), boxGeo(0.14, 0.14, 1.3, 0, 5.15, 0.6, dark), boxGeo(0.45, 0.2, 0.45, 0, 5.0, 1.25, [1, 0.95, 0.75])]),
    signal: mergeList([boxGeo(0.18, 4.2, 0.18, 0, 2.1, 0, dark), boxGeo(0.12, 0.12, 3.2, 0, 4.1, 1.6, dark),
                       boxGeo(0.4, 1.1, 0.35, 0, 3.6, 3.1, [0.2, 0.22, 0.2]), boxGeo(0.25, 0.25, 0.05, 0, 3.95, 3.29, [0.9, 0.15, 0.1]),
                       boxGeo(0.25, 0.25, 0.05, 0, 3.6, 3.29, [0.95, 0.75, 0.1]), boxGeo(0.25, 0.25, 0.05, 0, 3.25, 3.29, [0.2, 0.85, 0.3])]),
    bench: mergeList([boxGeo(1.8, 0.08, 0.5, 0, 0.45, 0, [0.55, 0.38, 0.22]), boxGeo(1.8, 0.45, 0.06, 0, 0.75, -0.24, [0.55, 0.38, 0.22]),
                      boxGeo(0.08, 0.45, 0.45, -0.8, 0.22, 0, dark), boxGeo(0.08, 0.45, 0.45, 0.8, 0.22, 0, dark)]),
    car: (() => { const g = trafficCarGeometry(); return g; })(),
  };
}

export class Decor {
  constructor(scene, world) {
    this.scene = scene; this.w = world; this.cells = new Map(); this.radius = 1300;
    this.protos = decorProtos();
    this.mat = graded(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, map: pixelNoise(16, 0.86, 1, 21) }));
    this.rooftops = STYLE === 'cozy';
    // index building boxes by cell (only proper buildings: footprint >= 6 m, >= 5 m tall)
    const C = world.col, n = C.length / 7;
    this.boxBins = new Map();
    for (let i = 0; i < n; i++) {
      const o = i * 7, hu = C[o + 2], hw = C[o + 3], z0 = C[o + 5], z1 = C[o + 6];
      if (hu < 3 || hw < 3 || z1 - z0 < 0.6) continue;          // includes thin roof caps (height above ground checked later)
      const k = this.key(C[o], C[o + 1]);
      let b = this.boxBins.get(k); if (!b) this.boxBins.set(k, (b = [])); b.push(i);
    }
  }

  key(bx, by) { return (Math.floor(bx / CELL) + 100) * 1000 + Math.floor((by + 50000) / CELL); }

  build(key) {
    const ci = Math.floor(key / 1000) - 100, cj = key % 1000;
    const ox = ci * CELL, oy = cj * CELL - 50000;
    // add(proto, blender x, height, blender y, blender yaw, scale..., colour) -> cell-local three.js coords
    const lists = {}; const add = (proto, bx, h, by, yaw, sx = 1, sy = 1, sz = 1, col = 0xffffff) =>
      (lists[proto] || (lists[proto] = [])).push([bx - ox, h, oy - by, yaw, sx, sy, sz, col]);
    const rnd = mulberry(key);
    const w = this.w, C = w.col;
    // ---- rooftop kit (cozy)
    if (this.rooftops) {
      for (const i of this.boxBins.get(key) || []) {
        const o = i * 7, cx = C[o], cy = C[o + 1], hu = C[o + 2], hw = C[o + 3], a = C[o + 4], z1 = C[o + 6];
        const g = w.H(cx, cy); if (z1 - g < 4.5) continue;
        const ri = w.roadInfo(cx, cy); if (ri && ri.d < 30) continue;
        const cs = Math.cos(a), sn = Math.sin(a);
        const at = (u, v) => [cx + u * cs - v * sn, cy + u * sn + v * cs];
        const pcol = T.palette.parapet;
        for (const [u, v, su, sv] of [[hu - 0.2, 0, 0.4, hw * 2], [-hu + 0.2, 0, 0.4, hw * 2], [0, hw - 0.2, hu * 2, 0.4], [0, -hw + 0.2, hu * 2, 0.4]]) {
          const [x, y] = at(u, v); add('box', x, z1, y, a, su, 0.7, sv, pcol);
        }
        const nAc = Math.min(5, 1 + Math.floor(hu * hw / 90));
        for (let k = 0; k < nAc; k++) {
          const [x, y] = at((rnd() - 0.5) * (hu * 2 - 3), (rnd() - 0.5) * (hw * 2 - 3)); add('ac', x, z1, y, a + (rnd() < 0.5 ? 0 : Math.PI / 2));
        }
        if (rnd() < 0.35) { const [x, y] = at((rnd() - 0.5) * (hu - 2), (rnd() - 0.5) * (hw - 2)); add('hut', x, z1, y, a); }
        if (cx > 93000 && rnd() < 0.3) { const [x, y] = at((rnd() - 0.5) * (hu - 2), (rnd() - 0.5) * (hw - 2)); add('tank', x, z1, y, a); }
        const hgt = z1 - g;
        if (hgt > 8 && hgt < 45 && Math.min(hu, hw) > 4 && rnd() < 0.45) {   // fire escape on a long side
          const alongU = hu > hw, side = rnd() < 0.5 ? 1 : -1;
          const [x, y] = alongU ? at(0, side * hw) : at(side * hu, 0);
          const yaw = alongU ? a + (side > 0 ? Math.PI : 0) : a + side * Math.PI / 2;
          for (let f = g + 3.4; f < z1 - 1.5; f += 3.2) add('escape', x, f, y, a + (alongU ? (side > 0 ? 0 : Math.PI) : (side > 0 ? -Math.PI / 2 : Math.PI / 2)));
        }
      }
    }
    // ---- street furniture on city grids
    for (const G of GRIDS) {
      const ca = Math.cos(G.ang), sa = Math.sin(G.ang);
      if (Math.abs(ox + CELL / 2 - G.cx) > G.rx + CELL || Math.abs(oy + CELL / 2 - G.cy) > G.ry + CELL) continue;
      const toUV = (x, y) => [ca * (x - G.cx) + sa * (y - G.cy), -sa * (x - G.cx) + ca * (y - G.cy)];
      const W_ = (u, v) => [G.cx + ca * u - sa * v, G.cy + sa * u + ca * v];
      const corners = [[ox, oy], [ox + CELL, oy], [ox, oy + CELL], [ox + CELL, oy + CELL]].map(([x, y]) => toUV(x, y));
      const umin = Math.min(...corners.map((c) => c[0])), umax = Math.max(...corners.map((c) => c[0]));
      const vmin = Math.min(...corners.map((c) => c[1])), vmax = Math.max(...corners.map((c) => c[1]));
      for (let i = Math.ceil(umin / G.pu); i <= Math.floor(umax / G.pu); i++) for (let j = Math.ceil(vmin / G.pv); j <= Math.floor(vmax / G.pv); j++) {
        const [x, y] = W_(i * G.pu, j * G.pv);
        if (x < ox || x >= ox + CELL || y < oy || y >= oy + CELL) continue;
        if (((x - G.cx) / G.rx) ** 2 + ((y - G.cy) / G.ry) ** 2 > 0.92) continue;
        if (this.parkAt && this.parkAt(x, y)) continue;                     // no streets through parks
        if (w.waterLevel(x, y) !== null) continue;
        const ri = w.roadInfo(x, y); if (ri && ri.d < 25) continue;
        const z = w.H(x, y) + 0.3, hs = G.street / 2;
        // zebra crossings on the four approaches
        for (const [du, dv, rot] of [[0, hs + 2.2, 0], [0, -hs - 2.2, 0], [hs + 2.2, 0, 1], [-hs - 2.2, 0, 1]]) {
          for (let k = -3; k <= 3; k++) {
            const su = rot ? du : du + k * 1.3, sv = rot ? dv + k * 1.3 : dv;
            const [px, py] = W_(i * G.pu + su, j * G.pv + sv);
            add('box', px, w.H(px, py) + 0.29, py, G.ang, rot ? 2.8 : 0.6, 0.03, rot ? 0.6 : 2.8, 0xf2efe6);
          }
        }
        // traffic lights on two corners, lamps on the others
        const cr = hs + 1.6;
        [[cr, cr], [-cr, -cr]].forEach(([du, dv], k) => { const [px, py] = W_(i * G.pu + du, j * G.pv + dv); add('signal', px, w.H(px, py) + 0.4, py, G.ang + (k ? 0 : Math.PI) + Math.PI / 2); });
        [[cr, -cr], [-cr, cr]].forEach(([du, dv]) => { const [px, py] = W_(i * G.pu + du, j * G.pv + dv); add('lamp', px, w.H(px, py) + 0.4, py, G.ang + rnd() * 4); });
        // parked cars along the next block's curb + a bench
        for (let k = 1; k < 6; k++) {
          if (rnd() > 0.45) continue;
          const along = 9 + k * 9.5; if (along > G.pu - 10) break;
          const [px, py] = W_(i * G.pu + along, j * G.pv + hs - 1.3);
          if (w.waterLevel(px, py) !== null) continue;
          if (this.parkAt && this.parkAt(px, py)) continue;
          add('car', px, w.H(px, py) + 0.28, py, G.ang + Math.PI / 2 + (rnd() < 0.5 ? 0 : Math.PI), 0.92, 0.92, 0.92, [0xb24f37, 0xe8dcc0, 0x56707a, 0xd7b04e, 0x2f3b3d, 0xf2f2f2][(rnd() * 6) | 0]);
        }
        if (rnd() < 0.35) { const [px, py] = W_(i * G.pu + G.pu / 2, j * G.pv - hs - 2.2); add('bench', px, w.H(px, py) + 0.42, py, G.ang + Math.PI); }
      }
    }
    // ---- instanced meshes for this cell
    const grp = new THREE.Group(); grp.position.set(ox, 0, -oy);
    const m4 = new THREE.Matrix4(), qq = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), p = new THREE.Vector3(), s = new THREE.Vector3(), c = new THREE.Color();
    for (const [proto, list] of Object.entries(lists)) {
      const im = new THREE.InstancedMesh(this.protos[proto], this.mat, list.length);
      list.forEach(([x, y, z, yaw, sx, sy, sz, col], k) => {
        p.set(x, y, z); qq.setFromAxisAngle(up, yaw); s.set(sx, sy, sz);
        im.setMatrixAt(k, m4.compose(p, qq, s)); im.setColorAt(k, c.setHex(col));
      });
      im.castShadow = proto !== 'box' || list.length < 2000; im.receiveShadow = true; im.computeBoundingSphere();
      grp.add(im);
    }
    this.scene.add(grp);
    return grp;
  }

  update(bx, by, enabled = true) {
    const R = enabled ? this.radius : -1, want = new Set(); let built = false;
    for (let x = bx - R; x <= bx + R; x += CELL) for (let y = by - R; y <= by + R; y += CELL) {
      if (R < 0) break;
      const k = this.key(x, y); want.add(k);
      if (!this.cells.has(k) && !built) { this.cells.set(k, this.build(k)); built = true; }   // at most one new cell per frame
    }
    for (const [k, g] of this.cells) if (!want.has(k)) { this.scene.remove(g); g.children.forEach((m) => m.dispose()); this.cells.delete(k); }
  }
}

function mulberry(a) {
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
