"""Rend la lune (sprite RGBA) avec Blender Cycles : mers sombres et cratères procéduraux.
Usage : python make_moon.py -- <fichier_sortie.png>
"""
import bpy, sys, math
out = sys.argv[sys.argv.index('--') + 1]
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.render.engine = 'CYCLES'; sc.cycles.samples = 48; sc.cycles.use_denoising = True
sc.render.film_transparent = True; sc.render.resolution_x = sc.render.resolution_y = 512
sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGBA'
sc.view_settings.view_transform = 'Standard'
w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
w.node_tree.nodes['Background'].inputs[1].default_value = 0.02
bpy.ops.mesh.primitive_uv_sphere_add(segments=96, ring_count=48, radius=1)
ob = bpy.context.object
for p in ob.data.polygons: p.use_smooth = True
m = bpy.data.materials.new('moon'); m.use_nodes = True; nt = m.node_tree
bsdf = nt.nodes['Principled BSDF']; bsdf.inputs['Roughness'].default_value = 0.95
tc = nt.nodes.new('ShaderNodeTexCoord')
maria = nt.nodes.new('ShaderNodeTexNoise'); maria.inputs['Scale'].default_value = 1.6; maria.inputs['Detail'].default_value = 5; maria.inputs['Roughness'].default_value = 0.55
ramp = nt.nodes.new('ShaderNodeValToRGB')
ramp.color_ramp.elements[0].position = 0.42; ramp.color_ramp.elements[0].color = (0.16, 0.17, 0.2, 1)
ramp.color_ramp.elements[1].position = 0.6; ramp.color_ramp.elements[1].color = (0.78, 0.78, 0.76, 1)
vor = nt.nodes.new('ShaderNodeTexVoronoi'); vor.inputs['Scale'].default_value = 9
vor2 = nt.nodes.new('ShaderNodeTexVoronoi'); vor2.inputs['Scale'].default_value = 26
crat = nt.nodes.new('ShaderNodeMath'); crat.operation = 'SMOOTH_MIN'; crat.inputs[2].default_value = 0.2
bump = nt.nodes.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = 0.55; bump.inputs['Distance'].default_value = 0.08
L = nt.links.new
L(tc.outputs['Object'], maria.inputs['Vector']); L(maria.outputs['Fac'], ramp.inputs['Fac']); L(ramp.outputs['Color'], bsdf.inputs['Base Color'])
L(tc.outputs['Object'], vor.inputs['Vector']); L(tc.outputs['Object'], vor2.inputs['Vector'])
L(vor.outputs['Distance'], crat.inputs[0]); L(vor2.outputs['Distance'], crat.inputs[1]); L(crat.outputs[0], bump.inputs['Height']); L(bump.outputs['Normal'], bsdf.inputs['Normal'])
ob.data.materials.append(m)
sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); sun.data.energy = 6
sun.rotation_euler = (math.radians(72), 0, math.radians(-28)); sc.collection.objects.link(sun)
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); cam.data.type = 'ORTHO'; cam.data.ortho_scale = 2.08
cam.location = (0, -6, 0); cam.rotation_euler = (math.radians(90), 0, 0); sc.collection.objects.link(cam); sc.camera = cam
sc.render.filepath = out
bpy.ops.render.render(write_still=True)
