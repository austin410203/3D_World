// audio.js - synthesized V8 engine (pitch follows rpm, load follows throttle), shift blips, tyre squeal, wind
export class EngineAudio {
  constructor() { this.ctx = null; this.muted = false; }

  start() {
    if (this.ctx) { this.ctx.resume(); return; }
    const C = (this.ctx = new (window.AudioContext || window.webkitAudioContext)());
    this.master = C.createGain(); this.master.gain.value = 0.0; this.master.connect(C.destination);
    this.lp = C.createBiquadFilter(); this.lp.type = 'lowpass'; this.lp.frequency.value = 900; this.lp.Q.value = 2.5;
    this.lp.connect(this.master);
    this.oscs = [['sawtooth', 1, 0.5], ['square', 0.5, 0.25], ['sawtooth', 2.01, 0.18]].map(([type, mult, g]) => {
      const o = C.createOscillator(); o.type = type; const gg = C.createGain(); gg.gain.value = g;
      o.connect(gg).connect(this.lp); o.start(); return { o, mult };
    });
    // noise for wind / tyres
    const buf = C.createBuffer(1, C.sampleRate * 2, C.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const mk = (f, q) => {
      const s = C.createBufferSource(); s.buffer = buf; s.loop = true;
      const bp = C.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q;
      const g = C.createGain(); g.gain.value = 0; s.connect(bp).connect(g).connect(C.destination); s.start(); return g;
    };
    this.wind = mk(500, 0.4); this.squeal = mk(2300, 6);
  }

  update(car, active) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, on = active && !this.muted;
    const f = car.rpm / 60 * 4;                       // V8: 4 firing pulses per revolution
    for (const { o, mult } of this.oscs) o.frequency.setTargetAtTime(f * mult, t, 0.015);
    const load = car.shiftT > 0 ? 0.25 : 0.35 + car.throttle * 0.65;
    this.lp.frequency.setTargetAtTime(500 + car.rpm * 0.35 * load, t, 0.03);
    this.master.gain.setTargetAtTime(on ? 0.05 + 0.1 * load : 0, t, 0.05);
    const v = car.speedKmh;
    this.wind.gain.setTargetAtTime(on ? Math.min(0.12, (v / 300) ** 2 * 0.12) : 0, t, 0.1);
    this.squeal.gain.setTargetAtTime(on && car.drift > 0.35 && v > 25 ? 0.05 * car.drift : 0, t, 0.05);
  }
}
