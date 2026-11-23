/**
 * Copies three.js's Draco decoder (WebAssembly build) into public/draco/, so it is served from
 * our own origin and always matches the installed three version. Run after upgrading three:
 *   node scripts/assets/sync-draco.ts
 * src/engine/assets.test.ts fails if the copies drift from node_modules.
 */
import { copyFileSync, mkdirSync } from "node:fs";

export const DRACO_FILES = ["draco_decoder.wasm", "draco_wasm_wrapper.js"];
const from = "node_modules/three/examples/jsm/libs/draco/gltf";

if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/assets/sync-draco.ts")) {
  mkdirSync("public/draco", { recursive: true });
  for (const f of DRACO_FILES) copyFileSync(`${from}/${f}`, `public/draco/${f}`);
  console.log(`Copied ${DRACO_FILES.join(", ")} to public/draco/`);
}
