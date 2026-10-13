// camera.js - third-person orbit camera on foot, chase / hood camera in the car (speed-dependent FOV + shake)
import * as THREE from 'three';

export class CameraRig {
  constructor(camera, world) {
    this.cam = camera; this.w = world;
    this.yaw = 0; this.pitch = 0.25; this.dist = 4.2; this.mode = 'chase';
    this.freeLook = 0; this.pos = new THREE.Vector3(); this.look = new THREE.Vector3(); this.init = false;
  }

  orbit(inp) {
    this.yaw -= inp.mdx * 0.0028; this.pitch = THREE.MathUtils.clamp(this.pitch + inp.mdy * 0.0024, -0.6, 1.3);
    if (inp.mdx || inp.mdy) this.freeLook = 1.8;
  }

  // pull the camera in front of walls / bridge parts between the target and the desired position
  avoid(target, want) {
    const N = 14, c = this._c || (this._c = { x: 0, y: 0, hit: false });
    for (let k = 1; k <= N; k++) {
      const t = k / N, x = target.x + (want.x - target.x) * t, y = target.y + (want.y - target.y) * t, z = target.z + (want.z - target.z) * t;
      if (this.w.collide(x, -z, 0.35, y - 0.35, y + 0.35, c).hit) {
        const tt = Math.max(0.12, (k - 1) / N);
        want.set(target.x + (want.x - target.x) * tt, target.y + (want.y - target.y) * tt, target.z + (want.z - target.z) * tt);
        return true;
      }
    }
    return false;
  }

  updateFoot(dt, person, inp) {
    this.orbit(inp);
    this.dist = THREE.MathUtils.clamp(this.dist + inp.wheel * 0.6, 1.8, 14);
    const target = person.pos.clone(); target.y += 1.55;
    const off = new THREE.Vector3(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch)).multiplyScalar(this.dist);
    const want = target.clone().add(off);
    const g = this.w.ground(want.x, -want.z, want.y).z;
    want.y = Math.max(want.y, g + 0.4);
    const blocked = this.avoid(target, want);
    this.pos.lerp(want, this.init && !blocked ? Math.min(1, dt * 14) : 1); this.init = true;
    this.cam.position.copy(this.pos); this.cam.lookAt(target);
    this.cam.fov += (62 - this.cam.fov) * Math.min(1, dt * 4); this.cam.updateProjectionMatrix();
  }

  updateCar(dt, car, inp) {
    if (inp.mdx || inp.mdy) this.orbit(inp);
    this.freeLook = Math.max(0, this.freeLook - dt);
    const carYawCam = car.yaw + Math.PI;          // camera behind the car
    const speed = car.speed;
    if (this.freeLook <= 0) {
      let d = carYawCam - this.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
      this.yaw += d * Math.min(1, dt * (2.5 + speed * 0.04));
      this.pitch += (0.16 - this.pitch) * Math.min(1, dt * 2);
    }
    const kmh = speed * 3.6;
    const fov = this.mode === 'hood' ? 72 + kmh * 0.05 : 64 + Math.min(16, kmh * 0.055);
    this.cam.fov += (fov - this.cam.fov) * Math.min(1, dt * 3); this.cam.updateProjectionMatrix();
    const shake = Math.min(1, Math.max(0, kmh - 160) / 140) * 0.05 + (car.onRoad ? 0 : Math.min(kmh, 100) / 100 * 0.04);
    const sh = new THREE.Vector3((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake, 0);
    if (this.mode === 'hood') {
      const fwd = new THREE.Vector3(Math.sin(car.yaw), 0, Math.cos(car.yaw));
      const p = car.mesh.localToWorld(new THREE.Vector3(0.36, 1.12, -0.1));
      this.cam.position.copy(p).add(sh);
      this.cam.lookAt(p.clone().addScaledVector(fwd, 30).add(new THREE.Vector3(0, -car.pitch * 30 - 0.6, 0)));
      return;
    }
    const dist = 6.2 + Math.min(1.4, kmh / 200);
    this.dist = THREE.MathUtils.clamp(this.dist + inp.wheel * 0.8, 4, 20);
    const D = Math.max(dist, this.dist);
    const target = car.pos.clone(); target.y += 1.25;
    const off = new THREE.Vector3(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch)).multiplyScalar(D);
    const want = target.clone().add(off);
    const g = this.w.ground(want.x, -want.z, want.y).z;
    want.y = Math.max(want.y, g + 0.6);
    const blocked = this.avoid(target, want);
    this.pos.lerp(want, this.init && !blocked ? Math.min(1, dt * 10) : 1); this.init = true;
    this.cam.position.copy(this.pos).add(sh);
    this.cam.lookAt(target.clone().add(new THREE.Vector3(0, 0.4, 0)));
  }

  // ground yaw the player faces when walking (camera forward)
  get groundYaw() { return this.yaw; }
}
