// kit.js - export the current style's reusable asset pack as one GLB (colours baked into vertex colours):
// building modules, rooftop / street kit, plants, vehicles, hero, resident, animals - laid out on a grid, named for reuse.
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { STYLE, T, gradeJS } from './theme.js';
import { decorProtos } from './world/decor.js';
import { buildCar } from './actors/carModel.js';
import { buildPerson } from './actors/personModel.js';
import { humanParts } from './life/residents.js';
import { SPECIES, quadParts } from './life/wildlife.js';

const mat = () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });

function bake(geo) {                         // apply the style grade to vertex colours
  const g = geo.clone(), c = g.attributes.color;
  if (c) for (let i = 0; i < c.count; i++) { const [r, gg, b] = gradeJS(c.getX(i), c.getY(i), c.getZ(i)); c.setXYZ(i, r, gg, b); }
  return g;
}
function colored(geo, hex) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone(), col = new THREE.Color(hex), n = g.attributes.position.count;
  const a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = col.r; a[i * 3 + 1] = col.g; a[i * 3 + 2] = col.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g;
}
function mesh(name, geo) { const m = new THREE.Mesh(bake(geo), mat()); m.name = name; return m; }

// a styled building module: walls + window panes on all sides + roof (gable for houses unless cozy, flat with parapet/AC for cozy)
function building(name, w, d, floors, wallHex, kind) {
  const g = new THREE.Group(); g.name = name;
  const flo = kind === 'house' ? 3.1 : 3.6, h = floors * flo + 0.6;
  g.add(mesh('walls', colored(new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0), wallHex)));
  const glass = STYLE === 'sketch' ? 0x7f8a99 : STYLE === 'cozy' ? 0x2c3a40 : 0x22303a, frame = STYLE === 'cozy' ? 0xe8dcc0 : 0xdddddd;
  const bay = kind === 'house' ? 3.6 : 3.0, ww = bay * (kind === 'house' ? 0.38 : 0.6), wh = flo * (kind === 'house' ? 0.42 : 0.6);
  for (const [len, axis] of [[w, 'x'], [d, 'z']]) for (const side of [-1, 1]) {
    const n = Math.max(1, Math.floor(len / bay));
    for (let f = 0; f < floors; f++) for (let k = 0; k < n; k++) {
      const o = (k - (n - 1) / 2) * bay, y = f * flo + flo * 0.3 + wh / 2;
      const off = (axis === 'x' ? d : w) / 2 + 0.03;
      const pane = (sx, sy, hex, extra) => {
        const geo = axis === 'x' ? new THREE.BoxGeometry(sx, sy, 0.06).translate(o, y, side * (off + extra)) : new THREE.BoxGeometry(0.06, sy, sx).translate(side * (off + extra), y, o);
        g.add(mesh('window', colored(geo, hex)));
      };
      if (STYLE === 'cozy') pane(ww + 0.25, wh + 0.25, frame, 0);
      pane(ww, wh, glass, 0.02);
    }
  }
  const P = T.palette || {};
  if (kind === 'house' && STYLE !== 'cozy') {
    const r = new THREE.BufferGeometry(), hw = w / 2 + 0.3, hd = d / 2 + 0.3, rh = Math.min(w, d) * 0.35;
    const v = [-hw, h, -hd, hw, h, -hd, hw, h, hd, -hw, h, hd, -hw, h + rh, 0, hw, h + rh, 0];
    const idx = [0, 4, 1, 1, 4, 5, 2, 5, 3, 3, 5, 4, 1, 5, 2, 3, 4, 0];
    r.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); r.setIndex(idx); r.computeVertexNormals();
    g.add(mesh('roof', colored(r.toNonIndexed(), STYLE === 'sketch' ? 0xd99c9c : 0x5a3a2a)));
  } else {
    g.add(mesh('roof', colored(new THREE.BoxGeometry(w, 0.1, d).translate(0, h + 0.05, 0), P.roof ?? 0x3b4648)));
    if (STYLE === 'cozy') {
      for (const [sx, sz, x, z] of [[w, 0.4, 0, d / 2 - 0.2], [w, 0.4, 0, -d / 2 + 0.2], [0.4, d, w / 2 - 0.2, 0], [0.4, d, -w / 2 + 0.2, 0]])
        g.add(mesh('parapet', colored(new THREE.BoxGeometry(sx, 0.7, sz).translate(x, h + 0.35, z), P.parapet)));
      const ac = new THREE.Mesh(bake(decorProtos().ac), mat()); ac.name = 'ac_unit'; ac.position.set(w * 0.2, h, d * 0.15); g.add(ac);
    }
  }
  return g;
}

