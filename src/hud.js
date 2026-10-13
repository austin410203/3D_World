// hud.js - tachometer / speed / gear, stage + progress strip, minimap, prompts and toasts
const $ = (id) => document.getElementById(id);

export class HUD {
  constructor(world) {
    this.w = world;
    this.tach = $('tach'); this.tctx = this.tach.getContext('2d');
    this.mini = $('minimap'); this.mctx = this.mini.getContext('2d');
    this.map = new Image(); this.map.src = './assets/map.jpg';
    this.toastT = 0;
    const strip = $('stages');
    for (const s of world.meta.stages) {
      const d = document.createElement('div'); d.className = 'tick';
      d.style.left = (s.route_km / world.meta.route_km * 100) + '%';
      d.title = `${s.stage}. ${s.title}`; d.textContent = s.stage; strip.appendChild(d);
    }
  }

  toast(msg, t = 2.5) { $('toast').textContent = msg; $('toast').style.opacity = 1; this.toastT = t; }
  prompt(msg) { $('prompt').textContent = msg || ''; $('prompt').style.display = msg ? 'block' : 'none'; }

  update(dt, s) {
    if (this.toastT > 0) { this.toastT -= dt; if (this.toastT <= 0) $('toast').style.opacity = 0; }
    const st = this.w.stageAt(s.bx);
    $('stage').textContent = `STAGE ${st.stage} · ${st.title}`;
    $('stage-sub').textContent = st.subtitle;
    $('km').textContent = `US-99 ${(s.routeS / 1000).toFixed(1)} / ${this.w.meta.route_km.toFixed(1)} km`;
    $('progress').style.width = (s.routeS / 1000 / this.w.meta.route_km * 100) + '%';
    $('fps').textContent = `${s.fps | 0} FPS`;
    $('dash').style.display = s.mode === 'car' ? 'block' : 'none';
    $('foot').style.display = s.mode === 'foot' ? 'block' : 'none';
    if (s.mode === 'car') this.drawTach(s.car);
    else $('foot').textContent = `${s.person.swim ? '游泳' : s.run ? '跑步' : s.person.speed > 0.2 ? '走路' : '站立'} · ${(s.person.speed * 3.6).toFixed(1)} km/h`;
    this.drawMini(s);
  }

