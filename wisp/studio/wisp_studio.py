"""Photoreal Wisp renders with Blender Cycles.

Molded parts are modelled as signed distance fields and meshed with marching cubes (real
fillets, normals from the field). Thin parts are built as meshes. Run with Blender's Python
module (pip install bpy), for example:

    python wisp_studio.py --shot hero --out renders/hero.png --res 1920x1200 --samples 256
"""
import argparse
import math
import os
import sys
import time

import bpy
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from sdf import (box3, cyl, extrude, length2, mesh_sdf, polar_repeat, rotate2, round_box2,  # noqa: E402
                 smax, smin, torus, union)

MM = 0.001

# ---------------------------------------------------------------- drone layout (mm, Z up, front = -Y)
A = 39.0            # motor centres at (±A, ±A): 110 mm wheelbase
RB = 23.8           # duct bore radius (45 mm props)
RO = 27.2           # duct outer radius seen from above
ZT, ZB = 7.0, -7.0  # plate top and bottom
HUB_TOP = -4.6      # motors sit on the hubs
CAN = dict(bx=14.0, by=27.0, r=9.0, cy=-1.0)   # canopy footprint
MOTORS = [(sx * A, sy * A) for sx, sy in ((1, 1), (-1, 1), (-1, -1), (1, -1))]


def frame_sdf(x, y, z):
    ax, ay = np.abs(x), np.abs(y)
    dx, dy = ax - A, ay - A
    rho = length2(dx, dy)
    core = round_box2(x, y, 44.0, 44.0, 16.0)
    dish = np.minimum(length2(ax - 102.8, y), length2(x, ay - 102.8)) - 60.0
    core = smax(core, -dish, 4.0)
    d2 = smin(core, rho - RO, 7.0)
    plate = extrude(d2, z, ZB, ZT, 2.4)
    plate = smax(plate, -(rho - RB), 2.6)
    foot = round_box2(x, y - CAN['cy'], CAN['bx'] + 0.3, CAN['by'] + 0.3, CAN['r'] + 0.3)
    plate = smax(plate, -extrude(foot, z, ZT - 1.0, ZT + 5.0), 0.25)
    tray = extrude(round_box2(x, y, 16.6, 28.2, 7.2), z, ZB - 5.2, ZB + 2.0, 1.6)
    plate = smin(plate, tray, 3.0)
    plate = smax(plate, -extrude(round_box2(x, y, 15.1, 26.7, 6.0), z, ZB - 6.0, ZB + 0.6), 0.3)
    hub = cyl(dx, dy, z, 7.4, ZB, HUB_TOP, 0.7)
    struts = None
    for a in (-0.75 * np.pi, -0.75 * np.pi + 2 * np.pi / 3, -0.75 * np.pi - 2 * np.pi / 3):
        u, v = rotate2(dx, dy, a)
        s = box3(u - 15.5, v, z - (ZB + 1.3), 9.0, 1.35, 1.3, 0.5)
        struts = s if struts is None else np.minimum(struts, s)
    rings = np.minimum(extrude(np.abs(rho - 13.4) - 0.65, z, ZB, ZB + 1.25, 0.4),
                       extrude(np.abs(rho - 18.8) - 0.65, z, ZB, ZB + 1.25, 0.4))
    u, v = polar_repeat(dx, dy, 12, np.pi / 12)
    spokes = box3(u - 15.5, v, z - (ZB + 0.62), 8.6, 0.55, 0.62, 0.35)
    grille = np.maximum(union(hub, struts, rings, spokes), rho - RB - 0.8)
    return smin(plate, grille, 0.9)


CAN_TOP = 15.6


def canopy_top(x, yy):
    """Crowned top surface of the canopy: highest just behind the optics, falling to the sides and rear."""
    return CAN_TOP - 0.0095 * x * x - 0.0011 * (yy + 8.0) ** 2


def canopy_sdf(x, y, z):
    yy = y - CAN['cy']
    t = np.clip((z - ZT) / 9.0, 0.0, 1.0)
    taper = 1.6 * np.clip((yy + 6.0) / 33.0, 0.0, 1.0)
    d2 = round_box2(x, yy, CAN['bx'] - 1.2 * t - taper, CAN['by'] - 1.2 * t, CAN['r'] - 1.0 * t)
    walls = extrude(d2, z, ZT - 1.0, 30.0, 0.0)
    pod = smax(walls, z - canopy_top(x, yy), 3.4)
    pod = smax(pod, (ZT - 1.0) - z, 0.0)
    pod = smax(pod, -torus(x, yy - 7.0, z - canopy_top(0.0, 7.0), 5.0, 0.6), 0.2)
    for zc in (10.4, 12.4, 14.4):
        pod = smax(pod, -box3(x, yy - 27.0, z - zc, 8.0, 2.2, 0.42, 0.4), 0.2)
    shell = np.maximum(pod, -(pod + 1.2))
    # optics opening through the front wall, following the draft of the face
    oy, oz = rotate2(yy + (CAN['by'] - 1.2 * (12.2 - ZT) / 9.0), z - 12.2, math.radians(-7.6))
    return smax(shell, -box3(x, oy, oz, 12.25, 3.0, 3.85, 3.8), 0.15)


def guard_sdf(x, y, z):
    rho = length2(x, y)
    t = 1.15
    rim = extrude(np.abs(rho - 23.3) - 0.8, z, 0.0, t, 0.45)
    rings = np.minimum(extrude(np.abs(rho - 9.0) - 0.5, z, 0.0, t, 0.3),
                       extrude(np.abs(rho - 15.6) - 0.5, z, 0.0, t, 0.3))
    cap = extrude(rho - 4.4, z, 0.0, t, 0.45)
    u, v = polar_repeat(x, y, 10, 0.0)
    spokes = box3(u - 14.0, v, z - t / 2, 9.8, 0.5, t / 2, 0.3)
    return smin(union(rim, rings, cap), spokes, 0.25)


def bell_sdf(x, y, z):
    cup = cyl(x, y, z, 7.0, 1.1, 5.4, 0.7)
    cup = smax(cup, -cyl(x, y, z, 6.25, -1.0, 4.6, 0.3), 0.2)
    u, v = polar_repeat(x, y, 6, np.pi / 6)
    cup = smax(cup, -box3(u - 4.25, v, z - 5.0, 1.6, 1.2, 1.0, 0.6), 0.2)
    rho = length2(x, y)
    return smax(cup, 1.0 - rho, 0.1)


def stator_sdf(x, y, z):
    rho = length2(x, y)
    core = cyl(x, y, z, 5.9, 1.3, 4.5, 0.4)
    u, v = polar_repeat(x, y, 12, 0.0)
    coils = box3(u - 4.5, v, z - 2.9, 1.35, 0.95, 1.5, 0.6)
    return smin(np.maximum(core, -(rho - 2.2)), coils, 0.3)


def prop_hub_sdf(x, y, z):
    hub = cyl(x, y, z, 3.9, 0.0, 3.2, 0.7)
    hub = smax(hub, -cyl(x, y, z, 1.5, 2.6, 4.0, 0.2), 0.2)
    return hub


def battery_sdf(x, y, z):
    return extrude(round_box2(x, y, 15.0, 26.6, 5.9), z, ZB - 5.2, ZB - 0.2, 1.0)


def window_sdf(x, y, z):
    return box3(x, y, z, 12.05, 0.6, 3.75, 3.7)


def bezel_sdf(x, y, z):
    plate = box3(x, y, z, 11.9, 0.35, 3.6, 3.5)
    for cx, r in ((-7.2, 3.25), (7.2, 3.25), (0.0, 2.35)):
        plate = smax(plate, -(length2(x - cx, z) - r), 0.15)
    return plate


def reflector_sdf(x, y, z):
    # parabolic cup opening toward -Y (rim at y = 0, vertex at y = +2.5), hole for the emitter
    rho = length2(x, z)
    f = 1.05
    inner = -y - (rho * rho / (4 * f) - 2.5)
    shell = np.maximum(np.abs(inner) * 0.7 - 0.18, rho - 3.2)
    shell = np.maximum(shell, 1.9 - rho)
    return np.maximum(shell, -y - 0.1)


def barrel_sdf(x, y, z):
    rho = length2(x, z)
    b = extrude(rho - 2.2, y, -2.0, 2.0, 0.35)
    return smax(b, -extrude(rho - 1.42, y, -3.0, -1.5), 0.12)


# ---------------------------------------------------------------- Blender helpers
def reset(res, samples):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = samples
    sc.cycles.use_adaptive_sampling = True
    sc.cycles.adaptive_threshold = 0.012
    sc.cycles.use_denoising = True
    sc.cycles.denoiser = 'OPENIMAGEDENOISE'
    sc.cycles.denoising_prefilter = 'ACCURATE'
    sc.cycles.max_bounces = 10
    sc.cycles.diffuse_bounces = 4
    sc.cycles.glossy_bounces = 6
    sc.cycles.transmission_bounces = 10
    sc.cycles.transparent_max_bounces = 10
    sc.cycles.caustics_reflective = False
    sc.cycles.caustics_refractive = False
    sc.cycles.blur_glossy = 0.6
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.resolution_percentage = 100
    sc.render.film_transparent = False
    sc.render.filter_size = 1.2
    sc.view_settings.view_transform = 'AgX'
    try:
        sc.view_settings.look = 'AgX - Medium High Contrast'
    except TypeError:
        pass
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_depth = '8'
    return sc


