# export_web.py - export the CrossCountry Blender world to compact web assets for the three.js game.
# Run inside Blender with CrossCountry.blend loaded:
#   exec(open(r"...\3D_World\tools\export_web.py").read(), {"__name__": "__main__"})
# Output: <repo>/assets/*  (three.js coords: X = bx, Y = bz, Z = -by)
import os, sys, json, math, time
import numpy as np
import bpy

REPO = r"C:\Users\Administrator\Documents\Gaming\3D_World"
CC = r"C:\Users\Administrator\Documents\Gaming\CrossCountry"
OUT = os.path.join(REPO, "assets")
os.makedirs(OUT, exist_ok=True)
sys.path.insert(0, os.path.join(CC, "scripts"))
import importlib, cc_lib as L
importlib.reload(L)
L._F.clear(); F = L.load_field()
t0 = time.time()
CELL = 1500.0
H_OFF, H_SCALE = 200.0, 20.0

import gzip


def wbin(name, data):
    """write gzip-compressed binary (decompressed in the browser with DecompressionStream)"""
    if not isinstance(data, (bytes, bytearray)): data = data.tobytes()
    with gzip.open(os.path.join(OUT, name + ".gz"), "wb", compresslevel=9) as fh: fh.write(data)
    for stale in (name,):
        p = os.path.join(OUT, stale)
        if os.path.exists(p): os.remove(p)


def lin2srgb(c):
    c = np.clip(c, 0, 1)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * np.power(c, 1 / 2.4) - 0.055)


def save_jpg(name, rgb, quality=90):
    """rgb: (h, w, 3) linear floats, row 0 = south/bottom"""
    h, w, _ = rgb.shape
    im = bpy.data.images.new("tmp_" + name, w, h, alpha=False)
    px = np.ones((h, w, 4), np.float32); px[..., :3] = lin2srgb(rgb)
    im.pixels.foreach_set(px.ravel())
    im.filepath_raw = os.path.join(OUT, name); im.file_format = "JPEG"
    try:
        im.save(quality=quality)
    except TypeError:
        im.save()
    bpy.data.images.remove(im)


# ------------------------------------------------------------------ terrain heightfield + colour map
h = F["h"].astype(np.float64)
q = np.clip(np.round((h + H_OFF) * H_SCALE), 0, 65535).astype("<u2")
wbin("terrain_h.bin", q)
col = np.zeros((L.NY, L.NX, 3), np.float32)
step = int(L.TILE / L.CELL)
for o in bpy.data.collections["CC_Terrain"].objects:
    if not o.name.startswith("Terrain_") or o.name == "Terrain_Backdrop": continue
    ti, tj = o["tile"]
    a = np.zeros(len(o.data.vertices) * 4, np.float32)
    o.data.attributes["col"].data.foreach_get("color", a)
    a = a.reshape(step + 1, step + 1, 4)
    col[tj * step: tj * step + step + 1, ti * step: ti * step + step + 1] = a[..., :3]
save_jpg("terrain_col.jpg", col, 92)
# backdrop (300 m grid, |y| <= 60 km)
bd = bpy.data.objects["Terrain_Backdrop"].data
bv = np.zeros(len(bd.vertices) * 3, np.float32); bd.vertices.foreach_get("co", bv); bv = bv.reshape(-1, 3)
bx = np.unique(np.round(bv[:, 0])); by = np.unique(np.round(bv[:, 1]))
bh = bv[:, 2].reshape(len(by), len(bx))
wbin("backdrop_h.bin", np.clip(np.round((bh + H_OFF) * H_SCALE), 0, 65535).astype("<u2"))
bc = np.zeros(len(bd.vertices) * 4, np.float32); bd.attributes["col"].data.foreach_get("color", bc)
save_jpg("backdrop_col.jpg", bc.reshape(len(by), len(bx), 4)[..., :3].copy(), 85)
print("terrain %.1fs" % (time.time() - t0))

# ------------------------------------------------------------------ route
rx, ry, rz, rs = (F[k].astype(np.float32) for k in ("rx", "ry", "rz", "rs"))
wbin("route.bin", np.stack([rx, ry, rz, rs], 1).astype("<f4"))

