// carModel.js - procedural sports coupe. Local frame: +Z forward, +Y up, origin on the ground between the axles.
import * as THREE from 'three';

export const CAR_DIM = { wheelbase: 2.7, track: 1.66, wheelR: 0.34, length: 4.6, width: 2.0 };

function extrudeProfile(shape, depth, bevel) {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.8,
                                                bevelSegments: 3, curveSegments: 18, steps: 1 });
  g.rotateY(-Math.PI / 2);          // shape x (length) -> +z, extrusion -> -x
  g.translate(depth / 2, 0, 0);
  g.computeVertexNormals();
  return g;
}

export function buildCar(paint = 0xb3001b) {
  const car = new THREE.Group(); car.name = 'PlayerCar';
  const body = new THREE.Group(); car.add(body);       // pitched / rolled by the physics
  const M = {
    paint: new THREE.MeshPhysicalMaterial({ color: paint, metalness: 0.55, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.06 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0x0c141c, metalness: 0.1, roughness: 0.04, clearcoat: 1 }),
    black: new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.6 }),
    trim: new THREE.MeshStandardMaterial({ color: 0x1b1b1d, roughness: 0.35, metalness: 0.4 }),
    chrome: new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.15, metalness: 1 }),
    tire: new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.9 }),
    rim: new THREE.MeshStandardMaterial({ color: 0xb8bcc2, roughness: 0.25, metalness: 0.95 }),
    caliper: new THREE.MeshStandardMaterial({ color: 0xd4a017, roughness: 0.4 }),
    head: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff4dd, emissiveIntensity: 2.2 }),
    tail: new THREE.MeshStandardMaterial({ color: 0x550000, emissive: 0xff1010, emissiveIntensity: 1.2 }),
  };
  const add = (geo, mat, x = 0, y = 0, z = 0, parent = body) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
  };
  const { wheelbase: WB, track: TR, wheelR: R } = CAR_DIM;
  const fx = WB / 2, rx = -WB / 2;

  // ---- lower body: side profile with wheel arches, extruded across the width
  const s = new THREE.Shape();
  s.moveTo(-2.27, 0.3);
  s.lineTo(rx - 0.44, 0.3);
  s.absarc(rx, 0.36, 0.45, Math.PI, 0, true);
  s.lineTo(fx - 0.44, 0.3);
  s.absarc(fx, 0.36, 0.45, Math.PI, 0, true);
  s.lineTo(2.2, 0.29);
  s.lineTo(2.33, 0.47);
  s.splineThru([new THREE.Vector2(2.24, 0.68), new THREE.Vector2(1.7, 0.83), new THREE.Vector2(1.12, 0.92),
                new THREE.Vector2(0.0, 0.99), new THREE.Vector2(-1.1, 1.0), new THREE.Vector2(-1.85, 0.98),
                new THREE.Vector2(-2.26, 0.88), new THREE.Vector2(-2.33, 0.6)]);
  s.lineTo(-2.27, 0.3);
  add(extrudeProfile(s, 1.84, 0.07), M.paint);
  // ---- greenhouse (glass canopy) + roof panel
  const gS = new THREE.Shape();
  gS.moveTo(-1.15, 0.97);
  gS.splineThru([new THREE.Vector2(-0.75, 1.2), new THREE.Vector2(-0.2, 1.31), new THREE.Vector2(0.35, 1.3)]);
  gS.lineTo(1.18, 0.93);
  gS.lineTo(-1.15, 0.97);
  add(extrudeProfile(gS, 1.42, 0.05), M.glass);
  add(new THREE.BoxGeometry(1.26, 0.03, 0.95), M.paint, 0, 1.325, 0.05);
  // ---- details
  add(new THREE.BoxGeometry(1.5, 0.16, 0.08), M.black, 0, 0.42, 2.3);                     // grille
  for (const sx of [-1, 1]) {
    const hl = add(new THREE.BoxGeometry(0.5, 0.09, 0.12), M.head, sx * 0.62, 0.66, 2.2);    // headlights
    hl.rotation.x = -0.35; hl.rotation.y = sx * 0.15;
    add(new THREE.BoxGeometry(0.06, 0.08, 1.9), M.black, sx * 1.0, 0.34, 0);                // side skirts
    add(new THREE.BoxGeometry(0.16, 0.08, 0.1), M.paint, sx * 1.0, 1.0, 0.92);               // mirrors
    add(new THREE.CylinderGeometry(0.045, 0.05, 0.16, 12).rotateX(Math.PI / 2), M.chrome, sx * 0.45, 0.33, -2.33); // exhausts
    add(new THREE.BoxGeometry(0.05, 0.28, 0.06), M.trim, sx * 0.62, 1.05, -2.05);            // wing stands
  }
  add(new THREE.BoxGeometry(1.62, 0.07, 0.07), M.tail, 0, 0.8, -2.33);                        // light bar
  add(new THREE.BoxGeometry(1.8, 0.035, 0.32), M.trim, 0, 1.2, -2.08).rotation.x = 0.08;      // rear wing
  add(new THREE.BoxGeometry(0.52, 0.12, 0.02), new THREE.MeshStandardMaterial({ color: 0xf2f2f2 }), 0, 0.5, -2.36); // plate
  add(new THREE.BoxGeometry(1.7, 0.06, 0.5), M.black, 0, 0.25, 2.05);                        // front splitter

  // ---- wheels: steer pivot (front) -> spin group -> tyre + rim + spokes
  const tyreG = new THREE.CylinderGeometry(R, R, 0.27, 28).rotateZ(Math.PI / 2);
  const rimG = new THREE.CylinderGeometry(R * 0.68, R * 0.68, 0.275, 24).rotateZ(Math.PI / 2);
  const hubG = new THREE.CylinderGeometry(0.05, 0.05, 0.29, 10).rotateZ(Math.PI / 2);
  const spokeG = new THREE.BoxGeometry(0.03, R * 1.3, 0.05);
  const wheels = [];
  for (const [z, front] of [[fx, true], [rx, false]]) for (const sx of [-1, 1]) {
    const steer = new THREE.Group(); steer.position.set(sx * TR / 2, R, z); car.add(steer);
    const spin = new THREE.Group(); steer.add(spin);
    add(tyreG, M.tire, 0, 0, 0, spin);
    add(rimG, M.rim, sx * 0.003, 0, 0, spin);
    add(hubG, M.chrome, 0, 0, 0, spin);
    for (let k = 0; k < 5; k++) { const sp = add(spokeG, M.rim, sx * 0.13, 0, 0, spin); sp.rotation.x = k * Math.PI * 2 / 5; }
    add(new THREE.BoxGeometry(0.06, 0.16, 0.2), M.caliper, -sx * 0.06, 0.12, 0, steer);
    wheels.push({ steer, spin, front, side: sx });
  }
  car.userData = { body, wheels };
  return car;
}

