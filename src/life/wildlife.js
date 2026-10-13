// wildlife.js - biome-specific animals (herds that graze, wander and flee) and birds circling overhead
import * as THREE from 'three';
import { PartRig, merge, tint } from './rig.js';

// ------------------------------------------------------------------ Minecraft-style species (sizes in "pixels", 1 px = 1/16 m)
const P = 1 / 16;
const B = (w, h, d, x, y, z, c) => tint(new THREE.BoxGeometry(w * P, h * P, d * P).translate(x * P, y * P, z * P), c[0], c[1], c[2]);
const hex = (h) => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];
const BONE = 0xd8c8a8;
// body [w,h,l], leg [w,h], head [w,h,l] in px; c body colour, c2 legs; extra.body / extra.head add boxes; zones = blender x ranges
const SPECIES = {
  cow:     { body: [12, 10, 18], leg: [4, 12], head: [8, 8, 6], c: 0x4a3222, c2: 0xe8e2d8, zones: [[58800, 73000]], herd: [4, 9], walk: 0.8, run: 5, fear: 10, w: 3, big: true,
             tints: [0xffffff, 0xffffff, 0x9a9a9a, 0xd8b090],
             extra: { body: (b) => [B(12.4, 6, 6, 0, b.y + 1, 2, hex(0xe8e2d8)), B(12.4, 5, 5, 0, b.y - 2, -6, hex(0xe8e2d8)), B(5, 2, 4, 0, b.y - 6, -5, hex(0xe6a0a0))],
                      head: (h) => [B(1, 3, 1, 4.5, h.y + 4, h.z - 4, hex(0xdcd3c0)), B(1, 3, 1, -4.5, h.y + 4, h.z - 4, hex(0xdcd3c0)), B(6, 3, 1, 0, h.y - 2, h.z + 0.5, hex(0xb08070))] } },
  pig:     { body: [10, 8, 16], leg: [4, 6], head: [8, 8, 8], c: 0xf0a3a0, c2: 0xe8928f, zones: [[58800, 73000], [80500, 91000]], herd: [2, 5], walk: 0.9, run: 4, fear: 8, w: 2,
             extra: { head: (h) => [B(4, 3, 1, 0, h.y - 1, h.z + 0.5, hex(0xe58a8a)), B(1, 1, 0.3, 1, h.y - 1, h.z + 1.1, hex(0x7a4040)), B(1, 1, 0.3, -1, h.y - 1, h.z + 1.1, hex(0x7a4040))] } },
  sheep:   { body: [12, 12, 16], leg: [4, 12], head: [6, 6, 8], c: 0xf2f2f2, c2: 0xe7d1b8, cHead: 0xd9bfa0, zones: [[58800, 73000], [91500, 104000], [80500, 91000]], herd: [3, 8], walk: 0.8, run: 5, fear: 12, w: 3,
             tints: [0xffffff, 0xffffff, 0xffffff, 0x6b6b6b, 0x3a3a3a, 0xa57a52],
             extra: { head: (h) => [B(6.6, 3, 6, 0, h.y + 3, h.z - 5, hex(0xf2f2f2))] } },
  chicken: { body: [6, 6, 8], leg: [1, 5], head: [4, 6, 3], c: 0xf5f5f5, c2: 0xf0b030, zones: [[58800, 73000]], herd: [3, 7], walk: 0.7, run: 4, fear: 7, w: 1.5,
             extra: { body: (b) => [B(1, 4, 6, 3.5, b.y, 0, hex(0xe8e8e8)), B(1, 4, 6, -3.5, b.y, 0, hex(0xe8e8e8))],
                      head: (h) => [B(4, 2, 2, 0, h.y, h.z + 1, hex(0xf0a020)), B(2, 2, 1, 0, h.y - 2, h.z + 0.5, hex(0xd02020))] } },
  horse:   { body: [10, 10, 22], leg: [4, 12], head: [6, 6, 12], neck: 9, c: 0x8b5a2b, c2: 0x6b4423, zones: [[0, 9800], [58800, 73000], [91500, 104000]], herd: [2, 4], walk: 1.3, run: 12, fear: 18, w: 1.5, big: true,
             tints: [0xffffff, 0x5a4030, 0xeeeeee, 0x2a2a2a, 0xc8a070],
             extra: { head: (h) => [B(2, 12, 6, 0, h.y - 2, h.z - 14, hex(0x2a1a10))] } },
  llama:   { body: [12, 10, 18], leg: [4, 14], head: [6, 6, 8], neck: 12, c: 0xe8d8b8, c2: 0xd8c8a8, zones: [[9800, 30000]], herd: [2, 5], walk: 1.0, run: 7, fear: 16, w: 2,
             tints: [0xffffff, 0xc8a070, 0x9a7050, 0xf8f8f8],
             extra: { body: (b) => [B(12.4, 4, 10, 0, b.y + 4, 2, hex(0xc03030)), B(12.4, 2, 10, 0, b.y + 1, 2, hex(0x3060c0))],
                      head: (h) => [B(1.5, 3, 1, 2, h.y + 4, h.z - 6, hex(0xe8d8b8)), B(1.5, 3, 1, -2, h.y + 4, h.z - 6, hex(0xe8d8b8))] } },
  fox:     { body: [6, 6, 12], leg: [2, 6], head: [8, 6, 6], c: 0xe07a2a, c2: 0x2a2a2a, zones: [[9800, 44000], [80500, 91000]], herd: [1, 2], walk: 1.3, run: 11, fear: 30, w: 2,
             tail: [4, 4, 9, 0xe07a2a], tailTip: true,
             extra: { head: (h) => [B(4, 2, 3, 0, h.y - 2, h.z + 1, hex(0xf2f2f2)), B(2, 2, 1, 2.5, h.y + 4, h.z - 4, hex(0xe07a2a)), B(2, 2, 1, -2.5, h.y + 4, h.z - 4, hex(0xe07a2a))] } },
  wolf:    { body: [8, 8, 14], leg: [2, 8], head: [6, 6, 6], c: 0x9a9a9a, c2: 0x8a8a8a, zones: [[44000, 58800]], herd: [2, 4], walk: 1.3, run: 12, fear: 35, w: 1,
             tail: [2, 2, 8, 0x8a8a8a],
             extra: { body: (b) => [B(9, 9, 6, 0, b.y + 0.5, 4, hex(0xaaaaaa))],
                      head: (h) => [B(3, 3, 3, 0, h.y - 1.5, h.z + 1.5, hex(0x8a8a8a)), B(2, 2, 1, 2, h.y + 4, h.z - 4, hex(0x9a9a9a)), B(2, 2, 1, -2, h.y + 4, h.z - 4, hex(0x9a9a9a))] } },
  goat:    { body: [9, 10, 14], leg: [3, 10], head: [5, 7, 8], c: 0xe8e2d6, c2: 0xd8d2c6, zones: [[30000, 44000], [44000, 58800]], herd: [2, 6], walk: 1.0, run: 9, fear: 30, w: 1.5,
             extra: { head: (h) => [B(1.5, 6, 1.5, 1.5, h.y + 6, h.z - 6, hex(0x5a5048)), B(1.5, 6, 1.5, -1.5, h.y + 6, h.z - 6, hex(0x5a5048)), B(2, 4, 2, 0, h.y - 5, h.z - 2, hex(0xd8d2c6))] } },
  deer:    { body: [8, 9, 16], leg: [3, 14], head: [5, 6, 8], neck: 7, c: 0x9a6a3a, c2: 0x8a5a30, zones: [[43800, 58800], [72500, 92000]], herd: [2, 5], walk: 1.2, run: 12, fear: 40, w: 3,
             tail: [3, 3, 2, 0xf2f2f2],
             extra: { body: (b) => [B(8.2, 3, 12, 0, b.y - 3.5, 0, hex(0xd8c0a0))],
                      head: (h) => [B(1, 8, 1, 2, h.y + 7, h.z - 6, hex(BONE)), B(1, 8, 1, -2, h.y + 7, h.z - 6, hex(BONE)),
                                    B(5, 1, 1, 3.5, h.y + 9, h.z - 6, hex(BONE)), B(5, 1, 1, -3.5, h.y + 9, h.z - 6, hex(BONE)),
                                    B(1, 4, 1, 5.5, h.y + 11, h.z - 6, hex(BONE)), B(1, 4, 1, -5.5, h.y + 11, h.z - 6, hex(BONE))] } },
  elk:     { body: [12, 13, 24], leg: [4, 18], head: [7, 8, 11], neck: 10, c: 0x7a5232, c2: 0x5a3a22, zones: [[44500, 57500]], herd: [3, 7], walk: 1.3, run: 11, fear: 50, w: 2, big: true,
             extra: { body: (b) => [B(12.5, 12, 8, 0, b.y + 0.5, 8.5, hex(0x4a3020))],
                      head: (h) => [B(1.5, 12, 1.5, 3, h.y + 10, h.z - 8, hex(BONE)), B(1.5, 12, 1.5, -3, h.y + 10, h.z - 8, hex(BONE)),
                                    B(8, 1.5, 1.5, 6.5, h.y + 13, h.z - 8, hex(BONE)), B(8, 1.5, 1.5, -6.5, h.y + 13, h.z - 8, hex(BONE)),
                                    B(1.5, 6, 1.5, 9.5, h.y + 16, h.z - 8, hex(BONE)), B(1.5, 6, 1.5, -9.5, h.y + 16, h.z - 8, hex(BONE)),
                                    B(1.5, 5, 1.5, 6, h.y + 18, h.z - 8, hex(BONE)), B(1.5, 5, 1.5, -6, h.y + 18, h.z - 8, hex(BONE))] } },
  bear:    { body: [14, 14, 22], leg: [6, 9], head: [9, 9, 8], c: 0x3a2618, c2: 0x2a1a10, zones: [[44000, 58000], [80500, 91000]], herd: [1, 2], walk: 1.0, run: 9, fear: 22, w: 0.7, big: true,
             extra: { head: (h) => [B(5, 4, 3, 0, h.y - 1.5, h.z + 1.5, hex(0x8a6a50)), B(3, 3, 1, 3.5, h.y + 5, h.z - 6, hex(0x3a2618)), B(3, 3, 1, -3.5, h.y + 5, h.z - 6, hex(0x3a2618))] } },
  bison:   { body: [16, 14, 28], leg: [5, 10], head: [10, 10, 8], c: 0x4a3020, c2: 0x2a1a10, zones: [[58800, 73000]], herd: [6, 14], walk: 1.0, run: 10, fear: 30, w: 2.5, big: true,
             extra: { body: (b) => [B(16.5, 18, 12, 0, b.y + 3, 7, hex(0x5e3d26)), B(10, 6, 10, 0, b.y + 10, 6, hex(0x5e3d26))],
                      head: (h) => [B(4, 2, 2, 6, h.y + 4, h.z - 6, hex(0xd8d0c0)), B(4, 2, 2, -6, h.y + 4, h.z - 6, hex(0xd8d0c0)), B(6, 4, 2, 0, h.y - 6, h.z - 2, hex(0x3a2418))] } },
};
const BIRDS = {
  gull:  { col: 0xf2f2f2, wing: 0xb9c1c8, span: 1.2, zones: [[-4000, 9800], [90500, 104000]], flap: 6, n: [4, 9] },
  hawk:  { col: 0x5a3b22, wing: 0x6e4a2c, span: 1.3, zones: [[9800, 58800]], flap: 2.5, n: [1, 3] },
  crow:  { col: 0x111111, wing: 0x1a1a1a, span: 0.9, zones: [[58800, 92000]], flap: 7, n: [5, 12] },
};

