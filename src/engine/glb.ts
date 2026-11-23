/**
 * Reads the JSON chunk of a binary glTF (GLB) without loading anything else, so the stage can
 * check which extensions a model REQUIRES before trying to load it.
 */
export class GlbError extends Error {}

export interface GlbSummary {
  extensionsUsed: string[];
  extensionsRequired: string[];
}

export function readGlbSummary(buffer: ArrayBuffer): GlbSummary {
  if (buffer.byteLength < 20) throw new GlbError("File is too small to be a GLB.");
  const view = new DataView(buffer);
  if (view.getUint32(0, true) !== 0x46546c67) throw new GlbError("Not a GLB file (bad magic number)."); // "glTF"
  if (view.getUint32(4, true) !== 2) throw new GlbError(`Unsupported GLB version ${view.getUint32(4, true)}.`);
  const length = view.getUint32(8, true);
  if (length > buffer.byteLength) throw new GlbError("GLB is truncated.");
  const chunkLength = view.getUint32(12, true);
  if (view.getUint32(16, true) !== 0x4e4f534a) throw new GlbError("GLB's first chunk is not JSON."); // "JSON"
  if (20 + chunkLength > buffer.byteLength) throw new GlbError("GLB JSON chunk is truncated.");
  let json: { extensionsUsed?: unknown; extensionsRequired?: unknown };
  try {
    json = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 20, chunkLength)));
  } catch {
    throw new GlbError("GLB JSON chunk is not valid JSON.");
  }
  const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  return { extensionsUsed: list(json.extensionsUsed), extensionsRequired: list(json.extensionsRequired) };
}

/** Extensions our runtime can decode (GLTFLoader built-ins plus our Draco decoder). */
export const SUPPORTED_REQUIRED_EXTENSIONS: ReadonlySet<string> = new Set([
  "KHR_draco_mesh_compression",
  "EXT_texture_webp",
  "KHR_mesh_quantization",
  "KHR_texture_transform",
  "KHR_materials_emissive_strength",
  "KHR_materials_unlit",
]);

export function unsupportedRequired(summary: GlbSummary): string[] {
  return summary.extensionsRequired.filter((e) => !SUPPORTED_REQUIRED_EXTENSIONS.has(e));
}
