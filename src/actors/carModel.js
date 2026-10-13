// carModel.js - Minecraft-style blocky car. Local frame: +Z forward, +Y up, origin on the ground between the axles.
import * as THREE from 'three';
import { pixelNoise } from '../pixel.js';

export const CAR_DIM = { wheelbase: 2.7, track: 1.7, wheelR: 0.34, length: 4.6, width: 2.0 };

// 8-sided "blocky" wheel with exact flat normals
function octWheel(r, w) {
  const g = new THREE.CylinderGeometry(r, r, w, 8).rotateZ(Math.PI / 2).rotateX(Math.PI / 8).toNonIndexed();
  g.computeVertexNormals();
  return g;
}

export function buildCar(paint = 0xd32f2f) {
  const pix = pixelNoise(16, 0.8, 1.0, 11);
  const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, map: pix, roughness: 0.6, metalness: 0.05, ...o });
  const mat = {
    paint: M(paint, { roughness: 0.45, metalness: 0.15 }), dark: M(0x262626), glass: M(0x5d8fc4, { roughness: 0.12, metalness: 0.3 }),
    bumper: M(0x9e9e9e, { metalness: 0.5, roughness: 0.35 }), tire: M(0x1c1c1c, { roughness: 0.95 }), rim: M(0xd0d0d0, { metalness: 0.6, roughness: 0.3 }),
    head: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff3c4, emissiveIntensity: 2.0 }),
    tail: new THREE.MeshStandardMaterial({ color: 0x660000, emissive: 0xff1a1a, emissiveIntensity: 1.2 }),
    white: M(0xf2f2f2), stripe: M(0xffffff),
  };
  const car = new THREE.Group(); car.name = 'PlayerCar';
  const body = new THREE.Group(); car.add(body);
  const add = (w, h, d, x, y, z, m, parent = body) => {
    const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z);
    o.castShadow = true; o.receiveShadow = true; parent.add(o); return o;
  };
  add(2.0, 0.5, 4.4, 0, 0.62, 0, mat.paint);                    // chassis
  add(2.0, 0.28, 1.35, 0, 1.0, 1.45, mat.paint);                // hood
  add(2.0, 0.28, 0.95, 0, 1.0, -1.72, mat.paint);               // trunk
  add(1.86, 0.62, 1.95, 0, 1.45, -0.22, mat.glass);             // cabin glass
  add(1.98, 0.12, 1.78, 0, 1.82, -0.25, mat.paint);             // roof
  for (const sx of [-1, 1]) for (const z of [0.68, -1.13]) add(0.12, 0.62, 0.14, sx * 0.93, 1.45, z, mat.paint);   // pillars
  add(1.9, 0.1, 0.1, 0, 1.17, 0.72, mat.dark);                  // dash line
  add(0.22, 0.04, 4.42, 0.45, 1.15, 0, mat.stripe); add(0.22, 0.04, 4.42, -0.45, 1.15, 0, mat.stripe);   // racing stripes
  add(2.06, 0.26, 0.24, 0, 0.42, 2.24, mat.bumper); add(2.06, 0.26, 0.24, 0, 0.42, -2.24, mat.bumper);
  add(1.1, 0.22, 0.06, 0, 0.72, 2.22, mat.dark);                // grille
  for (const sx of [-1, 1]) {
    add(0.42, 0.2, 0.08, sx * 0.68, 0.8, 2.21, mat.head);
    add(0.42, 0.18, 0.08, sx * 0.68, 0.8, -2.21, mat.tail);
    add(0.18, 0.14, 0.12, sx * 1.06, 1.3, 0.62, mat.paint);     // mirrors
    add(0.06, 0.14, 3.0, sx * 1.01, 0.5, 0, mat.dark);          // side skirt
    add(0.06, 0.1, 0.35, sx * 1.01, 0.9, -0.3, mat.dark);        // door handle line
  }
  add(0.5, 0.12, 0.03, 0, 0.55, 2.37, mat.white); add(0.5, 0.12, 0.03, 0, 0.55, -2.37, mat.white);   // plates

  const { wheelbase: WB, track: TR } = CAR_DIM, R = 0.37;
  const tyre = octWheel(R, 0.32), rim = new THREE.BoxGeometry(0.34, 0.34, 0.34);
  const wheels = [];
  for (const [z, front] of [[WB / 2, true], [-WB / 2, false]]) for (const sx of [-1, 1]) {
    const steer = new THREE.Group(); steer.position.set(sx * TR / 2, R, z); car.add(steer);
    const spin = new THREE.Group(); steer.add(spin);
    const t = new THREE.Mesh(tyre, mat.tire); t.castShadow = true; spin.add(t);
    const r = new THREE.Mesh(rim, mat.rim); r.position.x = sx * 0.01; spin.add(r);
    wheels.push({ steer, spin, front, side: sx });
  }
  // damage smoke anchor
  const engine = new THREE.Object3D(); engine.position.set(0, 1.2, 1.6); body.add(engine);
  car.userData = { body, wheels, engine, paint: mat.paint };
  return car;
}

// merged blocky car for traffic instancing (body tinted by instanceColor)
export function trafficCarGeometry() {
  const parts = [];
  const box = (w, h, l, x, y, z, shade) => {
    const g = new THREE.BoxGeometry(w, h, l).translate(x, y, z).toNonIndexed();
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(shade), 3)); parts.push(g);
  };
  box(1.9, 0.5, 4.4, 0, 0.62, 0, 1.0);
  box(1.9, 0.26, 1.3, 0, 0.99, 1.45, 1.0);
  box(1.9, 0.26, 0.9, 0, 0.99, -1.7, 1.0);
  box(1.78, 0.6, 1.95, 0, 1.42, -0.22, 0.18);   // dark glass
  box(1.88, 0.12, 1.76, 0, 1.78, -0.25, 1.0);
  box(1.96, 0.24, 0.22, 0, 0.42, 2.22, 0.55); box(1.96, 0.24, 0.22, 0, 0.42, -2.22, 0.55);
  for (const z of [1.35, -1.35]) for (const x of [-0.85, 0.85]) {
    const g = octWheel(0.36, 0.3).translate(x, 0.36, z);
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(0.06), 3)); parts.push(g);
  }
  const n = parts.reduce((a, g) => a + g.attributes.position.count, 0);
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), uv = new Float32Array(n * 2); let o = 0;
  for (const g of parts) {
    pos.set(g.attributes.position.array, o * 3); col.set(g.attributes.color.array, o * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
    o += g.attributes.position.count;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}