function quadParts(s) {
  const [bw, bh, bl] = s.body, [lw, lh] = s.leg, [hw, hh, hl] = s.head;
  const c = hex(s.c), c2 = hex(s.c2), ch = hex(s.cHead ?? s.c);
  const by = lh + bh / 2;                                  // body centre height (px)
  const body = [B(bw, bh, bl, 0, by, 0, c), ...(s.extra?.body?.({ y: by }) || [])];
  // head part: pivot at the front-top of the body; an optional blocky neck lifts the head (horse / llama / deer / elk)
  const neck = s.neck || 0;
  const pivot = [0, (lh + bh * 0.85) * P, (bl / 2 - 1) * P];
  const hzc = neck ? hl / 2 + 1 : hl / 2 - 1, hyc = neck ? neck + hh / 2 - 2 : 1, front = hzc + hl / 2;
  const hd = [B(hw, hh, hl, 0, hyc, hzc, ch)];
  if (neck) hd.push(B(hw * 0.75, neck + 2, Math.min(hl, 6), 0, neck / 2, 1, c));
  for (const sx of [-1, 1]) {   // pixel eyes on both sides of the face
    hd.push(B(0.3, 1, 1, sx * (hw / 2 + 0.1), hyc + 1, front - 2, [1, 1, 1]));
    hd.push(B(0.35, 1, 0.6, sx * (hw / 2 + 0.15), hyc + 1, front - 1.6, [0.05, 0.05, 0.05]));
  }
  hd.push(...(s.extra?.head?.({ y: hyc, z: front }) || []));   // z = front face of the head
  const parts = [{ name: 'body', geo: merge(...body) }, { name: 'head', geo: merge(...hd), pivot }];
  const hoof = Math.min(2, lh / 4);
  const leg = merge(B(lw, lh, lw, 0, -lh / 2, 0, c2), B(lw + 0.1, hoof, lw + 0.1, 0, -lh + hoof / 2, 0, [0.25, 0.22, 0.2]));
  const lx = (bw - lw) / 2 * P, lz = (bl / 2 - lw / 2 - 1) * P, ly = lh * P;
  parts.push({ name: 'fl', geo: leg, pivot: [lx, ly, lz] }, { name: 'fr', geo: leg, pivot: [-lx, ly, lz] },
             { name: 'bl', geo: leg, pivot: [lx, ly, -lz] }, { name: 'br', geo: leg, pivot: [-lx, ly, -lz] });
  const t = s.tail || [2, 2, 6, s.c];
  const tg = [B(t[0], t[1], t[2], 0, 0, -t[2] / 2, hex(t[3]))];
  if (s.tailTip) tg.push(B(t[0] + 0.2, t[1] + 0.2, 2, 0, 0, -t[2] + 1, [1, 1, 1]));
  parts.push({ name: 'tail', geo: merge(...tg), pivot: [0, (lh + bh * 0.8) * P, -bl / 2 * P] });
  return parts;
}

