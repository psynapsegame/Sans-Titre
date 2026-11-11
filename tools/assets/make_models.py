"""Modélise les assets 3D originaux du jeu dans Blender et les exporte en GLB.

  - bird.glb    étourneau (nuée) — COLOR_0 = teinte, TEXCOORD_0 = (poids d'aile, masque bec)
  - falcon.glb  faucon pèlerin   — mêmes attributs
  - feather.glb plume dorée
  - stack0..2.glb aiguilles rocheuses (UV cylindriques pour textures PBR en tuiles)

Usage : python make_models.py -- <dossier_sortie>
Repère d'auteur : x = droite, up = haut, fwd = avant (converti en Y-up par l'export glTF).
"""
import bpy, bmesh, sys, math, os
from mathutils import Vector, noise

out = sys.argv[sys.argv.index('--') + 1]
os.makedirs(out, exist_ok=True)


def P(x, up, fwd):
    return Vector((x, -fwd, up))


def new_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def finish(bm, name, smooth=False):
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me); bm.free()
    for p in me.polygons: p.use_smooth = smooth
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def export(name):
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(filepath=os.path.join(out, name + '.glb'), export_format='GLB',
                              export_materials='NONE', export_yup=True, export_apply=True,
                              export_normals=True, export_texcoords=True, export_vertex_color='ACTIVE',
                              export_all_vertex_colors=True, export_attributes=False)
    print('EXPORTED', name)


