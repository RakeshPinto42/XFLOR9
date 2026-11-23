# 3D asset pipeline

How models get into XPLOR9 (F1, increment 2). Every model has a recipe, a reproducible build and a
manifest record with its source, licence, authors, modifications and before/after inspection.

## Files

| File | Role |
|---|---|
| `content/assets/recipes.json` | Per asset: source, licence, authors, input file, texture patches, settings |
| `scripts/assets/build-asset.ts` | Builds one asset from its recipe (`npm run assets:build -- <id>`) |
| `content/assets/manifest.json` | Generated record per asset (never edit by hand) |
| `public/assets/models/<id>.glb` | Optimised model served to visitors |
| `public/draco/` | Draco decoder, copied from the installed three.js (`npm run assets:sync-draco`) |
| `src/engine/assets.ts`, `src/engine/glb.ts` | Manifest validation; GLB extension preflight |
| `src/stage/assets.ts` | Runtime loading (`useModel(id)`), progress, sharing and disposal |

## Adding an asset

1. Check the licence on the source page and the exact authors (CC0 or XPLOR9-original only, for now).
2. Inspect it visually: it must fit the creative direction (authentically Indian 1990–2010, no
   brands or logos, not cheap low-poly). Reject rather than force a poor fit.
3. Download the source into `.cache/assets/src/<SourceName>/` and verify its published checksums.
4. Add a recipe. Brand marks or logos are removed with `texturePatches` (copying neighbouring texture
   over them), each with a recorded reason.
5. `npm run assets:build -- <id>`, then check the result visually and run `npm test`.

## What the build does

- dedup and prune (removes duplicate and unused data);
- textures to WebP, at most `maxTextureSize` (default 1024);
- texture sets (`textures` in the recipes, `npm run assets:build-texture`): each map to WebP with its own size cap (`mapSizes`). AO/roughness/metal maps and the normal maps of small surfaces are 512 px, saving GPU memory (8 sets: ~84 MB on the GPU, was ~134 MB; 3.9 MB download);
- Draco geometry compression **only for static models**. Models with animation, skins or morph
  targets keep uncompressed geometry unless the recipe sets `dracoVerified` after a visual and motion
  check;
- never simplifies meshes: the build fails if the triangle count, animations, skins or morph targets
  change;
- validates with the Khronos glTF validator (0 errors required). The validator can't look inside Draco
  data, so the build also decodes the result and compares counts with the source.

## OptimizeGLB comparison (2026-11-23)

OptimizeGLB (optimizeglb.com) now runs entirely in the browser (files are not uploaded) and is built
on glTF Transform, the same library as this pipeline. Same source (Poly Haven Television_01, 1k):

| Output | Size | Triangles | Vertices | Textures | Geometry | Validator errors |
|---|---|---|---|---|---|---|
| Original (lossless GLB) | 518 KB | 1918 | 1976 | 3 × JPEG 1024 | none | 0 |
| OptimizeGLB "Compatible" preset | 340 KB | 1918 | 1976 | 3 × WebP 1024 | Draco | 0 |
| XPLOR9 pipeline | 297 KB | 1918 | 1976 | 3 × WebP 1024 | Draco | 0 |

The outputs are structurally equivalent; the size difference is texture quality (90% vs 88%).
OptimizeGLB's default "Smallest" preset may enable mesh simplification, so use "Compatible" (or
"Custom" without Simplify) for XPLOR9 assets. The scripted pipeline stays the source of truth because
it is reproducible and writes the manifest record; OptimizeGLB is a good visual check and an option for
artists' assets, whose output then goes through the same inspection and manifest steps.

## Current assets

| Id | Source | Authors | Licence | Notes |
|---|---|---|---|---|
| television-01 | Poly Haven Television_01 | Gabriel Radić | CC0 | Brand marks removed (front "VTECH", side "VTECH" and chevron, "TRRA" label text) |
| monobloc-chair-01 | Poly Haven plastic_monobloc_chair_01 | Kuutti Siitonen | CC0 | |
| brass-vase-03 | Poly Haven brass_vase_03 | Rico Cilliers | CC0 | |

Rejected for not fitting the direction: Poly Haven ceiling_fan (modern four-blade), Sofa_01 (ornate
European), coffee_table_round_01 (modern metal), chinese_tea_table (reads as Chinese). The sofa,
centre table, TV cabinet and three-blade fan are built for XPLOR9 in increment 3.