function birdParts(b) {
  const c = hex(b.col), w = hex(b.wing), S = b.span * 16;
  const body = merge(B(4, 4, 8, 0, 0, 0, c), B(3, 3, 3, 0, 1, 5, c), B(1, 1, 2, 0, 1, 7.4, [0.95, 0.7, 0.15]), B(4, 1, 3, 0, 0, -5, w));
  const wing = (sx) => merge(B(S / 2, 1, 5, sx * S / 4, 0, 0, w), B(S / 4, 1, 3, sx * S * 0.55, 0, -1, w.map((v) => v * 0.7)));
  return [{ name: 'body', geo: body }, { name: 'wl', geo: wing(1) }, { name: 'wr', geo: wing(-1) }];
}

const inZone = (z, bx) => z.some(([a, b]) => bx >= a && bx < b);

export class Wildlife {
  constructor(scene, world) {
    this.w = world; this.herds = []; this.flocks = []; this.enabled = true;
    this.rigs = {};
    for (const [k, s] of Object.entries(SPECIES)) this.rigs[k] = new PartRig(scene, quadParts(s), 90);
    this.brigs = {};
    for (const [k, b] of Object.entries(BIRDS)) this.brigs[k] = new PartRig(scene, birdParts(b), 60, { shadow: false });
    this.towns = Object.values(world.meta.towns).map((t) => ({ cx: t.center[0], cy: t.center[1], rx: t.radius[0] * 1.25, ry: t.radius[1] * 1.25 }));
    this._c = { x: 0, y: 0, hit: false };
    this.spawnT = 0;
  }

