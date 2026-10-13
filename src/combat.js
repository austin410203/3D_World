// combat.js - health (10 hearts = 20 hp), hotbar weapons (fist / diamond sword / bow), melee and arrows
import * as THREE from 'three';
import { pixelNoise } from './pixel.js';
import { PX } from './actors/personModel.js';

export const WEAPONS = [
  { id: 'fist', name: '拳頭', icon: '✊', dmg: 2, range: 2.4, cd: 0.35 },
  { id: 'sword', name: '鑽石劍', icon: '🗡️', dmg: 7, range: 3.3, cd: 0.5 },
  { id: 'bow', name: '弓', icon: '🏹', dmg: 9, cd: 0.7, speed: 52 },
];

function swordMesh() {
  const g = new THREE.Group(), pix = pixelNoise(16, 0.8, 1, 5);
  const m = (c, e = 0) => new THREE.MeshStandardMaterial({ color: c, map: pix, roughness: 0.4, metalness: 0.3, emissive: c, emissiveIntensity: e });
  const b = (w, h, d, x, y, z, mm) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w * PX, h * PX, d * PX), mm); o.position.set(x * PX, y * PX, z * PX); o.castShadow = true; g.add(o); };
  b(1, 1, 5, 0, 0, 1.5, m(0x5a3a1a));                 // grip
  b(5, 1, 1, 0, 0, 4, m(0x1f6f6a));                   // guard
  b(1, 1.6, 14, 0, 0, 11.5, m(0x4ee6dc, 0.25));       // diamond blade
  b(1, 1, 1, 0, 0, 19, m(0x9ff6ef, 0.3));
  g.rotation.x = -0.25;
  return g;
}
function bowMesh() {
  const g = new THREE.Group(), pix = pixelNoise(16, 0.8, 1, 6);
  const wood = new THREE.MeshStandardMaterial({ color: 0x8b5a2b, map: pix, roughness: 0.8 });
  const str = new THREE.MeshBasicMaterial({ color: 0xdddddd });
  const segs = [[0, 0, 7], [0, 3, 6], [0, 6, 4.5], [0, -3, 6], [0, -6, 4.5]];
  for (const [x, y, z] of segs) { const o = new THREE.Mesh(new THREE.BoxGeometry(1.2 * PX, 3.2 * PX, 1.2 * PX), wood); o.position.set(x, y * PX, z * PX); g.add(o); }
  const s = new THREE.Mesh(new THREE.BoxGeometry(0.3 * PX, 13 * PX, 0.3 * PX), str); s.position.set(0, 0, 3.5 * PX); g.add(s);
  return g;
}
function arrowMesh() {
  const g = new THREE.Group(), pix = pixelNoise(16, 0.8, 1, 8);
  const a = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.75), new THREE.MeshStandardMaterial({ color: 0x8b5a2b, map: pix }));
  const t = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.12), new THREE.MeshStandardMaterial({ color: 0x9e9e9e }));
  t.position.z = 0.4; const f = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.02, 0.14), new THREE.MeshStandardMaterial({ color: 0xffffff }));
  f.position.z = -0.32; g.add(a, t, f);
  return g;
}

export class Combat {
  constructor(scene, world, person) {
    this.scene = scene; this.w = world; this.p = person;
    this.hp = 20; this.maxHp = 20; this.slot = 0; this.cd = 0; this.swing = 0; this.hurtT = 0; this.regenT = 0;
    this.arrows = []; this.events = []; this.aimT = 0;
    const hand = person.mesh.userData.hand;
    this.sword = swordMesh(); this.bow = bowMesh();
    this.sword.position.set(0, -1 * PX, 0); this.bow.position.set(0, -1 * PX, 1 * PX);
    hand.add(this.sword, this.bow);
    this.arrowProto = arrowMesh();
    this.select(0);
  }

  get weapon() { return WEAPONS[this.slot]; }
  select(i) { this.slot = (i + WEAPONS.length) % WEAPONS.length; this.sword.visible = this.weapon.id === 'sword'; this.bow.visible = this.weapon.id === 'bow'; }
  cycle() { this.select(this.slot + 1); }

