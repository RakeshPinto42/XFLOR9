/**
 * Builds one 3D asset from its recipe (content/assets/recipes.json) and records it in the asset
 * manifest (content/assets/manifest.json).
 *
 *   node scripts/assets/build-asset.ts <asset-id>
 *
 * Steps: read the downloaded source → apply recorded texture patches (e.g. brand removal) →
 * dedup + prune unused data → textures to WebP (max size from the recipe) → Draco geometry
 * compression ONLY for static models (no animation, skins or morph targets) → validate with the
 * Khronos glTF validator → inspect before/after → write public/assets/models/<id>.glb.
 * No mesh simplification is ever applied.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, statSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { NodeIO, type Document } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, draco, prune, textureCompress } from "@gltf-transform/functions";
import draco3d from "draco3dgltf";
import sharp from "sharp";
import validator from "gltf-validator";

const id = process.argv[2];
const recipes = JSON.parse(readFileSync("content/assets/recipes.json", "utf8")).assets;
const recipe = recipes[id];
if (!recipe) {
  console.error(`Unknown asset "${id}". Known: ${Object.keys(recipes).join(", ")}`);
  process.exit(1);
}

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    "draco3d.decoder": await draco3d.createDecoderModule(),
    "draco3d.encoder": await draco3d.createEncoderModule(),
  });

function inspect(doc: Document, bytes: number) {
  const root = doc.getRoot();
  let primitives = 0;
  let vertices = 0;
  let triangles = 0;
  let morphTargets = 0;
  for (const mesh of root.listMeshes()) {
    for (const p of mesh.listPrimitives()) {
      primitives += 1;
      const count = p.getAttribute("POSITION")?.getCount() ?? 0;
      vertices += count;
      triangles += (p.getIndices()?.getCount() ?? count) / 3;
      morphTargets += p.listTargets().length;
    }
  }
  return {
    bytes,
    meshes: root.listMeshes().length,
    primitives,
    vertices,
    triangles: Math.round(triangles),
    materials: root.listMaterials().length,
    textures: root.listTextures().map((t) => ({
      name: basename(t.getURI() || t.getName() || "embedded"),
      mimeType: t.getMimeType(),
      size: t.getSize(),
      bytes: t.getImage()?.byteLength ?? 0,
    })),
    animations: root.listAnimations().length,
    skins: root.listSkins().length,
    morphTargets,
    extensionsUsed: root.listExtensionsUsed().map((e) => e.extensionName),
  };
}

const sha256 = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

// --- read source -----------------------------------------------------------------------
const srcDir = dirname(recipe.input);
const sourceFiles: { name: string; bytes: number; md5: string }[] = [];
const walk = (dir: string, prefix = "") => {
  for (const f of readdirSync(dir, { withFileTypes: true })) {
    if (f.name === "list.txt") continue;
    const p = join(dir, f.name);
    if (f.isDirectory()) walk(p, `${prefix}${f.name}/`);
    else
      sourceFiles.push({
        name: `${prefix}${f.name}`,
        bytes: statSync(p).size,
        md5: createHash("md5").update(readFileSync(p)).digest("hex"),
      });
  }
};
walk(srcDir);
const originalBytes = sourceFiles.reduce((n, f) => n + f.bytes, 0);
const doc = await io.read(recipe.input);
const before = inspect(doc, originalBytes);

// --- texture patches (recorded modifications) ------------------------------------------
for (const patch of recipe.texturePatches ?? []) {
  const tex = doc.getRoot().listTextures().find((t) => basename(t.getURI()) === patch.texture);
  if (!tex) throw new Error(`Patch target texture not found: ${patch.texture}`);
  const img = Buffer.from(tex.getImage()!);
  const [fx, fy, fw, fh] = patch.from;
  const [tx, ty, tw, th] = patch.to;
  const piece = await sharp(img).extract({ left: fx, top: fy, width: fw, height: fh }).resize(tw, th, { fit: "fill" }).toBuffer();
  const patched = await sharp(img).composite([{ input: piece, left: tx, top: ty }]).jpeg({ quality: 95 }).toBuffer();
  tex.setImage(new Uint8Array(patched));
}

// --- optimise --------------------------------------------------------------------------
const animated = before.animations > 0 || before.skins > 0 || before.morphTargets > 0;
const useDraco = recipe.draco === true && (!animated || recipe.dracoVerified === true);
const max = recipe.maxTextureSize ?? 1024;
await doc.transform(
  dedup(),
  prune(),
  textureCompress({ encoder: sharp, targetFormat: "webp", resize: [max, max], quality: 88 }),
  ...(useDraco ? [draco({ method: "edgebreaker" })] : []),
);

const glb = await io.writeBinary(doc);
const report = await validator.validateBytes(glb, { maxIssues: 50 });
if (report.issues.numErrors > 0) {
  console.error(JSON.stringify(report.issues.messages.filter((m: { severity: number }) => m.severity === 0), null, 2));
  throw new Error(`glTF validator found ${report.issues.numErrors} errors`);
}
const after = inspect(await io.readBinary(glb), glb.byteLength);
if (after.triangles !== before.triangles) throw new Error(`Triangle count changed (${before.triangles} → ${after.triangles}): no simplification allowed`);
if (after.animations !== before.animations || after.skins !== before.skins || after.morphTargets !== before.morphTargets)
  throw new Error("Animation, skin or morph-target data changed");

const out = `public/assets/models/${id}.glb`;
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, glb);

// --- manifest record --------------------------------------------------------------------
const today = new Date().toISOString().slice(0, 10);
const record = {
  id,
  kind: "model",
  title: recipe.title,
  file: { path: `/assets/models/${id}.glb`, bytes: glb.byteLength, sha256: sha256(glb) },
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
  modifications: (recipe.texturePatches ?? []).map((p: { why: string; texture: string }) => `${p.why} (texture ${p.texture})`),
  optimisation: {
    tool: "gltf-transform 4.5.1 (dedup, prune, textureCompress webp" + (useDraco ? ", draco edgebreaker" : "") + ")",
    geometry: useDraco ? "draco" : "none",
    textures: "webp",
    maxTextureSize: max,
    animated,
    originalBytes,
    optimisedBytes: glb.byteLength,
    validator: { version: report.validatorVersion, errors: report.issues.numErrors, warnings: report.issues.numWarnings },
  },
  inspection: { before, after },
  verifiedAt: today,
};
const manifestPath = "content/assets/manifest.json";
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : { version: 1, assets: [] };
manifest.assets = [...manifest.assets.filter((a: { id: string }) => a.id !== id), record].sort((a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id));
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

const kb = (n: number) => `${Math.round(n / 1024)} KB`;
console.log(
  `${id}: ${kb(originalBytes)} → ${kb(glb.byteLength)} | ${after.triangles} triangles | textures ${after.textures.map((t) => `${t.size?.join("x")} ${t.mimeType}`).join(", ")} | geometry ${useDraco ? "draco" : "none"} | validator ${report.issues.numErrors} errors, ${report.issues.numWarnings} warnings`,
);