  okGround(bx, by) {
    const w = this.w;
    if (w.waterLevel(bx, by) !== null) return false;
    for (const t of this.towns) if (((bx - t.cx) / t.rx) ** 2 + ((by - t.cy) / t.ry) ** 2 < 1) return false;
    const e = 3, sl = Math.hypot(w.H(bx + e, by) - w.H(bx - e, by), w.H(bx, by + e) - w.H(bx, by - e)) / (2 * e);
    if (sl > 0.75) return false;
    if (w.collide(bx, by, 1.0, w.H(bx, by), w.H(bx, by) + 1.5, this._c).hit) return false;
    return true;
  }

  spawnHerd(fx, fy) {
    const a = Math.random() * Math.PI * 2, d = 220 + Math.random() * 520;
    const bx = fx + Math.cos(a) * d, by = fy + Math.sin(a) * d;
    const cands = Object.entries(SPECIES).filter(([, s]) => inZone(s.zones, bx));
    if (!cands.length) return;
    let tot = cands.reduce((t, [, s]) => t + s.w, 0), r = Math.random() * tot, kind = cands[0][0];
    for (const [k, s] of cands) { r -= s.w; if (r <= 0) { kind = k; break; } }
    const s = SPECIES[kind];
    if (!this.okGround(bx, by) || this.w.roadInfo(bx, by)?.d < 20) return;
    const n = s.herd[0] + Math.floor(Math.random() * (s.herd[1] - s.herd[0] + 1));
    const heading = Math.random() * Math.PI * 2, members = [];
    for (let i = 0; i < n; i++) {
      const mx = bx + (Math.random() - 0.5) * (6 + n * 2.5), my = by + (Math.random() - 0.5) * (6 + n * 2.5);
      if (!this.okGround(mx, my)) continue;
      members.push({ bx: mx, by: my, z: this.w.H(mx, my), yaw: heading + (Math.random() - 0.5) * 1.2, phase: Math.random() * 6,
        state: Math.random() < 0.6 ? 'graze' : 'walk', timer: 2 + Math.random() * 8, speed: 0, head: 0,
        scale: 0.9 + Math.random() * 0.2,
        color: s.tints ? s.tints[(Math.random() * s.tints.length) | 0] : 0xffffff });
    }
    if (members.length) this.herds.push({ kind, members, cx: bx, cy: by });
  }

