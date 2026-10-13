// car.js - sports car physics: torque curve, 6-speed gearbox (auto / manual, timed shifts with power cut),
// drag-limited acceleration with a 300 km/h limiter, tyre grip / handbrake drift, terrain + bridge following, collisions.
import * as THREE from 'three';
import { buildCar, CAR_DIM } from './carModel.js';

export const GEARS = [3.1, 2.15, 1.62, 1.28, 1.04, 0.86];   // 1st..6th
const REVERSE = 3.3, FINAL = 3.6, EFF = 0.9;
const IDLE = 900, REDLINE = 8000, LIMIT_RPM = 8250;
const MASS = 1480, CDA = 0.62, G = 9.81;
const VMAX = 301 / 3.6;   // governor: holds a displayed 300 km/h
const SHIFT_TIME = 0.24;

export function engineTorque(rpm) {      // Nm, twin-turbo V8 style
  const pts = [[0, 0], [900, 330], [2000, 520], [3000, 640], [4500, 700], [6000, 690], [7200, 640], [8000, 560], [8300, 0]];
  for (let i = 1; i < pts.length; i++) if (rpm <= pts[i][0]) {
    const [r0, t0] = pts[i - 1], [r1, t1] = pts[i]; return t0 + (t1 - t0) * (rpm - r0) / (r1 - r0);
  }
  return 0;
}

export class Car {
  constructor(scene, world) {
    this.w = world;
    this.mesh = buildCar();
    scene.add(this.mesh);
    this.pos = new THREE.Vector3();   // three coords (ground contact point)
    this.yaw = 0;                      // heading: forward = (sin yaw, 0, cos yaw)
    this.vel = new THREE.Vector2();    // world velocity in x / z
    this.vy = 0;
    this.gear = 1; this.rpm = IDLE; this.shiftT = 0; this.shiftTo = 1;
    this.auto = true; this.steer = 0; this.throttle = 0; this.brake = 0;
    this.pitch = 0; this.roll = 0; this.wheelRot = 0; this.yawRate = 0;
    this.onRoad = true; this.inWater = false; this.drift = 0; this.airborne = false;
    this.speedKmh = 0; this.events = [];
    this.hp = 100; this.dead = false;   // damage model: crashes reduce hp, 0 = engine dead
    this._c = { x: 0, y: 0, hit: false };
  }

  place(bx, by, heading) {          // heading = blender angle of the forward vector in XY
    const g = this.w.ground(bx, by, Infinity);
    this.pos.set(bx, g.z, -by);
    this.yaw = Math.atan2(Math.cos(heading), -Math.sin(heading)); // blender (cos h, sin h) -> three forward (x, -y)
    this._lastG = undefined; this.airborne = false;
    this.vel.set(0, 0); this.vy = 0; this.gear = 1; this.rpm = IDLE; this.shiftT = 0;
    this.sync(0);
  }

  get forward() { return new THREE.Vector2(Math.sin(this.yaw), Math.cos(this.yaw)); }
  get speed() { return this.vel.length(); }
  get vLong() { return this.vel.x * Math.sin(this.yaw) + this.vel.y * Math.cos(this.yaw); }

  shift(dir) {
    if (this.shiftT > 0) return;
    let to = this.gear === -1 ? (dir > 0 ? 1 : -1) : this.gear + dir;
    if (to === 0) to = -1;                                   // below 1st is reverse
    if (to < -1 || to > GEARS.length || to === this.gear) return;
    if (to === -1 && this.vLong > 2) return;                 // no reverse while rolling forward
    if (to === -1 || this.gear === -1) { this.gear = to; this.events.push('shift'); return; }
    this.shiftTo = to; this.shiftT = SHIFT_TIME; this.events.push('shift');
  }

  ratio(gear) { return gear === -1 ? -REVERSE * FINAL : GEARS[gear - 1] * FINAL; }

  update(dt, inp) {
    const n = Math.max(1, Math.ceil(dt / (1 / 120))), h = dt / n;
    for (let i = 0; i < n; i++) this.step(h, inp);
    this.sync(dt);
  }

  step(dt, inp) {
    const w = this.w;
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);   // forward
    const rxv = -fz, rzv = fx;                                   // right
    let vLong = this.vel.x * fx + this.vel.y * fz;
    let vLat = this.vel.x * rxv + this.vel.y * rzv;
    const spd = Math.abs(vLong);

    // ---- driver inputs -> throttle / brake, reverse handling
    let up = inp.up, down = inp.down;
    if (this.gear === -1) [up, down] = [down, up];
    this.throttle += ((up ? 1 : 0) - this.throttle) * Math.min(1, dt * 8);
    this.brake = down ? 1 : 0;
    if (this.auto && this.shiftT <= 0) {
      if (this.gear >= 1 && inp.down && !inp.up && vLong < 0.6) { this._revT = (this._revT || 0) + dt; if (this._revT > 0.35) { this.gear = -1; this._revT = 0; this.events.push('shift'); } }
      else if (this.gear === -1 && inp.up && !inp.down && vLong > -0.6) { this._revT = (this._revT || 0) + dt; if (this._revT > 0.25) { this.gear = 1; this._revT = 0; this.events.push('shift'); } }
      else this._revT = 0;
    }

