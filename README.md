# playground

## Wisp

A concept for a personal protection drone, plus a startup-style website for it. Everything lives in `wisp/`:

| File | What it is |
| --- | --- |
| `index.html` | Home page: photoreal hero, the system (Silk harness, a drag-to-rotate 360° of Wisp, Orbit's flight patterns), how it works, a scroll-scrubbed exploded view, design targets, principles |
| `technology.html` | Launch sequence, the six Orbit flight patterns (live top-down plots), perception, the harness and the energy budget |
| `safety.html` | Safety commitments, test stages and FAQ |
| `company.html` | Mission, progress and open roles |
| `scenario.html` | The real-time previs of the encounter: the attacker draws, the defender presses the chest clasp, and Wisp lifts off the harness and circles the attacker's head with light while the defender walks away. |
| `studio/` | Blender (Cycles) scripts that build the product and path-trace every image and image sequence on the site. See `studio/README.md`. |
| `assets/img/` | The renders (WebP): stills in `r/`, the 360° spin in `spin/`, the exploded view in `explode/` |
| `assets/patterns.js` | Orbit's flight patterns, shared by the site plots and the previs |
| `assets/wisp-model.js` | Real-time models for the previs: the drone, the two-strap Silk harness, a dress form and a head bust |
| `assets/site.js`, `assets/site.css` | Site behavior and styles |

The pages use ES modules, so serve the repo over HTTP instead of opening the files directly:

```sh
python3 -m http.server 8000
# then open http://localhost:8000/wisp/
```

The previs loads Three.js from a public CDN and every page loads its fonts from Google Fonts, so they need network access.

The scenario's light defaults to a slow, soft pulse. The real ~11 Hz strobe is opt-in behind a photosensitivity warning.

Wisp Systems is fictional. The specifications are design targets for the concept, not a real product.
