// touch.js - phone / tablet landscape controls, feeding the same Input state the keyboard uses.
//   left half  : floating joystick (appears under the thumb; full push = run)
//   right half : drag = look around, pinch = zoom
//   bottom-right: max 3 big context buttons (change with foot / car / ride / god)
//   top-right  : ☰ menu with the less frequent actions
export const IS_TOUCH = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

const BTN = {   // context button sets: [key, icon, label, hold?]
  foot: [['act', '', ''], ['Space', '⤒', '跳'], ['KeyX', '⚔', '攻擊']],
  ride: [['act', '', ''], ['Space', '⤒', '跳'], ['KeyX', '⚔', '攻擊']],
  car:  [['act', '🚪', '下車'], ['Space', '⛔', '手煞']],
  god:  [['KeyV', '⬇', '降落'], ['KeyE', '▲', '上升', 1], ['KeyQ', '▼', '下降', 1]],
  dead: [],
};
const MENU = [
  ['KeyV', '🕊', '上帝視角'], ['KeyI', '🧭', '等角視角'], ['KeyK', '🚗', '叫車'], ['KeyC', '🎥', '車內視角'],
  ['KeyR', '🛣', '回公路'], ['KeyT', '🎨', '換風格'], ['KeyM', '⚙', '手/自排'], ['KeyN', '🔈', '音效'],
  ['KeyG', '✨', '畫質'], ['places', '📍', '地點'], ['KeyH', '❔', '說明'],
];

export class TouchControls {
  constructor(input) {
    this.input = input; this.joy = null; this.look = new Map(); this.mode = 'foot'; this.actKey = null; this.held = new Set();
    document.body.classList.add('touch');
    input.lockEnabled = false; input.touchMode = true;
    const root = (this.root = document.createElement('div')); root.id = 'touch';
    root.innerHTML = `<div id="joy-base"><div id="joy-knob"></div></div><div id="tbtns"></div>
      <button id="tmenu-btn">☰</button><div id="tmenu"></div><div id="rotate-hint">請將手機橫放 ↻</div>`;
    document.body.appendChild(root);
    this.base = root.querySelector('#joy-base'); this.knob = root.querySelector('#joy-knob');
    this.btnBox = root.querySelector('#tbtns'); this.menu = root.querySelector('#tmenu');
    root.addEventListener('touchstart', (e) => this.start(e), { passive: false });
    root.addEventListener('touchmove', (e) => this.move(e), { passive: false });
    root.addEventListener('touchend', (e) => this.end(e), { passive: false });
    root.addEventListener('touchcancel', (e) => this.end(e), { passive: false });
    root.querySelector('#tmenu-btn').addEventListener('touchstart', (e) => { e.stopPropagation(); e.preventDefault(); this.menu.classList.toggle('open'); }, { passive: false });
    for (const [k, icon, label] of MENU) {
      const b = document.createElement('button'); b.innerHTML = `<span>${icon}</span>${label}`;
      b.addEventListener('touchstart', (e) => {
        e.stopPropagation(); e.preventDefault(); this.menu.classList.remove('open');
        if (k === 'places') document.getElementById('god').classList.toggle('mshow'); else this.tap(k);
      }, { passive: false });
      this.menu.appendChild(b);
    }
    this.setMode('foot');
  }

  tap(code) { this.input.pressed.add(code); this.input.keys.add(code); setTimeout(() => this.input.keys.delete(code), 120); }

  setMode(mode, actKey = null, actLabel = '') {
    const sig = `${mode}|${actKey}|${actLabel}`;
    if (sig === this.sig) return; this.sig = sig; this.mode = mode; this.actKey = actKey;
    this.btnBox.innerHTML = '';
    BTN[mode === 'dead' ? 'dead' : mode].forEach(([k, icon, label, hold], i) => {
      let key = k;
      if (k === 'act') {
        if (!actKey) return;
        key = actKey; icon = mode === 'car' ? '🚪' : actKey === 'KeyF' ? '✋' : '💬'; label = actLabel;
      }
      if (mode === 'car' && k === 'act') key = 'KeyF';
      const b = document.createElement('button'); b.className = 'tb tb' + i; b.innerHTML = `<span>${icon}</span><small>${label}</small>`;
      b.addEventListener('touchstart', (e) => { e.stopPropagation(); e.preventDefault(); this.input.pressed.add(key); this.input.keys.add(key); this.held.add(key); b.classList.add('down'); }, { passive: false });
      const up = (e) => { e.stopPropagation(); e.preventDefault(); this.input.keys.delete(key); this.held.delete(key); b.classList.remove('down'); };
      b.addEventListener('touchend', up, { passive: false }); b.addEventListener('touchcancel', up, { passive: false });
      this.btnBox.appendChild(b);
    });
  }

  start(e) {
    e.preventDefault();
    if (this.menu.classList.contains("open")) { this.menu.classList.remove("open"); return; }   // tap outside closes the menu
    for (const t of e.changedTouches) {
      if (t.clientX < innerWidth * 0.42 && !this.joy) {
        this.joy = { id: t.identifier, x: t.clientX, y: t.clientY };
        this.base.style.left = t.clientX + 'px'; this.base.style.top = t.clientY + 'px'; this.base.classList.add('on');
        this.knob.style.transform = 'translate(-50%,-50%)';
      } else this.look.set(t.identifier, { x: t.clientX, y: t.clientY });
    }
    this.input.dragging = this.look.size > 0;
  }

  move(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (this.joy && t.identifier === this.joy.id) {
        let dx = t.clientX - this.joy.x, dy = t.clientY - this.joy.y; const R = 55, d = Math.hypot(dx, dy);
        if (d > R) { dx *= R / d; dy *= R / d; }
        this.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
        this.setStick(dx / R, dy / R);
      } else if (this.look.has(t.identifier)) {
        const p = this.look.get(t.identifier);
        if (this.look.size === 2) {        // pinch -> zoom
          const [a, b] = [...this.look.values()], before = Math.hypot(a.x - b.x, a.y - b.y);
          p.x = t.clientX; p.y = t.clientY;
          const [a2, b2] = [...this.look.values()], after = Math.hypot(a2.x - b2.x, a2.y - b2.y);
          if (Math.abs(after - before) > 2) this.input.wheel += (before - after) * 0.04;
        } else {
          this.input.mdx += (t.clientX - p.x) * 1.6; this.input.mdy += (t.clientY - p.y) * 1.6;
          p.x = t.clientX; p.y = t.clientY;
        }
      }
    }
  }

  end(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (this.joy && t.identifier === this.joy.id) { this.joy = null; this.base.classList.remove('on'); this.setStick(0, 0); }
      this.look.delete(t.identifier);
    }
    this.input.dragging = this.look.size > 0;
  }

  setStick(x, y) {
    const k = this.input.keys, th = 0.32, set = (code, on) => (on ? k.add(code) : k.delete(code));
    set('KeyW', y < -th); set('KeyS', y > th); set('KeyA', x < -th); set('KeyD', x > th);
    set('ShiftLeft', this.mode !== 'car' && Math.hypot(x, y) > 0.92);   // full push = run / sprint / fly fast
  }
}
