// traffic.js - cars cruising both directions of the highway around the player (instanced)
import * as THREE from 'three';
import { graded } from '../theme.js';
import { trafficCarGeometry } from '../actors/carModel.js';
import { pixelNoise } from '../pixel.js';

const LANES = [   // lateral offset (blender, + = left of travel direction), direction, speed m/s
  [-1.75, 1, 31], [-5.25, 1, 25], [1.75, -1, 30], [5.25, -1, 24],
];
const COLORS = [0xc8102e, 0xf2f2f2, 0x1f3f8f, 0x111111, 0x8a8d91, 0x2e6b30, 0xd4a017, 0x5a2d82];

export class Traffic {
  constructor(scene, world, n = 70) {
    this.w = world; this.n = n;
    this.mesh = new THREE.InstancedMesh(trafficCarGeometry(),
      graded(new THREE.MeshStandardMaterial({ vertexColors: true, map: pixelNoise(16, 0.8, 1, 11), roughness: 0.45, metalness: 0.15 })), n);
    this.mesh.castShadow = true; this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this.cars = []; this.blockers = [];
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      this.cars.push({ s: 0, lane: LANES[i % 4], speed: 0, alive: false });
      this.mesh.setColorAt(i, c.setHex(COLORS[i % COLORS.length]));
    }
    this.m4 = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.p = new THREE.Vector3(); this.one = new THREE.Vector3(1, 1, 1);
    this.origin = new THREE.Vector3();
  }

  spawn(c, sPlayer, far) {
    const L = this.w.routeLen;
    const lane = c.lane;
    // spread lanes into fixed slots so cars in a lane never overlap
    c.s = Math.min(L - 50, Math.max(50, sPlayer + (Math.random() * 2 - 1) * far));
    c.speed = lane[2] * (0.97 + Math.random() * 0.06);
    c.alive = true;
  }

  update(dt, playerBX, playerBY, sPlayer, playerCar) {
    const far = 2400, L = this.w.routeLen;
    // keep the instanced mesh near the player for float precision
    this.origin.set(Math.round(playerBX / 1000) * 1000, 0, -Math.round(playerBY / 1000) * 1000);
    this.mesh.position.copy(this.origin);
    for (let i = 0; i < this.n; i++) {
      const c = this.cars[i];
      if (!c.alive || Math.abs(c.s - sPlayer) > far + 300 || c.s < 10 || c.s > L - 10) this.spawn(c, sPlayer, far);
      // slow down behind the player car in the same lane
      let v = c.speed;
      const r = this.w.routeAt(c.s);
      // lateral offset along the route's left normal (-ty, tx); eastbound lanes are on the right (negative)
      const bx = r.x - r.ty * c.lane[0], by = r.y + r.tx * c.lane[0];
      if (playerCar) {
        const dx = playerCar.x - bx, dy = playerCar.y - by, ahead = (dx * r.tx + dy * r.ty) * c.lane[1];
        if (ahead > 0 && ahead < 35 && Math.abs(dx * -r.ty + dy * r.tx - c.lane[0]) < 2.2) v = Math.min(v, Math.max(0, (ahead - 9) * 0.8));
      }
      // queue behind the car ahead in the same lane, and stop for blockers (accidents)
      for (const o of this.cars) {
        if (o === c || o.lane !== c.lane || !o.alive) continue;
        const ahead = (o.s - c.s) * c.lane[1];
        if (ahead > 0 && ahead < 40) v = Math.min(v, Math.max(0, (ahead - 9) * 0.9), o.v ?? v);
      }
      for (const b of this.blockers) {
        if (b.dir !== c.lane[1]) continue;
        const ahead = (b.s - c.s) * c.lane[1];
        if (ahead > 0 && ahead < 120) v = Math.min(v, Math.max(0, (ahead - 22) * 0.4));
      }
      c.v = v;
      c.s += v * c.lane[1] * dt;
      const yaw = Math.atan2(r.tx * c.lane[1], -r.ty * c.lane[1]);
      this.p.set(bx - this.origin.x, r.z, -by - this.origin.z);
      this.q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
      this.mesh.setMatrixAt(i, this.m4.compose(this.p, this.q, this.one));
      c.bx = bx; c.by = by; c.vx = r.tx * v * c.lane[1]; c.vy = r.ty * v * c.lane[1];
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