# ------------------------------------------------------------------ static mesh packs
MAT_IDS = {"Bld_Plain": 0, "Bld_Office": 1, "Bld_House": 2, "Bld_Glass": 3, "Bld_Metal": 4, "Bld_Neon": 5, "Bld_Roof": 6}
ATTR_MATS = set(MAT_IDS)


def mat_info(m):
    if m is None: return 0, (0.6, 0.6, 0.6)
    if m.name in MAT_IDS: return MAT_IDS[m.name], None
    c = tuple(m.diffuse_color[:3])
    if m.name.startswith("Neon_"): return 5, c
    if m.name in ("GuardRail", "Rail_Steel"): return 4, c
    if m.name.startswith("Water"): return 7, c
    return 0, c


def object_tris(o):
    """world-space verts (blender), per-vertex srgb colour + mat id, triangle index array, prim ids (or None)"""
    dg = bpy.context.evaluated_depsgraph_get()
    if o.type == "FONT":
        ev = o.evaluated_get(dg); me = ev.to_mesh()
    else:
        me = o.data; ev = None
    nv = len(me.vertices)
    if nv == 0:
        if ev: ev.to_mesh_clear()
        return None
    co = np.zeros(nv * 3, np.float32); me.vertices.foreach_get("co", co); co = co.reshape(-1, 3)
    M = np.array(o.matrix_world)
    co = co @ M[:3, :3].T + M[:3, 3]
    npoly = len(me.polygons)
    ls = np.zeros(npoly, np.int32); lt = np.zeros(npoly, np.int32); mi = np.zeros(npoly, np.int32)
    me.polygons.foreach_get("loop_start", ls); me.polygons.foreach_get("loop_total", lt); me.polygons.foreach_get("material_index", mi)
    lv = np.zeros(len(me.loops), np.int32); me.loops.foreach_get("vertex_index", lv)
    mats = [mat_info(s.material) for s in o.material_slots] or [mat_info(None)]
    pm = np.array([mats[min(k, len(mats) - 1)][0] for k in range(len(mats))])[np.clip(mi, 0, len(mats) - 1)]
    pc = np.array([mats[min(k, len(mats) - 1)][1] or (-1, -1, -1) for k in range(len(mats))], float)[np.clip(mi, 0, len(mats) - 1)]
    tris = []
    for k in np.unique(lt):
        if k < 3: continue
        sel = np.where(lt == k)[0]
        for t in range(1, k - 1):
            tris.append(np.stack([lv[ls[sel]], lv[ls[sel] + t], lv[ls[sel] + t + 1]], 1))
    tris = np.vstack(tris) if tris else np.zeros((0, 3), np.int32)
    # per-vertex material/colour: first polygon wins (iterate polys reversed)
    vmat = np.zeros(nv, np.int32); vcol = np.full((nv, 3), 0.6)
    order = np.arange(npoly)[::-1]
    poly_of_loop = np.repeat(np.arange(npoly), lt)
    lo = np.argsort(-poly_of_loop, kind="stable")
    vmat[lv[lo]] = pm[poly_of_loop[lo]]
    vcol[lv[lo]] = pc[poly_of_loop[lo]]
    if "bcol" in me.attributes:
        b = np.zeros(nv * 4, np.float32); me.attributes["bcol"].data.foreach_get("color", b); b = b.reshape(-1, 4)[:, :3]
        use = vcol[:, 0] < 0
        vcol[use] = b[use]
    vcol[vcol[:, 0] < 0] = 0.6
    prim = None
    if "prim" in me.attributes:
        prim = np.zeros(nv, np.float32); me.attributes["prim"].data.foreach_get("value", prim); prim = prim.astype(np.int64)
    # per-face-corner arrays for rendering: every polygon gets its own vertices -> exact flat normals in the browser
    lcol = pc[poly_of_loop].copy()
    if "bcol" in me.attributes:
        use = lcol[:, 0] < 0
        lcol[use] = b[lv[use]]
    lcol[lcol[:, 0] < 0] = 0.6
    ltris = []
    for k in np.unique(lt):
        if k < 3: continue
        sel = np.where(lt == k)[0]
        for t in range(1, k - 1):
            ltris.append(np.stack([ls[sel], ls[sel] + t, ls[sel] + t + 1], 1))
    ltris = np.vstack(ltris) if ltris else np.zeros((0, 3), np.int32)
    faces = (co[lv], lin2srgb(lcol), pm[poly_of_loop], ltris)
    if ev: ev.to_mesh_clear()
    return co, lin2srgb(vcol), vmat, tris, prim, faces


