// residents.js - Minecraft-style blocky pedestrians wandering the cities and towns (instanced, animated)
import * as THREE from 'three';
import { PartRig, merge, tint } from './rig.js';

const SHIRTS = [0xd94141, 0x2f6fd6, 0xf2f2f2, 0x2d8a4e, 0xf0b429, 0x6b3fa0, 0x222222, 0xe07a2f, 0x58c0d8, 0xc7b299, 0x8a1c3a];
const PANTS = [0x1f2a44, 0x2b2b2b, 0x5a4a3a, 0x3a4f6b, 0x7b6d5d, 0x111111, 0x6a6f78];
const SKIN = [0xf1c9a5, 0xe0ac86, 0xc68642, 0x8d5524, 0xffdbb4, 0xa86b45];
const HAIR = [0x1b1209, 0x3b2314, 0x6b4423, 0xb8892f, 0x111111, 0x9a9a9a, 0x7a1f12];
const pick = (a) => a[(Math.random() * a.length) | 0];

// Minecraft-style blocky person (32 "pixels" tall = 1.8 m). Box faces keep exact flat normals.
const PX = 1.8 / 32;
const box = (w, h, d, x, y, z, r = 1, g = 1, b = 1) => tint(new THREE.BoxGeometry(w * PX, h * PX, d * PX).translate(x * PX, y * PX, z * PX), r, g, b);
function humanParts() {
  const torso = merge(box(8, 12, 4, 0, 18, 0), box(8.2, 1, 4.2, 0, 12.5, 0, 0.45, 0.32, 0.2));          // shirt + belt
  const head = merge(box(8, 8, 8, 0, 28, 0));                                                       // skin
  const face = merge(                                                                              // pixel face (fixed colours)
    box(2, 1, 0.2, -2, 28, 4.1, 1, 1, 1), box(1, 1, 0.25, -1.5, 28, 4.12, 0.25, 0.35, 0.8),
    box(2, 1, 0.2, 2, 28, 4.1, 1, 1, 1), box(1, 1, 0.25, 1.5, 28, 4.12, 0.25, 0.35, 0.8),
    box(2, 1, 0.2, 0, 26, 4.1, 0.55, 0.3, 0.25), box(4, 0.6, 0.2, 0, 25, 4.1, 0.45, 0.25, 0.2));
  const hair = merge(box(8.4, 2.5, 8.4, 0, 31.4, 0), box(8.4, 5, 1.2, 0, 29, -3.8), box(1.2, 3, 8.4, 3.8, 29.8, 0), box(1.2, 3, 8.4, -3.8, 29.8, 0));
  const leg = merge(box(4, 12, 4, 0, -6, 0), box(4.2, 2, 4.2, 0, -11, 0, 0.35, 0.35, 0.38));       // trousers + shoes
  const arm = merge(box(4, 12, 4, 0, -4, 0), box(4.05, 3, 4.05, 0, -8.6, 0, 0.95, 0.78, 0.62));    // sleeve + hand
  return [
    { name: 'torso', geo: torso }, { name: 'head', geo: head }, { name: 'face', geo: face }, { name: 'hair', geo: hair },
    { name: 'legL', geo: leg, pivot: [2 * PX, 12 * PX, 0] }, { name: 'legR', geo: leg, pivot: [-2 * PX, 12 * PX, 0] },
    { name: 'armL', geo: arm, pivot: [6 * PX, 22 * PX, 0] }, { name: 'armR', geo: arm, pivot: [-6 * PX, 22 * PX, 0] },
  ];
}

export class Residents {
  constructor(scene, world, max = 320) {
    this.w = world; this.max = max; this.list = [];
    this.rig = new PartRig(scene, humanParts(), max);
    this.towns = Object.values(world.meta.towns).map((t) => ({ cx: t.center[0], cy: t.center[1], rx: t.radius[0], ry: t.radius[1], city: /city/.test(t.style) }));
    this._c = { x: 0, y: 0, hit: false };
    this.enabled = true;
  }

  townAt(bx, by) {
    for (const t of this.towns) if (((bx - t.cx) / t.rx) ** 2 + ((by - t.cy) / t.ry) ** 2 < 1) return t;
    return null;
  }

  okSpot(bx, by, z) {
    const w = this.w;
    if (!this.townAt(bx, by)) return false;
    if (w.waterLevel(bx, by) !== null) return false;
    const ri = w.roadInfo(bx, by); if (ri && ri.d < 12) return false;
    if (w.collide(bx, by, 0.4, z + 0.2, z + 1.7, this._c).hit) return false;
    return true;
  }

