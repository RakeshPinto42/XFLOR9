/**
 * Builds texture sets from their recipes (content/assets/recipes.json → "textures") and records
 * them in the asset manifest.
 *
 *   node scripts/assets/build-texture.ts <texture-id> [more ids…]
 *
 * Downloads the 1k JPEG maps from Poly Haven (or reuses the cached download), verifies the
 * published MD5 checksums, converts each map to WebP and writes
 * public/assets/textures/<id>/<map>.webp. Maps: diff (colour), nor_gl (OpenGL normal),
 * arm (ambient occlusion / roughness / metalness packed).
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const ids = process.argv.slice(2);
const recipes = JSON.parse(readFileSync("content/assets/recipes.json", "utf8")).textures ?? {};
if (ids.length === 0 || ids.some((id) => !recipes[id])) {
  console.error(`Usage: build-texture.ts <id…>. Known: ${Object.keys(recipes).join(", ")}`);
  process.exit(1);
}
const API_KEY: Record<string, string> = { diff: "Diffuse", nor_gl: "nor_gl", arm: "arm" };
const md5 = (b: Uint8Array) => createHash("md5").update(b).digest("hex");
const sha256 = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const today = new Date().toISOString().slice(0, 10);

const manifestPath = "content/assets/manifest.json";
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : { version: 1, assets: [] };

for (const id of ids) {
  const recipe = recipes[id];
  const asset = recipe.source.asset;
  const filesInfo = await (await fetch(recipe.source.api, { headers: { "User-Agent": "asset-pipeline/1.0" } })).json();
  const srcDir = `.cache/assets/tex/${asset}`;
  mkdirSync(srcDir, { recursive: true });
  const outDir = `public/assets/textures/${id}`;
  mkdirSync(outDir, { recursive: true });
  const maps = [];
  const sourceFiles = [];
  for (const map of recipe.maps) {
    const entry = filesInfo[API_KEY[map]]?.[recipe.source.resolution]?.jpg;
    if (!entry) throw new Error(`${id}: no ${map} map at ${recipe.source.resolution}`);
    const local = `${srcDir}/${entry.url.split("/").pop()}`;
    let bytes = existsSync(local) ? new Uint8Array(readFileSync(local)) : null;
    if (!bytes || md5(bytes) !== entry.md5) {
      bytes = new Uint8Array(await (await fetch(entry.url, { headers: { "User-Agent": "asset-pipeline/1.0" } })).arrayBuffer());
      writeFileSync(local, bytes);
    }
    if (md5(bytes) !== entry.md5) throw new Error(`${id}: checksum mismatch for ${map}`);
    sourceFiles.push({ name: entry.url.split("/").pop(), bytes: bytes.byteLength, md5: entry.md5 });
    // Per-map size cap (GPU memory): e.g. packed AO/roughness/metal maps carry low-frequency detail.
    const max = recipe.mapSizes?.[map] ?? 1024;
    const webp = await sharp(bytes).resize(max, max, { fit: "inside", withoutEnlargement: true }).webp({ quality: recipe.quality ?? 86 }).toBuffer();
    const meta = await sharp(webp).metadata();
    writeFileSync(`${outDir}/${map}.webp`, webp);
    maps.push({ map, path: `/assets/textures/${id}/${map}.webp`, bytes: webp.byteLength, sha256: sha256(webp), size: [meta.width, meta.height] });
  }
  const record = {
    id,
    kind: "texture",
    title: recipe.title,
    use: recipe.use,
    maps,
    realWorldMetres: recipe.realWorldMetres,
    licence: recipe.licence,
    authors: recipe.authors,
    source: {
      name: recipe.source.name,
      url: recipe.source.url,
      retrievedFrom: recipe.source.api,
      resolution: recipe.source.resolution,
      retrievedAt: today,
      files: sourceFiles,
    },
    modifications: [],
    optimisation: {
      tool: "sharp (JPEG → WebP, per-map size caps)",
      mapSizes: Object.fromEntries(recipe.maps.map((m: string) => [m, recipe.mapSizes?.[m] ?? 1024])),
      textures: "webp",
      quality: recipe.quality ?? 86,
      originalBytes: sourceFiles.reduce((n, f) => n + f.bytes, 0),
      optimisedBytes: maps.reduce((n, m) => n + m.bytes, 0),
    },
    verifiedAt: today,
  };
  manifest.assets = [...manifest.assets.filter((a: { id: string }) => a.id !== id), record];
  const kb = (n: number) => `${Math.round(n / 1024)} KB`;
  console.log(`${id}: ${kb(record.optimisation.originalBytes)} → ${kb(record.optimisation.optimisedBytes)} (${maps.map((m) => m.map).join(", ")})`);
}
manifest.assets.sort((a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id));
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