// light-weight merged car for traffic instancing (body colour from instanceColor)
export function trafficCarGeometry() {
  const parts = [];
  const box = (w, h, l, x, y, z, shade) => {
    const g = new THREE.BoxGeometry(w, h, l).translate(x, y, z).toNonIndexed();
    const c = new Float32Array(g.attributes.position.count * 3).fill(shade);
    g.setAttribute('color', new THREE.BufferAttribute(c, 3)); parts.push(g);
  };
  box(1.82, 0.7, 4.5, 0, 0.62, 0, 1.0);          // body (tinted by instance colour)
  box(1.6, 0.52, 2.3, 0, 1.22, -0.2, 0.12);      // cabin glass (dark)
  box(1.5, 0.05, 1.8, 0, 1.5, -0.25, 1.0);       // roof
  for (const z of [1.4, -1.4]) for (const x of [-0.82, 0.82]) box(0.26, 0.64, 0.64, x, 0.32, z, 0.05);
  box(1.4, 0.12, 0.05, 0, 0.75, -2.26, 0.6);     // tail lights strip
  const n = parts.reduce((a, g) => a + g.attributes.position.count, 0);
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3); let o = 0;
  for (const g of parts) { pos.set(g.attributes.position.array, o * 3); col.set(g.attributes.color.array, o * 3); o += g.attributes.position.count; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}
