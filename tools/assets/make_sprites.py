"""Rend les sprites 2D du jeu à partir des modèles 3D (Blender Cycles), vus de dessus.

Sorties (PNG, fond transparent) dans <sortie>/ :
  bird_0..7.png    étourneau, cycle de battement d'ailes (nuances de gris : teinté par le jeu)
  falcon_0..3.png  faucon
  feather.png      plume dorée
  pine0.png, pine1.png   conifères avec ombre portée
  stack0..2.png    aiguilles rocheuses (nuances de gris : teintées par chapitre)

Usage : python make_sprites.py -- <dossier_modeles> <sortie>
"""
import bpy, sys, math, os
from mathutils import Vector

models, out = sys.argv[sys.argv.index('--') + 1:][:2]
os.makedirs(out, exist_ok=True)


def scene(res, samples=48):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'; sc.cycles.samples = samples; sc.cycles.use_denoising = True
    sc.render.film_transparent = True
    sc.render.resolution_x = sc.render.resolution_y = res
    sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGBA'
    sc.view_settings.view_transform = 'Standard'
    w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
    w.node_tree.nodes['Background'].inputs[0].default_value = (1, 1, 1, 1)
    w.node_tree.nodes['Background'].inputs[1].default_value = 0.75
    return sc


def sun(sc, elev, azim, energy=2.6):
    l = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN'))
    l.data.energy = energy; l.data.angle = math.radians(6)
    l.rotation_euler = (math.radians(90 - elev), 0, math.radians(azim))
    sc.collection.objects.link(l)


def top_camera(sc, scale, cx=0.0, cy=0.0):
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    cam.data.type = 'ORTHO'; cam.data.ortho_scale = scale
    cam.location = (cx, cy, 50); cam.rotation_euler = (0, 0, 0); cam.data.clip_end = 200
    sc.collection.objects.link(cam); sc.camera = cam


def load(name):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(models, name + '.glb'))
    return [o for o in set(bpy.data.objects) - before if o.type == 'MESH'][0]


def material(ob, vertex_color=True, base=(0.8, 0.8, 0.8), rough=0.85, metal=0.0):
    m = bpy.data.materials.new('m'); m.use_nodes = True
    bsdf = m.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Roughness'].default_value = rough; bsdf.inputs['Metallic'].default_value = metal
    if vertex_color and ob.data.color_attributes:
        vc = m.node_tree.nodes.new('ShaderNodeVertexColor')
        m.node_tree.links.new(vc.outputs['Color'], bsdf.inputs['Base Color'])
    else:
        bsdf.inputs['Base Color'].default_value = (*base, 1)
    ob.data.materials.clear(); ob.data.materials.append(m)
    return m


def render(sc, name):
    sc.render.filepath = os.path.join(out, name + '.png')
    bpy.ops.render.render(write_still=True)
    print('SPRITE', name, flush=True)


# ---------------------------------------------------------------- oiseaux : cycle de battement
def flap_frames(model, prefix, n, amp, res, scale):
    sc = scene(res)
    ob = load(model)
    ob.rotation_mode = 'XYZ'; ob.rotation_euler = (0, 0, math.pi)  # avant du modèle vers le haut de l'image
    material(ob)
    sun(sc, 58, -35)
    top_camera(sc, scale)
    me = ob.data
    base = [v.co.copy() for v in me.vertices]
    wgt = [0.0] * len(me.vertices)
    uv = me.uv_layers.active.data
    for loop in me.loops: wgt[loop.vertex_index] = max(wgt[loop.vertex_index], uv[loop.index].uv.x)
    for f in range(n):
        ph = f / n * math.tau
        for i, v in enumerate(me.vertices):
            p, w = base[i], wgt[i]
            side = -1.0 if p.x < 0 else 1.0
            ang = (math.sin(ph - w * 1.3) * amp + 0.16) * w
            c, s = math.cos(ang), math.sin(ang)
            qx, qy = abs(p.x) - 0.1, p.z - 0.045
            qx, qy = qx * c - qy * s, qx * s + qy * c
            v.co = Vector((side * (qx + 0.1), p.y, qy + 0.045 + math.sin(ph + 1.2) * 0.04))
        me.update()
        render(sc, f'{prefix}_{f}')


flap_frames('bird', 'bird', 8, 0.85, 96, 2.9)
flap_frames('falcon', 'falcon', 4, 0.4, 160, 3.5)

# ---------------------------------------------------------------- plume dorée
sc = scene(96)
ob = load('feather'); material(ob, False, (1.0, 0.72, 0.25), 0.3, 0.9)
ob.rotation_euler = (math.radians(15), math.radians(-20), math.radians(-35))
sun(sc, 55, -40, 4.0); top_camera(sc, 1.25)
render(sc, 'feather')

# ---------------------------------------------------------------- conifères (vue plongeante) et leur ombre, séparés
def tilted_camera(sc, scale, tilt_deg, target):
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    cam.data.type = 'ORTHO'; cam.data.ortho_scale = scale; cam.data.clip_end = 200
    t = math.radians(tilt_deg)
    cam.location = Vector(target) + Vector((0, -math.sin(t), math.cos(t))) * 50
    cam.rotation_euler = (t, 0, 0)
    sc.collection.objects.link(cam); sc.camera = cam


for i in range(2):
    for shadow in (False, True):
        sc = scene(128)
        ob = load(f'pine{i}'); material(ob)
        if shadow:
            ob.visible_camera = False
            bpy.ops.mesh.primitive_plane_add(size=10); bpy.context.object.is_shadow_catcher = True
        sun(sc, 50, -42, 5.5)
        tilted_camera(sc, 1.9, 32, (0.25 if shadow else 0, -0.2 if shadow else 0, 0.45))
        render(sc, f'pine{i}' + ('_shadow' if shadow else ''))

# ---------------------------------------------------------------- aiguilles rocheuses vues de dessus
for i in range(3):
    sc = scene(256, 64)
    ob = load(f'stack{i}')
    ob.scale = (1, 1, 5.5)  # hauteur réelle : la base évasée déborde autour du sommet
    ob.location = (0, 0, -5.5 * 0.9)
    m = material(ob, False)
    # plus sombre en profondeur : lecture immédiate du relief
    nt = m.node_tree; geo = nt.nodes.new('ShaderNodeNewGeometry'); sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    mr = nt.nodes.new('ShaderNodeMapRange'); mr.inputs['From Min'].default_value = -4.6; mr.inputs['From Max'].default_value = 0.4
    mr.inputs['To Min'].default_value = 0.05; mr.inputs['To Max'].default_value = 0.42
    comb = nt.nodes.new('ShaderNodeCombineColor')
    nt.links.new(geo.outputs['Position'], sep.inputs[0]); nt.links.new(sep.outputs['Z'], mr.inputs['Value'])
    for ch in ('Red', 'Green', 'Blue'): nt.links.new(mr.outputs['Result'], comb.inputs[ch])
    nt.links.new(comb.outputs['Color'], nt.nodes['Principled BSDF'].inputs['Base Color'])
    sun(sc, 48, -40, 2.6); top_camera(sc, 3.7)
    render(sc, f'stack{i}')