  spawnFlock(fx, fy) {
    const a = Math.random() * Math.PI * 2, d = 100 + Math.random() * 500;
    const bx = fx + Math.cos(a) * d, by = fy + Math.sin(a) * d;
    const cands = Object.keys(BIRDS).filter((k) => inZone(BIRDS[k].zones, bx));
    if (!cands.length) return;
    const kind = cands[(Math.random() * cands.length) | 0], b = BIRDS[kind];
    const n = b.n[0] + Math.floor(Math.random() * (b.n[1] - b.n[0] + 1)), alt = 30 + Math.random() * 90;
    const R = 40 + Math.random() * 120, birds = [];
    for (let i = 0; i < n; i++) birds.push({ a: Math.random() * 6.28, r: R * (0.7 + Math.random() * 0.6), h: alt + (Math.random() - 0.5) * 20,
      w: (Math.random() < 0.5 ? 1 : -1) * (0.15 + Math.random() * 0.1) * (60 / R), flap: Math.random() * 6 });
    this.flocks.push({ kind, cx: bx, cy: by, birds, drift: [Math.random() - 0.5, Math.random() - 0.5] });
  }

  // threat: { bx, by, speed, car }  -> returns hit events
  update(dt, fx, fy, camH, origin, threat) {
    const near = camH < 1200 && this.enabled, events = [];
    this.herds = this.herds.filter((h) => near && Math.hypot(h.cx - fx, h.cy - fy) < 1300);
    this.flocks = this.flocks.filter((f) => near && Math.hypot(f.cx - fx, f.cy - fy) < 1500);
    this.spawnT -= dt;
    if (near && this.spawnT <= 0) {
      this.spawnT = 0.25;
      if (this.herds.length < 10) this.spawnHerd(fx, fy);
      if (this.flocks.length < 5) this.spawnFlock(fx, fy);
    }
    for (const r of Object.values(this.rigs)) r.begin(origin);
    for (const r of Object.values(this.brigs)) r.begin(origin);
    const w = this.w;
    for (const h of this.herds) {
      const s = SPECIES[h.kind], rig = this.rigs[h.kind];
      let sx = 0, sy = 0;
      for (const m of h.members) {
        // fear: run directly away from the player / car
        if (threat) {
          const dx = m.bx - threat.bx, dy = m.by - threat.by, d = Math.hypot(dx, dy);
          const fear = s.fear * (threat.car ? 1.6 + threat.speed / 25 : 1);
          if (d < fear && m.state !== 'down') { m.state = 'flee'; m.timer = 3 + Math.random() * 3; m.yaw = Math.atan2(dx, -dy) + (Math.random() - 0.5) * 0.4; }
          if (threat.car && d < s.body[2] / 32 + 1.8 && threat.speed > 3 && m.state !== 'down') {
            m.state = 'down'; m.timer = 4; events.push({ type: 'hit-animal', big: !!s.big, kind: h.kind });
            m.bx += dx / (d || 1) * 2; m.by += dy / (d || 1) * 2;
          }
        }
        m.timer -= dt;
        if (m.timer <= 0) {
          if (m.state === 'down') { m.state = 'flee'; m.timer = 3; }
          else { m.state = Math.random() < 0.55 ? 'graze' : 'walk'; m.timer = 3 + Math.random() * 9; m.yaw += (Math.random() - 0.5) * 1.5; }
        }
        const target = m.state === 'walk' ? s.walk : m.state === 'flee' ? s.run : 0;
        m.speed += (target - m.speed) * Math.min(1, dt * 3);
        if (m.speed > 0.05 && m.state !== 'down') {
          const nx = m.bx + Math.sin(m.yaw) * m.speed * dt, ny = m.by - Math.cos(m.yaw) * m.speed * dt;
          if (this.okGround(nx, ny)) { m.bx = nx; m.by = ny; }
          else { m.yaw += Math.PI * (0.6 + Math.random() * 0.8); if (m.state !== 'flee') m.state = 'graze'; }
        }
        m.z += (w.H(m.bx, m.by) - m.z) * Math.min(1, dt * 10);
        m.head += ((m.state === 'graze' ? 0.95 : m.state === 'flee' ? -0.15 : 0.1) - m.head) * Math.min(1, dt * 3);
        const run = m.speed > s.walk * 2;
        const legH = s.leg[1] / 16;
        m.phase += m.speed * dt * (run ? 2.2 : 4.2) / Math.max(0.35, legH);
        const ph = m.phase, amp = Math.min(run ? 0.9 : 0.45, m.speed * 0.4);
        const a1 = Math.sin(ph) * amp, a2 = Math.sin(ph + (run ? 0.6 : Math.PI)) * amp;
        const pose = {
          fl: [a1, 0, 0], br: [run ? a1 * 0.9 : a1, 0, 0], fr: [a2, 0, 0], bl: [run ? a2 * 0.9 : a2, 0, 0],
          head: [m.head * (s.neck ? 1.1 : 0.7), Math.sin(ph * 0.3) * 0.1, 0],
          tail: [0.3 + Math.sin(ph * 2 + m.timer) * 0.25, 0, Math.sin(ph * 1.3) * 0.3],
        };
        const bob = run ? Math.abs(Math.sin(ph)) * 0.1 * legH : 0;
        const tilt = m.state === 'down' ? [0, Math.PI / 2 * Math.min(1, (4 - m.timer) * 4)] : null;
        const colors = { body: m.color, head: m.color, tail: m.color, fl: m.color, fr: m.color, bl: m.color, br: m.color };
        rig.push(new THREE.Vector3(m.bx, m.z + bob, -m.by), m.yaw, m.scale, pose, colors, tilt);
        sx += m.bx; sy += m.by;
      }
      h.cx = sx / h.members.length; h.cy = sy / h.members.length;
    }
    const t = performance.now() / 1000;
    for (const f of this.flocks) {
      const b = BIRDS[f.kind], rig = this.brigs[f.kind];
      f.cx += f.drift[0] * dt * 2; f.cy += f.drift[1] * dt * 2;
      const ground = w.H(f.cx, f.cy);
      for (const bd of f.birds) {
        bd.a += bd.w * dt;
        const x = f.cx + Math.cos(bd.a) * bd.r, y = f.cy + Math.sin(bd.a) * bd.r;
        const dx = -Math.sin(bd.a) * Math.sign(bd.w), dy = Math.cos(bd.a) * Math.sign(bd.w);   // tangent
        const flapAmt = (Math.sin(t * 0.7 + bd.flap) > 0.2 || f.kind !== 'hawk') ? 1 : 0.08;
        const fl = Math.sin(t * b.flap + bd.flap) * 0.7 * flapAmt;
        const pose = { wl: [0, 0, fl], wr: [0, 0, -fl] };
        const bank = -Math.sign(bd.w) * 0.35;
        rig.push(new THREE.Vector3(x, Math.max(ground, 0) + bd.h + Math.sin(t + bd.flap) * 2, -y), Math.atan2(dx, -dy), 1, pose,
                 { body: b.col, wl: b.wing, wr: b.wing }, [0, bank]);
      }
    }
    for (const r of Object.values(this.rigs)) r.end();
    for (const r of Object.values(this.brigs)) r.end();
    return events;
  }

  count() {
    return { animals: this.herds.reduce((a, h) => a + h.members.length, 0), birds: this.flocks.reduce((a, f) => a + f.birds.length, 0) };
  }
}
