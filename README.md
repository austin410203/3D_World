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
| V / K / L | god mode / call (and repair) the car / toggle residents & wildlife | |
| E / Q / left click | talk / interact · switch weapon · attack | |
| F | mount an animal (taming needed) | |
| G / N / H | graphics quality / sound / help | |


## God mode and wildlife
- **V god mode**: free flight over the whole world. WASD to fly, E/Space to climb, Q/C to descend, Shift to speed up, mouse wheel to change speed, drag the mouse to turn. Click any of the 14 places in the list on the left (Golden Gate, Grand Canyon, Silver Lake, Gateway Arch, Lighthouse Point, Liberty Island, New York midtown, and more) to fly there along a smooth arc. Number keys fly you to each stage. Press V again to land right where you are, and press **K** to call the car to you.
- **Minecraft-style residents**: blocky pedestrians with pixel faces wander the streets of every city and town (up to 320 nearby in the big cities). They jump out of the way of fast cars, and fall over if you hit them.
- **Minecraft-style wildlife by biome** (they graze, wander in herds, and flee when you get close):
  - Coastal hills: horses
  - Desert: llamas, foxes
  - Canyon: goats, foxes
  - Rockies: deer, elk, bears, wolves, goats
  - Plains: cows, pigs, sheep, chickens, horses, bison
  - Appalachia: deer, bears, foxes, pigs
  - Sky: gulls along the coasts, hawks over the desert, crows over the plains
- **L** toggles residents and wildlife on or off. Everything is drawn with InstancedMesh, so each body part is a single draw call no matter how many creatures there are.


## Minecraft-style gameplay
- **The hero and the car** are Minecraft-style blocks with pixel textures. Highway traffic uses the same blocky style.
- **Residents do things that make sense for where they are**:
  - City streets: they walk the block grid (New York's 29° grid included), chat in small groups, and wait at the roadside.
  - Parks: they jog, picnic and chat.
  - Beach: sunbathing and strolling.
  - Lakes and rivers: fishing.
  - Kansas fields: farming with a hoe.
  - Golden Gate, Gateway Arch, canyon rim, lighthouse and the red barn: taking photos.
  - If you attack someone, people nearby panic and scatter.
- **Quests** (yellow "!" giver in each town; E to talk, E again to accept):
  - Find a lost pet: search inside the circle on the minimap, then E to have it follow you home.
  - Catch a thief: chase and tackle with E, or hit him, then return the wallet.
  - Delivery: drive to the next town before time runs out (yellow light beam marks the drop-off).
  - Tame a horse or llama.
  - Hunt 3 wolves.
  - Rewards are emeralds 💎.
- **Highway accidents**: wrecked cars on fire with smoke, traffic cones, and stopped traffic queuing behind. Pull over, then hold E next to the injured person to give first aid.
- **Weapons and health**:
  - 10 hearts of health.
  - Q switches between fist, diamond sword and bow; left click (or X) attacks or fires an arrow, and arrows follow a ballistic arc.
  - Falls, bites, being hit by a car and car crashes all cost health. Health regenerates when you stop taking damage, and you respawn beside the highway after dying.
  - The car takes damage and smokes when hurt; at 0 the engine catches fire and dies. K calls a new car.
- **Ride any animal (F)**: untamed animals bolt, buck, and throw you off. Each attempt raises their trust until they're tamed, after which WASD steers, Shift sprints and Space jumps. A horse gallops at up to 68 km/h. Wolves and bears attack you if you get close on foot.

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