COLL = {'current': None}


def use_collection(name):
    c = bpy.data.collections.get(name)
    if c is None:
        c = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(c)
    COLL['current'] = c
    return c


def link(ob, coll=None):
    (coll or COLL['current'] or bpy.context.scene.collection).objects.link(ob)
    return ob


def mesh_from_arrays(name, verts_mm, faces, normals=None, smooth=True):
    me = bpy.data.meshes.new(name)
    v = np.ascontiguousarray((verts_mm * MM).astype(np.float32))
    me.vertices.add(len(v))
    me.vertices.foreach_set('co', v.ravel())
    nf = len(faces)
    me.loops.add(nf * 3)
    me.loops.foreach_set('vertex_index', np.ascontiguousarray(faces, dtype=np.int32).ravel())
    me.polygons.add(nf)
    me.polygons.foreach_set('loop_start', np.arange(0, nf * 3, 3, dtype=np.int32))
    me.update(calc_edges=True)
    if smooth:
        me.shade_smooth()
        if normals is not None:
            me.normals_split_custom_set_from_vertices(np.ascontiguousarray(normals, dtype=np.float32))
    return me


_mesh_cache = {}


def sdf_mesh(name, f, bounds, h):
    key = (name, h)
    if key not in _mesh_cache:
        t = time.time()
        v, fc, n = mesh_sdf(f, bounds, h)
        _mesh_cache[key] = mesh_from_arrays(name, v, fc, n)
        print(f'  mesh {name}: {len(fc):,} tris in {time.time() - t:.1f}s', flush=True)
    return _mesh_cache[key]


def obj(name, me, mat=None, loc=(0, 0, 0), rot=(0, 0, 0), parent=None):
    ob = bpy.data.objects.new(name, me)
    if mat is not None:
        if len(me.materials) == 0:
            me.materials.append(mat)
    ob.location = tuple(c * MM for c in loc)
    ob.rotation_euler = rot
    if parent is not None:
        ob.parent = parent
    link(ob)
    return ob


def empty(name, loc=(0, 0, 0), parent=None):
    ob = bpy.data.objects.new(name, None)
    ob.location = tuple(c * MM for c in loc)
    if parent is not None:
        ob.parent = parent
    link(ob)
    return ob


# ---------------------------------------------------------------- materials
def new_mat(name):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    return m, m.node_tree, m.node_tree.nodes['Principled BSDF']


def node(nt, kind, loc=(0, 0), **props):
    n = nt.nodes.new(kind)
    n.location = loc
    for k, v in props.items():
        setattr(n, k, v)
    return n


def set_in(n, **inputs):
    for k, v in inputs.items():
        n.inputs[k.replace('_', ' ')].default_value = v


def micro_bump(nt, bsdf, scale=3500.0, strength=0.035, rough_base=None, rough_var=0.0, rough_scale=260.0):
    tc = node(nt, 'ShaderNodeTexCoord', (-900, 0))
    nz = node(nt, 'ShaderNodeTexNoise', (-700, -200))
    nz.inputs['Scale'].default_value = scale
    nz.inputs['Detail'].default_value = 3.0
    nt.links.new(tc.outputs['Object'], nz.inputs['Vector'])
    bump = node(nt, 'ShaderNodeBump', (-450, -200))
    bump.inputs['Strength'].default_value = strength
    bump.inputs['Distance'].default_value = 0.00002
    nt.links.new(nz.outputs['Fac'], bump.inputs['Height'])
    nt.links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])
    if rough_base is not None and rough_var > 0:
        nr = node(nt, 'ShaderNodeTexNoise', (-700, 200))
        nr.inputs['Scale'].default_value = rough_scale
        nr.inputs['Detail'].default_value = 2.0
        nt.links.new(tc.outputs['Object'], nr.inputs['Vector'])
        mr = node(nt, 'ShaderNodeMapRange', (-450, 200))
        mr.inputs['To Min'].default_value = rough_base - rough_var
        mr.inputs['To Max'].default_value = rough_base + rough_var
        nt.links.new(nr.outputs['Fac'], mr.inputs['Value'])
        nt.links.new(mr.outputs['Result'], bsdf.inputs['Roughness'])
    return tc


def parting_line(nt, bsdf, tc, z_mm, color, width_mm=0.16):
    """A molded parting line: a hairline groove at height z_mm on walls that face sideways."""
    sep = node(nt, 'ShaderNodeSeparateXYZ', (-700, 500))
    nt.links.new(tc.outputs['Object'], sep.inputs['Vector'])
    off = node(nt, 'ShaderNodeMath', (-550, 500), operation='SUBTRACT')
    nt.links.new(sep.outputs['Z'], off.inputs[0])
    off.inputs[1].default_value = z_mm * MM
    ab = node(nt, 'ShaderNodeMath', (-420, 500), operation='ABSOLUTE')
    nt.links.new(off.outputs[0], ab.inputs[0])
    band = node(nt, 'ShaderNodeMapRange', (-290, 500))
    band.inputs['From Min'].default_value = width_mm * MM
    band.inputs['From Max'].default_value = width_mm * 0.4 * MM
    nt.links.new(ab.outputs[0], band.inputs['Value'])
    geo = node(nt, 'ShaderNodeNewGeometry', (-700, 700))
    sepn = node(nt, 'ShaderNodeSeparateXYZ', (-550, 700))
    nt.links.new(geo.outputs['Normal'], sepn.inputs['Vector'])
    nz = node(nt, 'ShaderNodeMath', (-420, 700), operation='ABSOLUTE')
    nt.links.new(sepn.outputs['Z'], nz.inputs[0])
    side = node(nt, 'ShaderNodeMapRange', (-290, 700))
    side.inputs['From Min'].default_value = 0.5
    side.inputs['From Max'].default_value = 0.2
    nt.links.new(nz.outputs[0], side.inputs['Value'])
    mask = node(nt, 'ShaderNodeMath', (-150, 600), operation='MULTIPLY')
    nt.links.new(band.outputs['Result'], mask.inputs[0])
    nt.links.new(side.outputs['Result'], mask.inputs[1])
    mix = node(nt, 'ShaderNodeMix', (0, 600))
    mix.data_type = 'RGBA'
    nt.links.new(mask.outputs[0], mix.inputs['Factor'])
    mix.inputs['A'].default_value = color
    mix.inputs['B'].default_value = (0.003, 0.003, 0.0035, 1)
    nt.links.new(mix.outputs['Result'], bsdf.inputs['Base Color'])
    return mask


