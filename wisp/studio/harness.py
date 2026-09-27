"""The Silk harness on a tailor's dress form: a contoured back plate that Wisp docks onto, two
padded shoulder straps that run over the shoulders and back under the arms like a backpack,
and a sternum strap carrying the trigger clasp. Units are millimetres, Z up, the form faces -Y.
"""
import math

import numpy as np

from sdf import box3, cyl, extrude, length2, length3, mesh_sdf, round_box2, smax, smin, torus, union


def ellipsoid(x, y, z, rx, ry, rz):
    k0 = length3(x / rx, y / ry, z / rz)
    k1 = length3(x / (rx * rx), y / (ry * ry), z / (rz * rz))
    return k0 * (k0 - 1.0) / np.maximum(k1, 1e-9)


def capsule(x, y, z, a, b, r):
    ax, ay, az = a
    bx, by, bz = b
    px, py, pz = x - ax, y - ay, z - az
    dx, dy, dz = bx - ax, by - ay, bz - az
    h = np.clip((px * dx + py * dy + pz * dz) / (dx * dx + dy * dy + dz * dz), 0.0, 1.0)
    return length3(px - dx * h, py - dy * h, pz - dz * h) - r


# ---------------------------------------------------------------- the dress form (z = 0 at the shoulder line)
def torso_sdf(x, y, z):
    ax = np.abs(x)
    chest = ellipsoid(x, y + 8.0, z + 165.0, 158.0, 104.0, 200.0)
    pecs = ellipsoid(ax - 62.0, y + 36.0, z + 120.0, 78.0, 70.0, 70.0)
    waist = ellipsoid(x, y + 2.0, z + 390.0, 134.0, 92.0, 175.0)
    hips = ellipsoid(x, y - 6.0, z + 560.0, 158.0, 104.0, 140.0)
    blades = ellipsoid(ax - 68.0, y - 62.0, z + 120.0, 62.0, 52.0, 88.0)
    shoulders = capsule(x, y, z, (-150.0, 4.0, -26.0), (150.0, 4.0, -26.0), 66.0)
    trap = capsule(x, y, z, (-70.0, 10.0, 10.0), (70.0, 10.0, 10.0), 48.0)
    body = smin(smin(chest, waist, 70.0), hips, 60.0)
    body = smin(body, blades, 40.0)
    body = smin(body, shoulders, 55.0)
    body = smin(body, trap, 45.0)
    neck = cyl(x, y - 6.0, z, 56.0, -40.0, 118.0, 6.0)
    body = smin(body, neck, 26.0)
    body = smax(body, ax - 196.0, 16.0)         # flat arm plates
    body = smax(body, -(z + 640.0), 10.0)       # flat bottom
    return body


def neck_cap_sdf(x, y, z):
    return cyl(x, y - 6.0, z, 58.0, 0.0, 14.0, 5.0)


def pole_sdf(x, y, z):
    return cyl(x, y, z, 11.0, -520.0, 0.0, 1.0)


# ---------------------------------------------------------------- the harness
BACK_Y = None   # set by plate_frame()


def surface_point(x, z, side=1.0, offset=0.0, y0=None):
    """March along Y from far outside toward the body at (x, z) and return the surface point."""
    y = np.full(np.shape(x), 400.0 * side if y0 is None else y0, dtype=np.float64)
    for _ in range(80):
        d = torso_sdf(x, y, z) - offset
        y = y - side * d * 0.9
    return y


def project(p, offset, iters=12):
    """Pull points onto the torso surface offset by `offset` mm along the field gradient."""
    p = p.astype(np.float64).copy()
    e = 0.3
    for _ in range(iters):
        x, y, z = p[:, 0], p[:, 1], p[:, 2]
        d = torso_sdf(x, y, z) - offset
        g = np.stack([torso_sdf(x + e, y, z) - torso_sdf(x - e, y, z),
                      torso_sdf(x, y + e, z) - torso_sdf(x, y - e, z),
                      torso_sdf(x, y, z + e) - torso_sdf(x, y, z - e)], axis=1)
        g /= np.maximum(np.linalg.norm(g, axis=1, keepdims=True), 1e-9)
        p -= g * d[:, None]
    return p


