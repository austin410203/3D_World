// personModel.js - articulated low-poly person (1.78 m) with procedural idle / walk / run / jump / swim poses.
// Local frame: +Z forward, feet at y = 0.
import * as THREE from 'three';

export function buildPerson({ shirt = 0x2f6fd6, pants = 0x1f2a44, skin = 0xe1b48e, hair = 0x2b1b12, shoes = 0xf0f0f0 } = {}) {
  const mat = (c, r = 0.75) => new THREE.MeshStandardMaterial({ color: c, roughness: r });
  const M = { shirt: mat(shirt), pants: mat(pants), skin: mat(skin, 0.6), hair: mat(hair, 0.9), shoes: mat(shoes, 0.5), eye: mat(0x111111, 0.3) };
  const root = new THREE.Group(); root.name = 'Person';
  const mesh = (g, m, parent, x = 0, y = 0, z = 0) => {
    const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; parent.add(o); return o;
  };
  const pivot = (parent, x, y, z) => { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; };
  const cap = (r, len) => new THREE.CapsuleGeometry(r, len, 4, 10);

  const hips = pivot(root, 0, 0.95, 0);
  mesh(new THREE.BoxGeometry(0.3, 0.16, 0.18), M.pants, hips, 0, 0.0, 0);
  const spine = pivot(hips, 0, 0.06, 0);
  mesh(cap(0.155, 0.3), M.shirt, spine, 0, 0.27, 0).scale.set(1.12, 1, 0.78);
  mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.08, 10), M.skin, spine, 0, 0.54, 0);
  const neck = pivot(spine, 0, 0.58, 0);
  mesh(new THREE.SphereGeometry(0.112, 18, 14), M.skin, neck, 0, 0.11, 0).scale.set(0.92, 1.05, 1);
  mesh(new THREE.SphereGeometry(0.118, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), M.hair, neck, 0, 0.13, -0.008);
  for (const sx of [-1, 1]) mesh(new THREE.SphereGeometry(0.014, 8, 6), M.eye, neck, sx * 0.038, 0.125, 0.1);
  mesh(new THREE.BoxGeometry(0.02, 0.03, 0.02), M.skin, neck, 0, 0.095, 0.112);   // nose

  const limbs = {};
  for (const [side, sx] of [['L', 1], ['R', -1]]) {
    const sh = pivot(spine, sx * 0.205, 0.47, 0);
    mesh(new THREE.SphereGeometry(0.06, 10, 8), M.shirt, sh);
    mesh(cap(0.05, 0.22), M.shirt, sh, 0, -0.14, 0);
    const el = pivot(sh, 0, -0.29, 0);
    mesh(cap(0.043, 0.2), M.skin, el, 0, -0.13, 0);
    mesh(new THREE.SphereGeometry(0.048, 10, 8), M.skin, el, 0, -0.28, 0.005).scale.set(0.8, 1.1, 0.6);
    const hp = pivot(hips, sx * 0.095, -0.02, 0);
    mesh(cap(0.074, 0.3), M.pants, hp, 0, -0.21, 0);
    const kn = pivot(hp, 0, -0.43, 0);
    mesh(cap(0.058, 0.32), M.pants, kn, 0, -0.2, 0);
    const ft = pivot(kn, 0, -0.46, 0);
    mesh(new THREE.BoxGeometry(0.1, 0.07, 0.25), M.shoes, ft, 0, -0.012, 0.05);
    limbs[side] = { sh, el, hp, kn, ft };
  }
  root.userData = { hips, spine, neck, limbs, phase: 0 };
  return root;
}

// pose: { speed (m/s), air (bool), swim (bool), dt }
export function animatePerson(p, { speed = 0, air = false, swim = false, dt = 0.016, t = 0 }) {
  const u = p.userData, L = u.limbs.L, R = u.limbs.R;
  const run = THREE.MathUtils.clamp((speed - 2.2) / 3.5, 0, 1);
  const moving = THREE.MathUtils.clamp(speed / 1.2, 0, 1);
  const freq = speed < 0.05 ? 0 : (1.6 + run * 1.3) * Math.PI * 2 / (1 + run * 0.15) * Math.min(1, 0.35 + speed / 2);
  u.phase += freq * dt;
  const ph = u.phase, s = Math.sin(ph), c = Math.cos(ph);
  const amp = (0.45 + 0.45 * run) * moving;
  const k = 1 - Math.exp(-dt * 14), lerp = (o, key, v) => { o.rotation[key] += (v - o.rotation[key]) * k; };

  if (air) {
    lerp(L.hp, 'x', -0.7); lerp(R.hp, 'x', 0.15); lerp(L.kn, 'x', 1.1); lerp(R.kn, 'x', 0.5);
    lerp(L.sh, 'x', -1.2); lerp(R.sh, 'x', 0.6); lerp(L.el, 'x', -0.6); lerp(R.el, 'x', -0.6);
    lerp(u.spine, 'x', 0.15);
  } else if (swim) {
    lerp(u.spine, 'x', 1.1); lerp(u.hips, 'x', 0);
    lerp(L.sh, 'x', -2.6 + s * 1.2); lerp(R.sh, 'x', -2.6 - s * 1.2); lerp(L.el, 'x', -0.2); lerp(R.el, 'x', -0.2);
    lerp(L.hp, 'x', 0.9 + s * 0.3); lerp(R.hp, 'x', 0.9 - s * 0.3); lerp(L.kn, 'x', 0.3); lerp(R.kn, 'x', 0.3);
  } else {
    lerp(L.hp, 'x', -s * amp); lerp(R.hp, 'x', s * amp);
    lerp(L.kn, 'x', (0.15 + Math.max(0, -c) * 1.1) * amp * 1.4 + 0.05);
    lerp(R.kn, 'x', (0.15 + Math.max(0, c) * 1.1) * amp * 1.4 + 0.05);
    lerp(L.ft, 'x', -0.2 * amp * s); lerp(R.ft, 'x', 0.2 * amp * s);
    lerp(L.sh, 'x', s * amp * 0.85); lerp(R.sh, 'x', -s * amp * 0.85);
    lerp(L.el, 'x', -0.25 - run * 1.15); lerp(R.el, 'x', -0.25 - run * 1.15);
    lerp(u.spine, 'x', 0.04 + run * 0.22 + (speed < 0.05 ? Math.sin(t * 1.7) * 0.012 : 0));
  }
  for (const [side, l] of [[1, L], [-1, R]]) lerp(l.sh, 'z', side * (0.08 + (air ? 0.3 : 0)));
  const bob = air || swim ? 0 : Math.abs(s) * (0.025 + run * 0.05) * moving;
  u.hips.position.y = 0.95 + bob - run * 0.03 - (swim ? 0.55 : 0);
  u.spine.rotation.y = -s * 0.12 * amp;
}