def materials():
    M = {}
    m, nt, b = new_mat('Graphite satin')
    set_in(b, Base_Color=(0.026, 0.028, 0.031, 1), Roughness=0.34, Specular_IOR_Level=0.5)
    tc = micro_bump(nt, b, 3600, 0.025, rough_base=0.34, rough_var=0.04)
    parting_line(nt, b, tc, z_mm=-1.0, color=(0.026, 0.028, 0.031, 1))
    M['body'] = m

    m, nt, b = new_mat('Graphite gloss')
    set_in(b, Base_Color=(0.02, 0.022, 0.025, 1), Roughness=0.3, Coat_Weight=0.2, Coat_Roughness=0.15)
    micro_bump(nt, b, 3600, 0.02)
    M['guard'] = m

    m, nt, b = new_mat('Gunmetal anodized')
    set_in(b, Base_Color=(0.16, 0.165, 0.175, 1), Metallic=1.0, Roughness=0.26, Anisotropic=0.6)
    tc = node(nt, 'ShaderNodeTexCoord', (-900, 0))
    tang = node(nt, 'ShaderNodeTangent', (-500, -400))
    tang.direction_type = 'RADIAL'
    tang.axis = 'Z'
    nt.links.new(tang.outputs['Tangent'], b.inputs['Tangent'])
    # lathe rings: concentric machining marks
    sep = node(nt, 'ShaderNodeSeparateXYZ', (-700, -150))
    nt.links.new(tc.outputs['Object'], sep.inputs['Vector'])
    mx = node(nt, 'ShaderNodeMath', (-550, -150), operation='MULTIPLY')
    my = node(nt, 'ShaderNodeMath', (-550, -250), operation='MULTIPLY')
    nt.links.new(sep.outputs['X'], mx.inputs[0]); nt.links.new(sep.outputs['X'], mx.inputs[1])
    nt.links.new(sep.outputs['Y'], my.inputs[0]); nt.links.new(sep.outputs['Y'], my.inputs[1])
    add = node(nt, 'ShaderNodeMath', (-400, -200), operation='ADD')
    nt.links.new(mx.outputs[0], add.inputs[0]); nt.links.new(my.outputs[0], add.inputs[1])
    sq = node(nt, 'ShaderNodeMath', (-300, -200), operation='SQRT')
    nt.links.new(add.outputs[0], sq.inputs[0])
    wave = node(nt, 'ShaderNodeMath', (-200, -200), operation='MULTIPLY')
    wave.inputs[1].default_value = 2 * math.pi / 0.00006
    nt.links.new(sq.outputs[0], wave.inputs[0])
    sn = node(nt, 'ShaderNodeMath', (-100, -200), operation='SINE')
    nt.links.new(wave.outputs[0], sn.inputs[0])
    bump = node(nt, 'ShaderNodeBump', (50, -250))
    bump.inputs['Strength'].default_value = 0.05
    bump.inputs['Distance'].default_value = 0.000005
    nt.links.new(sn.outputs[0], bump.inputs['Height'])
    nt.links.new(bump.outputs['Normal'], b.inputs['Normal'])
    M['bell'] = m

    m, nt, b = new_mat('Copper winding')
    set_in(b, Base_Color=(0.93, 0.56, 0.38, 1), Metallic=1.0, Roughness=0.32)
    micro_bump(nt, b, 9000, 0.12)
    M['copper'] = m

    m, nt, b = new_mat('Black anodized')
    set_in(b, Base_Color=(0.03, 0.03, 0.032, 1), Metallic=1.0, Roughness=0.35)
    micro_bump(nt, b, 5000, 0.03)
    M['black_metal'] = m

    m, nt, b = new_mat('Steel')
    set_in(b, Base_Color=(0.62, 0.62, 0.63, 1), Metallic=1.0, Roughness=0.18)
    M['steel'] = m

    m, nt, b = new_mat('Smoke polycarbonate')
    set_in(b, Base_Color=(0.2, 0.24, 0.28, 1), Roughness=0.14, Transmission_Weight=0.72, IOR=1.58)
    micro_bump(nt, b, 2400, 0.02)
    M['prop'] = m

    m, nt, b = new_mat('Sapphire window')
    set_in(b, Base_Color=(0.2, 0.21, 0.23, 1), Roughness=0.0, Transmission_Weight=1.0, IOR=1.77)
    M['glass'] = m

    m, nt, b = new_mat('Lens coating')
    set_in(b, Base_Color=(0.02, 0.02, 0.025, 1), Roughness=0.02, IOR=1.6,
           Thin_Film_Thickness=380.0, Thin_Film_IOR=1.38, Coat_Weight=1.0, Coat_Roughness=0.0)
    M['lens'] = m

    m, nt, b = new_mat('Chrome')
    set_in(b, Base_Color=(0.92, 0.92, 0.93, 1), Metallic=1.0, Roughness=0.05)
    M['chrome'] = m

    m, nt, b = new_mat('Matte black')
    set_in(b, Base_Color=(0.012, 0.012, 0.013, 1), Roughness=0.62)
    micro_bump(nt, b, 4000, 0.04)
    M['matte_black'] = m

    m, nt, b = new_mat('LED phosphor')
    set_in(b, Base_Color=(0.95, 0.78, 0.2, 1), Roughness=0.35, Subsurface_Weight=0.2,
           Emission_Color=(1.0, 0.96, 0.9, 1), Emission_Strength=0.0)
    M['phosphor'] = m

    m, nt, b = new_mat('Ceramic')
    set_in(b, Base_Color=(0.85, 0.85, 0.83, 1), Roughness=0.4)
    M['ceramic'] = m

    m, nt, b = new_mat('Light pipe')
    set_in(b, Base_Color=(0.85, 0.9, 0.95, 1), Roughness=0.3, Transmission_Weight=0.4,
           Emission_Color=(0.62, 0.84, 1.0, 1), Emission_Strength=0.0)
    M['lightpipe'] = m

    m, nt, b = new_mat('Soft touch')
    set_in(b, Base_Color=(0.016, 0.017, 0.019, 1), Roughness=0.62, Sheen_Weight=0.3, Sheen_Roughness=0.5)
    micro_bump(nt, b, 5000, 0.03)
    M['battery'] = m

    m, nt, b = new_mat('Gold')
    set_in(b, Base_Color=(1.0, 0.77, 0.34, 1), Metallic=1.0, Roughness=0.2)
    M['gold'] = m

    m, nt, b = new_mat('Nickel')
    set_in(b, Base_Color=(0.66, 0.64, 0.6, 1), Metallic=1.0, Roughness=0.22)
    M['nickel'] = m

    m, nt, b = new_mat('Rubber')
    set_in(b, Base_Color=(0.02, 0.02, 0.02, 1), Roughness=0.75)
    M['rubber'] = m

    m, nt, b = new_mat('Print')
    set_in(b, Base_Color=(0.32, 0.33, 0.34, 1), Roughness=0.5)
    M['print'] = m

    M['linen'] = mat_linen()
    M['webbing'] = mat_webbing()
    M['carbon'] = mat_carbon()
    return M


def _tex_coord(nt):
    return node(nt, 'ShaderNodeTexCoord', (-1100, 0))


def mat_linen():
    m, nt, b = new_mat('Linen')
    set_in(b, Base_Color=(0.3, 0.285, 0.26, 1), Roughness=0.86, Sheen_Weight=0.35, Sheen_Roughness=0.35,
           Specular_IOR_Level=0.3)
    tc = _tex_coord(nt)
    mp = node(nt, 'ShaderNodeMapping', (-900, 0))
    mp.inputs['Scale'].default_value = (1 / 0.00055, 1 / 0.00055, 1 / 0.00055)
    nt.links.new(tc.outputs['Object'], mp.inputs['Vector'])
    w1 = node(nt, 'ShaderNodeTexWave', (-700, 150), wave_type='BANDS', bands_direction='X')
    w2 = node(nt, 'ShaderNodeTexWave', (-700, -50), wave_type='BANDS', bands_direction='Z')
    for w in (w1, w2):
        w.inputs['Scale'].default_value = 1.0
        w.inputs['Distortion'].default_value = 1.5
        w.inputs['Detail'].default_value = 1.0
        nt.links.new(mp.outputs['Vector'], w.inputs['Vector'])
    mul = node(nt, 'ShaderNodeMath', (-500, 50), operation='MULTIPLY')
    nt.links.new(w1.outputs['Fac'], mul.inputs[0])
    nt.links.new(w2.outputs['Fac'], mul.inputs[1])
    nz = node(nt, 'ShaderNodeTexNoise', (-700, -250))
    nz.inputs['Scale'].default_value = 60.0
    nz.inputs['Detail'].default_value = 6.0
    nt.links.new(tc.outputs['Object'], nz.inputs['Vector'])
    bump = node(nt, 'ShaderNodeBump', (-300, -100))
    bump.inputs['Strength'].default_value = 0.35
    bump.inputs['Distance'].default_value = 0.0002
    nt.links.new(mul.outputs[0], bump.inputs['Height'])
    nt.links.new(bump.outputs['Normal'], b.inputs['Normal'])
    cr = node(nt, 'ShaderNodeMapRange', (-450, 300))
    cr.inputs['To Min'].default_value = 0.85
    cr.inputs['To Max'].default_value = 1.08
    nt.links.new(nz.outputs['Fac'], cr.inputs['Value'])
    tint = node(nt, 'ShaderNodeMix', (-250, 300))
    tint.data_type = 'RGBA'
    tint.blend_type = 'MULTIPLY'
    tint.inputs['Factor'].default_value = 1.0
    tint.inputs['A'].default_value = (0.3, 0.285, 0.26, 1)
    nt.links.new(cr.outputs['Result'], tint.inputs['B'])
    nt.links.new(tint.outputs['Result'], b.inputs['Base Color'])
    # seams: centre front/back and princess seams, as fine grooves
    sep = node(nt, 'ShaderNodeSeparateXYZ', (-900, -450))
    nt.links.new(tc.outputs['Object'], sep.inputs['Vector'])
    ax = node(nt, 'ShaderNodeMath', (-760, -450), operation='ABSOLUTE')
    nt.links.new(sep.outputs['X'], ax.inputs[0])
    seams = None
    for xs in (0.0, 0.092):
        d = node(nt, 'ShaderNodeMath', (-620, -450), operation='SUBTRACT')
        nt.links.new(ax.outputs[0], d.inputs[0])
        d.inputs[1].default_value = xs
        ad = node(nt, 'ShaderNodeMath', (-500, -450), operation='ABSOLUTE')
        nt.links.new(d.outputs[0], ad.inputs[0])
        g = node(nt, 'ShaderNodeMapRange', (-380, -450))
        g.inputs['From Min'].default_value = 0.0009
        g.inputs['From Max'].default_value = 0.0
        nt.links.new(ad.outputs[0], g.inputs['Value'])
        if seams is None:
            seams = g
        else:
            mx = node(nt, 'ShaderNodeMath', (-250, -450), operation='MAXIMUM')
            nt.links.new(seams.outputs[0], mx.inputs[0])
            nt.links.new(g.outputs[0], mx.inputs[1])
            seams = mx
    hsum = node(nt, 'ShaderNodeMath', (-400, -250), operation='MULTIPLY_ADD')
    nt.links.new(seams.outputs[0], hsum.inputs[0])
    hsum.inputs[1].default_value = -2.5
    nt.links.new(mul.outputs[0], hsum.inputs[2])
    nt.links.new(hsum.outputs[0], bump.inputs['Height'])
    return m


