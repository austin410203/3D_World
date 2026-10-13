// particles.js - Minecraft-style square particles (smoke, fire, hit sparks, hearts) in one InstancedMesh
import * as THREE from 'three';

const PRESETS = {
  smoke: { color: [0x555555, 0x777777, 0x3a3a3a], size: [0.4, 0.9], life: [1.6, 3.0], vel: [0.6, 2.2, 0.6], grow: 1.4, grav: -0.2 },
  fire:  { color: [0xff8a00, 0xffc400, 0xff3d00], size: [0.25, 0.55], life: [0.4, 0.9], vel: [0.5, 2.6, 0.5], grow: -0.6, grav: -0.5, glow: true },
  hit:   { color: [0xb71c1c, 0xe53935], size: [0.08, 0.16], life: [0.4, 0.8], vel: [2.2, 3, 2.2], grow: -0.1, grav: 9 },
  heart: { color: [0xff2d55], size: [0.18, 0.25], life: [1.0, 1.5], vel: [0.4, 1.4, 0.4], grow: 0, grav: -0.3, glow: true },
  dust:  { color: [0xbfa77a, 0x9c8a66], size: [0.15, 0.35], life: [0.6, 1.2], vel: [1.2, 1, 1.2], grow: 0.6, grav: 0.5 },
  spark: { color: [0xffffff, 0xfff176], size: [0.06, 0.12], life: [0.3, 0.6], vel: [3, 3, 3], grow: -0.1, grav: 6, glow: true },
};

export class Particles {
  constructor(scene, max = 700) {
    this.max = max; this.list = [];
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ toneMapped: true }), max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, new THREE.Color());
    this.mesh.frustumCulled = false; this.mesh.count = 0;
    scene.add(this.mesh);
    this.origin = new THREE.Vector3();
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._v = new THREE.Vector3(); this._s = new THREE.Vector3(); this._c = new THREE.Color();
  }

  emit(type, pos, n = 1) {     // pos: three world coords
    const p = PRESETS[type];
    for (let i = 0; i < n && this.list.length < this.max; i++) {
      const r = (a) => a[0] + Math.random() * (a[1] - a[0]);
      this.list.push({
        x: pos.x + (Math.random() - 0.5) * 0.4, y: pos.y, z: pos.z + (Math.random() - 0.5) * 0.4,
        vx: (Math.random() - 0.5) * 2 * p.vel[0], vy: Math.random() * p.vel[1], vz: (Math.random() - 0.5) * 2 * p.vel[2],
        life: r(p.life), age: 0, size: r(p.size), p, col: p.color[(Math.random() * p.color.length) | 0], rot: Math.random() * 6,
      });
    }
  }

  update(dt, origin) {
    this.origin.copy(origin); this.mesh.position.copy(origin);
    let n = 0;
    this.list = this.list.filter((q) => (q.age += dt) < q.life);
    for (const q of this.list) {
      q.vy -= q.p.grav * dt; q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
      q.vx *= 0.98; q.vz *= 0.98;
      const k = q.age / q.life, s = Math.max(0.01, q.size * (1 + q.p.grow * k) * (1 - k * 0.5));
      this._q.setFromAxisAngle(this._v.set(0, 1, 0), q.rot);
      this._m.compose(this._v.set(q.x - origin.x, q.y, q.z - origin.z), this._q, this._s.setScalar(s));
      this.mesh.setMatrixAt(n, this._m);
      this.mesh.setColorAt(n, this._c.setHex(q.col).multiplyScalar(q.p.glow ? 1.6 : 1));
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
