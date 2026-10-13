// ride.js - mount any animal. Untamed animals run wild and buck; each failed attempt raises their trust
// (temper) until they accept the rider (Minecraft horse-style taming). Tamed animals are steered with WASD.
import * as THREE from 'three';
import { RIDE, NAMES, SPECIES } from '../life/wildlife.js';
import { animatePerson } from './personModel.js';

export class Ride {
  constructor(world, wildlife, person) {
    this.w = world; this.wl = wildlife; this.p = person; this.m = null; this.events = []; this.t = 0;
    this._c = { x: 0, y: 0, hit: false };
  }

  get active() { return !!this.m; }
  get name() { return this.m ? NAMES[this.m.kind] : ''; }

  mount(m) {
    this.m = m; m.ridden = true; m.state = 'ridden'; m.speed = 0; m.vy = 0; this.air = false;
    this.wildT = m.tamed ? 0 : 1.6 + Math.random() * 2.4;
    this.wildYaw = m.yaw;
    this.p.mesh.visible = true;
  }

  dismount(thrown = false) {
    const m = this.m; if (!m) return;
    m.ridden = false; m.buck = 0; m.state = m.tamed ? 'graze' : 'flee'; m.timer = m.tamed ? 20 : 4;
    const side = thrown ? 3.2 : 1.6, lx = Math.cos(m.yaw), lz = -Math.sin(m.yaw);
    const x = m.bx + lx * side, y = m.by - lz * side;
    const b = this.w.inBounds(x, y);
    this.p.place(b.x, b.y, m.yaw);
    if (thrown) { this.p.vel.set(lx * 4, 5, -(-lz) * 4); this.p.air = true; }
    this.m = null;
  }

  update(dt, inp) {
    const m = this.m, s = SPECIES[m.kind], w = this.w;
    this.t += dt;
    const top = RIDE[m.kind] || 8;
    let speed = m.speed;
    if (!m.tamed) {
      // wild ride: sprint in random directions and buck; then decide
      this.wildT -= dt;
      this.wildYaw += (Math.sin(this.t * 2.3) + (Math.random() - 0.5) * 2) * dt * 2.2;
      m.yaw += Math.atan2(Math.sin(this.wildYaw - m.yaw), Math.cos(this.wildYaw - m.yaw)) * Math.min(1, dt * 3);
      m.buck = Math.sin(this.t * 3) > 0.2 ? 1 : 0;
      speed += (top * 0.6 - speed) * Math.min(1, dt * 2);
      if (this.wildT <= 0) {
        if (Math.random() * 100 < m.temper) {
          m.tamed = true; m.buck = 0; this.events.push({ type: 'tamed', kind: m.kind, m });
        } else {
          m.temper = Math.min(95, m.temper + 14 + Math.random() * 8);
          this.events.push({ type: 'thrown', kind: m.kind, temper: m.temper });
          this.dismount(true);
          return;
        }
      }
    } else {
      m.buck = 0;
      const turn = (inp.left ? 1 : 0) - (inp.right ? 1 : 0);
      m.yaw += turn * dt * (2.6 - Math.min(1.4, speed * 0.08));
      const want = inp.up ? (inp.run ? top : top * 0.45) : inp.down ? -1.5 : 0;
      speed += (want - speed) * Math.min(1, dt * (want > speed ? 1.6 : 3));
      if (inp.jumpPressed && !this.air) { m.vy = 6.5; this.air = true; }
    }
    // move with collisions; deep water and cliffs stop the animal
    const nx = m.bx + Math.sin(m.yaw) * speed * dt, ny = m.by - Math.cos(m.yaw) * speed * dt;
    const wl = w.waterLevel(nx, ny), gz = w.H(nx, ny);
    const steep = Math.abs(gz - w.H(m.bx, m.by)) > Math.max(1.2, Math.abs(speed * dt) * 1.4) && !this.air;
    if ((wl !== null && wl - gz > 1.0) || steep) { speed *= -0.2; if (!m.tamed) this.wildYaw += Math.PI; }
    else {
      const c = w.collide(nx, ny, 0.8, m.z + 0.3, m.z + 1.8, this._c);
      m.bx = nx + (c.hit ? c.x : 0); m.by = ny + (c.hit ? c.y : 0);
      if (c.hit) speed *= 0.5;
    }
    const b = w.inBounds(m.bx, m.by); m.bx = b.x; m.by = b.y;
    const g = w.ground(m.bx, m.by, m.z + 1).z;
    m.vy -= 20 * dt; m.z += m.vy * dt;
    if (m.z <= g) { m.z = g; m.vy = 0; this.air = false; }
    m.speed = speed;
    // rider
    const seat = this.wl.seatHeight(m);
    const P = this.p, hipY = P.mesh.userData.hipY;
    const bump = Math.abs(Math.sin(m.phase)) * 0.06 * Math.min(1, Math.abs(speed) / 4) + (m.buck ? Math.abs(Math.sin(this.t * 13)) * 0.35 : 0);
    P.pos.set(m.bx, m.z + seat - hipY * 0.55 + bump, -m.by);
    P.yaw = m.yaw; P.vel.set(0, 0, 0);
    P.mesh.position.copy(P.pos); P.mesh.rotation.y = m.yaw;
    animatePerson(P.mesh, { speed: Math.abs(speed), sit: true, dt, t: this.t, ...P.pose });
  }
}