def mat_webbing():
    """Nylon webbing: ribs along the strap, a fine cross weave and lighter edge stitching (UVs in mm)."""
    m, nt, b = new_mat('Webbing')
    set_in(b, Base_Color=(0.008, 0.008, 0.009, 1), Roughness=0.55, Sheen_Weight=0.16, Sheen_Roughness=0.4)
    uv = node(nt, 'ShaderNodeUVMap', (-1100, 0))
    sep = node(nt, 'ShaderNodeSeparateXYZ', (-950, 0))
    nt.links.new(uv.outputs['UV'], sep.inputs['Vector'])
    ribs = node(nt, 'ShaderNodeMath', (-800, 150), operation='MULTIPLY')
    ribs.inputs[1].default_value = 2 * math.pi / 1.1
    nt.links.new(sep.outputs['X'], ribs.inputs[0])
    rs = node(nt, 'ShaderNodeMath', (-680, 150), operation='SINE')
    nt.links.new(ribs.outputs[0], rs.inputs[0])
    cross = node(nt, 'ShaderNodeMath', (-800, 0), operation='MULTIPLY')
    cross.inputs[1].default_value = 2 * math.pi / 0.45
    nt.links.new(sep.outputs['Y'], cross.inputs[0])
    cs = node(nt, 'ShaderNodeMath', (-680, 0), operation='SINE')
    nt.links.new(cross.outputs[0], cs.inputs[0])
    csc = node(nt, 'ShaderNodeMath', (-560, 0), operation='MULTIPLY')
    csc.inputs[1].default_value = 0.35
    nt.links.new(cs.outputs[0], csc.inputs[0])
    h = node(nt, 'ShaderNodeMath', (-450, 80), operation='ADD')
    nt.links.new(rs.outputs[0], h.inputs[0])
    nt.links.new(csc.outputs[0], h.inputs[1])
    # stitching: dashes 2.2 mm in from each edge
    au = node(nt, 'ShaderNodeMath', (-800, -200), operation='ABSOLUTE')
    nt.links.new(sep.outputs['X'], au.inputs[0])
    edge = node(nt, 'ShaderNodeValue', (-950, -300))
    edge.name = 'edge'
    edge.outputs[0].default_value = 16.8
    du = node(nt, 'ShaderNodeMath', (-680, -200), operation='SUBTRACT')
    nt.links.new(au.outputs[0], du.inputs[0])
    nt.links.new(edge.outputs[0], du.inputs[1])
    adu = node(nt, 'ShaderNodeMath', (-560, -200), operation='ABSOLUTE')
    nt.links.new(du.outputs[0], adu.inputs[0])
    line = node(nt, 'ShaderNodeMath', (-440, -200), operation='LESS_THAN')
    line.inputs[1].default_value = 0.32
    nt.links.new(adu.outputs[0], line.inputs[0])
    dash = node(nt, 'ShaderNodeMath', (-680, -350), operation='WRAP')
    dash.inputs[1].default_value = 3.2
    dash.inputs[2].default_value = 0.0
    nt.links.new(sep.outputs['Y'], dash.inputs[0])
    on = node(nt, 'ShaderNodeMath', (-560, -350), operation='LESS_THAN')
    on.inputs[1].default_value = 2.4
    nt.links.new(dash.outputs[0], on.inputs[0])
    st = node(nt, 'ShaderNodeMath', (-320, -260), operation='MULTIPLY')
    nt.links.new(line.outputs[0], st.inputs[0])
    nt.links.new(on.outputs[0], st.inputs[1])
    hs = node(nt, 'ShaderNodeMath', (-250, 0), operation='MULTIPLY_ADD')
    nt.links.new(st.outputs[0], hs.inputs[0])
    hs.inputs[1].default_value = 1.6
    nt.links.new(h.outputs[0], hs.inputs[2])
    bump = node(nt, 'ShaderNodeBump', (-100, 0))
    bump.inputs['Strength'].default_value = 0.5
    bump.inputs['Distance'].default_value = 0.00012
    nt.links.new(hs.outputs[0], bump.inputs['Height'])
    nt.links.new(bump.outputs['Normal'], b.inputs['Normal'])
    col = node(nt, 'ShaderNodeMix', (-100, 250))
    col.data_type = 'RGBA'
    nt.links.new(st.outputs[0], col.inputs['Factor'])
    col.inputs['A'].default_value = (0.008, 0.008, 0.009, 1)
    col.inputs['B'].default_value = (0.04, 0.042, 0.045, 1)
    nt.links.new(col.outputs['Result'], b.inputs['Base Color'])
    return m


def mat_carbon():
    """Twill carbon under a clear coat: alternating tows change the direction of the sheen."""
    m, nt, b = new_mat('Carbon')
    set_in(b, Base_Color=(0.012, 0.012, 0.013, 1), Metallic=0.0, Roughness=0.32, Anisotropic=0.8,
           Coat_Weight=1.0, Coat_Roughness=0.04, Coat_IOR=1.5)
    tc = _tex_coord(nt)
    mp = node(nt, 'ShaderNodeMapping', (-900, 0))
    mp.inputs['Rotation'].default_value = (0, 0, math.radians(45))
    mp.inputs['Scale'].default_value = (1 / 0.0022, 1 / 0.0022, 1 / 0.0022)
    nt.links.new(tc.outputs['Object'], mp.inputs['Vector'])
    ck = node(nt, 'ShaderNodeTexChecker', (-700, 0))
    ck.inputs['Scale'].default_value = 1.0
    ck.inputs['Color1'].default_value = (1, 1, 1, 1)
    ck.inputs['Color2'].default_value = (0, 0, 0, 1)
    nt.links.new(mp.outputs['Vector'], ck.inputs['Vector'])
    rot = node(nt, 'ShaderNodeMath', (-500, 0), operation='MULTIPLY')
    rot.inputs[1].default_value = 0.25
    nt.links.new(ck.outputs['Fac'], rot.inputs[0])
    nt.links.new(rot.outputs[0], b.inputs['Anisotropic Rotation'])
    mr = node(nt, 'ShaderNodeMapRange', (-500, 200))
    mr.inputs['To Min'].default_value = 0.26
    mr.inputs['To Max'].default_value = 0.38
    nt.links.new(ck.outputs['Fac'], mr.inputs['Value'])
    nt.links.new(mr.outputs['Result'], b.inputs['Roughness'])
    return m


# ---------------------------------------------------------------- thin parts
def prop_blades_mesh(name, ccw=True, n=5):
    r0, r1 = 3.75, 22.3
    ns, nc = 22, 16
    verts, faces = [], []
    sign = 1.0 if ccw else -1.0
    for bl in range(n):
        a = 2 * math.pi * bl / n
        ux, uy = math.cos(a), math.sin(a)
        wx, wy = -uy * sign, ux * sign
        start = len(verts)
        for i in range(ns + 1):
            s = i / ns
            r = r0 + (r1 - r0) * s
            chord = (6.2 + 3.2 * math.sin(math.pi * min(1.0, s * 1.4)) * (1 - s) + 1.2 * (1 - s)) * math.sqrt(max(1 - s ** 8, 0.02))
            pitch = math.radians(31 - 17 * s)
            thick = 0.95 - 0.5 * s
            camber = 0.35 * (1 - s * 0.6)
            sweep = 2.6 * s * s
            for j in range(nc):
                t = 2 * math.pi * j / nc
                cx = 0.5 * math.cos(t)
                cy = 0.5 * thick * math.sin(t) + camber * (1 - 4 * cx * cx) * 0.5
                T = cx * chord * math.cos(pitch) - cy * math.sin(pitch) - sweep
                Z = cx * chord * math.sin(pitch) + cy * math.cos(pitch)
                verts.append((ux * r + wx * T, uy * r + wy * T, Z))
        for i in range(ns):
            for j in range(nc):
                a0 = start + i * nc + j
                a1 = start + i * nc + (j + 1) % nc
                b0 = a0 + nc
                b1 = a1 + nc
                faces.append((a0, a1, b1, b0) if ccw else (a0, b0, b1, a1))
        tip = start + ns * nc
        faces.append(tuple(tip + j for j in range(nc)) if ccw else tuple(tip + j for j in reversed(range(nc))))
    import bmesh
    me = bpy.data.meshes.new(name)
    me.from_pydata([(x * MM, y * MM, z * MM) for x, y, z in verts], [], faces)
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    me.update()
    me.shade_smooth()
    return me


def text_mesh(name, body, size, align='CENTER', font_weight='REGULAR'):
    cu = bpy.data.curves.new(name, 'FONT')
    cu.body = body
    cu.size = size * MM
    cu.align_x = align
    cu.align_y = 'CENTER'
    ob = bpy.data.objects.new(name + '_tmp', cu)
    link(ob)
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    bpy.data.objects.remove(ob)
    return me


