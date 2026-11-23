/**
 * Measures a scene's real performance on THIS machine, in a visible Chrome window (real GPU).
 *
 *   node scripts/stage/measure.ts <base-url> <scene-path> [seconds=40] [width=1920] [height=1080]
 *   e.g. node scripts/stage/measure.ts http://localhost:3000 /lab/monsoon
 *
 * Use a production build (`npm run build && npm start`). Reports the GPU the browser actually used
 * (laptops with two GPUs often run browsers on the integrated one), frame rate (median, 5th
 * percentile), frame time, draw calls, triangles, geometries, textures and the quality level the
 * adaptive system settled on. Prints JSON plus a readable summary.
 */
import { chromium } from "@playwright/test";

const [base, path, seconds = "40", width = "1920", height = "1080"] = process.argv.slice(2);
if (!base || !path) {
  console.error("Usage: measure.ts <base-url> <scene-path> [seconds] [width] [height]");
  process.exit(1);
}
const browser = await chromium.launch({ headless: false, args: ["--ignore-gpu-blocklist", "--enable-gpu-rasterization", "--force-high-performance-gpu"] });
const page = await browser.newPage({ viewport: { width: Number(width), height: Number(height) }, deviceScaleFactor: 1 });
await page.addInitScript(() => localStorage.setItem("xplor9.stage.quality", JSON.stringify("auto")));
await page.goto(`${base}${path}?stage-stats`);
const gpu = await page.evaluate(() => {
  const c = document.createElement("canvas");
  const gl = (c.getContext("webgl2") ?? c.getContext("webgl")) as WebGLRenderingContext | null;
  const ext = gl?.getExtension("WEBGL_debug_renderer_info");
  return ext ? String(gl!.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : "unknown";
});
// Let assets load and the adaptive system warm up before sampling.
await page.waitForFunction(() => document.querySelector('[data-testid="stage"]')?.getAttribute("data-mode") !== null, null, { timeout: 60_000 });
await page.waitForTimeout(8_000);
const samples: { fps: number; frameMs: number; drawCalls: number; triangles: number; geometries: number; textures: number; level: string; mode: string }[] = [];
const end = Date.now() + Number(seconds) * 1000;
while (Date.now() < end) {
  const s = await page.getByTestId("stage-diagnostics").getAttribute("data-stats").catch(() => null);
  if (s) samples.push(JSON.parse(s));
  await page.waitForTimeout(500);
}
const heap = await page.evaluate(() => (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? null);
await browser.close();

const fps = samples.map((s) => s.fps).filter((n) => n > 0).sort((a, b) => a - b);
const pct = (p: number) => fps[Math.min(fps.length - 1, Math.floor(p * fps.length))];
const last = samples[samples.length - 1];
const result = {
  scene: path,
  resolution: `${width}x${height}`,
  gpu,
  samples: fps.length,
  fpsMedian: pct(0.5),
  fpsP5: pct(0.05),
  frameMsMedian: samples.map((s) => s.frameMs).sort((a, b) => a - b)[Math.floor(samples.length / 2)],
  drawCalls: last?.drawCalls,
  triangles: last?.triangles,
  geometries: last?.geometries,
  textures: last?.textures,
  finalLevel: last?.level,
  finalMode: last?.mode,
  levelsSeen: [...new Set(samples.map((s) => s.level))],
  jsHeapMB: heap ? Math.round(heap / 1048576) : null,
};
console.log(JSON.stringify(result, null, 2));
