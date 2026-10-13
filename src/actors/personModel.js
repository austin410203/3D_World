// personModel.js - Minecraft-style blocky hero (32 px = 1.8 m) with pixel textures and procedural poses:
// idle / walk / run / jump / swim / sit (riding) / melee swing / bow aim / tumble.  Local frame: +Z forward, feet at y = 0.
import * as THREE from 'three';
import { pixelNoise } from '../pixel.js';

export const PX = 1.8 / 32;

export function buildPerson({ shirt = 0x2aa5b5, pants = 0x3b3fa6, skin = 0xc8926a, hair = 0x3a2212, shoes = 0x55585e } = {}) {
  const pix = pixelNoise(16, 0.8, 1.0, 3);
  const M = (c, extra = {}) => new THREE.MeshStandardMaterial({ color: c, map: pix, roughness: 0.92, ...extra });
  const mat = { shirt: M(shirt), pants: M(pants), skin: M(skin), hair: M(hair), shoes: M(shoes), white: M(0xffffff), eye: M(0x3a3aa8),
                mouth: M(0x8a5040) };
  const root = new THREE.Group(); root.name = 'Hero';
  const box = (w, h, d, x, y, z, m, parent) => {
    const o = new THREE.Mesh(new THREE.BoxGeometry(w * PX, h * PX, d * PX), m);
    o.position.set(x * PX, y * PX, z * PX); o.castShadow = true; o.receiveShadow = true; parent.add(o); return o;
  };
  const pivot = (parent, x, y, z) => { const g = new THREE.Group(); g.position.set(x * PX, y * PX, z * PX); parent.add(g); return g; };

  const hips = pivot(root, 0, 12, 0);
  const spine = pivot(hips, 0, 0, 0);
  box(8, 12, 4, 0, 6, 0, mat.shirt, spine);
  box(8.1, 1, 4.1, 0, 0.5, 0, mat.pants, spine);
  const neck = pivot(spine, 0, 12, 0);
  box(8, 8, 8, 0, 4, 0, mat.skin, neck);
  box(8.4, 2, 8.4, 0, 7.4, 0, mat.hair, neck);                    // hair: top, back, sides
  box(8.4, 5, 1.2, 0, 4.5, -3.8, mat.hair, neck);
  box(1, 3, 8.4, 3.8, 5.5, 0, mat.hair, neck); box(1, 3, 8.4, -3.8, 5.5, 0, mat.hair, neck);
  for (const sx of [-1, 1]) {
    box(2, 1, 0.3, sx * 2, 4, 4.05, mat.white, neck);
    box(1, 1, 0.35, sx * 1.5, 4, 4.08, mat.eye, neck);
  }
  box(2, 1, 0.3, 0, 2.6, 4.05, mat.mouth, neck);                 // nose
  box(4, 1, 0.3, 0, 1.5, 4.05, mat.hair, neck);                  // stubble

  const limbs = {};
  for (const [side, sx] of [['L', 1], ['R', -1]]) {
    const sh = pivot(spine, sx * 6, 10, 0);
    box(4, 6, 4, 0, -1, 0, mat.shirt, sh);
    const el = pivot(sh, 0, -4, 0);
    box(4, 6, 4, 0, -3, 0, mat.skin, el);
    const hand = pivot(el, 0, -6, 0);
    const hp = pivot(hips, sx * 2, 0, 0);
    box(4, 6, 4, 0, -3, 0, mat.pants, hp);
    const kn = pivot(hp, 0, -6, 0);
    box(4, 6, 4, 0, -2.5, 0, mat.pants, kn);
    box(4.2, 2, 4.2, 0, -5.1, 0, mat.shoes, kn);
    const ft = pivot(kn, 0, -6, 0);
    limbs[side] = { sh, el, hp, kn, ft, hand };
  }
  root.userData = { hips, spine, neck, limbs, phase: 0, hipY: 12 * PX, hand: limbs.R.hand };
  return root;
}