# ---------------------------------------------------------------- oiseaux
def make_bird(name, cfg):
    new_scene()
    bm = bmesh.new()
    col = bm.loops.layers.color.new('Col')
    uv = bm.loops.layers.uv.new('UVMap')
    span, chord, body = cfg['span'], cfg['chord'], cfg['body']

    def face(pts, colors, weights, accent=0.0):
        vs = [bm.verts.new(p) for p in pts]
        f = bm.faces.new(vs)
        for i, l in enumerate(f.loops):
            c = colors[i] if isinstance(colors, list) else colors
            l[col] = (c[0], c[1], c[2], 1.0)
            w = weights[i] if isinstance(weights, list) else weights
            l[uv].uv = (w, accent)
        return f

    # corps : sections octogonales lissées de la queue à la tête
    secs = cfg['sections']  # (fwd, demi-largeur, demi-hauteur, décalage vertical)
    n = 8
    rings = []
    for (fz, hw, hh, oy) in secs:
        ring = []
        for k in range(n):
            a = (k + 0.5) / n * math.tau
            ring.append(P(math.cos(a) * hw * body, oy + math.sin(a) * hh * body, fz))
        rings.append(ring)
    back, belly = cfg['back'], cfg['belly']

    def body_col(p):
        t = (p.z - (-0.12)) / 0.24  # p.z = up
        t = max(0.0, min(1.0, t * 0.5 + 0.5))
        return tuple(belly[i] + (back[i] - belly[i]) * t for i in range(3))

    for i in range(len(rings) - 1):
        for k in range(n):
            a, b = rings[i][k], rings[i][(k + 1) % n]
            c, d = rings[i + 1][(k + 1) % n], rings[i + 1][k]
            face([a, b, c, d], [body_col(a), body_col(b), body_col(c), body_col(d)], 0.0)
    # bec
    tip = P(0, secs[-1][3] - 0.012, secs[-1][0] + cfg['beak'])
    for k in range(n):
        a, b = rings[-1][k], rings[-1][(k + 1) % n]
        face([a, b, tip], cfg['beak_col'], 0.0, accent=1.0)
    # bouchon arrière
    tail0 = P(0, secs[0][3], secs[0][0] - 0.02)
    for k in range(n):
        a, b = rings[0][(k + 1) % n], rings[0][k]
        face([a, b, tail0], body_col(a), 0.0)

    # queue en éventail
    tz, tl, tw = secs[0][0], cfg['tail_len'], cfg['tail_w']
    tc = cfg['tail_col']
    for s in (-1, 1):
        a = P(0, 0.012, tz + 0.06); b = P(s * 0.05, 0.01, tz + 0.04)
        c = P(s * tw, 0.0, tz - tl); d = P(s * tw * 0.35, 0.0, tz - tl * 0.86)
        e = P(0, 0.0, tz - tl * (1.0 - cfg['tail_notch']))
        face([a, b, c, d], tc, 0.0); face([a, d, e], tc, 0.0)

    # ailes : stations d'envergure (x, bord d'attaque, bord de fuite), légère cambrure
    st = cfg['wing']
    wing_in, wing_out, lead = cfg['wing_in'], cfg['wing_out'], cfg['wing_lead']
    x0, x1 = st[0][0] * span, st[-1][0] * span

    def wgt(x):
        return max(0.0, min(1.0, (abs(x) - x0) / (x1 - x0)))

    def wcol(x, edge):
        t = wgt(x)
        c = [wing_in[i] + (wing_out[i] - wing_in[i]) * t for i in range(3)]
        if edge > 0: c = [c[i] + (lead[i] - c[i]) * 0.6 for i in range(3)]
        return tuple(c)

    for s in (-1, 1):
        for i in range(len(st) - 1):
            xa, la, ta = st[i]; xb, lb, tb = st[i + 1]
            xa *= span; xb *= span
            ma, mb = (la + ta) / 2 * chord, (lb + tb) / 2 * chord
            up_a, up_b = 0.045 - 0.02 * wgt(xa), 0.045 - 0.02 * wgt(xb)
            A = P(s * xa, up_a, la * chord); B = P(s * xb, up_b, lb * chord)
            MA = P(s * xa, up_a + 0.028, ma); MB = P(s * xb, up_b + 0.028, mb)
            # dentelure des rémiges sur le bord de fuite
            jag = 0.035 * chord if i % 2 == 0 else 0.0
            TA = P(s * xa, up_a - 0.005, ta * chord); TB = P(s * xb, up_b - 0.005, tb * chord - jag)
            face([A, B, MB, MA], [wcol(xa, 1), wcol(xb, 1), wcol(xb, 0), wcol(xa, 0)], [wgt(xa), wgt(xb), wgt(xb), wgt(xa)])
            face([MA, MB, TB, TA], [wcol(xa, 0), wcol(xb, 0), wcol(xb, -1), wcol(xa, -1)], [wgt(xa), wgt(xb), wgt(xb), wgt(xa)])
        # pointe : trois rémiges primaires
        xl, ll, tl2 = st[-1]
        xl *= span
        up = 0.025
        base_l = P(s * xl, up, ll * chord); base_t = P(s * xl, up, tl2 * chord)
        base_m = P(s * xl, up + 0.02, (ll + tl2) / 2 * chord)
        for (dx, dz, src) in cfg['primaries']:
            tipp = P(s * (xl + dx * span), up - 0.01, dz * chord)
            a_, b_ = src
            pa = [base_l, base_m, base_t][a_]; pb = [base_l, base_m, base_t][b_]
            face([pa, tipp, pb], wing_out, 1.0)

    finish(bm, name, smooth=False)
    export(name)