    // ---- gearbox
    if (this.shiftT > 0) { this.shiftT -= dt; if (this.shiftT <= 0) this.gear = this.shiftTo; }
    const ratio = this.ratio(this.gear);
    const wheelRpm = (vLong / CAR_DIM.wheelR) * 60 / (2 * Math.PI);
    let rpmTarget = Math.abs(wheelRpm * ratio);
    const launch = this.gear === 1 || this.gear === -1;
    if (launch && rpmTarget < 3200) rpmTarget = Math.max(rpmTarget, IDLE + this.throttle * 2600);   // clutch slip
    if (this.shiftT > 0) rpmTarget = Math.abs(wheelRpm * this.ratio(this.shiftTo === 0 ? 1 : this.shiftTo));
    rpmTarget = Math.max(IDLE + (this.throttle * 300), rpmTarget);
    this.rpm += (Math.min(rpmTarget, LIMIT_RPM) - this.rpm) * Math.min(1, dt * (this.shiftT > 0 ? 18 : 30));
    if (this.auto && this.shiftT <= 0 && this.gear >= 1) {
      if (this.rpm > 7600 && this.gear < GEARS.length && this.throttle > 0.3) this.shift(1);
      else if (this.gear > 1) {
        const down = this.rpm * this.ratio(this.gear - 1) / ratio;
        if ((this.rpm < 2600 || (this.brake && this.rpm < 4200) || (this.throttle > 0.9 && this.rpm < 4000)) && down < 7000) this.shift(-1);
      }
    }

    // ---- longitudinal forces
    let Fdrive = 0;
    if (this.shiftT <= 0 && this.gear !== 0) {
      let T = engineTorque(this.rpm) * this.throttle;
      if (this.rpm >= 8150) T = 0;                                  // rev limiter
      Fdrive = T * ratio * EFF / CAR_DIM.wheelR;
      if (this.gear >= 1 && vLong > VMAX - 0.6) Fdrive *= Math.max(0, (VMAX - vLong) / 0.6);   // 300 km/h governor
      if (this.throttle < 0.05) Fdrive -= Math.sign(vLong) * (35 + this.rpm * 0.012) * Math.abs(ratio) / CAR_DIM.wheelR;   // engine braking
    }
    if (this.dead) Fdrive = 0;
    const grip = (this.onRoad ? 1.05 : 0.75) * (this.inWater ? 0.3 : 1);
    const tractionMax = grip * MASS * G * 0.62;
    if (Math.abs(Fdrive) > tractionMax) { this.drift = Math.max(this.drift, 0.4); Fdrive = Math.sign(Fdrive) * tractionMax; }
    let Fbrake = 0;
    if (this.brake) Fbrake = Math.min(MASS * 10.5 * grip, spd / dt * MASS) * Math.sign(vLong);
    if (inp.hand) Fbrake += Math.min(MASS * 4, spd / dt * MASS * 0.5) * Math.sign(vLong);
    const Fdrag = 0.5 * 1.225 * CDA * vLong * Math.abs(vLong);
    const crr = this.inWater ? 0.6 : this.onRoad ? 0.012 : 0.045;
    const Froll = crr * MASS * G * Math.sign(vLong) * Math.min(1, spd * 2);
    const Fslope = -MASS * G * Math.sin(this.pitch);
    let a = (Fdrive - Fbrake - Fdrag - Froll + Fslope) / MASS;
    if (this.airborne) a = -Fdrag / MASS;
    vLong += a * dt;
    if (!up && !inp.down && Math.abs(vLong) < 0.15) vLong = 0;

    // ---- steering & yaw (kinematic bicycle with speed-sensitive lock)
    const maxSteer = 0.58 / (1 + spd / 14);
    const target = (inp.left ? 1 : 0) - (inp.right ? 1 : 0);
    this.steer += (target * maxSteer - this.steer) * Math.min(1, dt * (target ? 5 : 8));
    let yawRate = this.airborne ? this.yawRate : vLong * Math.tan(this.steer) / CAR_DIM.wheelbase;
    if (inp.hand && spd > 5) yawRate *= 1.45;
    this.yawRate = yawRate;
    this.yaw += yawRate * dt;

    // ---- lateral grip: slide decays towards the heading (handbrake = drift)
    const latGrip = this.airborne ? 0.2 : (inp.hand ? 1.6 : 9.5) * grip;
    vLat *= Math.exp(-latGrip * dt);
    this.drift = Math.max(0, Math.min(1, Math.abs(vLat) / 6), this.drift - dt * 2);
    const nfx = Math.sin(this.yaw), nfz = Math.cos(this.yaw), nrx = -nfz, nrz = nfx;
    // keep the old velocity direction partly (momentum) then re-project
    this.vel.set(nfx * vLong + nrx * vLat, nfz * vLong + nrz * vLat);