def mark_mesh(name, s):
    """The Wisp mark (a tilted orbit with a dot on it, around a centre dot) as a flat mesh, size s mm."""
    import bmesh
    bm = bmesh.new()
    tilt = -0.38
    rx, ry, w = 0.46 * s, 0.19 * s, 0.075 * s / 2
    n = 96
    outer, inner = [], []
    for i in range(n):
        t = 2 * math.pi * i / n
        for rad, lst in ((w, outer), (-w, inner)):
            ex, ey = (rx + rad) * math.cos(t), (ry + rad) * math.sin(t)
            lst.append(bm.verts.new((ex * math.cos(tilt) - ey * math.sin(tilt), ex * math.sin(tilt) + ey * math.cos(tilt), 0)))
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((outer[i], outer[j], inner[j], inner[i]))

    def disc(cx, cy, r):
        c = bm.verts.new((cx, cy, 0))
        ring = [bm.verts.new((cx + r * math.cos(2 * math.pi * k / 40), cy + r * math.sin(2 * math.pi * k / 40), 0)) for k in range(40)]
        for k in range(40):
            bm.faces.new((c, ring[k], ring[(k + 1) % 40]))
    disc(0, 0, 0.15 * s)
    a = -0.95
    ex, ey = rx * math.cos(a), ry * math.sin(a)
    disc(ex * math.cos(tilt) - ey * math.sin(tilt), ex * math.sin(tilt) + ey * math.cos(tilt), 0.07 * s)
    for v in bm.verts:
        v.co *= MM
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    return me


# ---------------------------------------------------------------- the drone
def build_drone(M, explode=0.0, lights_on=False, spin=False, hi=True, led=400.0):
    """Returns the root empty. explode in [0, 1] lifts parts apart along Z."""
    use_collection('Product')
    h = 0.2 if hi else 0.34
    root = empty('Wisp')
    e = explode
    parts = {}

    def part(name, lift):
        p = empty(name, (0, 0, lift * e), root)
        parts[name] = p
        return p

    frame_g = part('frame', 0.0)
    canopy_g = part('canopy', 52.0)
    optics_g = part('optics', 34.0)
    pcb_g = part('pcb', 22.0)
    guard_g = part('guards', 62.0)
    prop_g = part('props', 40.0)
    motor_g = part('motors', 20.0)
    battery_g = part('battery', -34.0)

    frame_me = sdf_mesh('frame', frame_sdf, ((-68, 68), (-68, 68), (-13, 8)), h)
    obj('Frame', frame_me, M['body'], parent=frame_g)
    canopy_me = sdf_mesh('canopy', canopy_sdf, ((-15.5, 15.5), (-30.5, 28.5), (5.4, 17.4)), min(h, 0.13))
    obj('Canopy', canopy_me, M['body'], parent=canopy_g)

    # light pipe ring on the canopy and the mark behind it
    ztop = float(canopy_top(0.0, 7.0))
    lp = sdf_mesh('lightpipe', lambda x, y, z: torus(x, y, z, 5.0, 0.52), ((-6, 6), (-6, 6), (-1, 1)), 0.05)
    obj('Status ring', lp, M['lightpipe'], (0, CAN['cy'] + 7.0, ztop - 0.12), parent=canopy_g)
    mk = mark_mesh('mark', 6.0)
    obj('Mark', mk, M['print'], (0, CAN['cy'] + 7.0, ztop + 0.015), (-0.03, 0, 0), parent=canopy_g)

    # optics: window, bezel, reflectors, emitters, camera
    fy = CAN['cy'] - (CAN['by'] - 1.2 * (12.2 - ZT) / 9.0)   # canopy front face at the window height
    om = empty('optics mount', (0, fy, 12.2), optics_g)
    om.rotation_euler = (math.radians(-7.6), 0, 0)
    win = sdf_mesh('window', lambda x, y, z: box3(x, y, z, 12.05, 0.5, 3.68, 3.62), ((-12.5, 12.5), (-0.8, 0.8), (-4.1, 4.1)), 0.05)
    obj('Window', win, M['glass'], (0, 0.52, 0), parent=om)
    bz = sdf_mesh('bezel', bezel_sdf, ((-12.4, 12.4), (-0.6, 0.6), (-4.0, 4.0)), 0.05)
    obj('Bezel', bz, M['matte_black'], (0, 1.55, 0), parent=om)
    refl = sdf_mesh('reflector', reflector_sdf, ((-3.6, 3.6), (-0.4, 2.9), (-3.6, 3.6)), 0.035)
    phos = sdf_mesh('phosphor', lambda x, y, z: np.maximum(length2(x, z) - 1.15, np.abs(y) - 0.3), ((-1.4, 1.4), (-0.5, 0.5), (-1.4, 1.4)), 0.03)
    base = sdf_mesh('ledbase', lambda x, y, z: box3(x, y, z, 1.72, 0.3, 1.72, 0.1), ((-2, 2), (-0.5, 0.5), (-2, 2)), 0.04)
    for sx in (-1, 1):
        obj('Reflector', refl, M['chrome'], (sx * 7.2, 1.9, 0), parent=om)
        obj('LED base', base, M['ceramic'], (sx * 7.2, 3.8, 0), parent=om)
        obj('LED', phos, M['phosphor'], (sx * 7.2, 3.25, 0), parent=om)
    barrel = sdf_mesh('barrel', barrel_sdf, ((-2.5, 2.5), (-2.4, 2.4), (-2.5, 2.5)), 0.035)
    obj('Camera barrel', barrel, M['black_metal'], (0, 3.3, 0), parent=om)
    lens = sdf_mesh('lens', lambda x, y, z: np.maximum(length3v(x, y - 1.6, z) - 2.2, y + 0.2), ((-1.8, 1.8), (-0.8, 0.8), (-1.8, 1.8)), 0.03)
    obj('Camera lens', lens, M['lens'], (0, 1.95, 0), parent=om)
    build_drone.optics_mount = om

    # PCB (visible in the exploded view)
    pcb = sdf_mesh('pcb', lambda x, y, z: extrude(round_box2(x, y, 12.2, 24.5, 4.0), z, -0.5, 0.5, 0.2), ((-13, 13), (-25.5, 25.5), (-0.8, 0.8)), 0.1)
    obj('PCB', pcb, M['matte_black'], (0, CAN['cy'], 8.2), parent=pcb_g)
    chip = sdf_mesh('soc', lambda x, y, z: box3(x, y, z, 5.5, 5.5, 0.55, 0.3), ((-6, 6), (-6, 6), (-0.8, 0.8)), 0.06)
    obj('SoC', chip, M['nickel'], (0, CAN['cy'] + 2.0, 9.25), parent=pcb_g)
    ram = sdf_mesh('ram', lambda x, y, z: box3(x, y, z, 3.6, 2.4, 0.45, 0.2), ((-4, 4), (-3, 3), (-0.6, 0.6)), 0.06)
    obj('RAM', ram, M['matte_black'], (0, CAN['cy'] + 11.5, 9.1), parent=pcb_g)
    obj('IMU', ram, M['matte_black'], (6.0, CAN['cy'] - 12.0, 9.1), (0, 0, math.pi / 2), parent=pcb_g)

    # battery with dock contacts underneath
    bat = sdf_mesh('battery', battery_sdf, ((-15.5, 15.5), (-27.5, 27.5), (-13, -6.5)), 0.12)
    obj('Battery', bat, M['battery'], parent=battery_g)
    mag = sdf_mesh('magnet', lambda x, y, z: cyl(x, y, z, 2.4, -0.3, 0.3, 0.15), ((-2.6, 2.6), (-2.6, 2.6), (-0.5, 0.5)), 0.04)
    pogo = sdf_mesh('pogo', lambda x, y, z: cyl(x, y, z, 1.05, -0.25, 0.25, 0.2), ((-1.3, 1.3), (-1.3, 1.3), (-0.4, 0.4)), 0.03)
    zb = ZB - 5.2
    for sx in (-1, 1):
        for sy in (-1, 1):
            obj('Magnet', mag, M['nickel'], (sx * 9.5, sy * 19.0, zb + 0.18), parent=battery_g)
    for i in (-1, 0, 1):
        obj('Pogo pad', pogo, M['gold'], (i * 3.4, 0, zb + 0.12), parent=battery_g)
    t1 = text_mesh('label1', 'WISP  W1', 2.6)
    obj('Label', t1, M['print'], (0, -9.0, zb - 0.02), (math.pi, 0, 0), parent=battery_g)
    t2 = text_mesh('label2', '7.4 V  550 mAh  4.1 Wh', 1.35)
    obj('Label2', t2, M['print'], (0, 8.0, zb - 0.02), (math.pi, 0, 0), parent=battery_g)
    t3 = text_mesh('label3', 'Designed by Wisp Systems', 1.1)
    obj('Label3', t3, M['print'], (0, 11.0, zb - 0.02), (math.pi, 0, 0), parent=battery_g)

    # motors, props, guards per duct
    base_me = sdf_mesh('motorbase', lambda x, y, z: cyl(x, y, z, 6.8, 0.0, 1.2, 0.35), ((-7.2, 7.2), (-7.2, 7.2), (-0.3, 1.5)), 0.05)
    stator_me = sdf_mesh('stator', stator_sdf, ((-6.4, 6.4), (-6.4, 6.4), (1.0, 4.8)), 0.05)
    bell_me = sdf_mesh('bell', bell_sdf, ((-7.4, 7.4), (-7.4, 7.4), (0.8, 5.8)), 0.05)
    shaft_me = sdf_mesh('shaft', lambda x, y, z: cyl(x, y, z, 0.75, 0.0, 9.6, 0.1), ((-1, 1), (-1, 1), (-0.2, 9.9)), 0.03)
    hub_me = sdf_mesh('prophub', prop_hub_sdf, ((-4.2, 4.2), (-4.2, 4.2), (-0.3, 3.5)), 0.04)
    screw_me = sdf_mesh('screw', lambda x, y, z: smax(cyl(x, y, z, 1.35, 0.0, 0.7, 0.3), -np.minimum(box3(x, y, z - 0.7, 0.75, 0.2, 0.4), box3(x, y, z - 0.7, 0.2, 0.75, 0.4)), 0.05), ((-1.6, 1.6), (-1.6, 1.6), (-0.2, 1.0)), 0.025)
    guard_me = sdf_mesh('guard', guard_sdf, ((-24.6, 24.6), (-24.6, 24.6), (-0.3, 1.5)), 0.07)
    blades = {True: prop_blades_mesh('blades_ccw', True), False: prop_blades_mesh('blades_cw', False)}
    spin_objs = []
    for i, (mx, my) in enumerate(MOTORS):
        ccw = (i % 2 == 0)
        mg = empty(f'motor{i}', (mx, my, HUB_TOP), motor_g)
        obj('Motor base', base_me, M['black_metal'], parent=mg)
        obj('Stator', stator_me, M['copper'], parent=mg)
        rot = empty(f'rotor{i}', (0, 0, 0), mg)
        obj('Bell', bell_me, M['bell'], parent=rot)
        obj('Shaft', shaft_me, M['steel'], parent=rot)
        pg = empty(f'prop{i}', (mx, my, HUB_TOP + 5.45), prop_g)
        prot = empty(f'proprot{i}', (0, 0, 0), pg)
        prot.rotation_euler = (0, 0, 0.7 * i)
        obj('Prop hub', hub_me, M['prop'], parent=prot)
        bo = obj('Blades', blades[ccw], M['prop'], (0, 0, 1.6), parent=prot)
        sub = bo.modifiers.new('sub', 'SUBSURF')
        sub.levels = 1
        sub.render_levels = 2
        obj('Screw', screw_me, M['steel'], (0, 0, 2.62), parent=prot)
        spin_objs.append((rot, prot, 1 if ccw else -1))
        obj('Guard', guard_me, M['guard'], (mx, my, 5.35), (0, 0, 0.12 * i), parent=guard_g)

    if lights_on:
        M['phosphor'].node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].default_value = led
        M['lightpipe'].node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].default_value = 6.0
    else:
        M['lightpipe'].node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].default_value = 1.2
    root['parts'] = list(parts.keys())
    root['spin'] = len(spin_objs)
    build_drone.spin_objs = spin_objs
    build_drone.parts = parts
    return root