starling = dict(
    span=1.0, chord=1.0, body=1.0,
    sections=[(-0.42, 0.035, 0.03, 0.0), (-0.28, 0.085, 0.075, 0.0), (-0.08, 0.125, 0.112, -0.005),
              (0.10, 0.13, 0.118, -0.01), (0.26, 0.105, 0.098, 0.0), (0.36, 0.078, 0.076, 0.016),
              (0.44, 0.082, 0.08, 0.03), (0.52, 0.056, 0.055, 0.03), (0.565, 0.028, 0.026, 0.022)],
    beak=0.15, beak_col=(1.0, 1.0, 1.0),
    back=(0.62, 0.62, 0.62), belly=(0.95, 0.95, 0.95),
    tail_len=0.36, tail_w=0.13, tail_notch=0.12, tail_col=(0.6, 0.6, 0.6),
    wing=[(0.10, 0.20, -0.20), (0.32, 0.26, -0.25), (0.56, 0.23, -0.26), (0.80, 0.11, -0.29), (1.00, -0.06, -0.33)],
    wing_in=(0.82, 0.82, 0.82), wing_out=(0.5, 0.5, 0.5), wing_lead=(1.0, 1.0, 1.0),
    primaries=[(0.20, -0.36, (0, 1)), (0.12, -0.46, (1, 2))],
)
make_bird('bird', starling)

falcon = dict(
    span=1.22, chord=1.12, body=1.28,
    sections=[(-0.48, 0.04, 0.035, 0.0), (-0.3, 0.09, 0.08, 0.0), (-0.08, 0.13, 0.115, -0.005),
              (0.12, 0.135, 0.12, -0.01), (0.28, 0.11, 0.1, 0.0), (0.38, 0.085, 0.082, 0.02),
              (0.46, 0.09, 0.086, 0.034), (0.53, 0.062, 0.06, 0.03), (0.57, 0.034, 0.034, 0.016)],
    beak=0.09, beak_col=(1.0, 0.78, 0.2),
    back=(0.2, 0.24, 0.32), belly=(0.92, 0.86, 0.74),
    tail_len=0.5, tail_w=0.12, tail_notch=0.0, tail_col=(0.16, 0.19, 0.26),
    wing=[(0.10, 0.22, -0.2), (0.3, 0.3, -0.24), (0.52, 0.3, -0.22), (0.76, 0.18, -0.24), (1.0, -0.04, -0.3)],
    wing_in=(0.3, 0.35, 0.45), wing_out=(0.1, 0.12, 0.17), wing_lead=(0.5, 0.55, 0.65),
    primaries=[(0.26, -0.44, (0, 1)), (0.14, -0.5, (1, 2))],
)
make_bird('falcon', falcon)


# ---------------------------------------------------------------- plume
def make_feather():
    new_scene()
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')
    N = 12
    L, R, C = [], [], []
    for i in range(N + 1):
        t = i / N
        w = 0.19 * math.sin(math.pi * (t ** 0.75)) * (1 - 0.25 * t) + 0.004
        bend = 0.12 * math.sin(t * math.pi)
        y = (t - 0.5) * 1.0
        C.append(Vector((0.0, y, bend + 0.03)))
        L.append(Vector((-w, y - 0.07 * (1 - t), bend - w * 0.25)))
        R.append(Vector((w * 0.8, y - 0.07 * (1 - t), bend - w * 0.2)))
    for i in range(N):
        for a, b, c, d, u0, u1 in ((L[i], C[i], C[i + 1], L[i + 1], 0.0, 0.5), (C[i], R[i], R[i + 1], C[i + 1], 0.5, 1.0)):
            f = bm.faces.new([bm.verts.new(p) for p in (a, b, c, d)])
            uvs = [(u0, i / N), (u1, i / N), (u1, (i + 1) / N), (u0, (i + 1) / N)]
            for l, q in zip(f.loops, uvs): l[uv].uv = q
    # hampe
    q0 = Vector((0, -0.72, 0.0))
    f = bm.faces.new([bm.verts.new(p) for p in (C[0] + Vector((-0.012, 0, 0)), C[0] + Vector((0.012, 0, 0)), q0)])
    for l in f.loops: l[uv].uv = (0.5, 0.0)
    finish(bm, 'feather', smooth=True)
    export('feather')


make_feather()


# ---------------------------------------------------------------- aiguilles rocheuses
def fbm(v, oct=4):
    return noise.fractal(v, 1.0, 2.0, oct, noise_basis='PERLIN_ORIGINAL')


