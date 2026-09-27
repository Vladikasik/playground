# playground

## Wisp

A concept for a personal protection drone, plus a startup-style website for it. Everything lives in `wisp/`:

| File | What it is |
| --- | --- |
| `index.html` | Home page: live 3D hero, the system (Silk harness, Wisp drone, Orbit flight software), how it works, a scroll-driven exploded view of the drone, design targets, principles |
| `technology.html` | Launch sequence, the six Orbit flight patterns (live 3D plus top-down plots), perception, the harness and the energy budget |
| `safety.html` | Safety commitments, test stages and FAQ |
| `company.html` | Mission, progress and open roles |
| `scenario.html` | A 24-second 3D standoff film. The attacker draws, the defender presses the chest clasp, and Wisp peels off the harness and circles the attacker's head with light while the defender walks away. |
| `assets/wisp-model.js` | Procedural models shared by every page: the drone (with internals for the exploded view), the Silk harness, a dress form, a head bust and the flight patterns |
| `assets/site3d.js` | The site's live 3D views. Each one renders only while it is on screen. |
| `assets/site.js`, `assets/site.css` | Site behavior and styles |
| `assets/img/` | Stills rendered from the scenario |

The pages use ES modules, so serve the repo over HTTP instead of opening the files directly:

```sh
python3 -m http.server 8000
# then open http://localhost:8000/wisp/
```

Three.js and the fonts load from public CDNs, so the pages need network access.

The scenario's light defaults to a slow, soft pulse. The real ~11 Hz strobe is opt-in behind a photosensitivity warning.

Wisp Systems is fictional. The specifications are design targets for the concept, not a real product.