  spawn(fx, fy) {
    for (let k = 0; k < 6; k++) {
      const a = Math.random() * Math.PI * 2, d = 40 + Math.random() * 230;
      const bx = fx + Math.cos(a) * d, by = fy + Math.sin(a) * d, z = this.w.H(bx, by);
      if (!this.okSpot(bx, by, z)) continue;
      const kids = Math.random() < 0.08;
      this.list.push({
        bx, by, z, yaw: Math.random() * Math.PI * 2, phase: Math.random() * 6, speed: 1.0 + Math.random() * 0.6,
        state: Math.random() < 0.25 ? 'idle' : 'walk', timer: 2 + Math.random() * 8, scale: kids ? 0.62 : 0.92 + Math.random() * 0.16,
        colors: { torso: pick(SHIRTS), legL: 0, legR: 0, armL: 0, armR: 0, head: pick(SKIN), hair: pick(HAIR), face: 0xffffff }, down: 0,
      });
      const c = this.list[this.list.length - 1].colors; c.legL = c.legR = pick(PANTS); c.armL = c.armR = c.torso;
      return;
    }
  }

  // player: { bx, by, car: bool, speed (m/s), heading } ; returns hit events
  update(dt, fx, fy, camH, origin, player) {
    const w = this.w, events = [];
    const near = camH < 450 && this.enabled;
    // density: busier in the two big cities
    const t = this.townAt(fx, fy);
    const target = !near ? 0 : t ? (t.city ? this.max : 90) : 25;
    if (this.list.length < target) for (let k = 0; k < 4; k++) this.spawn(fx, fy);
    this.list = this.list.filter((p) => Math.hypot(p.bx - fx, p.by - fy) < 360 && near);
    this.rig.begin(origin);
    for (const p of this.list) {
      // react to the player car
      if (player && player.car) {
        const dx = p.bx - player.bx, dy = p.by - player.by, d = Math.hypot(dx, dy);
        if (p.down <= 0 && d < 1.9 && player.speed > 3) {
          p.down = 5; events.push({ type: 'hit-person' });
          p.bx += dx / (d || 1) * 1.5; p.by += dy / (d || 1) * 1.5;
        } else if (d < 14 && player.speed > 6 && p.down <= 0) {   // jump out of the way
          p.state = 'flee'; p.timer = 1.5; p.yaw = Math.atan2(dx, -dy);
        }
      } else if (player) {
        const dx = p.bx - player.bx, dy = p.by - player.by, d = Math.hypot(dx, dy);
        if (d < 0.7 && d > 1e-3) { p.bx += dx / d * (0.7 - d); p.by += dy / d * (0.7 - d); }
      }
      let speed = 0;
      if (p.down > 0) { p.down -= dt; }
      else {
        p.timer -= dt;
        if (p.timer <= 0) {
          p.state = Math.random() < 0.3 ? 'idle' : 'walk'; p.timer = 3 + Math.random() * 10;
          if (Math.random() < 0.5) p.yaw += (Math.random() - 0.5) * 2.4;
        }
        speed = p.state === 'walk' ? p.speed : p.state === 'flee' ? 4.5 : 0;
        if (speed > 0) {
          const nx = p.bx + Math.sin(p.yaw) * speed * dt, ny = p.by - Math.cos(p.yaw) * speed * dt, nz = w.H(nx, ny);
          if (this.okSpot(nx, ny, nz) || p.state === 'flee') { p.bx = nx; p.by = ny; p.z = nz; }
          else { p.yaw += Math.PI * (0.5 + Math.random()); p.timer = Math.min(p.timer, 4); }
        }
      }
      p.phase += speed * dt * 3.6;
      const s = Math.sin(p.phase), amp = Math.min(0.75, speed * 0.38);
      const pos = new THREE.Vector3(p.bx, p.z + Math.abs(s) * 0.025 * (speed > 0 ? 1 : 0), -p.by);
      const pose = {
        legL: [-s * amp, 0, 0], legR: [s * amp, 0, 0],
        armL: [s * amp * 0.8, 0, 0.08], armR: [-s * amp * 0.8, 0, -0.08],
        head: speed === 0 ? [0, Math.sin(p.phase * 0.2 + p.timer) * 0.4, 0] : null,
        face: speed === 0 ? [0, Math.sin(p.phase * 0.2 + p.timer) * 0.4, 0] : null,
        hair: speed === 0 ? [0, Math.sin(p.phase * 0.2 + p.timer) * 0.4, 0] : null,
      };
      if (speed === 0 && p.down <= 0) p.phase += dt * 0.6;
      const tilt = p.down > 0 ? [-Math.PI / 2 * Math.min(1, (5 - p.down) * 4), 0] : null;
      this.rig.push(pos, p.yaw, p.scale, pose, p.colors, tilt);
    }
    this.rig.end();
    return events;
  }
}
