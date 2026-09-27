"""Signed distance field helpers (numpy) and marching-cubes meshing for molded parts.

All distances are in millimetres. Shapes are functions f(x, y, z) -> distance that work on
broadcastable numpy arrays, so a part can be evaluated on a grid in z-slabs.
"""
import numpy as np
from skimage.measure import marching_cubes

F32 = np.float32


def length2(x, y):
    return np.sqrt(x * x + y * y)


def length3(x, y, z):
    return np.sqrt(x * x + y * y + z * z)


def smin(a, b, k):
    """Polynomial smooth minimum: a fillet of roughly radius k where two shapes meet."""
    if k <= 0:
        return np.minimum(a, b)
    h = np.clip(0.5 + 0.5 * (b - a) / k, 0.0, 1.0)
    return b + (a - b) * h - k * h * (1.0 - h)


def smax(a, b, k):
    return -smin(-a, -b, k)


def union(*ds):
    out = ds[0]
    for d in ds[1:]:
        out = np.minimum(out, d)
    return out


def round_box2(x, y, bx, by, r):
    """2D rounded rectangle, half sizes bx, by (rounding included), corner radius r."""
    qx = np.abs(x) - bx + r
    qy = np.abs(y) - by + r
    return length2(np.maximum(qx, 0), np.maximum(qy, 0)) + np.minimum(np.maximum(qx, qy), 0) - r


def extrude(d2, z, z0, z1, r=0.0):
    """Extrude a 2D distance between z0 and z1, rounding the top and bottom edges by r."""
    zc = 0.5 * (z0 + z1)
    hz = 0.5 * (z1 - z0)
    wx = d2 + r
    wy = np.abs(z - zc) - hz + r
    return length2(np.maximum(wx, 0), np.maximum(wy, 0)) + np.minimum(np.maximum(wx, wy), 0) - r


def box3(x, y, z, bx, by, bz, r=0.0):
    qx = np.abs(x) - bx + r
    qy = np.abs(y) - by + r
    qz = np.abs(z) - bz + r
    return (length3(np.maximum(qx, 0), np.maximum(qy, 0), np.maximum(qz, 0))
            + np.minimum(np.maximum(qx, np.maximum(qy, qz)), 0) - r)


def cyl(x, y, z, r, z0, z1, re=0.0):
    return extrude(length2(x, y) - r, z, z0, z1, re)


def torus(x, y, z, R, r):
    return length2(length2(x, y) - R, z) - r


def polar_repeat(x, y, n, offset=0.0):
    """Fold the plane into one of n angular sectors; returns (u, v) with u along the sector axis."""
    phi = np.arctan2(y, x) - offset
    sector = 2 * np.pi / n
    phi = np.mod(phi + sector / 2, sector) - sector / 2
    rho = length2(x, y)
    return rho * np.cos(phi), rho * np.sin(phi)


def rotate2(x, y, a):
    c, s = np.cos(a), np.sin(a)
    return c * x + s * y, -s * x + c * y


def evaluate(f, bounds, h, chunk=16):
    (x0, x1), (y0, y1), (z0, z1) = bounds
    nx = int(np.ceil((x1 - x0) / h)) + 1
    ny = int(np.ceil((y1 - y0) / h)) + 1
    nz = int(np.ceil((z1 - z0) / h)) + 1
    xs = (x0 + np.arange(nx) * h).astype(F32)
    ys = (y0 + np.arange(ny) * h).astype(F32)
    zs = (z0 + np.arange(nz) * h).astype(F32)
    vol = np.empty((nx, ny, nz), dtype=F32)
    X = xs[:, None, None]
    Y = ys[None, :, None]
    for k in range(0, nz, chunk):
        Z = zs[None, None, k:k + chunk]
        vol[:, :, k:k + chunk] = np.broadcast_to(f(X, Y, Z), (nx, ny, Z.shape[2]))
    return vol, (x0, y0, z0)


def gradient(f, p, eps):
    x, y, z = p[:, 0], p[:, 1], p[:, 2]
    g = np.stack([
        f(x + eps, y, z) - f(x - eps, y, z),
        f(x, y + eps, z) - f(x, y - eps, z),
        f(x, y, z + eps) - f(x, y, z - eps),
    ], axis=1)
    n = np.linalg.norm(g, axis=1, keepdims=True)
    return (g / np.maximum(n, 1e-12)).astype(F32)


def mesh_sdf(f, bounds, h):
    """Mesh the zero level set of f; returns vertices (mm), triangle indices and SDF normals."""
    vol, origin = evaluate(f, bounds, h)
    verts, faces, _, _ = marching_cubes(vol, level=0.0, spacing=(h, h, h),
                                        gradient_direction='ascent', allow_degenerate=False)
    verts = verts.astype(F32) + np.array(origin, dtype=F32)
    normals = gradient(f, verts, h * 0.5)
    # marching_cubes winds triangles inward for this sign convention; flip them to face out
    return verts, np.ascontiguousarray(faces[:, ::-1], dtype=np.int32), normals