def to3(p):   # blender -> three
    return np.stack([p[:, 0], p[:, 2], -p[:, 1]], 1)


class Pack:
    def __init__(self, name):
        self.name = name; self.entries = []; self.buf = bytearray()

    def _pad(self):
        while len(self.buf) % 4: self.buf.append(0)

    def add(self, key, P3, rgbm, tris, quant=True):
        if len(tris) == 0: return
        lo = P3.min(0); size = np.maximum(P3.max(0) - lo, 1e-3)
        e = {"key": key, "origin": lo.round(3).tolist(), "size": size.round(3).tolist(), "v": len(P3), "i": int(tris.size)}
        e["pOff"] = len(self.buf)
        if quant:
            self.buf += np.round((P3 - lo) / size * 65535).astype("<u2").tobytes()
        else:
            self.buf += (P3 - lo).astype("<f4").tobytes(); e["float"] = True
        self._pad(); e["cOff"] = len(self.buf)
        self.buf += rgbm.astype(np.uint8).tobytes(); self._pad()
        e["iOff"] = len(self.buf)
        if len(P3) < 65536: self.buf += tris.astype("<u2").tobytes()
        else: self.buf += tris.astype("<u4").tobytes(); e["u32"] = True
        self._pad()
        self.entries.append(e)

    def write(self):
        wbin(self.name + ".bin", bytes(self.buf))
        json.dump(self.entries, open(os.path.join(OUT, self.name + ".json"), "w"))
        print("  %s: %d entries, %.1f MB" % (self.name, len(self.entries), len(self.buf) / 1e6))


def gather(objs):
    cells = {}
    colliders = []
    for o in objs:
        r = object_tris(o)
        if r is None: continue
        co, srgb, vmat, tris, prim, (fco, fsrgb, fmat, ftris) = r
        if len(ftris) == 0: continue
        rgbm = np.c_[np.round(fsrgb * 255), fmat].astype(np.uint8)
        cen = fco[ftris].mean(1)
        ci = np.floor((cen[:, 0] - L.X0) / CELL).astype(int); cj = np.floor((cen[:, 1] - L.Y0) / CELL).astype(int)
        key = ci * 1000 + cj
        for k in np.unique(key):
            t = ftris[key == k]
            cells.setdefault(int(k), []).append((fco, rgbm, t))
        if prim is not None:
            colliders.append(prim_colliders(co, vmat, prim))
    return cells, colliders


SOLID = {0, 1, 2, 3, 4}


def prim_colliders(co, vmat, prim):
    order = np.argsort(prim, kind="stable")
    p_sorted = prim[order]
    bounds = np.r_[0, np.where(np.diff(p_sorted))[0] + 1, len(order)]
    out = []
    for a, b in zip(bounds[:-1], bounds[1:]):
        idx = order[a:b]
        if len(idx) < 4 or vmat[idx[0]] not in SOLID: continue
        v = co[idx]
        z0, z1 = v[:, 2].min(), v[:, 2].max()
        if z1 - z0 < 0.25: continue
        if z1 - z0 > 2.0:   # tall slanted beams (cables, A-frame legs, arch ribs) would block the road as a 2D box
            zm = (z0 + z1) / 2; lo = v[v[:, 2] <= zm, :2].mean(0); hi = v[v[:, 2] > zm, :2].mean(0)
            if np.hypot(*(hi - lo)) > 1.5: continue
        d = v[1, :2] - v[0, :2]
        ang = math.atan2(d[1], d[0]) if np.hypot(*d) > 1e-3 else 0.0
        c, s = math.cos(ang), math.sin(ang)
        u = v[:, 0] * c + v[:, 1] * s; w = -v[:, 0] * s + v[:, 1] * c
        hu = (u.max() - u.min()) / 2; hw = (w.max() - w.min()) / 2
        if max(hu, hw) < 0.5 or min(hu, hw) < 0.06: continue
        cu = (u.max() + u.min()) / 2; cw = (w.max() + w.min()) / 2
        out.append((cu * c - cw * s, cu * s + cw * c, hu, hw, ang, z0, z1))
    return np.array(out, np.float32).reshape(-1, 7)


