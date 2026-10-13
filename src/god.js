// god.js - free-flight "god view": fly anywhere over the 106 km world, smooth fly-to for places
import * as THREE from 'three';
import { canyonX, riverX } from './data.js';

// places of interest (blender coords). eye = target + (cos az, sin az) * dist, raised by elev * dist
export const PLACES = [
  { name: '金門大橋', sub: 'Golden Gate', bx: 1500, by: 3650, h: 70, dist: 1100, az: -40, elev: 0.25 },
  { name: '太平洋灣 市中心', sub: 'Pacific Bay (SF)', bx: 4250, by: 2050, h: 120, dist: 1300, az: 210, elev: 0.35 },
  { name: '塵水鎮', sub: 'Dustwater · Route 66', bx: 20000, by: 0, h: 10, dist: 380, az: 240, elev: 0.3 },
  { name: '大峽谷', sub: 'Grand Canyon', bx: () => canyonX(4200), by: 4200, h: -120, dist: 2600, az: 160, elev: 0.28 },
  { name: '峽谷拱橋', sub: 'Marble Gorge Bridge', bx: 38028, by: -600, h: -120, dist: 650, az: 270, elev: 0.12 },
  { name: '銀湖', sub: 'Silver Lake · Rockies', bx: 50700, by: 2750, h: 40, dist: 2600, az: 260, elev: 0.18 },
  { name: '銀峰鎮', sub: 'Silver Pass', bx: 52800, by: 820, h: 10, dist: 420, az: 220, elev: 0.3 },
  { name: '堪薩斯農場', sub: 'Maple Falls farm', bx: 62650, by: 300, h: 8, dist: 320, az: 225, elev: 0.18 },
  { name: '楓瀑鎮', sub: 'Maple Falls', bx: 66000, by: 0, h: 15, dist: 600, az: 230, elev: 0.3 },
  { name: '拱門城', sub: 'Gateway City · Arch', bx: () => riverX(450) - 360, by: 450, h: 100, dist: 700, az: 10, elev: 0.15 },
  { name: '哈珀嶺', sub: "Harper's Ridge", bx: 87400, by: 250, h: 15, dist: 520, az: 210, elev: 0.3 },
  { name: '燈塔岬', sub: 'Lighthouse Point', bx: 95300, by: -3654, h: 30, dist: 520, az: -50, elev: 0.12 },
  { name: '自由女神島', sub: 'Liberty Island', bx: 98400, by: -3300, h: 60, dist: 420, az: -30, elev: 0.12 },
  { name: '大西洋港 中城', sub: 'Atlantic Harbor (NYC)', bx: 97400, by: 2000, h: 220, dist: 1700, az: 250, elev: 0.3 },
];

export class GodMode {
  constructor(camera, world) {
    this.cam = camera; this.w = world; this.active = false;
    this.yaw = 0; this.pitch = -0.35; this.speed = 40; this.fly = null;
    this.vel = new THREE.Vector3();
  }

  enter(from) {
    this.active = true;
    const e = new THREE.Euler().setFromQuaternion(this.cam.quaternion, 'YXZ');
    this.yaw = e.y; this.pitch = Math.min(-0.2, e.x);
    this.cam.position.copy(from); this.cam.position.y += 45;
    this.vel.set(0, 0, 0);
  }

  ground(p) { const g = this.w.H(p.x, -p.z); return Math.max(g, 0); }
  altitude() { return this.cam.position.y - this.ground(this.cam.position); }

  flyTo(place) {
    const bx = typeof place.bx === 'function' ? place.bx() : place.bx, by = place.by;
    const gz = Math.max(0, this.w.H(bx, by));
    const look = new THREE.Vector3(bx, gz + place.h * 0.4, -by);
    const a = THREE.MathUtils.degToRad(place.az);
    const ex = bx + Math.cos(a) * place.dist, ey = by + Math.sin(a) * place.dist;
    const eye = new THREE.Vector3(ex, Math.max(this.w.H(ex, ey), 0, gz) + place.h + place.dist * place.elev, -ey);
    const from = this.cam.position.clone(), d = from.distanceTo(eye);
    this.fly = { from, eye, look, t: 0, dur: THREE.MathUtils.clamp(1.2 + d / 9000, 1.5, 7), peak: Math.min(6000, d * 0.18) };
  }

  update(dt, input, keysDown) {
    const cam = this.cam;
    if (this.fly) {
      const f = this.fly; f.t += dt / f.dur;
      const k = f.t >= 1 ? 1 : 0.5 - 0.5 * Math.cos(Math.PI * f.t);
      cam.position.lerpVectors(f.from, f.eye, k); cam.position.y += Math.sin(Math.PI * k) * f.peak;
      const dir = f.look.clone().sub(cam.position).normalize();
      const ty = Math.atan2(-dir.x, -dir.z), tp = Math.asin(dir.y);
      let dy = ty - this.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      const s = Math.min(1, dt * (f.t > 0.7 ? 6 : 2.5));
      this.yaw += dy * s; this.pitch += (tp - this.pitch) * s;
      if (f.t >= 1) this.fly = null;
      if (input.mdx || input.mdy || keysDown) this.fly = null;      // grab control back
    } else {
      this.yaw -= input.mdx * 0.0026; this.pitch = THREE.MathUtils.clamp(this.pitch - input.mdy * 0.0026, -1.5, 1.4);
      if (input.wheel) this.speed = THREE.MathUtils.clamp(this.speed * Math.pow(1.2, -input.wheel), 5, 2000);
      const alt = Math.max(0, this.altitude());
      const v = this.speed * (1 + alt / 120) * (input.down('ShiftLeft', 'ShiftRight') ? 5 : 1) * (input.down('ControlLeft', 'AltLeft') ? 0.2 : 1);
      const f = new THREE.Vector3(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch));
      const r = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
      const want = new THREE.Vector3();
      if (input.down('KeyW', 'ArrowUp')) want.add(f);
      if (input.down('KeyS', 'ArrowDown')) want.sub(f);
      if (input.down('KeyD', 'ArrowRight')) want.add(r);
      if (input.down('KeyA', 'ArrowLeft')) want.sub(r);
      if (input.down('KeyE', 'Space')) want.y += 1;
      if (input.down('KeyQ', 'KeyC')) want.y -= 1;
      if (want.lengthSq() > 0) want.normalize().multiplyScalar(v);
      this.vel.lerp(want, Math.min(1, dt * 4));
      cam.position.addScaledVector(this.vel, dt);
    }
    // stay above ground, inside a generous box around the world
    const d = this.w;
    cam.position.x = THREE.MathUtils.clamp(cam.position.x, d.X0 - 20000, d.X1 + 20000);
    cam.position.z = THREE.MathUtils.clamp(cam.position.z, -(d.Y1 + 40000), -(d.Y0 - 40000));
    cam.position.y = THREE.MathUtils.clamp(cam.position.y, this.ground(cam.position) + 1.5, 30000);
    cam.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    if (Math.abs(cam.fov - 60) > 0.1) { cam.fov += (60 - cam.fov) * Math.min(1, dt * 4); cam.updateProjectionMatrix(); }
  }
}