  drawTach(car) {
    const g = this.tctx, W = this.tach.width, cx = W / 2, cy = W / 2, R = W * 0.42;
    g.clearRect(0, 0, W, W);
    const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25, MAXR = 9000;
    const ang = (r) => a0 + (a1 - a0) * Math.min(r, MAXR) / MAXR;
    g.lineCap = 'butt';
    g.lineWidth = W * 0.05; g.strokeStyle = 'rgba(255,255,255,0.12)'; g.beginPath(); g.arc(cx, cy, R, a0, a1); g.stroke();
    g.strokeStyle = 'rgba(255,40,40,0.75)'; g.beginPath(); g.arc(cx, cy, R, ang(7800), a1); g.stroke();
    const shiftLight = car.rpm > 7400 && car.gear > 0 && car.gear < 6;
    g.strokeStyle = shiftLight ? '#ff3b30' : car.rpm > 6500 ? '#ffb020' : '#36d1ff';
    g.beginPath(); g.arc(cx, cy, R, a0, ang(car.rpm)); g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.75)'; g.font = `${W * 0.055}px system-ui`; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let k = 0; k <= 9; k++) {
      const a = ang(k * 1000), rr = R - W * 0.085;
      g.fillText(k, cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    }
    // needle
    const a = ang(car.rpm);
    g.strokeStyle = '#fff'; g.lineWidth = 3; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * R * 0.98, cy + Math.sin(a) * R * 0.98); g.stroke();
    g.fillStyle = '#fff'; g.font = `700 ${W * 0.2}px system-ui`;
    g.fillText(Math.round(car.speedKmh), cx, cy + W * 0.02);
    g.font = `${W * 0.055}px system-ui`; g.fillStyle = 'rgba(255,255,255,0.7)';
    g.fillText('km/h', cx, cy + W * 0.14);
    const gear = car.shiftT > 0 ? '·' : car.gear === -1 ? 'R' : car.speedKmh < 1 && car.throttle < 0.05 && car.gear === 1 ? 'N' : String(car.gear);
    g.font = `800 ${W * 0.13}px system-ui`; g.fillStyle = shiftLight ? '#ff3b30' : '#ffd60a';
    g.fillText(gear, cx, cy + W * 0.3);
    g.font = `${W * 0.045}px system-ui`; g.fillStyle = 'rgba(255,255,255,0.6)';
    g.fillText(`${car.auto ? 'AUTO' : 'MANUAL'} · ${Math.round(car.rpm)} rpm`, cx, cy - W * 0.17);
    $('dash-extra').textContent = `${(car.speedKmh / 1.609).toFixed(0)} mph${car.drift > 0.4 ? ' · DRIFT' : ''}${car.inWater ? ' · 落水! 按 R 回到公路' : ''}${car.onRoad ? '' : ' · 越野'}`;
  }

  drawMini(s) {
    const g = this.mctx, W = this.mini.width, w = this.w;
    const span = s.span || (s.mode === 'car' ? 2400 + Math.min(4000, s.car.speedKmh * 14) : 1400);   // metres across
    const sc = W / span;
    g.save(); g.clearRect(0, 0, W, W);
    g.beginPath(); g.arc(W / 2, W / 2, W / 2 - 2, 0, Math.PI * 2); g.clip();
    g.fillStyle = '#0d2236'; g.fillRect(0, 0, W, W);
    if (this.map.complete && this.map.naturalWidth) {
      const iw = this.map.naturalWidth, ih = this.map.naturalHeight;
      const mx0 = 50000 - 55000, my1 = 9900, mw = 110000, mh = 19800;
      const px = (s.bx - mx0) / mw * iw, py = (my1 - s.by) / mh * ih, pw = span / mw * iw, ph = span / mh * ih;
      g.drawImage(this.map, px - pw / 2, py - ph / 2, pw, ph, 0, 0, W, W);
    }
    // highway
    g.strokeStyle = '#ffd60a'; g.lineWidth = 2.2; g.beginPath();
    let started = false;
    const i0 = Math.max(0, this.idxNear(s.routeS - span) ), i1 = Math.min(w.rx.length - 1, this.idxNear(s.routeS + span));
    for (let i = i0; i <= i1; i += 3) {
      const x = W / 2 + (w.rx[i] - s.bx) * sc, y = W / 2 - (w.ry[i] - s.by) * sc;
      if (!started) { g.moveTo(x, y); started = true; } else g.lineTo(x, y);
    }
    g.stroke();
    if (s.mode !== 'car') {      // where the car is parked
      const x = W / 2 + (s.carBX - s.bx) * sc, y = W / 2 - (s.carBY - s.by) * sc;
      g.fillStyle = '#ff3b30'; g.beginPath(); g.arc(x, y, 4.5, 0, Math.PI * 2); g.fill();
    }
    // player arrow (heading: blender angle)
    g.translate(W / 2, W / 2); g.rotate(-s.heading + Math.PI / 2);
    g.fillStyle = '#fff'; g.strokeStyle = '#000'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(0, -9); g.lineTo(6, 7); g.lineTo(0, 3); g.lineTo(-6, 7); g.closePath(); g.fill(); g.stroke();
    g.restore();
    g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 2; g.beginPath(); g.arc(W / 2, W / 2, W / 2 - 2, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#fff'; g.font = '12px system-ui'; g.textAlign = 'center'; g.fillText('N', W / 2, 14);
  }

  idxNear(s) {
    const rs = this.w.rs; let lo = 0, hi = rs.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (rs[m] < s) lo = m; else hi = m; }
    return lo;
  }
}