def write_cells(pack, cells, max_tris=20000):
    for k, parts in sorted(cells.items()):
        # merge all parts of the cell, then split into <= 60k-vertex batches
        P = []; C = []; T = []; off = 0
        for (co, rgbm, t) in parts:
            u, inv = np.unique(t.ravel(), return_inverse=True)
            P.append(co[u]); C.append(rgbm[u]); T.append(inv.reshape(-1, 3) + off); off += len(u)
        P = np.vstack(P); C = np.vstack(C); T = np.vstack(T)
        for s in range(0, len(T), max_tris):
            t = T[s:s + max_tris]
            u, inv = np.unique(t.ravel(), return_inverse=True)
            pack.add(k, to3(P[u]), C[u], inv.reshape(-1, 3))


static_objs = []
for cn in ("CC_Cities", "CC_Towns", "CC_Landmarks", "CC_Props"):
    for o in bpy.data.collections[cn].all_objects:
        if o.type in ("MESH", "FONT") and not o.name.startswith("Proto_"):
            static_objs.append(o)
static_objs.append(bpy.data.objects["Highway_Bridges_Rails"])
cells, cols = gather(static_objs)
REGION = 6      # cells (1.5 km) per streamed region -> 9 km wide files
regions = {}
for k, parts in cells.items():
    regions.setdefault((k // 1000) // REGION, {})[k] = parts
reg_index = []
for r, rc in sorted(regions.items()):
    pk = Pack("static_r%02d" % r); write_cells(pk, rc); pk.write()
    reg_index.append({"file": "static_r%02d" % r, "x0": L.X0 + r * REGION * CELL, "x1": L.X0 + (r + 1) * REGION * CELL})
json.dump(reg_index, open(os.path.join(OUT, "static_regions.json"), "w"))
for fn in os.listdir(OUT):
    if fn in ("static.bin", "static.json"): os.remove(os.path.join(OUT, fn))
COL = np.vstack([c for c in cols if len(c)])
# safety net: nothing may block the carriageway at driving height
near = L.road_dist(COL[:, 0], COL[:, 1]) < 60 + np.hypot(COL[:, 2], COL[:, 3])
cand = np.where(near)[0]
drop = np.zeros(len(COL), bool)
for k in cand:
    cx, cy, hu, hw, ang, z0, z1 = COL[k]
    R = math.hypot(hu, hw) + 8.5
    sel = np.where((np.abs(rx - cx) < R) & (np.abs(ry - cy) < R))[0]
    if not len(sel): continue
    c, s = math.cos(ang), math.sin(ang)
    du = (rx[sel] - cx) * c + (ry[sel] - cy) * s; dw = -(rx[sel] - cx) * s + (ry[sel] - cy) * c
    d = np.hypot(np.maximum(np.abs(du) - hu, 0), np.maximum(np.abs(dw) - hw, 0))
    hitz = (z1 > rz[sel] + 0.15) & (z0 < rz[sel] + 1.8)
    if np.any((d < 7.9) & hitz): drop[k] = True
print("colliders dropped from the carriageway:", int(drop.sum()))
COL = COL[~drop]
wbin("colliders.bin", COL.astype("<f4"))
print("colliders %d  (%.1fs)" % (len(COL), time.time() - t0))

# water
pw = Pack("water")
for o in bpy.data.collections["CC_Water"].objects:
    co, srgb, vmat, tris, prim, (co, srgb, vmat, tris) = object_tris(o)
    pw.add(o.name, to3(co), np.c_[np.round(srgb * 255), np.full(len(co), 7)].astype(np.uint8), tris, quant=False)
pw.write()

# vegetation prototypes (float, local)
pp = Pack("protos")
for o in bpy.data.collections["CC_Protos"].objects:
    co, srgb, vmat, tris, prim, (co, srgb, vmat, tris) = object_tris(o)
    co = co - np.array(o.matrix_world)[:3, 3]
    P3 = to3(co)
    pp.add(o.name, P3, np.c_[np.round(srgb * 255), vmat].astype(np.uint8), tris, quant=False)
    pp.entries[-1]["origin"] = (P3.min(0)).round(4).tolist()
pp.write()

# vegetation instances: per proto, float32 x,y (blender) + uint8 scale*8 + uint8 rot
veg = {}
for o in bpy.data.collections["CC_Vegetation"].objects:
    me = o.data; n = len(me.vertices)
    if n == 0: continue
    co = np.zeros(n * 3, np.float32); me.vertices.foreach_get("co", co); co = co.reshape(-1, 3)
    sc_ = np.zeros(n, np.float32); me.attributes["scl"].data.foreach_get("value", sc_)
    ro = np.zeros(n, np.float32); me.attributes["rot"].data.foreach_get("value", ro)
    veg.setdefault(o["proto"], []).append((co[:, :2], sc_, ro))
vbuf = bytearray(); vidx = []
for proto, parts in veg.items():
    xy = np.vstack([p[0] for p in parts]); s_ = np.concatenate([p[1] for p in parts]); r_ = np.concatenate([p[2] for p in parts])
    e = {"proto": proto, "n": len(xy), "xyOff": len(vbuf)}
    vbuf += xy.astype("<f4").tobytes()
    e["sOff"] = len(vbuf); vbuf += np.clip(np.round(s_ * 8), 1, 255).astype(np.uint8).tobytes()
    e["rOff"] = len(vbuf); vbuf += np.round((r_ % (2 * math.pi)) / (2 * math.pi) * 255).astype(np.uint8).tobytes()
    while len(vbuf) % 4: vbuf.append(0)
    vidx.append(e)
wbin("veg.bin", bytes(vbuf))
json.dump(vidx, open(os.path.join(OUT, "veg.json"), "w"))
print("veg %d instances, %.1f MB" % (sum(e["n"] for e in vidx), len(vbuf) / 1e6))

# minimap image
src = os.path.join(CC, "renders", "Cam_Map.png")
if os.path.exists(src):
    im = bpy.data.images.load(src, check_existing=False); _ = im.pixels[0]   # force-load the buffer
    im.filepath_raw = os.path.join(OUT, "map.jpg"); im.file_format = "JPEG"; im.save(); bpy.data.images.remove(im)

# meta
wm = json.load(open(os.path.join(CC, "world_meta.json")))
st = json.load(open(os.path.join(CC, "data", "stages.json")))
stage_x = [0, 9800, 17500, 30000, 43800, 58800, 73000, 80500, 90500, 95500]
for s_, x in zip(st["stages"], stage_x):
    i = int(np.searchsorted(rs, s_["route_km"] * 1000 + 250))
    s_["start"] = [float(rx[i]), float(ry[i]), float(rz[i])]
    s_["x"] = x
meta = {
    "X0": L.X0, "X1": L.X1, "Y0": L.Y0, "Y1": L.Y1, "CELL": L.CELL, "NX": L.NX, "NY": L.NY,
    "H_OFF": H_OFF, "H_SCALE": H_SCALE,
    "backdrop": {"nx": int(len(bx)), "ny": int(len(by)), "x0": float(bx[0]), "y0": float(by[0]), "cell": float(bx[1] - bx[0])},
    "route_n": int(len(rx)), "route_km": float(rs[-1] / 1000), "road_half": L.ROAD_HALF,
    "towns": wm["towns"], "lakes": wm["lakes"], "stages": st["stages"],
    "river": {"z": L.MISS_Z, "hw": L.RIVER_HW}, "canyon": {"z": L.CANYON_Z},
    "static_cell": CELL, "colliders": int(len(COL)),
}
json.dump(meta, open(os.path.join(OUT, "meta.json"), "w"), indent=1)
tot = sum(os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT))
print("done %.1fs  total %.1f MB" % (time.time() - t0, tot / 1e6))
