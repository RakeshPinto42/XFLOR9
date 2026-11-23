# Scene format (F2)

Every 3D scene is one JSON file in `content/scenes/<id>.json`. The renderer only reads and draws it;
the Cinematic Studio (S1–S3) will write it. The format is defined and validated in
`src/engine/scene/format.ts` (plain TypeScript, no three.js), so the site, the Studio, scripts and
tests all share one definition.

Think of it as the difference between a budget template and the numbers in it: the code is the
template (how a house or a light is drawn), the scene file is the numbers (which houses, where,
what colour). Changing the numbers never needs a code change.

## How a scene file is used

1. The page's registry entry (`src/stage/registry.ts`) names the renderer and the file.
2. Full mode loads both, then **upgrades** the file to the current format and **validates** it.
3. An invalid file never reaches the renderer: the scene falls back to Lite with a reason, and the
   console lists every problem with its exact location, e.g.
   `objects[12] (house-3).width: must be between 3 and 30 (got 45)`.

## Top level

| Field | Meaning |
|---|---|
| `formatVersion` | Format number (currently **1**). Older files are upgraded; newer ones are refused with a clear message. |
| `id`, `title` | Scene id (lowercase, e.g. `monsoon-neighbourhood`) and a readable name. |
| `environment` | Background, fog, exposure, sky, post effects and weather. |
| `camera` | Field of view, clipping, start position and aim; optionally a looping cinematic path. |
| `lights` | Hemisphere (sky light), directional (sun/moon), point (bulbs) and spot lights. |
| `objects` | Everything placed in the scene (see below). |
| `audio` | Sound positions for the A1 audio system (rain on roofs, eave drips, radio, birds…). |
| `activities` | Where F4's characters will play, read and talk (cricket, reading, cycling route…). |
| `interactions`, `transitions` | Placeholders for later phases: things to use, and ways to other scenes. |

Units: metres, radians, seconds. Colours: `"#rrggbb"`. Positions: `[x, y, z]`, y is up.

## Environment

```json
"environment": {
  "background": null,
  "fog": { "type": "exp2", "color": "#5b6670", "density": 0.026 },
  "exposure": 1.35,
  "sky": "monsoon-clouds",
  "effects": { "bloom": 1.05, "bloomThreshold": 0.6, "vignette": 0.5, "grain": 0.05 },
  "weather": {
    "rain": { "maxDrops": 9000 },
    "mist": { "strength": 0.75, "banks": [[-3.1, 1.8, 12], [4.2, 2.6, 4.5]] },
    "lightning": { "firstSeconds": 9, "minSeconds": 12, "maxSeconds": 30 }
  }
}
```

- `fog` is `exp2` (thickens with distance, outdoors) or `linear` (`near`/`far`, rooms), or `null`.
- `effects` are switched off automatically at lower quality levels; `null` = none.
- `rain.maxDrops` is the count at the highest quality; lower levels use a share of it.

## Objects

Every object has a unique `id`. Placed objects have `position`, optional `rotation` and `scale`.

| Type | What it is | Key fields |
|---|---|---|
| `model` | A model from the asset manifest | `asset` (an id, never a URL) |
| `box`, `plane` | Simple shapes (room shells, blockouts) | `size`, `material` (`color`, `roughness`, `metalness`, `unlit`), shadows |
| `ceiling-fan` | Three-blade fan, turning | `speed` (radians per second) |
| `lane-ground` | Ground with a muddy lane and grass verges | `size`, `lane` (`width`, `from`, `to`) |
| `water-channel` | Rainwater flowing beside the lane | `x`, `from`, `to` |
| `house` | Tiled-roof house with veranda (faces local +z) | `width`, `depth`, `wall` (texture set), `tint`, `band`, `door`, `roofPitch`, `veranda`, `windows`, `doorOpen`, `lamp`, `tulsi`, `seed` |
| `tree` | Canopy tree, coconut palm, banana plant or bush | `kind`, `scale`, `seed` |
| `puddle` | Rain puddle with ripples | `size`, `rotation` |

Example house:

```json
{
  "id": "house-1", "type": "house", "position": [-8.9, 0, 4], "rotation": [0, 1.5708, 0],
  "width": 7.1, "depth": 5.6, "wall": "mossy-plaster", "tint": "#e6e0d2", "band": "#4f6b5a",
  "door": "#8a6446", "roofPitch": 1.6, "veranda": 1.9, "windows": 2,
  "doorOpen": true, "lamp": true, "tulsi": false, "seed": 1
}
```

`box`, `plane`, `model` and `ceiling-fan` can be drawn in any scene. The other types are drawn by
the scene's own kit (the monsoon scene has the ground, house, tree, puddle and channel kits); an
object type a scene cannot draw is reported in the console, never silently dropped.

## Safety rules (scene files are untrusted input)

- Unknown fields are refused, so a typo is reported instead of ignored.
- Numbers must be finite and within range (coordinates within ±10 km, sizes positive…).
- Assets are referenced only by id and must exist in the asset manifest with the right kind.
- No text may contain a link, a URL scheme (`https:`, `data:`, `javascript:`…) or a file path.
- Limits: 2 MB per file, 5,000 objects, 2,000 items in other lists.
- Ids are unique; interactions must point at an object in the same scene.

## Versions and upgrades

`UPGRADES` in `format.ts` holds one step per format change (`UPGRADES[1]` turns format 1 into 2,
and so on). Loading a file applies every step it needs, in order, so files saved by an older Studio
keep working. Today only format 1 exists, so the chain is empty; the mechanism itself is tested.

When the format changes: raise `SCENE_FORMAT_VERSION`, add the upgrade step and its test, update
this document, and re-save the shipped scene files.

## Canonical text

`serializeScene()` writes the canonical file text (2-space JSON, trailing newline). Loading a file
and saving it again gives the identical file — tested for every shipped scene — so Studio saves
produce clean, reviewable diffs.

## Files

| File | Role |
|---|---|
| `src/engine/scene/format.ts` | Types, limits, validation, upgrades, canonical text |
| `src/stage/scene-view.tsx` | Shared drawing: environment and camera settings, lights, basic objects, activity markers |
| `content/scenes/*.json` | The scene files |
| `scripts/scenes/export-scenes.ts` | One-off conversion that produced the first two files from the old hard-coded layouts (`npm run scenes:export`) |
