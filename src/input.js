// input.js - keyboard + mouse (pointer lock) state
export class Input {
  constructor(canvas) {
    this.keys = new Set(); this.pressed = new Set();
    this.mdx = 0; this.mdy = 0; this.wheel = 0; this.dragging = false; this.lockEnabled = true;
    addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT') return;
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    canvas.addEventListener('mousedown', (e) => {
      this.dragging = true;
      if (document.pointerLockElement === canvas) { this.pressed.add('Mouse' + e.button); this.keys.add('Mouse' + e.button); }
      if (e.button === 0 && this.lockEnabled && !this.touchMode && document.pointerLockElement !== canvas) canvas.requestPointerLock?.()?.catch?.(() => {});
    });
    addEventListener('mouseup', (e) => { this.dragging = false; this.keys.delete('Mouse' + e.button); });
    addEventListener('mousemove', (e) => {
      if (document.pointerLockElement === canvas || this.dragging) { this.mdx += e.movementX; this.mdy += e.movementY; }
    });
    canvas.addEventListener('wheel', (e) => { this.wheel += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });
  }
  down(...codes) { return codes.some((c) => this.keys.has(c)); }
  hit(code) { return this.pressed.has(code); }
  endFrame() { this.pressed.clear(); this.mdx = 0; this.mdy = 0; this.wheel = 0; }

  move() {
    return {
      up: this.down('KeyW', 'ArrowUp'), down: this.down('KeyS', 'ArrowDown'),
      left: this.down('KeyA', 'ArrowLeft'), right: this.down('KeyD', 'ArrowRight'),
      run: this.down('ShiftLeft', 'ShiftRight'), hand: this.down('Space'), jumpPressed: this.hit('Space'),
    };
  }
}