    // ---- integrate position + world bounds
    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.y * dt;
    const b = w.inBounds(this.pos.x, -this.pos.z); this.pos.x = b.x; this.pos.z = -b.y;

    // ---- collisions with buildings / bridge rails / poles (3 circles along the body)
    for (const off of [1.45, 0, -1.45]) {
      const cx = this.pos.x + nfx * off, cz = this.pos.z + nfz * off;
      const c = w.collide(cx, -cz, 0.98, this.pos.y + 0.25, this.pos.y + 1.3, this._c);
      if (c.hit) {
        const px = c.x, pz = -c.y, L = Math.hypot(px, pz);
        this.pos.x += px; this.pos.z += pz;
        const nx = px / L, nz = pz / L, vn = this.vel.x * nx + this.vel.y * nz;
        if (vn < 0) {
          this.vel.x -= nx * vn * 1.25; this.vel.y -= nz * vn * 1.25; this.vel.multiplyScalar(0.92);
          if (-vn > 4) { this.events.push('crash:' + (-vn).toFixed(1)); this.damage((-vn - 3) * 2.2); }
        }
      }
    }

    // ---- vertical: 4 contact points -> height, pitch, roll; airborne over crests
    const hw = CAR_DIM.track / 2, hl = CAR_DIM.wheelbase / 2;
    const gh = (ox, oz) => {
      const x = this.pos.x + nfx * oz + nrx * ox, z = this.pos.z + nfz * oz + nrz * ox;
      return w.ground(x, -z, this.pos.y + 1.0).z;
    };
    const hFL = gh(-hw, hl), hFR = gh(hw, hl), hRL = gh(-hw, -hl), hRR = gh(hw, -hl);
    const gAvg = (hFL + hFR + hRL + hRR) / 4;
    const gRate = this._lastG === undefined ? 0 : (gAvg - this._lastG) / dt;
    this._lastG = gAvg;
    this.vy -= G * dt; this.pos.y += this.vy * dt;
    if (this.pos.y <= gAvg) {
      if (this.airborne && this.vy < -7) this.events.push('land');
      // ride the ground; the car only leaves it when the road falls away faster than gravity (crests, jumps)
      this.pos.y = gAvg; this.vy = THREE.MathUtils.clamp(gRate, -60, 12); this.airborne = false;
    } else if (this.pos.y > gAvg + 0.3) this.airborne = true;
    if (!this.airborne) {
      const tp = Math.atan2(((hFL + hFR) - (hRL + hRR)) / 2, CAR_DIM.wheelbase);
      const tr = Math.atan2(((hFR + hRR) - (hFL + hRL)) / 2, CAR_DIM.track);
      this.pitch += (tp - this.pitch) * Math.min(1, dt * 12); this.roll += (tr - this.roll) * Math.min(1, dt * 12);
    }
    const ri = w.roadInfo(this.pos.x, -this.pos.z);
    this.onRoad = !!ri && ri.d < 8.6;
    const wl = w.waterLevel(this.pos.x, -this.pos.z);
    this.inWater = wl !== null && wl > this.pos.y + 0.5;
    this.wheelRot += vLong / CAR_DIM.wheelR * dt;
    this.speedKmh = Math.abs(vLong) * 3.6;
  }

  sync(dt) {
    const m = this.mesh, u = m.userData;
    m.position.copy(this.pos);
    m.rotation.set(-this.pitch, this.yaw, -this.roll, 'YXZ');   // whole car follows the slope
    // body lean: pitch from slope + squat/dive, roll from cornering
    const accelLean = THREE.MathUtils.clamp((this._lastV !== undefined && dt > 0 ? (this.vLong - this._lastV) / dt : 0) * -0.004, -0.04, 0.04);
    this._lastV = this.vLong;
    this._lean = (this._lean || 0) + (accelLean - (this._lean || 0)) * Math.min(1, dt * 6);
    const corner = THREE.MathUtils.clamp(this.yawRate * this.vLong * 0.004, -0.05, 0.05);
    u.body.rotation.set(this._lean, 0, corner);                  // squat / dive and body roll on the springs
    for (const wh of u.wheels) {
      if (wh.front) wh.steer.rotation.y = this.steer;
      wh.spin.rotation.x = this.wheelRot;
    }
  }

  damage(n) {
    this.hp = Math.max(0, this.hp - n);
    if (this.hp <= 0 && !this.dead) { this.dead = true; this.events.push("dead"); }
  }

  repair() { this.hp = 100; this.dead = false; }

  resetToRoad() {
    const s = this.w.nearestRouteS(this.pos.x, -this.pos.z);
    const r = this.w.routeAt(s);
    const bx = r.x + -r.ty * -5.25, by = r.y + r.tx * -5.25;
    this.place(bx, by, Math.atan2(r.ty, r.tx));
  }
}