def length3v(x, y, z):
    return np.sqrt(x * x + y * y + z * z)


# ---------------------------------------------------------------- studio
def area_light(name, loc, size, energy, color=(1, 1, 1), target=(0, 0, 0), shape='RECTANGLE', size_y=None, spread=None,
               receivers='Product'):
    ld = bpy.data.lights.new(name, 'AREA')
    ld.energy = energy
    ld.color = color
    ld.shape = shape
    ld.size = size
    if size_y is not None:
        ld.size_y = size_y
    if spread is not None:
        ld.spread = spread
    ob = bpy.data.objects.new(name, ld)
    ob.location = loc
    link(ob, bpy.context.scene.collection)
    look_at(ob, target)
    if receivers and bpy.data.collections.get(receivers):
        ob.light_linking.receiver_collection = bpy.data.collections[receivers]
    return ob


def look_at(ob, target):
    from mathutils import Vector
    d = Vector(target) - Vector(ob.location)
    ob.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()


def studio(floor_z=-0.0122, floor_color=0.006, floor_rough=0.22, pool=1.1):
    sc = bpy.context.scene
    w = bpy.data.worlds.new('World')
    sc.world = w
    w.use_nodes = True
    w.node_tree.nodes['Background'].inputs['Color'].default_value = (0, 0, 0, 1)
    w.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.0
    # seamless floor that curves up into a back wall
    import bmesh
    bm = bmesh.new()
    prof = []
    R = 0.35
    for i in range(24):
        a = (math.pi / 2) * i / 23
        prof.append((0.9 - R + R * math.sin(a), floor_z + R - R * math.cos(a)))
    pts = [(-1.6, floor_z)] + prof + [(0.9, floor_z + 1.4)]
    rows = []
    for x in (-2.0, 2.0):
        rows.append([bm.verts.new((x, y, z)) for y, z in pts])
    for i in range(len(pts) - 1):
        bm.faces.new((rows[0][i], rows[1][i], rows[1][i + 1], rows[0][i + 1]))
    me = bpy.data.meshes.new('cyc')
    bm.to_mesh(me)
    bm.free()
    me.shade_smooth()
    m, nt, b = new_mat('Backdrop')
    set_in(b, Base_Color=(floor_color, floor_color, floor_color * 1.1, 1), Roughness=floor_rough, Specular_IOR_Level=0.25)
    me.materials.append(m)
    cyc = bpy.data.objects.new('Backdrop', me)
    stage = use_collection('Stage')
    link(cyc, stage)
    COLL['current'] = bpy.data.collections.get('Product')
    # a soft pool of light on the floor under the product, and nothing else
    if pool > 0:
        area_light('Floor pool', (0.0, 0.02, 0.9), 0.9, pool, target=(0, 0.0, 0), spread=math.radians(30), receivers='Stage')
    return cyc


def lights_product(k=0.2, cool=(0.78, 0.88, 1.0), cam=(0.36, -0.44, 0.27)):
    """Softbox opposite the camera (mirrors into the top faces), a gentle key, cool strip rims."""
    cx, cy, cz = cam
    n = math.sqrt(cx * cx + cy * cy)
    bx, by = -cx / n, -cy / n
    area_light('Sheen', (bx * 0.55, by * 0.55, 0.5), 1.1, 60 * k, size_y=0.7, target=(0, 0, 0))
    area_light('Top', (0.05, 0.1, 0.8), 0.6, 10 * k, target=(0, 0, 0), spread=math.radians(80))
    area_light('Key', (0.5, -0.45, 0.4), 0.5, 12 * k, target=(0, 0, 0), spread=math.radians(70))
    area_light('Rim L', (-0.62, 0.3, 0.14), 0.05, 36 * k, color=cool, size_y=0.8, target=(0, 0, 0.01), spread=math.radians(60))
    area_light('Rim R', (0.55, 0.5, 0.12), 0.05, 26 * k, color=cool, size_y=0.8, target=(0, 0, 0.01), spread=math.radians(60))


def camera(name, loc, target, lens=100, fstop=None, focus=None, sensor=36):
    cd = bpy.data.cameras.new(name)
    cd.lens = lens
    cd.sensor_width = sensor
    cd.clip_start = 0.01
    cd.clip_end = 20
    if fstop:
        cd.dof.use_dof = True
        cd.dof.aperture_fstop = fstop
        cd.dof.focus_distance = focus if focus else (np.linalg.norm(np.array(loc) - np.array(target)))
    ob = bpy.data.objects.new(name, cd)
    ob.location = loc
    link(ob)
    look_at(ob, target)
    bpy.context.scene.camera = ob
    return ob


def compositor(glare=0.0, vignette=0.0):
    sc = bpy.context.scene
    sc.use_nodes = True
    nt = sc.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    rl = nt.nodes.new('CompositorNodeRLayers')
    out = nt.nodes.new('CompositorNodeComposite')
    last = rl.outputs['Image']
    if glare > 0:
        g = nt.nodes.new('CompositorNodeGlare')
        g.glare_type = 'FOG_GLOW'
        g.quality = 'HIGH'
        g.threshold = 1.2
        g.size = 8
        g.mix = -1 + glare
        nt.links.new(last, g.inputs['Image'])
        last = g.outputs['Image']
    ld = nt.nodes.new('CompositorNodeLensdist')
    ld.inputs['Dispersion'].default_value = 0.006
    ld.use_fit = True
    nt.links.new(last, ld.inputs['Image'])
    last = ld.outputs['Image']
    if vignette > 0:
        mask = nt.nodes.new('CompositorNodeEllipseMask')
        mask.width, mask.height = 1.15, 1.1
        blur = nt.nodes.new('CompositorNodeBlur')
        blur.filter_type = 'GAUSS'
        blur.use_relative = True
        blur.factor_x = blur.factor_y = 0.35
        blur.use_extended_bounds = False
        nt.links.new(mask.outputs['Mask'], blur.inputs['Image'])
        mix = nt.nodes.new('CompositorNodeMixRGB')
        mix.blend_type = 'MULTIPLY'
        nt.links.new(last, mix.inputs[1])
        mr = nt.nodes.new('CompositorNodeMapRange')
        mr.inputs['To Min'].default_value = 1 - vignette
        mr.inputs['To Max'].default_value = 1.0
        nt.links.new(blur.outputs['Image'], mr.inputs['Value'])
        nt.links.new(mr.outputs['Value'], mix.inputs[2])
        last = mix.outputs['Image']
    nt.links.new(last, out.inputs['Image'])


