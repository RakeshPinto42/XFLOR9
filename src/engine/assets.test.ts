import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import raw from "../../content/assets/manifest.json";
import { DRACO_FILES } from "../../scripts/assets/sync-draco";
import { AssetManifestError, parseAssetManifest, type AssetRecord } from "./assets";
import { GlbError, readGlbSummary, unsupportedRequired } from "./glb";

const assets = parseAssetManifest(raw);
const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");
const clone = () => JSON.parse(JSON.stringify(raw)) as { version: number; assets: AssetRecord[] };
const problemsOf = (mutate: (a: AssetRecord) => void) => {
  const c = clone();
  mutate(c.assets[0]);
  try {
    parseAssetManifest(c);
    return [];
  } catch (e) {
    return (e as AssetManifestError).problems;
  }
};

/** A minimal GLB with the given JSON. */
function glb(json: object): ArrayBuffer {
  let text = JSON.stringify(json);
  while (text.length % 4) text += " ";
  const body = new TextEncoder().encode(text);
  const buf = new ArrayBuffer(20 + body.length);
  const v = new DataView(buf);
  v.setUint32(0, 0x46546c67, true);
  v.setUint32(4, 2, true);
  v.setUint32(8, buf.byteLength, true);
  v.setUint32(12, body.length, true);
  v.setUint32(16, 0x4e4f534a, true);
  new Uint8Array(buf, 20).set(body);
  return buf;
}

describe("the real asset manifest", () => {
  it("has the F1 assets", () => expect(assets.map((a) => a.id).sort()).toEqual(["brass-vase-03", "monobloc-chair-01", "television-01"]));

  it.each(assets.map((a) => [a.id, a]))("%s: the file matches its record and needs only supported extensions", (_, a) => {
    const rec = a as AssetRecord;
    const bytes = readFileSync(`public${rec.file.path}`);
    expect(statSync(`public${rec.file.path}`).size).toBe(rec.file.bytes);
    expect(sha(bytes)).toBe(rec.file.sha256);
    const summary = readGlbSummary(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    expect(unsupportedRequired(summary)).toEqual([]);
    expect(summary.extensionsUsed).toContain("EXT_texture_webp");
    for (const t of rec.inspection.after.textures) expect(t.mimeType).toBe("image/webp");
  });

  it("brand removal is recorded on the television", () => {
    const tv = assets.find((a) => a.id === "television-01")!;
    expect(tv.modifications.join(" ")).toMatch(/VTECH/);
  });
});

describe("manifest rules", () => {
  it("rejects unknown licences, missing authors and validator errors", () => {
    expect(problemsOf((a) => (a.licence.spdx = "CC-BY-NC-4.0" as never))).toEqual(expect.arrayContaining([expect.stringMatching(/allowed licence/)]));
    expect(problemsOf((a) => (a.authors = []))).toEqual(expect.arrayContaining([expect.stringMatching(/authors/)]));
    expect(problemsOf((a) => (a.optimisation.validator.errors = 2))).toEqual(expect.arrayContaining([expect.stringMatching(/0 errors/)]));
  });
  it("rejects Draco on animated assets and any change in triangles or animation data", () => {
    expect(problemsOf((a) => (a.optimisation.animated = true))).toEqual(expect.arrayContaining([expect.stringMatching(/animated assets/)]));
    expect(problemsOf((a) => (a.inspection.after.triangles -= 10))).toEqual(expect.arrayContaining([expect.stringMatching(/triangle count/)]));
    expect(problemsOf((a) => (a.inspection.after.animations += 1))).toEqual(expect.arrayContaining([expect.stringMatching(/animation data/)]));
  });
});

describe("GLB preflight", () => {
  it("reads required extensions", () => {
    const s = readGlbSummary(glb({ asset: { version: "2.0" }, extensionsUsed: ["EXT_meshopt_compression"], extensionsRequired: ["EXT_meshopt_compression"] }));
    expect(unsupportedRequired(s)).toEqual(["EXT_meshopt_compression"]);
    expect(unsupportedRequired(readGlbSummary(glb({ asset: { version: "2.0" }, extensionsRequired: ["KHR_draco_mesh_compression"] })))).toEqual([]);
  });
  it.each([
    ["too small", new ArrayBuffer(8)],
    ["not a GLB", new TextEncoder().encode("<html>not a model</html>").buffer as ArrayBuffer],
  ])("rejects %s", (_, b) => expect(() => readGlbSummary(b)).toThrow(GlbError));
});

describe("Draco decoder", () => {
  it.each(DRACO_FILES)("public/draco/%s matches the installed three.js", (f) => {
    expect(sha(readFileSync(`public/draco/${f}`))).toBe(sha(readFileSync(`node_modules/three/examples/jsm/libs/draco/gltf/${f}`)));
  });
});