def make_stack(idx, seed):
    new_scene()
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')
    rings, segs = 46, 30
    grid = []
    raw = []
    for j in range(rings):
        t = j / (rings - 1)
        band = math.floor(t * 15 + seed)
        ledge = 0.075 * noise.noise(Vector((band * 7.31, seed, 0.5))) + 0.03 * math.sin(t * 61 + seed)
        prof = 1.0 + 0.55 * (1 - t) ** 2.2 + 0.07 * math.sin(t * 7 + seed) - 0.1 * math.exp(-((t - 0.55) / 0.13) ** 2)
        lean = Vector((fbm(Vector((t * 1.6, seed, 3.1)), 2), fbm(Vector((seed, t * 1.6, 7.7)), 2), 0)) * 0.16 * (1 - t) ** 0.7
        row = []
        for k in range(segs):
            a = k / segs * math.tau
            ca, sa = math.cos(a), math.sin(a)
            r = prof * (1 + ledge)
            r *= 1 + 0.27 * fbm(Vector((ca * 1.1 + seed, sa * 1.1, t * 1.3)), 3) + 0.1 * math.cos(2 * a + seed)
            r *= 1 + 0.07 * fbm(Vector((ca * 3.6, sa * 3.6 + seed, t * 6.5)), 3)
            crev = noise.noise(Vector((ca * 2.7 + seed * 2, sa * 2.7, t * 0.6)))
            r *= 1 - 0.16 * max(0.0, crev) ** 1.5
            row.append((r, a, lean))
        raw.append(row)
    # normalise : rayon max = 1 dans la zone haute (altitude de vol), pour coller à la collision
    top_max = max(r for row in raw[int(rings * 0.84):] for (r, a, l) in row)
    for j, row in enumerate(raw):
        t = j / (rings - 1)
        vr = []
        for (r, a, lean) in row:
            r /= top_max
            vr.append(bm.verts.new(Vector((math.cos(a) * r + lean.x, math.sin(a) * r + lean.y, t))))
        grid.append(vr)
    # calotte irrégulière
    for (rs, dz) in ((0.86, 0.012), (0.6, 0.03), (0.3, 0.042)):
        vr = []
        for k in range(segs):
            base = grid[rings - 1][k].co
            bump = 0.012 * fbm(Vector((base.x * 3 + seed, base.y * 3, 1.0)), 2)
            vr.append(bm.verts.new(Vector((base.x * rs, base.y * rs, 1.0 + dz + bump))))
        grid.append(vr)
    apex = bm.verts.new(Vector((0, 0, 1.05)))
    total = len(grid)
    for j in range(total - 1):
        for k in range(segs):
            k2 = (k + 1) % segs
            f = bm.faces.new([grid[j][k], grid[j][k2], grid[j + 1][k2], grid[j + 1][k]])
            for l, (kk, jj) in zip(f.loops, ((k, j), (k + 1, j), (k + 1, j + 1), (k, j + 1))):
                if jj >= rings - 1 and j >= rings - 1:  # calotte : projection plane, sans étirement radial
                    co = grid[jj][kk % segs].co
                    l[uv].uv = (co.x * 0.42 + seed, co.y * 0.42)
                else:
                    l[uv].uv = (kk / segs * 3.0, jj / (rings - 1) * 3.2)
    for k in range(segs):
        k2 = (k + 1) % segs
        f = bm.faces.new([grid[-1][k], grid[-1][k2], apex])
        for l, vtx in zip(f.loops, (grid[-1][k], grid[-1][k2], apex)):
            l[uv].uv = (vtx.co.x * 0.42 + seed, vtx.co.y * 0.42)
    bmesh.ops.triangulate(bm, faces=bm.faces)
    finish(bm, f'stack{idx}', smooth=True)
    export(f'stack{idx}')


for i, sd in enumerate((1.7, 5.3, 9.9)):
    make_stack(i, sd)
