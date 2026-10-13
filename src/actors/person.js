// person.js - on-foot controller: camera-relative walk / run (Shift) / jump (Space), swimming, building collisions
import * as THREE from 'three';
import { buildPerson, animatePerson } from './personModel.js';

const WALK = 1.9, RUN = 6.8, SPRINT_ACC = 14, GRAV = 20, JUMP = 5.6;

export class Person {
  constructor(scene, world) {
    this.w = world;
    this.mesh = buildPerson();
    scene.add(this.mesh);
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0; this.air = false; this.swim = false; this.t = 0;
    this._c = { x: 0, y: 0, hit: false };
    this.pose = {}; this.events = [];   // pose: attack / aim / tumble (combat), events: fall damage
  }

  place(bx, by, yaw = 0) {
    const g = this.w.ground(bx, by, Infinity);
    this.pos.set(bx, g.z, -by); this.vel.set(0, 0, 0); this.yaw = yaw; this.air = false;
    this.sync(0);
  }

  get speed() { return Math.hypot(this.vel.x, this.vel.z); }

  update(dt, inp, camYaw) {
    const w = this.w;
    this.t += dt;
    // desired direction relative to the camera (camera looks along -Z rotated by camYaw)
    let ix = (inp.right ? 1 : 0) - (inp.left ? 1 : 0), iz = (inp.up ? 1 : 0) - (inp.down ? 1 : 0);
    const len = Math.hypot(ix, iz);
    const target = new THREE.Vector2();
    if (len > 0) {
      ix /= len; iz /= len;
      const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw);   // camera forward on the ground
      const rx = Math.cos(camYaw), rz = -Math.sin(camYaw);    // camera right
      const sp = this.swim ? 1.6 : inp.run ? RUN : WALK;
      target.set((fx * iz + rx * ix) * sp, (fz * iz + rz * ix) * sp);
      const want = Math.atan2(target.x, target.y);
      let dy = want - this.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      this.yaw += dy * Math.min(1, dt * 12);
    }
    const acc = this.air ? 3 : SPRINT_ACC;
    this.vel.x += (target.x - this.vel.x) * Math.min(1, dt * acc);
    this.vel.z += (target.y - this.vel.z) * Math.min(1, dt * acc);

    if (inp.jumpPressed && !this.air && !this.swim) { this.vel.y = JUMP; this.air = true; }
    this.vel.y -= GRAV * dt;
    this.pos.addScaledVector(this.vel, dt);
    const b = w.inBounds(this.pos.x, -this.pos.z); this.pos.x = b.x; this.pos.z = -b.y;

    // buildings, rails, poles
    const c = w.collide(this.pos.x, -this.pos.z, 0.32, this.pos.y + 0.3, this.pos.y + 1.7, this._c);
    if (c.hit) { this.pos.x += c.x; this.pos.z -= c.y; }

    // ground / water
    const g = w.ground(this.pos.x, -this.pos.z, this.pos.y + 0.6);
    const wl = w.waterLevel(this.pos.x, -this.pos.z, g.z);
    this.swim = wl !== null && wl - g.z > 1.25;
    if (this.swim) {
      const floatY = wl - 1.25;
      if (this.pos.y < floatY) { this.pos.y += (floatY - this.pos.y) * Math.min(1, dt * 5); this.vel.y = 0; this.air = false; }
    } else if (this.pos.y <= g.z) {
      if (this.air && this.vel.y < -12.5) this.events.push({ type: "fall", v: -this.vel.y });
      this.pos.y = g.z; this.vel.y = 0; this.air = false;
    } else if (this.pos.y > g.z + 0.25) this.air = true;
    else if (!this.air) this.pos.y = g.z;   // stick to slopes when walking down
    this.sync(dt);
  }

  sync(dt) {
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.yaw;
    animatePerson(this.mesh, { speed: this.speed, air: this.air, swim: this.swim, dt, t: this.t, ...this.pose });
  }
}
