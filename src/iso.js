// iso.js - isometric "city builder" camera (telephoto perspective ~ orthographic look).
// Follows the player, or pans freely in god mode. Wheel = zoom, drag = rotate, [ / ] = rotate 90 degrees.
import * as THREE from 'three';

export class IsoCam {
  constructor(camera, world) {
    this.cam = camera; this.w = world; this.active = false;
    this.az = Math.PI / 4; this.azTarget = this.az; this.elev = THREE.MathUtils.degToRad(36);
    this.width = 160;                 // metres visible across the screen
    this.target = new THREE.Vector3(); this.init = false; this.fov = 16;
  }

  // three.js yaw whose "camera forward on the ground" matches this view (used for WASD movement)
  get yaw() { return this.az; }

  update(dt, inp, focus, pan = false) {
    if (inp.wheel) this.width = THREE.MathUtils.clamp(this.width * Math.pow(1.15, inp.wheel), 30, 6000);
    if (inp.dragging && inp.mdx) this.azTarget -= inp.mdx * 0.005;
    if (inp.hit('BracketLeft')) this.azTarget += Math.PI / 2;
    if (inp.hit('BracketRight')) this.azTarget -= Math.PI / 2;
    this.az += (this.azTarget - this.az) * Math.min(1, dt * 8);
    if (pan) {
      const s = this.width * 0.9 * dt * (inp.down('ShiftLeft', 'ShiftRight') ? 3 : 1);
      const fx = -Math.sin(this.az), fz = -Math.cos(this.az), rx = Math.cos(this.az), rz = -Math.sin(this.az);
      if (inp.down('KeyW', 'ArrowUp')) { this.target.x += fx * s; this.target.z += fz * s; }
      if (inp.down('KeyS', 'ArrowDown')) { this.target.x -= fx * s; this.target.z -= fz * s; }
      if (inp.down('KeyD', 'ArrowRight')) { this.target.x += rx * s; this.target.z += rz * s; }
      if (inp.down('KeyA', 'ArrowLeft')) { this.target.x -= rx * s; this.target.z -= rz * s; }
      this.target.y += (Math.max(0, this.w.H(this.target.x, -this.target.z)) - this.target.y) * Math.min(1, dt * 6);
    } else if (focus) {
      this.init ? this.target.lerp(focus, Math.min(1, dt * 6)) : this.target.copy(focus);
    }
    this.init = true;
    const fov = THREE.MathUtils.degToRad(this.fov);
    const dist = this.width / (2 * Math.tan(fov / 2) * this.cam.aspect);
    const off = new THREE.Vector3(Math.sin(this.az) * Math.cos(this.elev), Math.sin(this.elev), Math.cos(this.az) * Math.cos(this.elev)).multiplyScalar(dist);
    this.cam.fov = this.fov; this.cam.updateProjectionMatrix();
    this.cam.position.copy(this.target).add(off);
    this.cam.lookAt(this.target);
  }
}
