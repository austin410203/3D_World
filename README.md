# Coast to Coast · 3D World

An open-world road trip across the USA built with three.js. You drive or walk 106 km from a San Francisco–style coastal city to a New York–style skyline. The scene was made procedurally in Blender (the CrossCountry project) and exported to compact binary assets.

**The world takes about 1 hour to drive end to end:** highway US-99 is 106.2 km long, roughly 61 minutes at 105 km/h.

## Ten stages
1. Coastal City: Golden Gate–style suspension bridge, San Francisco–style city
2. Desert Highway: Nevada desert, Joshua trees, power lines
3. Desert Town: Route 66–style gas station, motel, diner
4. Canyon: Grand Canyon terraces and a steel arch bridge
5. Mountains & Lake: Rockies, Silver Lake
6. Plains: Kansas wheat fields, red barns, silos, wind turbines
7. River City: Gateway Arch, cable-stayed bridge
8. Appalachian: autumn forest
9. Seaside: Atlantic cliffs and a lighthouse
10. East Coast City: New York–style skyline and a Statue of Liberty–style island

## Controls
| Key | On foot | In the car |
|---|---|---|
| W A S D | move | throttle / brake & reverse / steer |
| Shift | run | — |
| Space | jump | handbrake (drift) |
| F | get in (near the car) | get out (after stopping) |
| E / Q | — | shift up / down |
| M | — | toggle automatic / manual |
| C | — | toggle chase / hood camera |
| R | back to the highway | back to the highway |
| 1–9, 0 | teleport to stages 1–10 | same |
| Mouse / wheel | rotate / zoom the camera | same |
| G / N / H | graphics quality / sound / help | |

## Car physics
- Twin-turbo V8 torque curve (700 Nm), 900–8,000 rpm, rev limiter
- 6-speed gearbox (3.10 / 2.15 / 1.62 / 1.28 / 1.04 / 0.86, final drive 3.6). Every shift cuts power for 0.24 s; automatic upshift around 7,600 rpm and downshift by load
- Aero drag, rolling resistance, traction limit, more resistance off-road. **Top speed 300 km/h (electronic limiter); 0–100 km/h in about 4.5 s, 0–300 in about 25 s**
- Speed-sensitive steering, tyre grip, and handbrake drifts. Follows terrain and bridge decks (pitch and roll from 4 contact points), gets airborne over crests, collides with buildings, guardrails and traffic
- Synthesized engine sound (pitch follows rpm), wind noise and tyre squeal

## Tech
- Static site, no build step: `index.html` plus ES modules, three.js 0.170 loaded from a CDN import map. Deploy straight to Vercel.
- `assets/` (about 36 MB, gzip; decompressed in the browser with `DecompressionStream`):
  - `terrain_h.bin.gz`: 3601×601 heightfield at 30 m, rendered as 3 km tiles with 5 LOD levels and skirts
  - `static_rXX.bin.gz`: cities, towns, landmarks and signs, about 58,000 buildings, streamed in by region. Positions are quantized uint16 and windows come from a world-coordinate shader
  - `veg.bin.gz`: 618,000 trees, cacti, rocks and wheat plants, built as `InstancedMesh` cells within 2.6 km of the player
  - `colliders.bin.gz`: 110,000 building and guardrail collision boxes (OBB)
  - `route.bin.gz`: the highway centreline and height profile
- `tools/export_web.py`: run inside Blender to re-export `assets/` from `CrossCountry.blend`

## Running locally
```bash
python -m http.server 8000
```
Then open http://localhost:8000

## Deploying to Vercel
Import this repo in Vercel. Framework Preset: **Other**, with no build command and no output directory. Every push to `main` redeploys automatically.
