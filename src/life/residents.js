// residents.js - Minecraft-style townsfolk doing context-appropriate things:
//   streets: walk the block grid, chat in groups, wait by the highway; parks: jog, picnic, chat;
//   beach: sunbathe / stroll; lakes & rivers: fish; plains fields: farm; landmarks: take photos.
// Quest NPCs (givers, thief, injured people) are "persistent" residents with their own ai().
import * as THREE from 'three';
import { PartRig, merge, tint } from './rig.js';
import { canyonX, riverX } from '../data.js';

const SHIRTS = [0xd94141, 0x2f6fd6, 0xf2f2f2, 0x2d8a4e, 0xf0b429, 0x6b3fa0, 0x222222, 0xe07a2f, 0x58c0d8, 0xc7b299, 0x8a1c3a];
const PANTS = [0x1f2a44, 0x2b2b2b, 0x5a4a3a, 0x3a4f6b, 0x7b6d5d, 0x111111, 0x6a6f78];
const SKIN = [0xf1c9a5, 0xe0ac86, 0xc68642, 0x8d5524, 0xffdbb4, 0xa86b45];
const HAIR = [0x1b1209, 0x3b2314, 0x6b4423, 0xb8892f, 0x111111, 0x9a9a9a, 0x7a1f12];
const pick = (a) => a[(Math.random() * a.length) | 0];
const wpick = (w) => { let t = 0; for (const k in w) t += w[k]; let r = Math.random() * t; for (const k in w) { r -= w[k]; if (r <= 0) return k; } return Object.keys(w)[0]; };

// Minecraft-style blocky person (32 "pixels" tall = 1.8 m)
const PX = 1.8 / 32;
const box = (w, h, d, x, y, z, r = 1, g = 1, b = 1) => tint(new THREE.BoxGeometry(w * PX, h * PX, d * PX).translate(x * PX, y * PX, z * PX), r, g, b);
export function humanParts() {
  const torso = merge(box(8, 12, 4, 0, 18, 0), box(8.2, 1, 4.2, 0, 12.5, 0, 0.45, 0.32, 0.2));
  const head = merge(box(8, 8, 8, 0, 28, 0));
  const face = merge(
    box(2, 1, 0.2, -2, 28, 4.1, 1, 1, 1), box(1, 1, 0.25, -1.5, 28, 4.12, 0.25, 0.35, 0.8),
    box(2, 1, 0.2, 2, 28, 4.1, 1, 1, 1), box(1, 1, 0.25, 1.5, 28, 4.12, 0.25, 0.35, 0.8),
    box(2, 1, 0.2, 0, 26, 4.1, 0.55, 0.3, 0.25), box(4, 0.6, 0.2, 0, 25, 4.1, 0.45, 0.25, 0.2));
  const hair = merge(box(8.4, 2.5, 8.4, 0, 31.4, 0), box(8.4, 5, 1.2, 0, 29, -3.8), box(1.2, 3, 8.4, 3.8, 29.8, 0), box(1.2, 3, 8.4, -3.8, 29.8, 0));
  const leg = merge(box(4, 12, 4, 0, -6, 0), box(4.2, 2, 4.2, 0, -11, 0, 0.35, 0.35, 0.38));
  const arm = merge(box(4, 12, 4, 0, -4, 0), box(4.05, 3, 4.05, 0, -8.6, 0, 0.95, 0.78, 0.62));
  // tool held in the right hand (fishing rod / hoe): follows the right arm's pose
  const tool = merge(box(1, 1, 28, 0, -10, 13, 0.45, 0.3, 0.15), box(1.5, 3, 1.5, 0, -11, 27, 0.75, 0.75, 0.78));
  return [
    { name: 'torso', geo: torso }, { name: 'head', geo: head }, { name: 'face', geo: face }, { name: 'hair', geo: hair },
    { name: 'legL', geo: leg, pivot: [2 * PX, 12 * PX, 0] }, { name: 'legR', geo: leg, pivot: [-2 * PX, 12 * PX, 0] },
    { name: 'armL', geo: arm, pivot: [6 * PX, 22 * PX, 0] }, { name: 'armR', geo: arm, pivot: [-6 * PX, 22 * PX, 0] },
    { name: 'tool', geo: tool, pivot: [-6 * PX, 22 * PX, 0] },
  ];
}

