# Wisp studio: photoreal renders

Blender (Cycles path tracing) scripts that build the Wisp product and render the images and image
sequences the site uses. Everything is procedural, so any dimension, material or camera can be changed
and re-rendered.

## What is in here

| File | Purpose |
| --- | --- |
| `sdf.py` | Signed distance field helpers and marching-cubes meshing. Molded parts are modelled as fields, so every join gets a real fillet and normals come straight from the field. |
| `wisp_studio.py` | The drone (molded frame, crowned canopy, guards, machined motor bells, five-blade props, optics behind a smoked sapphire window, battery and dock contacts), materials, the studio, and every still. |
| `harness.py` | The Silk harness on a tailor's dress form: carbon back plate, two padded shoulder straps that return under the arms, a sternum strap and the trigger clasp. |
| `wisp_anim.py` | Image sequences: a 360° spin and a scroll-driven exploded view (with per-frame label positions). |
| `wisp_web.py` | Converts renders to web-sized WebP files for `wisp/assets/img/`. |

## Running

```sh
pip install bpy==4.2.0 scikit-image      # Blender as a Python module; needs Python 3.11
python wisp_studio.py --shot hero --out renders/hero.png --res 1800x1125 --samples 112
python wisp_studio.py --shot flight --draft --res 640x400 --samples 16   # quick preview
python wisp_anim.py spin --frames 48 --res 1000x750 --samples 36 --outdir renders/spin
python wisp_anim.py explode --frames 40 --res 1000x1000 --samples 36 --outdir renders/explode
python wisp_web.py renders ../assets/img
```

Shots: `flight` (the hero: hovering, rotors motion-blurred, beams in haze), `hero`, `front`, `top`,
`bottom`, `explode`, `macro`, `harness_back`, `harness_front`, `clasp`, `launch`.
Add `--blend scene.blend` to save any shot as a Blender file you can open and art-direct by hand.

The site's images were rendered on a 4-core CPU. On a machine with an NVIDIA or Apple GPU, set
`scene.cycles.device = 'GPU'` in `reset()` and raise `--samples` and `--res`: the same scripts give
4K stills in minutes.

## Going further: film-quality people

Product shots are the easy part of photorealism: no skin, no hair, no motion. The encounter film is
the hard part. The route studios use:

1. Export the drone and harness from these scenes (File > Export > FBX, glTF or USD from a saved `.blend`).
2. Build the shot in Unreal Engine 5 with MetaHumans for the two people, and motion capture for the
   performance (a Rokoko suit, or markerless capture such as Move.ai from phone video).
3. Light with Lumen for iteration and render finals with Movie Render Queue's path tracer.
4. Or skip digital people entirely: shoot the scene with actors and composite the CG drone into the
   plate. That is usually cheaper and the most convincing.

`wisp/scenario.html` is the real-time previs for that film: blocking, camera and timing.
