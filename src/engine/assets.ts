/**
 * The 3D asset manifest (content/assets/manifest.json): every model the site serves, with its
 * source, licence, authors, modifications, optimisation settings and before/after inspection.
 * Written by scripts/assets/build-asset.ts; validated here (and in tests) before use.
 */
export const ALLOWED_LICENCES = ["CC0-1.0", "XPLOR9-original"] as const;
export type Licence = (typeof ALLOWED_LICENCES)[number];

export interface Inspection {
  bytes: number;
  triangles: number;
  textures: { name: string; mimeType: string; size: [number, number] | null; bytes: number }[];
  animations: number;
  skins: number;
  morphTargets: number;
  extensionsUsed: string[];
}

interface CommonRecord {
  id: string;
  title: string;
  licence: { spdx: Licence; url: string };
  authors: string[];
  source: { name: string; url: string; retrievedFrom: string; retrievedAt: string; files: { name: string; bytes: number; md5: string }[] };
  modifications: string[];
  verifiedAt: string;
}

export interface ModelRecord extends CommonRecord {
  kind: "model";
  file: { path: string; bytes: number; sha256: string };
  optimisation: {
    tool: string;
    geometry: "draco" | "none";
    textures: string;
    maxTextureSize: number;
    animated: boolean;
    originalBytes: number;
    optimisedBytes: number;
    validator: { version: string; errors: number; warnings: number };
  };
  inspection: { before: Inspection; after: Inspection };
}

export type TextureMap = "diff" | "nor_gl" | "arm";

export interface TextureRecord extends CommonRecord {
  kind: "texture";
  use: string;
  /** Real-world width the texture covers (metres): used for correct tiling. */
  realWorldMetres: number;
  maps: { map: TextureMap; path: string; bytes: number; sha256: string; size: [number, number] }[];
  optimisation: { tool: string; textures: "webp"; quality: number; originalBytes: number; optimisedBytes: number };
}

export type AssetRecord = ModelRecord | TextureRecord;

export class AssetManifestError extends Error {
  constructor(readonly problems: string[]) {
    super(`Asset manifest is invalid:\n- ${problems.join("\n- ")}`);
  }
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function parseAssetManifest(raw: unknown): AssetRecord[] {
  const root = raw as { version?: unknown; assets?: unknown };
  const problems: string[] = [];
  if (root?.version !== 1) problems.push("version must be 1");
  if (!Array.isArray(root?.assets)) throw new AssetManifestError([...problems, "assets must be a list"]);
  const seen = new Set<string>();
  for (const [i, a] of (root.assets as AssetRecord[]).entries()) {
    const at = `asset[${i}]${typeof a?.id === "string" ? ` (${a.id})` : ""}`;
    const need = (ok: unknown, msg: string) => ok || problems.push(`${at}: ${msg}`);
    need(typeof a?.id === "string" && SLUG.test(a.id), "id must be a lowercase slug");
    need(!seen.has(a?.id), "duplicate id");
    seen.add(a?.id);
    need(a?.kind === "model" || a?.kind === "texture", "kind must be model or texture");
    need(typeof a?.title === "string" && a.title.trim(), "title is required");
    need((ALLOWED_LICENCES as readonly string[]).includes(a?.licence?.spdx) && /^https:\/\//.test(a?.licence?.url ?? ""), "licence must be an allowed licence with a URL");
    need(Array.isArray(a?.authors) && (a.licence?.spdx === "XPLOR9-original" || a.authors.length > 0), "authors are required for third-party assets");
    need(/^https:\/\//.test(a?.source?.url ?? "") && DATE.test(a?.source?.retrievedAt ?? "") && Array.isArray(a?.source?.files) && a.source.files.length > 0, "source url, retrieval date and source files are required");
    need(Array.isArray(a?.modifications), "modifications must be a list");
    need(DATE.test(a?.verifiedAt ?? ""), "verifiedAt must be YYYY-MM-DD");
    if (a?.kind === "model") checkModel(a, need);
    else if (a?.kind === "texture") checkTexture(a, need);
  }
  if (problems.length) throw new AssetManifestError(problems);
  return root.assets as AssetRecord[];
}

type Need = (ok: unknown, msg: string) => unknown;
const SHA = /^[0-9a-f]{64}$/;

function checkModel(a: ModelRecord, need: Need) {
  need(a.file?.path === `/assets/models/${a.id}.glb`, "file path must be /assets/models/<id>.glb");
  need(Number.isInteger(a.file?.bytes) && a.file.bytes > 0 && SHA.test(a.file?.sha256 ?? ""), "file bytes and sha256 are required");
  const o = a.optimisation;
  need(o && (o.geometry === "draco" || o.geometry === "none") && typeof o.animated === "boolean", "optimisation record is required");
  need(o?.validator?.errors === 0, "the glTF validator must report 0 errors");
  // Animated assets keep uncompressed geometry unless explicitly verified (recipe flag).
  need(!(o?.animated && o?.geometry === "draco"), "animated assets must not use Draco without verification");
  const b = a.inspection?.before;
  const f = a.inspection?.after;
  need(b && f && b.triangles === f.triangles, "optimisation must not change the triangle count");
  need(b && f && b.animations === f.animations && b.skins === f.skins && b.morphTargets === f.morphTargets, "animation data must be preserved");
}

function checkTexture(a: TextureRecord, need: Need) {
  need(typeof a.realWorldMetres === "number" && a.realWorldMetres > 0, "realWorldMetres is required");
  need(Array.isArray(a.maps) && a.maps.length > 0, "maps are required");
  for (const m of a.maps ?? []) {
    need(["diff", "nor_gl", "arm"].includes(m.map) && m.path === `/assets/textures/${a.id}/${m.map}.webp`, `map ${m.map}: path must be /assets/textures/<id>/<map>.webp`);
    need(Number.isInteger(m.bytes) && m.bytes > 0 && SHA.test(m.sha256 ?? ""), `map ${m.map}: bytes and sha256 are required`);
  }
  need(a.optimisation?.textures === "webp", "texture maps must be WebP");
}