const coastW = (y) => 300 * Math.sin(y / 2600 + 0.4) + 120 * Math.sin(y / 900) - 400 * Math.exp(-(((y + 4500) / 1500) ** 2));
const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const canyonHW = (y) => 170 + 1700 * ss(900, 4200, y) + 600 * ss(-2200, -5500, y);
const yawFromBlender = (a) => Math.atan2(Math.cos(a), -Math.sin(a));        // blender heading -> three yaw
const D2R = Math.PI / 180;

export class Residents {
  constructor(scene, world, max = 320) {
    this.w = world; this.max = max; this.list = []; this.enabled = true; this.t = 0;
    this.rig = new PartRig(scene, humanParts(), max + 40);
    const gridDeg = { 'Pacific Bay': 0, 'Gateway City': 0, 'Atlantic Harbor': 29 };
    this.towns = Object.entries(world.meta.towns).map(([name, t]) => {
      let grid = gridDeg[name];
      if (grid === undefined) {      // small towns: blocks align with the highway through town
        const s = world.nearestRouteS(t.center[0], t.center[1]), r = world.routeAt(s);
        grid = Math.atan2(r.ty, r.tx) / D2R;
      }
      return { name, cx: t.center[0], cy: t.center[1], rx: t.radius[0], ry: t.radius[1], city: /city/.test(t.style), grid: grid * D2R };
    });
    const ax = riverX(450) - world.meta.river.hw - 130;
    this.parks = [[1900, 350, 2900, 480, 0], [3300, 1500, 260, 220, 0], [2450, -900, 400, 400, 0], [75300, -650, 420, 300, 0],
                  [96650, 3300, 1900, 430, 29], [98950, -1500, 250, 220, 0], [ax - 60, 450, 110, 340, 0]]
      .map(([cx, cy, sx, sy, a]) => ({ cx, cy, sx, sy, a: a * D2R }));
    this.landmarks = [
      { bx: 1650, by: 2850, r: 60, look: [1500, 3650] },                       // Golden Gate viewpoint
      { bx: ax - 120, by: 450, r: 60, look: [ax, 450] },                         // Gateway Arch
      { bx: canyonX(3000) + canyonHW(3000) + 40, by: 3000, r: 70, look: [canyonX(3000), 3000] },   // canyon rim
      { bx: 95300, by: -3560, r: 45, look: [95300, -3900] },                   // lighthouse
      { bx: 62550, by: 150, r: 40, look: [62650, 330] },                       // red barn
    ];
    this._c = { x: 0, y: 0, hit: false };
  }

  // ------------------------------------------------------------ places
  townAt(bx, by) { for (const t of this.towns) if (((bx - t.cx) / t.rx) ** 2 + ((by - t.cy) / t.ry) ** 2 < 1) return t; return null; }
  parkAt(bx, by) {
    for (const p of this.parks) {
      const c = Math.cos(-p.a), s = Math.sin(-p.a), u = c * (bx - p.cx) - s * (by - p.cy), v = s * (bx - p.cx) + c * (by - p.cy);
      if (Math.abs(u) < p.sx / 2 && Math.abs(v) < p.sy / 2) return p;
    }
    return null;
  }
  onBeach(bx, by) { const cw = coastW(by); return by > -2200 && by < 2700 && bx > cw + 25 && bx < cw + 230; }
  free(bx, by, z) {
    const w = this.w;
    if (w.waterLevel(bx, by) !== null) return false;
    const ri = w.roadInfo(bx, by); if (ri && ri.d < 11.5) return false;
    return !w.collide(bx, by, 0.4, z + 0.2, z + 1.7, this._c).hit;
  }
  shoreDir(bx, by) {      // direction (blender angle) towards water within 8 m, or null
    for (let k = 0; k < 8; k++) {
      const a = k * Math.PI / 4;
      if (this.w.waterLevel(bx + Math.cos(a) * 8, by + Math.sin(a) * 8) !== null) return a;
    }
    return null;
  }