  heal(n) { this.hp = Math.min(this.maxHp, this.hp + n); }
  damage(n, reason) {
    if (this.hp <= 0) return;
    this.hp = Math.max(0, this.hp - n); this.hurtT = 0.35; this.regenT = 6;
    this.events.push({ type: 'hurt', n, reason });
    if (this.hp <= 0) this.events.push({ type: 'dead', reason });
  }

  // fire / swing. facingYaw: three yaw of the player, aim: THREE.Vector3 world direction (bow)
  attack(facingYaw, aim, targets) {
    if (this.cd > 0) return;
    const wpn = this.weapon; this.cd = wpn.cd;
    const P = this.p.pos;
    if (wpn.id === 'bow') {
      const a = this.arrowProto.clone(); this.scene.add(a);
      const start = new THREE.Vector3(P.x, P.y + 1.45, P.z).addScaledVector(aim, 0.8);
      this.arrows.push({ mesh: a, pos: start, vel: aim.clone().multiplyScalar(wpn.speed), life: 8, stuck: false });
      this.aimT = 0.4; this.events.push({ type: 'shoot' });
      return;
    }
    this.swing = 1;
    // nearest target inside a 70 degree cone in front
    const fx = Math.sin(facingYaw), fy = -Math.cos(facingYaw);   // blender forward
    const bx = P.x, by = -P.z; let best = null, bd = 1e9;
    for (const t of targets) {
      const dx = t.bx - bx, dy = t.by - by, d = Math.hypot(dx, dy);
      if (d > wpn.range + t.r || d < 1e-3 || Math.abs(t.z - P.y) > 2.6) continue;
      if ((dx * fx + dy * fy) / d < 0.35) continue;
      if (d < bd) { bd = d; best = t; }
    }
    if (best) { best.hit(wpn.dmg, bx, by); this.events.push({ type: 'hit', target: best }); }
    else this.events.push({ type: 'swing' });
  }

  update(dt, targets) {
    this.cd = Math.max(0, this.cd - dt);
    this.swing = Math.max(0, this.swing - dt / 0.28);
    this.aimT = Math.max(0, this.aimT - dt);
    this.hurtT = Math.max(0, this.hurtT - dt);
    this.regenT -= dt;
    if (this.regenT <= 0 && this.hp > 0 && this.hp < this.maxHp) { this.hp = Math.min(this.maxHp, this.hp + 1); this.regenT = 3; }
    this.p.pose.attack = this.swing > 0 ? 1 - this.swing : 0;
    this.p.pose.aim = this.weapon.id === 'bow' && this.aimT > 0;
    // arrows: ballistic flight, stick into terrain / walls, hit creatures
    for (const a of this.arrows) {
      a.life -= dt;
      if (a.stuck) continue;
      const steps = Math.ceil(a.vel.length() * dt / 0.5), h = dt / steps;
      for (let k = 0; k < steps && !a.stuck; k++) {
        a.vel.y -= 14 * h; a.pos.addScaledVector(a.vel, h);
        const bx = a.pos.x, by = -a.pos.z;
        if (a.pos.y < this.w.H(bx, by)) { a.stuck = true; break; }
        if (this.w.collide(bx, by, 0.05, a.pos.y - 0.05, a.pos.y + 0.05, { x: 0, y: 0, hit: false }).hit) { a.stuck = true; break; }
        for (const t of targets) {
          if (Math.hypot(t.bx - bx, t.by - by) < t.r + 0.15 && a.pos.y > t.z - 0.1 && a.pos.y < t.z + t.h + 0.2) {
            t.hit(WEAPONS[2].dmg, bx - a.vel.x * 0.01, by + a.vel.z * 0.01); this.events.push({ type: 'hit', target: t, arrow: true });
            a.life = 0; break;
          }
        }
      }
      a.mesh.position.copy(a.pos);
      if (!a.stuck) a.mesh.lookAt(a.pos.clone().add(a.vel));
    }
    this.arrows = this.arrows.filter((a) => { if (a.life <= 0) { this.scene.remove(a.mesh); return false; } return true; });
  }
}
