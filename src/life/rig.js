// rig.js - instanced multi-part creatures: every body part is one InstancedMesh, posed per creature per frame.
// Creatures are drawn relative to a moving origin near the camera (float precision in a 100 km world).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// geometry helpers ------------------------------------------------------------------------------
export function tint(geo, r, g, b) {
  const gg = geo.index ? geo.toNonIndexed() : geo;
  const n = gg.attributes.position.count, c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { c[i * 3] = r; c[i * 3 + 1] = g; c[i * 3 + 2] = b; }
  gg.setAttribute('color', new THREE.BufferAttribute(c, 3));
  for (const k of Object.keys(gg.attributes)) if (!['position', 'normal', 'color'].includes(k)) gg.deleteAttribute(k);
  return gg;
}
export function merge(...geos) {
  const g = mergeGeometries(geos.map((x) => (x.attributes.color ? x : tint(x, 1, 1, 1))));
  g.computeVertexNormals(); g.computeBoundingSphere();
  return g;
}
export const cap = (r, len, rs = 8) => new THREE.CapsuleGeometry(r, len, 3, rs);

const _m = new THREE.Matrix4(), _p = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(),
  _v = new THREE.Vector3(), _s = new THREE.Vector3(), _one = new THREE.Vector3(1, 1, 1), _c = new THREE.Color();

export class PartRig {
  // parts: [{ name, geo, pivot: [x, y, z] }]
  constructor(scene, parts, max, { shadow = true } = {}) {
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.max = max; this.n = 0; this.origin = new THREE.Vector3();
    this.parts = parts.map((p) => {
      const mesh = new THREE.InstancedMesh(p.geo, mat, max);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.setColorAt(0, _c.set(1, 1, 1));
      mesh.count = 0; mesh.castShadow = shadow; mesh.receiveShadow = false; mesh.frustumCulled = false;
      scene.add(mesh);
      return { ...p, mesh, pv: new THREE.Vector3(...(p.pivot || [0, 0, 0])) };
    });
    this.byName = Object.fromEntries(this.parts.map((p) => [p.name, p]));
  }

  begin(origin) { this.origin.copy(origin); this.n = 0; for (const p of this.parts) p.mesh.position.copy(origin); }

  // pos: three world position of the feet; yaw about +Y; pose: { part: [rx, ry, rz] }; colors: { part: Color|hex }
  push(pos, yaw, scale, pose, colors, tilt = null) {
    if (this.n >= this.max) return;
    const i = this.n++;
    _e.set(tilt ? tilt[0] : 0, yaw, tilt ? tilt[1] : 0, 'YXZ'); _q.setFromEuler(_e);
    _m.compose(_v.copy(pos).sub(this.origin), _q, _s.setScalar(scale));
    for (const p of this.parts) {
      const r = pose[p.name];
      if (r) { _e.set(r[0], r[1] || 0, r[2] || 0, 'XYZ'); _q.setFromEuler(_e); } else _q.identity();
      _p.compose(p.pv, _q, _one);
      p.mesh.setMatrixAt(i, _p.premultiply(_m));
      const c = colors[p.name];
      if (c !== undefined) p.mesh.setColorAt(i, typeof c === 'number' ? _c.setHex(c) : c);
    }
  }

  end() {
    for (const p of this.parts) {
      p.mesh.count = this.n;
      p.mesh.instanceMatrix.needsUpdate = true;
      if (p.mesh.instanceColor) p.mesh.instanceColor.needsUpdate = true;
    }
  }
}