  // ------------------------------------------------------------ spawning
  make(bx, by, act, extra = {}) {
    const z = this.w.H(bx, by);
    const kid = Math.random() < 0.07 && !['farm', 'fish', 'wait'].includes(act);
    const c = { torso: pick(SHIRTS), head: pick(SKIN), hair: pick(HAIR), face: 0xffffff, tool: 0xffffff };
    c.legL = c.legR = pick(PANTS); c.armL = c.armR = c.torso;
    if (act === 'farm') { c.torso = 0x4a7a3a; c.armL = c.armR = 0x4a7a3a; c.legL = c.legR = 0x3b4f8a; c.hair = 0xc8a050; }
    if (act === 'sunbathe') { c.torso = c.armL = c.armR = c.head; }
    return {
      bx, by, z, yaw: Math.random() * Math.PI * 2, phase: Math.random() * 6, speed: 1.0 + Math.random() * 0.5,
      act, base: act, timer: 10 + Math.random() * 30, scale: kid ? 0.62 : 0.93 + Math.random() * 0.14,
      colors: c, down: 0, hp: 10, tool: act === 'fish' || act === 'farm', ...extra,
    };
  }

  trySpawn(fx, fy) {
    const a = Math.random() * Math.PI * 2, d = 35 + Math.random() * 250;
    const bx = fx + Math.cos(a) * d, by = fy + Math.sin(a) * d, z = this.w.H(bx, by);
    if (!this.free(bx, by, z)) return;
    const lm = this.landmarks.find((l) => Math.hypot(l.bx - bx, l.by - by) < l.r);
    const park = this.parkAt(bx, by), town = this.townAt(bx, by), beach = this.onBeach(bx, by);
    let act, home;
    if (lm) {
      act = wpick({ photo: 0.75, walk: 0.25 }); home = { cx: lm.bx, cy: lm.by, r: lm.r };
      const n = this.make(bx, by, act, { home, look: lm.look });
      n.yaw = yawFromBlender(Math.atan2(lm.look[1] - by, lm.look[0] - bx)); this.list.push(n); return;
    }
    const sd = this.shoreDir(bx, by);
    if (sd !== null && Math.random() < 0.8) {
      const n = this.make(bx, by, 'fish', { home: { cx: bx, cy: by, r: 3 } }); n.yaw = yawFromBlender(sd); this.list.push(n); return;
    }
    if (park) { act = wpick({ jog: 0.32, picnic: 0.12, talk: 0.16, walk: 0.4 }); home = { park }; }
    else if (beach) { act = wpick({ sunbathe: 0.45, walk: 0.3, talk: 0.25 }); home = { beach: true }; }
    else if (town) {
      act = wpick({ walk: 0.55, talk: 0.27, wait: 0.18 }); home = { town };
      if (act === 'wait') {       // wait at the highway edge (bus stop / crossing), facing the road
        const ri = this.w.roadInfo(bx, by); if (!ri || ri.d > 40) act = 'walk';
        else {
          const side = Math.sign(ri.lat) || 1, wx = bx + (-ri.ty) * side * (14 - ri.d), wy = by + ri.tx * side * (14 - ri.d);
          if (!this.free(wx, wy, this.w.H(wx, wy))) return;
          const n = this.make(wx, wy, 'wait', { home: { cx: wx, cy: wy, r: 3 } });
          n.yaw = yawFromBlender(Math.atan2(-ri.tx * side, ri.ty * side)); this.list.push(n); return;
        }
      }
    } else if (bx > 58800 && bx < 73000 && this.list.filter((p) => p.act === 'farm').length < 10) {
      const ri = this.w.roadInfo(bx, by); if (ri && ri.d < 40) return;
      act = 'farm'; home = { cx: bx, cy: by, r: 12 };
    } else return;
    if (act === 'talk' || act === 'picnic') {      // little groups facing each other
      const k = 2 + (Math.random() < 0.4 ? 1 : 0);
      for (let i = 0; i < k; i++) {
        const ang = i / k * Math.PI * 2, px = bx + Math.cos(ang) * 0.9, py = by + Math.sin(ang) * 0.9;
        const n = this.make(px, py, act, { home });
        n.yaw = yawFromBlender(ang + Math.PI); n.timer = 25 + Math.random() * 40; this.list.push(n);
      }
      return;
    }
    const n = this.make(bx, by, act, { home });
    if (act === 'walk' && town) n.yaw = yawFromBlender(town.grid) + ((Math.random() * 4) | 0) * Math.PI / 2;   // walk the block grid
    if (act === 'jog') n.speed = 2.8 + Math.random() * 0.8;
    this.list.push(n);
  }

