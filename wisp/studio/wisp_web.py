"""Turn renders into web images: WebP stills, small card crops, a mobile hero crop and the sequences.

    python wisp_web.py <renders dir> <site img dir>

Expects <renders>/final/*.png, <renders>/spin/*.jpg and <renders>/explode/*.jpg (+ labels.json).
"""
import os
import shutil
import sys

import bpy
import numpy as np

QUALITY = 84


def load(path):
    img = bpy.data.images.load(path, check_existing=False)
    img.colorspace_settings.name = 'sRGB'
    return img


def pixels(img):
    w, h = img.size
    a = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(a)
    return a.reshape(h, w, 4)


def save_array(arr, dst, quality=QUALITY):
    h, w = arr.shape[:2]
    out = bpy.data.images.new('out', w, h, alpha=False)
    out.pixels.foreach_set(np.ascontiguousarray(arr, dtype=np.float32).ravel())
    out.filepath_raw = dst
    out.file_format = 'WEBP'
    out.save(quality=quality)
    bpy.data.images.remove(out)


def resize(arr, width):
    h, w = arr.shape[:2]
    if w <= width:
        return arr
    height = round(h * width / w)
    img = bpy.data.images.new('tmp', w, h, alpha=False)
    img.pixels.foreach_set(np.ascontiguousarray(arr).ravel())
    img.scale(width, height)
    out = pixels(img)
    bpy.data.images.remove(img)
    return out


def crop(arr, x0, x1, y0, y1):
    """Crop by fractions of width and height, measured from the top left."""
    h, w = arr.shape[:2]
    top, bot = int(y0 * h), int(y1 * h)
    return arr[h - bot:h - top, int(x0 * w):int(x1 * w)]


def main():
    src, dst = sys.argv[-2], sys.argv[-1]
    os.makedirs(os.path.join(dst, 'r'), exist_ok=True)
    final = os.path.join(src, 'final')
    cards = {'clasp': (0.0, 1.0, 0.0, 1.0), 'launch': (0.0, 1.0, 0.0, 1.0), 'front': (0.0, 1.0, 0.0, 1.0),
             'flight': (0.3, 0.95, 0.12, 0.9)}
    for name in sorted(os.listdir(final)):
        if not name.endswith('.png'):
            continue
        key = name[:-4]
        arr = pixels(load(os.path.join(final, name)))
        save_array(resize(arr, 2400 if key == 'flight' else 1800), os.path.join(dst, 'r', f'{key}.webp'))
        if key in cards:
            c = crop(arr, *cards[key])
            # 16:10 card crop around the centre of the chosen region
            h, w = c.shape[:2]
            if w / h > 1.6:
                cw = int(h * 1.6)
                c = c[:, (w - cw) // 2:(w - cw) // 2 + cw]
            else:
                ch = int(w / 1.6)
                c = c[(h - ch) // 2:(h - ch) // 2 + ch]
            save_array(resize(c, 960), os.path.join(dst, 'r', f'{key}-s.webp'))
        if key == 'flight':
            save_array(resize(crop(arr, 0.3, 0.92, 0.0, 1.0), 1100), os.path.join(dst, 'r', 'flight-m.webp'))
        print('wrote', key, flush=True)
    for seq in ('spin', 'explode'):
        sdir = os.path.join(src, seq)
        if not os.path.isdir(sdir):
            continue
        odir = os.path.join(dst, seq)
        os.makedirs(odir, exist_ok=True)
        for name in sorted(os.listdir(sdir)):
            if name.endswith('.jpg'):
                arr = pixels(load(os.path.join(sdir, name)))
                save_array(arr, os.path.join(odir, name[:-4] + '.webp'), 80)
            elif name == 'labels.json':
                shutil.copy(os.path.join(sdir, name), os.path.join(odir, name))
        print('wrote', seq, flush=True)


if __name__ == '__main__':
    main()