def spin_props(blur_angle=2.4):
    """Keyframe the rotors so Cycles motion blur smears the blades by blur_angle radians."""
    sc = bpy.context.scene
    sc.render.use_motion_blur = True
    sc.render.motion_blur_shutter = 0.5
    per_frame = blur_angle / 0.5
    for rot, prot, sign in build_drone.spin_objs:
        for ob, k in ((prot, 1.0), (rot, 1.0)):
            z0 = ob.rotation_euler.z
            ob.rotation_euler.z = z0 - sign * per_frame * k
            ob.keyframe_insert('rotation_euler', index=2, frame=0)
            ob.rotation_euler.z = z0 + sign * per_frame * k
            ob.keyframe_insert('rotation_euler', index=2, frame=2)
            for fc in ob.animation_data.action.fcurves:
                for kp in fc.keyframe_points:
                    kp.interpolation = 'LINEAR'
    sc.frame_set(1)


def beams(energy=6.0, spot_deg=26.0, tilt_deg=6.0):
    """Two spot lights at the emitters, pointing out of the nose, for beams in haze."""
    om = build_drone.optics_mount
    out = []
    for sx in (-1, 1):
        ld = bpy.data.lights.new('Beam', 'SPOT')
        ld.energy = energy
        ld.color = (1.0, 0.97, 0.92)
        ld.spot_size = math.radians(spot_deg)
        ld.spot_blend = 0.55
        ld.shadow_soft_size = 0.0025
        ob = bpy.data.objects.new('Beam', ld)
        link(ob, bpy.context.scene.collection)
        ob.parent = om
        ob.location = (sx * 7.2 * MM, -0.3 * MM, 0.0)
        ob.rotation_euler = (math.radians(-90 + tilt_deg), 0, 0)
        out.append(ob)
    return out


def haze(density=0.012, size=3.0, anisotropy=0.55):
    bpy.ops.mesh.primitive_cube_add(size=size, location=(0, 0, size / 2 - 0.2))
    cube = bpy.context.active_object
    for coll in cube.users_collection:
        coll.objects.unlink(cube)
    use_collection('Haze').objects.link(cube)
    m = bpy.data.materials.new('Haze')
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.remove(nt.nodes['Principled BSDF'])
    vol = nt.nodes.new('ShaderNodeVolumePrincipled')
    vol.inputs['Density'].default_value = density
    vol.inputs['Anisotropy'].default_value = anisotropy
    vol.inputs['Color'].default_value = (0.9, 0.93, 1.0, 1)
    nt.links.new(vol.outputs['Volume'], nt.nodes['Material Output'].inputs['Volume'])
    cube.data.materials.append(m)
    bpy.context.scene.cycles.volume_step_rate = 4.0
    bpy.context.scene.cycles.volume_bounces = 1
    COLL['current'] = bpy.data.collections.get('Product')
    return cube


# ---------------------------------------------------------------- shots
def shot_hero(M, a):
    root = build_drone(M, hi=not a.draft)
    root.rotation_euler = (0, 0, math.radians(-18))
    studio()
    lights_product()
    camera('Cam', (0.36, -0.44, 0.27), (0.0, 0.0, 0.004), lens=a.lens or 105, fstop=32)
    compositor(glare=0.0)


def shot_front(M, a):
    root = build_drone(M, lights_on=True, hi=not a.draft, led=25.0)
    root.location = (0, 0, 0.0)
    root.rotation_euler = (0, 0, math.radians(8))
    studio(pool=0.6)
    lights_product(0.16)
    camera('Cam', (0.07, -0.34, 0.075), (0.0, 0.0, 0.006), lens=a.lens or 100, fstop=16)
    compositor(glare=0.25)
    glare_threshold(4.0)


def shot_flight(M, a):
    """The hero: hovering nose-down, rotors blurred, both emitters on, beams sweeping right through haze."""
    root = build_drone(M, lights_on=True, hi=not a.draft)
    drone = (0.0, 0.0, 0.32)
    root.location = drone
    root.rotation_euler = (math.radians(9), math.radians(-4), math.radians(24))
    spin_props(2.6)
    beams(energy=48.0, spot_deg=22.0)
    haze(0.05)
    az, el, dist = math.radians(-35), math.radians(24), 0.6
    cam = (drone[0] + dist * math.cos(el) * math.sin(az), drone[1] - dist * math.cos(el) * math.cos(az), drone[2] + dist * math.sin(el))
    vx, vy = drone[0] - cam[0], drone[1] - cam[1]
    n = math.hypot(vx, vy)
    rx, ry = vy / n, -vx / n
    lights_product(0.19, cam=cam)
    for o in bpy.data.objects:
        if o.type == 'LIGHT' and o.name in ('Sheen', 'Top', 'Key', 'Rim L', 'Rim R'):
            o.location.z += drone[2]
    tgt = (drone[0] - rx * 0.045, drone[1] - ry * 0.045, drone[2] - 0.006)
    camera('Cam', cam, tgt, lens=a.lens or 50, fstop=16)
    compositor(glare=0.35)
    glare_threshold(3.0)


def glare_threshold(t):
    for n in bpy.context.scene.node_tree.nodes:
        if n.bl_idname == 'CompositorNodeGlare':
            n.threshold = t


def shot_top(M, a):
    build_drone(M, hi=not a.draft)
    studio(pool=0.15)
    lights_product(cam=(0.0, -0.02, 0.95))
    camera('Cam', (0.0, -0.02, 0.95), (0.0, 0.0, 0.0), lens=a.lens or 200)
    compositor()


def shot_bottom(M, a):
    root = build_drone(M, hi=not a.draft)
    root.rotation_euler = (math.radians(180), 0, math.radians(20))
    root.location = (0, 0, 0.004)
    studio()
    lights_product()
    camera('Cam', (0.3, -0.42, 0.3), (0.0, 0.0, 0.0), lens=a.lens or 105, fstop=22)
    compositor()


def shot_explode(M, a):
    root = build_drone(M, explode=1.0, hi=not a.draft)
    root.rotation_euler = (0, 0, math.radians(-24))
    root.location = (0, 0, 0.036)
    studio(pool=0.7)
    cam = (0.44, -0.5, 0.44)
    lights_product(cam=cam)
    camera('Cam', cam, (0.0, 0.0, 0.045), lens=a.lens or 80, fstop=22)
    compositor()


def shot_macro(M, a):
    root = build_drone(M, hi=not a.draft)
    root.rotation_euler = (0, 0, math.radians(-18))
    studio()
    cam = (0.1, -0.1, 0.085)
    lights_product(cam=cam)
    camera('Cam', cam, (0.028, -0.03, 0.004), lens=a.lens or 90, fstop=10)
    compositor()


def mesh_uv(name, verts_mm, faces, uvs):
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v * MM) for v in verts_mm], [], faces)
    me.update()
    uvl = me.uv_layers.new(name='UVMap')
    lv = np.zeros(len(me.loops), dtype=np.int32)
    me.loops.foreach_get('vertex_index', lv)
    uvl.data.foreach_set('uv', np.asarray(uvs, dtype=np.float32)[lv].ravel())
    me.shade_smooth()
    return me


def frame_matrix(p_mm, x_axis, y_axis):
    """Object matrix whose local X, Y follow the given directions (Z completes a right-handed frame)."""
    from mathutils import Matrix, Vector
    X = Vector(x_axis).normalized()
    Y = Vector(y_axis)
    Y = (Y - X * X.dot(Y)).normalized()
    Z = X.cross(Y)
    m = Matrix((X, Y, Z)).transposed().to_4x4()
    m.translation = Vector(p_mm) * MM
    return m