  inHome(p, bx, by) {
    const h = p.home; if (!h) return true;
    if (h.park) { const pk = this.parkAt(bx, by); return pk === h.park; }
    if (h.beach) return this.onBeach(bx, by);
    if (h.town) return this.townAt(bx, by) === h.town;
    return Math.hypot(bx - h.cx, by - h.cy) < h.r;
  }

  addPersistent(npc) { npc.persistent = true; this.list.push(npc); return npc; }
  remove(npc) { const i = this.list.indexOf(npc); if (i >= 0) this.list.splice(i, 1); }

  hit(p, dmg, fromBX, fromBY) {
    p.hp -= dmg;
    if (p.onHit) { p.onHit(dmg); return; }
    const dx = p.bx - fromBX, dy = p.by - fromBY;
    if (p.hp <= 0) { p.down = 12; p.hp = 10; }
    else { p.act = 'flee'; p.timer = 6; p.yaw = Math.atan2(dx, -dy); }
    for (const o of this.list) {   // bystanders panic
      if (o !== p && !o.persistent && Math.hypot(o.bx - p.bx, o.by - p.by) < 25 && o.down <= 0) {
        o.act = 'flee'; o.timer = 5 + Math.random() * 3; o.yaw = Math.atan2(o.bx - fromBX, -(o.by - fromBY));
      }
    }
  }

