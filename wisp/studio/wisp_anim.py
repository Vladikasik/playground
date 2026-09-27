"""Image sequences for the site: a 360 degree spin and a scroll-driven exploded view.

    python wisp_anim.py spin --frames 48 --res 1200x900 --samples 40 --outdir renders/spin
    python wisp_anim.py explode --frames 40 --res 1600x1000 --samples 40 --outdir renders/explode

The explode run also writes labels.json: the screen position of each part's anchor per frame.
"""
import argparse
import json
import math
import os
import sys
import time

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wisp_studio as W  # noqa: E402

# label anchors in each part group's local frame (mm)
ANCHORS = [
    ('canopy', 'Canopy', (8.0, W.CAN['cy'] + 12.0, 14.0)),
    ('optics', 'Optics', (10.5, W.CAN['cy'] - 26.6, 12.2)),
    ('pcb', 'Compute', (11.0, W.CAN['cy'] - 14.0, 8.7)),
    ('props', 'Rotors', (W.A + 15.0, -W.A + 15.0, 2.0)),
    ('guards', 'Guards', (W.A + 17.0, W.A + 16.0, 6.0)),
    ('frame', 'Airframe', (W.A + 19.0, -W.A - 19.0, 0.0)),
    ('battery', 'Power and dock', (13.5, 24.0, W.ZB - 5.0)),
]


def ease(u):
    return u * u * (3 - 2 * u)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('kind', choices=['spin', 'explode'])
    ap.add_argument('--frames', type=int, default=48)
    ap.add_argument('--res', default='1200x900')
    ap.add_argument('--samples', type=int, default=40)
    ap.add_argument('--outdir', default='renders/seq')
    ap.add_argument('--start', type=int, default=0)
    ap.add_argument('--draft', action='store_true')
    a = ap.parse_args()
    res = tuple(int(v) for v in a.res.lower().split('x'))
    sc = W.reset(res, a.samples)
    sc.render.use_persistent_data = True
    sc.render.image_settings.file_format = 'JPEG'
    sc.render.image_settings.quality = 92
    M = W.materials()
    os.makedirs(a.outdir, exist_ok=True)

    if a.kind == 'spin':
        root = W.build_drone(M, hi=not a.draft)
        W.studio(pool=0.7)
        cam = (0.0, -0.56, 0.3)
        W.lights_product(cam=cam)
        W.camera('Cam', cam, (0.0, 0.0, 0.0), lens=100, fstop=32)
        W.compositor()
        for f in range(a.start, a.frames):
            root.rotation_euler = (0, 0, math.radians(-30) + 2 * math.pi * f / a.frames)
            sc.render.filepath = os.path.join(os.path.abspath(a.outdir), f'{f:03d}.jpg')
            t = time.time()
            bpy.ops.render.render(write_still=True)
            print(f'frame {f} {time.time() - t:.1f}s', flush=True)
        return

    # explode: parts separate as the frame index grows, the whole drone turns a little
    root = W.build_drone(M, explode=1.0, hi=not a.draft)
    parts = W.build_drone.parts
    lifts = {k: p.location.z for k, p in parts.items()}
    W.studio(pool=0.7)
    cam = (0.44, -0.5, 0.44)
    W.lights_product(cam=cam)
    camo = W.camera('Cam', cam, (0.0, 0.0, 0.042), lens=100, fstop=32)
    W.compositor()
    from bpy_extras.object_utils import world_to_camera_view
    from mathutils import Vector
    labels = {'frames': a.frames, 'parts': [{'id': k, 'name': n, 'pts': []} for k, n, _ in ANCHORS]}
    c0, c1 = Vector((0.33, -0.375, 0.3)), Vector(cam)
    t0, t1 = Vector((0.0, 0.0, 0.012)), Vector((0.0, 0.0, 0.042))
    for f in range(a.frames):
        e = ease(f / (a.frames - 1))
        for k, p in parts.items():
            p.location.z = lifts[k] * e
        root.location = (0, 0, 0.036 * e)
        root.rotation_euler = (0, 0, math.radians(-16 - 12 * e))
        camo.location = c0.lerp(c1, e)
        W.look_at(camo, tuple(t0.lerp(t1, e)))
        bpy.context.view_layer.update()
        for entry, (k, n, anchor) in zip(labels['parts'], ANCHORS):
            wpos = parts[k].matrix_world @ Vector(tuple(c * W.MM for c in anchor))
            v = world_to_camera_view(sc, camo, wpos)
            entry['pts'].append([round(v.x, 4), round(1 - v.y, 4)])
        if f < a.start:
            continue
        sc.render.filepath = os.path.join(os.path.abspath(a.outdir), f'{f:03d}.jpg')
        t = time.time()
        bpy.ops.render.render(write_still=True)
        print(f'frame {f} {time.time() - t:.1f}s', flush=True)
    with open(os.path.join(a.outdir, 'labels.json'), 'w') as fh:
        json.dump(labels, fh)


if __name__ == '__main__':
    main()