def normals_at(p):
    e = 0.3
    x, y, z = p[:, 0], p[:, 1], p[:, 2]
    g = np.stack([torso_sdf(x + e, y, z) - torso_sdf(x - e, y, z),
                  torso_sdf(x, y + e, z) - torso_sdf(x, y - e, z),
                  torso_sdf(x, y, z + e) - torso_sdf(x, y, z - e)], axis=1)
    return g / np.maximum(np.linalg.norm(g, axis=1, keepdims=True), 1e-9)


def catmull(ctrl, step=2.5):
    ctrl = np.asarray(ctrl, dtype=np.float64)
    pts = [ctrl[0]]
    for i in range(len(ctrl) - 1):
        p0 = ctrl[max(i - 1, 0)]
        p1, p2 = ctrl[i], ctrl[i + 1]
        p3 = ctrl[min(i + 2, len(ctrl) - 1)]
        n = max(2, int(np.linalg.norm(p2 - p1) / step))
        for k in range(1, n + 1):
            t = k / n
            t2, t3 = t * t, t * t * t
            pts.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
    return np.array(pts)


def smooth_path(p, n=3):
    for _ in range(n):
        q = p.copy()
        q[1:-1] = 0.25 * p[:-2] + 0.5 * p[1:-1] + 0.25 * p[2:]
        p = q
    return p


def strap_path(ctrl, offset, step=2.5):
    p = catmull(ctrl, step)
    for _ in range(3):
        p = project(p, offset)
        p = smooth_path(p, 2)
    return project(p, offset)


def ribbon(path, width, thick, normals=None, flip=False, round_r=None, taper_ends=0.0):
    """Sweep a rounded-rectangle section along a path lying on the body.

    Returns vertices (mm), quad faces, per-vertex UVs (u across in mm, v along in mm) and a
    per-vertex tangent frame is implicit. The section's thickness grows outward from the body."""
    P = np.asarray(path, dtype=np.float64)
    n = normals_at(P) if normals is None else normals
    T = np.gradient(P, axis=0)
    T /= np.maximum(np.linalg.norm(T, axis=1, keepdims=True), 1e-9)
    B = np.cross(T, n)
    B /= np.maximum(np.linalg.norm(B, axis=1, keepdims=True), 1e-9)
    N = np.cross(B, T)
    if flip:
        B = -B
    r = min(thick * 0.5, width * 0.2) if round_r is None else round_r
    # rounded rectangle section, counter-clockwise, x across, y outward from the body
    sec = []
    hw, ht = width / 2, thick
    corners = [(hw - r, ht - r, 0.0), (-hw + r, ht - r, 0.5 * math.pi), (-hw + r, r, math.pi), (hw - r, r, 1.5 * math.pi)]
    for cx, cy, a0 in corners:
        for k in range(5):
            a = a0 + (math.pi / 2) * k / 4
            sec.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    sec = np.array(sec)
    m = len(sec)
    L = np.concatenate([[0.0], np.cumsum(np.linalg.norm(np.diff(P, axis=0), axis=1))])
    verts, uvs = [], []
    for i in range(len(P)):
        s = 1.0
        if taper_ends > 0:
            s = min(1.0, 0.6 + 0.4 * min(L[i], L[-1] - L[i]) / taper_ends)
        for sx, sy in sec:
            verts.append(P[i] + B[i] * sx * s + N[i] * sy)
            uvs.append((sx, L[i]))
    faces = []
    for i in range(len(P) - 1):
        for j in range(m):
            a, b = i * m + j, i * m + (j + 1) % m
            faces.append((a, b, b + m, a + m))
    faces.append(tuple(range(m))[::-1])
    faces.append(tuple((len(P) - 1) * m + j for j in range(m)))
    return np.array(verts), faces, np.array(uvs), L[-1]