def build_harness(M, draft=False, drone=True, lights_on=False, launch=0.0, tilt=0.0):
    import harness as H
    from mathutils import Matrix, Vector
    use_collection('Product')
    t0 = time.time()
    v, f, n = H.mesh_dress_form(1.8 if draft else 1.15)
    obj('Dress form', mesh_from_arrays('form', v, f, n), M['linen'])
    print(f'  mesh form: {len(f):,} tris in {time.time() - t0:.1f}s', flush=True)
    cap = sdf_mesh('neckcap', H.neck_cap_sdf, ((-66, 66), (-58, 70), (-2, 16)), 0.4)
    obj('Neck cap', cap, M['black_metal'], (0, 0, 117.5))
    pole = sdf_mesh('pole', H.pole_sdf, ((-13, 13), (-13, 13), (-522, 2)), 0.5)
    obj('Stand', pole, M['black_metal'], (0, 0, -640))
    plate = sdf_mesh('plate', H.plate_sdf, ((-70, 70), (60, 175), (-240, -60)), 0.5 if draft else 0.32)
    obj('Back plate', plate, M['carbon'])
    # straps
    for sx in (-1, 1):
        path = H.strap_path(H.shoulder_ctrl(sx), offset=0.8)
        vv, ff, uv, L = H.ribbon(path, 38.0, 3.4, taper_ends=0.0)
        obj('Shoulder strap', mesh_uv('shoulder', vv, ff, uv), M['webbing'])
        low = H.strap_path(H.lower_ctrl(sx), offset=0.8)
        vv, ff, uv, L = H.ribbon(low, 25.0, 2.0)
        obj('Lower strap', mesh_uv('lower', vv, ff, uv), M['webbing'])
        # ladder lock where the lower strap meets the shoulder strap
        k = len(path) - 6
        T = path[k + 1] - path[k - 1]
        N = H.normals_at(path[k:k + 1])[0]
        B = np.cross(T, N)
        sl = sdf_mesh('slider', H.slider_sdf, ((-24.5, 24.5), (-2.2, 2.2), (-10, 10)), 0.08)
        so = obj('Ladder lock', sl, M['black_metal'])
        so.matrix_world = frame_matrix(path[k] + N * 5.4, B, N)
    st = H.strap_path(H.sternum_ctrl(), offset=4.6)
    vv, ff, uv, L = H.ribbon(st, 20.0, 1.8)
    obj('Sternum strap', mesh_uv('sternum', vv, ff, uv), M['webbing'])
    mid = len(st) // 2
    T = st[mid + 1] - st[mid - 1]
    N = H.normals_at(st[mid:mid + 1])[0]
    cm = frame_matrix(st[mid] + N * 1.5, T, N)
    cl = sdf_mesh('clasp', H.clasp_sdf, ((-33, 33), (-1, 10), (-15, 15)), 0.1 if not draft else 0.16)
    co = obj('Clasp', cl, M['black_metal'])
    co.matrix_world = cm
    bt = sdf_mesh('button', H.button_sdf, ((-8.5, 8.5), (6, 10), (-8.5, 8.5)), 0.05)
    bo = obj('Button', bt, M['battery'])
    bo.matrix_world = cm
    ring = sdf_mesh('btnring', lambda x, y, z: torus(x, z, y - 9.25, 5.6, 0.22), ((-6.2, 6.2), (8.6, 9.9), (-6.2, 6.2)), 0.03)
    ro = obj('Button ring', ring, M['lightpipe'])
    ro.matrix_world = cm
    # the drone, docked flat on the plate: its top faces out, its nose points up
    set_emission(M['lightpipe'], 0.25)
    if drone:
        c, nrm = H.dock_center()
        root = build_drone(M, hi=not draft, lights_on=lights_on)
        use_collection('Product')
        q = Vector((0, 1, 0)).rotation_difference(Vector(nrm))
        rot = q.to_matrix().to_4x4() @ Matrix.Rotation(math.radians(-90), 4, 'X') @ Matrix.Rotation(math.radians(tilt), 4, 'X')
        lift = 12.2 + 0.4 + launch
        loc = Vector(c) + Vector(nrm) * lift
        root.matrix_world = Matrix.Translation(loc * MM) @ rot
        set_emission(M['lightpipe'], 0.25)
    return c if drone else None


def set_emission(mat, strength):
    mat.node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].default_value = strength


def backdrop_behind(target, cam, dist=1.4, size=4.0, glow=1.0, color=0.02):
    """A large dark card behind the subject, lit only by its own soft light for a gentle gradient."""
    from mathutils import Vector
    t, c = Vector(target), Vector(cam)
    d = (t - c).normalized()
    p = t + d * dist
    bpy.ops.mesh.primitive_plane_add(size=size, location=p)
    pl = bpy.context.active_object
    for coll in pl.users_collection:
        coll.objects.unlink(pl)
    stage = use_collection('Stage')
    stage.objects.link(pl)
    look_at(pl, tuple(c))
    pl.rotation_euler.rotate_axis('X', math.pi)
    m, nt, b = new_mat('Card')
    set_in(b, Base_Color=(color, color, color * 1.05, 1), Roughness=0.9)
    pl.data.materials.append(m)
    lp = t + d * (dist * 0.35) + Vector((0, 0, 0.2))
    area_light('Card light', tuple(lp), 1.2, 3 * glow, target=tuple(p), receivers='Stage', spread=math.radians(40))
    COLL['current'] = bpy.data.collections.get('Product')


def lights_harness(cam, target, k=0.38, cool=(0.8, 0.88, 1.0)):
    from mathutils import Vector
    c, t = Vector(cam), Vector(target)
    d = (c - t)
    d.z = 0
    d.normalize()
    side = Vector((-d.y, d.x, 0))
    area_light('Key', tuple(t + d * 1.2 + side * 1.0 + Vector((0, 0, 0.9))), 1.4, 180 * k, target=tuple(t))
    area_light('Fill', tuple(t + d * 1.4 - side * 1.3 + Vector((0, 0, 0.2))), 1.6, 45 * k, target=tuple(t))
    area_light('Top', tuple(t + Vector((0, 0, 1.6))), 1.2, 80 * k, target=tuple(t))
    area_light('Rim A', tuple(t - d * 1.2 + side * 1.1 + Vector((0, 0, 0.5))), 0.25, 160 * k, color=cool, size_y=1.6, target=tuple(t))
    area_light('Rim B', tuple(t - d * 1.2 - side * 1.1 + Vector((0, 0, 0.4))), 0.25, 120 * k, color=cool, size_y=1.6, target=tuple(t))


def shot_harness_back(M, a):
    build_harness(M, draft=a.draft)
    cam = (0.62, 1.22, 0.02)
    tgt = (0.0, 0.1, -0.165)
    camera('Cam', cam, tgt, lens=a.lens or 58, fstop=8)
    lights_harness(cam, tgt)
    backdrop_behind(tgt, cam)
    compositor()


def shot_harness_front(M, a):
    build_harness(M, draft=a.draft)
    cam = (-0.55, -1.25, -0.02)
    tgt = (0.0, -0.05, -0.17)
    camera('Cam', cam, tgt, lens=a.lens or 58, fstop=8)
    lights_harness(cam, tgt)
    backdrop_behind(tgt, cam)
    compositor()


def shot_clasp(M, a):
    build_harness(M, draft=a.draft, drone=False)
    cam = (-0.1, -0.42, -0.1)
    tgt = (0.0, -0.15, -0.18)
    camera('Cam', cam, tgt, lens=a.lens or 100, fstop=4)
    lights_harness(cam, tgt, k=0.5)
    backdrop_behind(tgt, cam)
    compositor()


def shot_launch(M, a):
    """Wisp peeling off the back plate: lifted clear, rotors blurred, status ring lit."""
    build_harness(M, draft=a.draft, launch=85.0, lights_on=True, tilt=10.0)
    spin_props(2.2)
    for o in build_drone.parts.values():
        pass
    cam = (0.88, 1.0, 0.16)
    tgt = (0.0, 0.19, -0.14)
    camera('Cam', cam, tgt, lens=a.lens or 68, fstop=8)
    lights_harness(cam, tgt)
    backdrop_behind(tgt, cam)
    compositor(glare=0.2)
    glare_threshold(3.0)


SHOTS = {'hero': shot_hero, 'front': shot_front, 'top': shot_top, 'bottom': shot_bottom,
         'explode': shot_explode, 'macro': shot_macro, 'harness_back': shot_harness_back,
         'harness_front': shot_harness_front, 'clasp': shot_clasp, 'flight': shot_flight, 'launch': shot_launch}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--shot', default='hero', choices=sorted(SHOTS))
    ap.add_argument('--out', default='renders/out.png')
    ap.add_argument('--res', default='1600x1000')
    ap.add_argument('--samples', type=int, default=128)
    ap.add_argument('--lens', type=float, default=0)
    ap.add_argument('--draft', action='store_true', help='coarser meshes for quick previews')
    ap.add_argument('--blend', default='', help='also save the scene as a .blend file')
    a = ap.parse_args()
    res = tuple(int(v) for v in a.res.lower().split('x'))
    reset(res, a.samples)
    M = materials()
    t = time.time()
    SHOTS[a.shot](M, a)
    print(f'scene built in {time.time() - t:.1f}s', flush=True)
    sc = bpy.context.scene
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    if a.out.lower().endswith(('.jpg', '.jpeg')):
        sc.render.image_settings.file_format = 'JPEG'
        sc.render.image_settings.quality = 92
    sc.render.filepath = os.path.abspath(a.out)
    if a.blend:
        bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(a.blend))
    t = time.time()
    bpy.ops.render.render(write_still=True)
    print(f'rendered {a.out} in {time.time() - t:.1f}s', flush=True)


if __name__ == '__main__':
    main()