export async function exportKit(vegGeoms) {
  const kit = new THREE.Group(); kit.name = `CrossCountry_${STYLE}_kit`;
  const P = T.palette || { brick: 0xb24f37, mustard: 0xd7b04e, teal: 0x6f8e8b, cream: 0xe8dcc0 };
  const walls = STYLE === 'sketch' ? [0xf4f4f2, 0xe9eef3, 0xf3ece9, 0xedf2ec] : STYLE === 'cozy' ? [P.brick, P.mustard, P.teal, P.cream] : [0xc9b8a0, 0x9c5a44, 0xd8d4cc, 0x7d8a96];
  const items = [
    building('house_small', 8, 10, 2, walls[0], 'house'), building('rowhouse', 7, 13, 3, walls[1], 'house'),
    building('shop_2f', 14, 12, 2, walls[2], 'office'), building('apartment_5f', 22, 16, 5, walls[3], 'office'),
    building('office_12f', 26, 26, 12, walls[1], 'office'), building('tower_30f', 30, 30, 30, walls[2], 'office'),
  ];
  const P2 = decorProtos();
  for (const [k, g] of Object.entries(P2)) { const m = new THREE.Mesh(bake(g), mat()); m.name = 'prop_' + k; items.push(m); }
  for (const [k, g] of Object.entries(vegGeoms || {})) { const m = new THREE.Mesh(bake(g), mat()); m.name = 'plant_' + k.replace('Proto_', ''); m.scale.setScalar(k.includes('Wheat') ? 1 : k.includes('rock') || k.includes('Shrub') ? 2 : 10); items.push(m); }
  const car = buildCar(); car.name = 'vehicle_car'; items.push(car);
  const hero = buildPerson(); hero.name = 'character_hero'; items.push(hero);
  const res = new THREE.Group(); res.name = 'character_resident';
  for (const p of humanParts()) { const m = new THREE.Mesh(bake(p.geo), mat()); m.name = p.name; if (p.pivot) m.position.fromArray(p.pivot); res.add(m); }
  items.push(res);
  for (const [k, s] of Object.entries(SPECIES)) {
    const a = new THREE.Group(); a.name = 'animal_' + k;
    for (const p of quadParts(s)) { const m = new THREE.Mesh(bake(p.geo), mat()); m.name = p.name; if (p.pivot) m.position.fromArray(p.pivot); a.add(m); }
    items.push(a);
  }
  // grade the hero / car materials too
  for (const it of [car, hero]) it.traverse((o) => { if (o.material?.color) { const c = o.material.color; o.material = o.material.clone(); o.material.color.setRGB(...gradeJS(c.r, c.g, c.b)); } });
  // lay out on a grid (12 m pitch, 8 per row; big buildings get more room)
  let x = 0, z = 0, rowMax = 0;
  for (const it of items) {
    const b = new THREE.Box3().setFromObject(it), sz = b.getSize(new THREE.Vector3());
    if (x > 0 && x + sz.x > 160) { x = 0; z += rowMax + 8; rowMax = 0; }
    it.position.x += x - b.min.x; it.position.z += z - b.min.z;
    x += sz.x + 8; rowMax = Math.max(rowMax, sz.z);
    kit.add(it);
  }
  const glb = await new GLTFExporter().parseAsync(kit, { binary: true });
  const url = URL.createObjectURL(new Blob([glb], { type: 'model/gltf-binary' }));
  const a = document.createElement('a'); a.href = url; a.download = `crosscountry_${STYLE}_kit.glb`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return items.length;
}
