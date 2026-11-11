"""Rend un atlas de nuages volumétriques avec Blender Cycles (sprites RGBA).
Usage : python make_clouds.py -- <dossier_sortie> [taille] [échantillons]
"""
import bpy, sys, math, os
args = sys.argv[sys.argv.index('--') + 1:]
out = args[0]; size = int(args[1]) if len(args) > 1 else 512; spp = int(args[2]) if len(args) > 2 else 64
N = 4

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.render.engine = 'CYCLES'
sc.cycles.samples = spp
sc.cycles.use_denoising = True
sc.cycles.volume_bounces = 6
sc.cycles.max_bounces = 8
sc.render.film_transparent = True
sc.render.resolution_x = sc.render.resolution_y = size
sc.render.image_settings.file_format = 'PNG'
sc.render.image_settings.color_mode = 'RGBA'
sc.view_settings.view_transform = 'AgX'
sc.render.threads_mode = 'AUTO'

world = bpy.data.worlds.new('w'); sc.world = world; world.use_nodes = True
bg = world.node_tree.nodes['Background']
bg.inputs[0].default_value = (0.62, 0.72, 0.9, 1); bg.inputs[1].default_value = 0.55

sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN'))
sun.data.energy = 3.4; sun.data.angle = math.radians(4)
sun.rotation_euler = (math.radians(52), 0, math.radians(-38))
sc.collection.objects.link(sun)

cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
cam.data.type = 'ORTHO'; cam.data.ortho_scale = 3.3
cam.location = (0, -8, 0); cam.rotation_euler = (math.radians(90), 0, 0)
sc.collection.objects.link(cam); sc.camera = cam

bpy.ops.mesh.primitive_cube_add(size=4)
cube = bpy.context.object
mat = bpy.data.materials.new('cloud'); mat.use_nodes = True
nt = mat.node_tree; nt.nodes.clear()
outn = nt.nodes.new('ShaderNodeOutputMaterial')
vol = nt.nodes.new('ShaderNodeVolumePrincipled')
vol.inputs['Color'].default_value = (1, 1, 1, 1)
vol.inputs['Anisotropy'].default_value = 0.55
coord = nt.nodes.new('ShaderNodeTexCoord')
noise = nt.nodes.new('ShaderNodeTexNoise'); noise.noise_dimensions = '4D'
noise.inputs['Scale'].default_value = 1.7; noise.inputs['Detail'].default_value = 9
noise.inputs['Roughness'].default_value = 0.6; noise.inputs['Distortion'].default_value = 0.35
big = nt.nodes.new('ShaderNodeTexNoise'); big.noise_dimensions = '4D'
big.inputs['Scale'].default_value = 0.6; big.inputs['Detail'].default_value = 2
# enveloppe : ellipsoïde aplati, plus dense en bas (base plate des cumulus)
sep = nt.nodes.new('ShaderNodeSeparateXYZ')
def math_node(op, a=None, b=None):
    n = nt.nodes.new('ShaderNodeMath'); n.operation = op
    if isinstance(a, (int, float)): n.inputs[0].default_value = a
    if isinstance(b, (int, float)): n.inputs[1].default_value = b
    return n
mapn = nt.nodes.new('ShaderNodeMapping'); mapn.inputs['Scale'].default_value = (0.44, 0.7, 0.8)
length = nt.nodes.new('ShaderNodeVectorMath'); length.operation = 'LENGTH'
fall = nt.nodes.new('ShaderNodeMapRange'); fall.inputs['From Min'].default_value = 0.0; fall.inputs['From Max'].default_value = 1.0
fall.inputs['To Min'].default_value = 1.0; fall.inputs['To Max'].default_value = 0.0
# densité = enveloppe + bruit qui sculpte les volutes ; base aplatie comme un cumulus
n1 = math_node('SUBTRACT', None, 0.5); n1m = math_node('MULTIPLY', None, 2.1)
n2 = math_node('SUBTRACT', None, 0.5); n2m = math_node('MULTIPLY', None, 1.3)
addn = math_node('ADD'); addf = math_node('ADD'); sub = math_node('SUBTRACT', None, 0.58)
base = nt.nodes.new('ShaderNodeMapRange'); base.inputs['From Min'].default_value = -0.75; base.inputs['From Max'].default_value = -0.45
base.inputs['To Min'].default_value = 0.0; base.inputs['To Max'].default_value = 1.0
mulb = math_node('MULTIPLY'); clampn = math_node('MAXIMUM', None, 0.0); dens = math_node('MULTIPLY', None, 38.0)
L = nt.links.new
L(coord.outputs['Object'], noise.inputs['Vector']); L(coord.outputs['Object'], big.inputs['Vector'])
L(coord.outputs['Object'], mapn.inputs['Vector']); L(mapn.outputs['Vector'], length.inputs[0])
L(coord.outputs['Object'], sep.inputs[0]); L(sep.outputs['Z'], base.inputs['Value'])
L(length.outputs['Value'], fall.inputs['Value'])
L(noise.outputs['Fac'], n1.inputs[0]); L(n1.outputs[0], n1m.inputs[0])
L(big.outputs['Fac'], n2.inputs[0]); L(n2.outputs[0], n2m.inputs[0])
L(n1m.outputs[0], addn.inputs[0]); L(n2m.outputs[0], addn.inputs[1])
L(addn.outputs[0], addf.inputs[0]); L(fall.outputs['Result'], addf.inputs[1])
L(addf.outputs[0], sub.inputs[0]); L(sub.outputs[0], mulb.inputs[0]); L(base.outputs['Result'], mulb.inputs[1])
L(mulb.outputs[0], clampn.inputs[0]); L(clampn.outputs[0], dens.inputs[0])
nt.links.new(dens.outputs[0], vol.inputs['Density']); nt.links.new(vol.outputs['Volume'], outn.inputs['Volume'])
cube.data.materials.append(mat)

os.makedirs(out, exist_ok=True)
for i in range(N):
    noise.inputs['W'].default_value = 3.7 * i + 1.1
    big.inputs['W'].default_value = 5.3 * i + 0.4
    sc.render.filepath = os.path.join(out, f'cloud{i}.png')
    bpy.ops.render.render(write_still=True)
    print('RENDERED', i, flush=True)
