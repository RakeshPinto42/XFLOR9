# F4 — Character system (plan)

Status: **planned, not built.** The monsoon neighbourhood (U1 benchmark) already has the activity
locations F4 will populate (`src/scenes/monsoon/activities.ts`). Until F4 lands those locations are
empty — that is not the final experience.

## Decision (Increment 3)

- **Option C:** original characters made for XPLOR9. No purchase of the Quaternius Source tier or
  any paid character pack at this stage.
- Interim CC0 bodies may be used only for rigging/animation tests, never shipped as "the children".

## What the characters are

Original, reusable Indian children (roughly 6–14) from 1990–2010 small-town and village life:

- **Proportions:** child proportions (larger head-to-body ratio, shorter limbs) — not scaled adults.
- **Clothing:** school uniforms (white shirt, navy/khaki shorts or pinafore), half-sleeve shirts,
  frocks, kurta-pyjama, salwar-kameez, chappals and rubber slippers, raincoats and umbrellas
  for the monsoon. Clothing is swapped by material/mesh variants, not new characters.
- **Variety without assets explosion:** one base skeleton per body type (younger / older child),
  with head, hair, skin tone, clothing and accessories as interchangeable parts.

## Capabilities (in build order)

| Stage | Capability | Notes |
|---|---|---|
| F4.1 | Skeleton, base meshes, clothing variants, LOD | One shared skeleton; GPU skinning; ≤ 3 LODs |
| F4.2 | Locomotion: idle, walk, run, cycling | Root motion along routes (`ActivitySpot.route`) |
| F4.3 | Activities: cricket, football, marbles | Group choreography per `ActivitySpot.group` |
| F4.4 | Reading and sitting | Veranda benches (`kind: "reading"`, sheltered) |
| F4.5 | Conversations and group interactions | `kind: "chatting"`; look-at, gestures, turn-taking |
| Later | Facial expressions and dialogue | Blend shapes + lip-sync; needs A1 dialogue bus |

**Not now:** no animation is built in Increment 3. Each stage gets its own plan and acceptance
criteria before it starts.

## Contracts already in place

- `ActivitySpot` (`activities.ts`): id, kind, position, facing, radius, group size, sheltered,
  optional route, note. F2 moves these into the shared scene format.
- The stage's quality levels: characters must respect `level` (fewer characters, cheaper LOD and
  no shadows at low/minimal) and stay within the scene's draw-call budget (regression test < 120).
- Lite/Still posters are re-rendered from the real scene once characters exist.

## Performance budget (reference: Lenovo Gaming 3, GTX 1650)

- Up to ~20 visible children at high quality, instanced or batched by shared materials.
- Character work must not push the monsoon scene below 60 fps median at 1080p on the reference
  laptop (currently ~110 fps median, 53 draw calls).

## Sourcing and licensing

- Characters are modelled and rigged for XPLOR9 (original work). Any third-party base mesh or
  animation must be CC0 or explicitly licensed for commercial use, recorded in the asset manifest.
- No likenesses of real people, no characters from existing films, TV, comics or games.
- Spending on assets or tools needs the owner's approval first.