# plate placement: centred between the shoulder blades
PLATE = dict(cx=0.0, cz=-150.0, hw=64.0, hh=80.0, r=22.0, t=7.0, gap=1.5)


def plate_sdf(x, y, z):
    """A contoured plate that follows the upper back: the band between gap and gap + t outside the skin."""
    d = torso_sdf(x, y, z)
    shell = np.maximum(PLATE['gap'] - d, d - (PLATE['gap'] + PLATE['t']))
    outline = round_box2(x - PLATE['cx'], z - PLATE['cz'], PLATE['hw'], PLATE['hh'], PLATE['r'])
    plate = smax(shell, outline, 3.0)
    return smax(plate, -y + 20.0, 2.0)   # back side only


def dock_center():
    """Point on the plate's outer face at its centre, and the outward normal there."""
    y = surface_point(np.array([PLATE['cx']]), np.array([PLATE['cz']]), side=1.0, offset=PLATE['gap'] + PLATE['t'])
    p = np.array([[PLATE['cx'], y[0], PLATE['cz']]])
    return p[0], normals_at(p)[0]


def shoulder_ctrl(sx):
    """One shoulder strap, from the plate's top corner over the shoulder, in toward the sternum, out to the ribs."""
    return [
        (sx * 40.0, 130.0, PLATE['cz'] + PLATE['hh'] - 8.0),
        (sx * 60.0, 112.0, -30.0),
        (sx * 82.0, 62.0, 28.0),
        (sx * 96.0, 0.0, 50.0),
        (sx * 92.0, -72.0, 12.0),
        (sx * 80.0, -122.0, -70.0),
        (sx * 70.0, -132.0, -160.0),
        (sx * 78.0, -128.0, -240.0),
        (sx * 102.0, -110.0, -292.0),
    ]


def lower_ctrl(sx):
    """From the ladder lock at the bottom of the shoulder strap, around the ribs to the plate's lower corner."""
    return [
        (sx * 104.0, -108.0, -296.0),
        (sx * 134.0, -78.0, -306.0),
        (sx * 160.0, -10.0, -300.0),
        (sx * 152.0, 62.0, -280.0),
        (sx * 104.0, 116.0, -252.0),
        (sx * 52.0, 132.0, PLATE['cz'] - PLATE['hh'] + 10.0),
    ]


def sternum_ctrl():
    return [(-76.0, -140.0, -166.0), (-40.0, -150.0, -171.0), (0.0, -150.0, -173.0), (40.0, -150.0, -171.0), (76.0, -140.0, -166.0)]


def clasp_sdf(x, y, z):
    """The trigger clasp, local frame: X across the chest, Y out of the chest, Z up."""
    body = box3(x, y - 4.2, z, 23.0, 4.4, 14.0, 4.2)
    body = smin(body, box3(x, y - 2.0, z, 30.0, 2.2, 10.0, 2.0), 3.0)     # strap slots' outer bars
    for sx in (-1, 1):
        body = smax(body, -box3(x - sx * 26.5, y - 2.0, z, 1.4, 4.0, 7.2, 0.6), 0.3)
    body = smax(body, -cyl(x, z, y, 8.6, 7.6, 12.0, 0.4), 0.4)            # button well
    return body


def button_sdf(x, y, z):
    return smax(cyl(x, z, y, 7.9, 6.4, 9.2, 0.9), -torus(x, z, y - 9.2, 5.6, 0.25), 0.1)


def slider_sdf(x, y, z):
    """A tri-glide adjuster, local frame: X across the strap, Y out, Z along."""
    f = box3(x, y, z, 23.0, 1.6, 9.0, 1.4)
    for zc in (-4.6, 4.6):
        f = smax(f, -box3(x, y, z - zc, 20.0, 3.0, 2.2, 0.8), 0.3)
    return f


def mesh_dress_form(h=1.4):
    return mesh_sdf(torso_sdf, ((-205, 205), (-150, 150), (-645, 125)), h)