  // ------------------------------------------------------------ update
  update(dt, fx, fy, camH, origin, threat) {
    const w = this.w, events = []; this.t += dt;
    const near = camH < 450 && this.enabled;
    const town = this.townAt(fx, fy);
    const target = !near ? 0 : town ? (town.city ? this.max : 110) : 45;
    const ambient = this.list.filter((p) => !p.persistent).length;
    if (ambient < target) for (let k = 0; k < 6; k++) this.trySpawn(fx, fy);
    this.list = this.list.filter((p) => p.persistent || (near && Math.hypot(p.bx - fx, p.by - fy) < 380));
    this.rig.begin(origin);
    const t = this.t;
    for (const p of this.list) {
      // the player's car
      if (threat && threat.car) {
        const dx = p.bx - threat.bx, dy = p.by - threat.by, d = Math.hypot(dx, dy);
        if (p.down <= 0 && d < 1.9 && threat.speed > 3) {
          p.down = 6; events.push({ type: 'hit-person', npc: p });
          p.bx += dx / (d || 1) * 1.5; p.by += dy / (d || 1) * 1.5;
          if (p.onHit) p.onHit(99, 'car');
        } else if (d < 15 && threat.speed > 6 && p.down <= 0 && !p.ai) { p.act = 'flee'; p.timer = 1.6; p.yaw = Math.atan2(dx, -dy); }
      } else if (threat) {
        const dx = p.bx - threat.bx, dy = p.by - threat.by, d = Math.hypot(dx, dy);
        if (d < 0.7 && d > 1e-3) { p.bx += dx / d * (0.7 - d); p.by += dy / d * (0.7 - d); }
      }
      let speed = 0;
      if (p.down > 0) {
        p.down -= dt;
        if (p.down <= 0 && p.act !== 'flee') p.act = p.base === 'sunbathe' ? 'walk' : p.base;
      } else if (p.ai) speed = p.ai(p, dt, threat) || 0;
      else {
        p.timer -= dt;
        if (p.timer <= 0) {
          if (p.act === 'flee') p.act = p.base === 'fish' || p.base === 'wait' ? 'walk' : p.base;
          else if (p.act === 'walk' && p.home && p.home.town) { p.yaw += (Math.random() < 0.5 ? 1 : -1) * Math.PI / 2; }
          else if (p.act === 'photo' && Math.random() < 0.5) { p.act = 'walk'; p.timer = 4 + Math.random() * 4; }
          else if (p.base === 'photo') { p.act = 'photo'; if (p.look) p.yaw = yawFromBlender(Math.atan2(p.look[1] - p.by, p.look[0] - p.bx)); }
          else if (p.act === 'talk' && Math.random() < 0.3 && p.home && p.home.town) p.act = 'walk';
          else if (p.act === 'jog' || p.act === 'farm') p.yaw += (Math.random() - 0.5) * 2;
          p.timer = (p.act === 'walk' ? 8 : 15) + Math.random() * 25;
        }
        speed = p.act === 'walk' ? p.speed : p.act === 'jog' ? p.speed : p.act === 'flee' ? 4.6 : p.act === 'farm' ? (Math.sin(t * 0.3 + p.phase) > 0.85 ? 0.6 : 0) : 0;
        if (speed > 0) {
          const nx = p.bx + Math.sin(p.yaw) * speed * dt, ny = p.by - Math.cos(p.yaw) * speed * dt, nz = w.H(nx, ny);
          const ok = this.free(nx, ny, nz) && (p.act === 'flee' || this.inHome(p, nx, ny));
          if (ok) { p.bx = nx; p.by = ny; p.z = nz; }
          else {
            p.yaw += p.home && p.home.town ? (Math.random() < 0.5 ? 1 : 2) * Math.PI / 2 * (Math.random() < 0.5 ? 1 : -1) : Math.PI * (0.5 + Math.random());
            if (p.act === 'walk' && Math.random() < 0.3) { p.act = 'talk'; p.timer = 6 + Math.random() * 8; }
          }
        }
      }
      // ---- pose
      p.phase += speed * dt * 3.4;
      const s = Math.sin(p.phase), amp = Math.min(0.85, speed * 0.36);
      const act = p.down > 0 ? 'down' : speed > 0 ? 'move' : p.act;
      const gest = Math.sin(t * 2.3 + p.phase * 7);
      let pose = { legL: [-s * amp, 0, 0], legR: [s * amp, 0, 0], armL: [s * amp * 0.8, 0, 0.06], armR: [-s * amp * 0.8, 0, -0.06], tool: p.tool ? null : 'hide' };
      let y = p.z, tilt = null;
      const look = [0, Math.sin(t * 0.4 + p.phase) * 0.5, 0];
      if (act === 'talk') { pose.armR = [gest > 0.3 ? -0.7 - gest * 0.4 : -0.05, 0, -0.1]; pose.head = pose.face = pose.hair = [Math.max(0, gest) * 0.12, 0, 0]; }
      if (act === 'wait') { pose.head = pose.face = pose.hair = look; }
      if (act === 'photo') { pose.armL = [-1.85, 0, -0.3]; pose.armR = [-1.85, 0, 0.3]; }
      if (act === 'fish') { const tug = Math.max(0, Math.sin(t * 0.7 + p.phase)) ** 8; pose.armR = [-0.75 - tug * 0.6, 0, 0]; pose.tool = pose.armR; pose.armL = [-0.6, 0, -0.35]; }
      if (act === 'farm') { const sw = Math.sin(t * 3.4 + p.phase); pose.armR = [-1.3 + sw * 0.75, 0, 0]; pose.armL = [-1.1 + sw * 0.75, 0, -0.2]; pose.tool = pose.armR; }
      if (act === 'picnic') { pose.legL = [-1.5, 0, 0.12]; pose.legR = [-1.5, 0, -0.12]; pose.armL = [-0.3, 0, 0.2]; pose.armR = [gest > 0.5 ? -1.2 : -0.3, 0, -0.2]; y -= 12 * PX * p.scale; }
      if (act === 'sunbathe') { tilt = [-Math.PI / 2, 0]; y += 0.12; pose.armL = [0, 0, 0.5]; pose.armR = [0, 0, -0.5]; }
      if (act === 'down') { tilt = [Math.PI / 2, 0]; y += 0.1; }
      if (act === 'wave' || p.wave) { pose.armR = [-2.8, 0, -0.2 + Math.sin(t * 9) * 0.35]; }
      if (p.act === 'flee' && speed > 0) { pose.armL = [s * 1.2, 0, 0.5]; pose.armR = [-s * 1.2, 0, -0.5]; }
      if (speed > 0) y += Math.abs(s) * 0.025;
      this.rig.push(new THREE.Vector3(p.bx, y, -p.by), p.yaw, p.scale, pose, p.colors, tilt);
    }
    this.rig.end();
    return events;
  }

  // targets for combat
  targets() {
    return this.list.map((p) => ({ bx: p.bx, by: p.by, z: p.z, h: 1.8 * p.scale, r: 0.4, kind: 'person', ref: p,
      hit: (dmg, fx, fy) => this.hit(p, dmg, fx, fy) }));
  }
}
