// data.js - world data: heightfield, highway route, building colliders, water levels.
// Blender coords (bx, by, bz) are used for all gameplay queries; three.js coords are (x, y, z) = (bx, bz, -by).

export const ASSET = './assets/';

export async function fetchBin(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  let buf = await r.arrayBuffer();
  const u = new Uint8Array(buf, 0, Math.min(2, buf.byteLength));
  if (u[0] === 0x1f && u[1] === 0x8b) {   // gzip -> inflate in the browser
    const ds = new DecompressionStream('gzip');
    buf = await new Response(new Blob([buf]).stream().pipeThrough(ds)).arrayBuffer();
  }
  return buf;
}

export async function fetchJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return r.json();
}

export const riverX = (y) => 77200 + 260 * Math.sin(y / 2600) + 90 * Math.sin(y / 900 + 1.3);
export const canyonX = (y) => 38200 + 1100 * Math.sin(y / 2800) + 250 * Math.sin(y / 800 + 1.0);

export class WorldData {
  async load(progress = () => {}) {
    this.meta = await fetchJSON(ASSET + 'meta.json');
    const m = this.meta;
    this.X0 = m.X0; this.X1 = m.X1; this.Y0 = m.Y0; this.Y1 = m.Y1;
    this.NX = m.NX; this.NY = m.NY; this.CELL = m.CELL;
    const [hBuf, rBuf, cBuf] = await Promise.all([
      fetchBin(ASSET + 'terrain_h.bin.gz').then((b) => (progress('地形高度'), b)),
      fetchBin(ASSET + 'route.bin.gz').then((b) => (progress('公路'), b)),
      fetchBin(ASSET + 'colliders.bin.gz').then((b) => (progress('碰撞'), b)),
    ]);
    this.hq = new Uint16Array(hBuf);
    // route: rx, ry, rz, rs interleaved
    const r = new Float32Array(rBuf); const n = r.length / 4;
    this.rx = new Float32Array(n); this.ry = new Float32Array(n); this.rz = new Float32Array(n); this.rs = new Float32Array(n);
    for (let i = 0; i < n; i++) { this.rx[i] = r[i * 4]; this.ry[i] = r[i * 4 + 1]; this.rz[i] = r[i * 4 + 2]; this.rs[i] = r[i * 4 + 3]; }
    this.routeLen = this.rs[n - 1];
    this.routeGrid = new Map(); const RG = 50;
    for (let i = 0; i < n; i++) {
      const k = Math.floor(this.rx[i] / RG) * 100000 + Math.floor((this.ry[i] + 50000) / RG);
      let a = this.routeGrid.get(k); if (!a) this.routeGrid.set(k, (a = [])); a.push(i);
    }
    this.RG = RG;
    // colliders: cx, cy, hx, hy, angle, z0, z1 (blender)
    this.col = new Float32Array(cBuf);
    this.colGrid = new Map(); const CG = 24; this.CG = CG;
    const nc = this.col.length / 7;
    for (let c = 0; c < nc; c++) {
      const o = c * 7, cx = this.col[o], cy = this.col[o + 1], rad = Math.hypot(this.col[o + 2], this.col[o + 3]);
      const i0 = Math.floor((cx - rad) / CG), i1 = Math.floor((cx + rad) / CG);
      const j0 = Math.floor((cy - rad + 50000) / CG), j1 = Math.floor((cy + rad + 50000) / CG);
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
        const k = i * 100000 + j; let a = this.colGrid.get(k); if (!a) this.colGrid.set(k, (a = [])); a.push(c);
      }
    }
    this.lakes = Object.entries(m.lakes).map(([name, v]) => ({ name, cx: v.center[0], cy: v.center[1], rx: v.radius[0], ry: v.radius[1], z: v.water_z }));
  }

  // ------------------------------------------------------------ terrain
  hRaw(i, j) { return this.hq[j * this.NX + i] / this.meta.H_SCALE - this.meta.H_OFF; }

  H(bx, by) {
    let fx = (bx - this.X0) / this.CELL, fy = (by - this.Y0) / this.CELL;
    fx = Math.min(Math.max(fx, 0), this.NX - 1.001); fy = Math.min(Math.max(fy, 0), this.NY - 1.001);
    const i = fx | 0, j = fy | 0, tx = fx - i, ty = fy - j, NX = this.NX, q = this.hq, s = this.meta.H_SCALE, o = this.meta.H_OFF;
    const a = q[j * NX + i], b = q[j * NX + i + 1], c = q[(j + 1) * NX + i], d = q[(j + 1) * NX + i + 1];
    return (a * (1 - tx) * (1 - ty) + b * tx * (1 - ty) + c * (1 - tx) * ty + d * tx * ty) / s - o;
  }

  // ------------------------------------------------------------ highway
  roadInfo(bx, by) {
    const RG = this.RG, ci = Math.floor(bx / RG), cj = Math.floor((by + 50000) / RG);
    let best = -1, bd = 1e18;
    for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++) {
      const a = this.routeGrid.get(i * 100000 + j); if (!a) continue;
      for (const k of a) { const dx = this.rx[k] - bx, dy = this.ry[k] - by, d = dx * dx + dy * dy; if (d < bd) { bd = d; best = k; } }
    }
    if (best < 0) return null;
    // project on the neighbouring segment
    const n = this.rx.length;
    let i0 = Math.max(0, best - 1), i1 = Math.min(n - 1, best + 1);
    let res = null;
    for (const [p, q] of [[i0, best], [best, i1]]) {
      if (p === q) continue;
      const ax = this.rx[p], ay = this.ry[p], ex = this.rx[q] - ax, ey = this.ry[q] - ay, L2 = ex * ex + ey * ey;
      let t = ((bx - ax) * ex + (by - ay) * ey) / L2; t = Math.min(1, Math.max(0, t));
      const px = ax + ex * t, py = ay + ey * t, d = Math.hypot(bx - px, by - py);
      if (!res || d < res.d) {
        const L = Math.sqrt(L2), tx = ex / L, ty = ey / L;
        res = { d, i: p, t, z: this.rz[p] + (this.rz[q] - this.rz[p]) * t, s: this.rs[p] + (this.rs[q] - this.rs[p]) * t,
                tx, ty, lat: (bx - px) * -ty + (by - py) * tx };
      }
    }
    return res;
  }

  routeAt(s) {   // position / tangent at distance s along the highway
    const rs = this.rs; let lo = 0, hi = rs.length - 1;
    s = Math.min(Math.max(s, 0), rs[hi]);
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (rs[mid] <= s) lo = mid; else hi = mid; }
    const t = (s - rs[lo]) / Math.max(rs[hi] - rs[lo], 1e-6);
    const x = this.rx[lo] + (this.rx[hi] - this.rx[lo]) * t, y = this.ry[lo] + (this.ry[hi] - this.ry[lo]) * t;
    const z = this.rz[lo] + (this.rz[hi] - this.rz[lo]) * t;
    let tx = this.rx[hi] - this.rx[lo], ty = this.ry[hi] - this.ry[lo]; const L = Math.hypot(tx, ty) || 1;
    return { x, y, z, tx: tx / L, ty: ty / L, i: lo };
  }

  nearestRouteS(bx, by) {
    const ri = this.roadInfo(bx, by); if (ri) return ri.s;
    let best = 0, bd = 1e18;
    for (let i = 0; i < this.rx.length; i += 4) { const d = (this.rx[i] - bx) ** 2 + (this.ry[i] - by) ** 2; if (d < bd) { bd = d; best = i; } }
    return this.rs[best];
  }

  // ground the actor stands on: terrain, or the highway deck (bridges) when on / above it
  ground(bx, by, curZ = Infinity) {
    const h = this.H(bx, by);
    const ri = this.roadInfo(bx, by);
    if (ri && ri.d < this.meta.road_half + 1.4) {
      const rz = ri.z;
      if (rz - h > 2.5 && curZ < rz - 2.0) return { z: h, road: false, ri };   // under a bridge
      if (rz >= h - 0.5) return { z: Math.max(rz, h), road: ri.d < this.meta.road_half, ri };
    }
    return { z: h, road: false, ri };
  }

  waterLevel(bx, by, h = this.H(bx, by)) {
    if (h < 0.0) return 0.0;
    for (const L of this.lakes) {
      const q = ((bx - L.cx) / L.rx) ** 2 + ((by - L.cy) / L.ry) ** 2;
      if (q < 2.25 && h < L.z) return L.z;
    }
    const rv = this.meta.river;
    if (Math.abs(bx - riverX(by)) < rv.hw + 70 && h < rv.z) return rv.z;
    if (Math.abs(bx - canyonX(by)) < 80 && h < this.meta.canyon.z) return this.meta.canyon.z;
    return null;
  }

  // ------------------------------------------------------------ collisions (circle vs oriented boxes), blender XY
  collide(bx, by, r, z0, z1, out) {
    out.x = 0; out.y = 0; out.hit = false;
    const CG = this.CG, ci = Math.floor(bx / CG), cj = Math.floor((by + 50000) / CG), C = this.col;
    const seen = this._seen || (this._seen = new Set()); seen.clear();
    for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++) {
      const a = this.colGrid.get(i * 100000 + j); if (!a) continue;
      for (const c of a) {
        if (seen.has(c)) continue; seen.add(c);
        const o = c * 7;
        if (z1 < C[o + 5] || z0 > C[o + 6]) continue;
        const dx = bx + out.x - C[o], dy = by + out.y - C[o + 1];
        const cs = Math.cos(C[o + 4]), sn = Math.sin(C[o + 4]);
        const u = dx * cs + dy * sn, w = -dx * sn + dy * cs, hu = C[o + 2], hw = C[o + 3];
        if (Math.abs(u) > hu + r || Math.abs(w) > hw + r) continue;
        const qu = Math.min(hu, Math.max(-hu, u)), qw = Math.min(hw, Math.max(-hw, w));
        let nu = u - qu, nw = w - qw, d = Math.hypot(nu, nw), push;
        if (d < 1e-6) {           // centre inside the box: leave by the nearest face
          const pu = hu - Math.abs(u), pw = hw - Math.abs(w);
          if (pu < pw) { nu = Math.sign(u) || 1; nw = 0; push = pu + r; } else { nu = 0; nw = Math.sign(w) || 1; push = pw + r; }
        } else {
          if (d >= r) continue;
          nu /= d; nw /= d; push = r - d;
        }
        out.x += (nu * cs - nw * sn) * push; out.y += (nu * sn + nw * cs) * push; out.hit = true;
      }
    }
    return out;
  }

  stageAt(bx) {
    const st = this.meta.stages; let k = 0;
    for (let i = 0; i < st.length; i++) if (bx >= st[i].x) k = i;
    return st[k];
  }

  inBounds(bx, by) {
    return { x: Math.min(this.X1 - 60, Math.max(this.X0 + 60, bx)), y: Math.min(this.Y1 - 60, Math.max(this.Y0 + 60, by)) };
  }
}