// pose: { speed, air, swim, sit, attack (0..1 swing), aim, tumble, dt, t }
export function animatePerson(p, { speed = 0, air = false, swim = false, sit = false, attack = 0, aim = false, tumble = 0, dt = 0.016, t = 0 }) {
  const u = p.userData, L = u.limbs.L, R = u.limbs.R;
  const run = THREE.MathUtils.clamp((speed - 2.4) / 3.5, 0, 1);
  const moving = THREE.MathUtils.clamp(speed / 1.2, 0, 1);
  const freq = speed < 0.05 ? 0 : (1.6 + run * 1.2) * Math.PI * 2 * Math.min(1, 0.35 + speed / 2);
  u.phase += freq * dt;
  const ph = u.phase, s = Math.sin(ph);
  const amp = (0.6 + 0.4 * run) * moving;
  const k = 1 - Math.exp(-dt * 16), set = (o, key, v) => { o.rotation[key] += (v - o.rotation[key]) * k; };
  let hipY = u.hipY;

  if (sit) {                               // straddling a mount
    set(L.hp, 'x', -1.35); set(R.hp, 'x', -1.35); set(L.hp, 'z', 0.45); set(R.hp, 'z', -0.45);
    set(L.kn, 'x', 0.9); set(R.kn, 'x', 0.9);
    set(L.sh, 'x', -0.7); set(R.sh, 'x', -0.7); set(L.el, 'x', -0.5); set(R.el, 'x', -0.5);
    set(u.spine, 'x', 0.1 + Math.sin(t * 9) * 0.04 * moving);
  } else if (tumble > 0) {                 // thrown off / knocked down
    set(L.hp, 'x', -0.8); set(R.hp, 'x', 0.6); set(L.sh, 'x', -2.6); set(R.sh, 'x', -2.2);
    set(L.sh, 'z', 0.8); set(R.sh, 'z', -0.8); set(u.spine, 'x', -0.3);
  } else if (air) {
    set(L.hp, 'x', -0.6); set(R.hp, 'x', 0.3); set(L.kn, 'x', 0.8); set(R.kn, 'x', 0.3);
    set(L.sh, 'x', -1.0); set(R.sh, 'x', 0.5); set(u.spine, 'x', 0.1);
  } else if (swim) {
    set(u.spine, 'x', 1.2);
    set(L.sh, 'x', -2.6 + s * 1.2); set(R.sh, 'x', -2.6 - s * 1.2);
    set(L.hp, 'x', 0.4 + s * 0.4); set(R.hp, 'x', 0.4 - s * 0.4); set(L.kn, 'x', 0.2); set(R.kn, 'x', 0.2);
    hipY -= 0.55;
  } else {
    set(L.hp, 'x', -s * amp); set(R.hp, 'x', s * amp);
    set(L.kn, 'x', Math.max(0, -Math.cos(ph)) * amp * 0.9); set(R.kn, 'x', Math.max(0, Math.cos(ph)) * amp * 0.9);
    set(L.sh, 'x', s * amp * 0.9); set(R.sh, 'x', -s * amp * 0.9);
    set(L.el, 'x', -0.1 - run * 0.9); set(R.el, 'x', -0.1 - run * 0.9);
    set(u.spine, 'x', run * 0.18 + (speed < 0.05 ? Math.sin(t * 1.7) * 0.012 : 0));
    hipY += Math.abs(s) * (0.02 + run * 0.04) * moving;
  }
  if (!sit) { set(L.hp, 'z', 0); set(R.hp, 'z', 0); }
  if (!tumble) { set(L.sh, 'z', 0.06); set(R.sh, 'z', -0.06); }
  // weapon actions override the right arm (and left arm for the bow)
  if (aim) { R.sh.rotation.x = -1.5; R.el.rotation.x = -0.2; L.sh.rotation.x = -1.45; L.sh.rotation.z = -0.5; L.el.rotation.x = -0.9; }
  else if (attack > 0) { R.sh.rotation.x = -2.4 * Math.sin(Math.PI * attack) - 0.3; R.el.rotation.x = -0.3; R.sh.rotation.z = -0.25 * Math.sin(Math.PI * attack); }
  u.hips.position.y = hipY;
  u.neck.rotation.x = swim ? -0.9 : 0;
}
