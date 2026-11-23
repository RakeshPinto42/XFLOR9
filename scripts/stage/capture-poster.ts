/**
 * Renders a scene's Lite/Still image from the real scene.
 *
 * Usage: node scripts/stage/capture-poster.ts <base-url> <scene-path> <output.webp> [seconds]
 *   e.g. node scripts/stage/capture-poster.ts http://localhost:3009 /lab/living-room public/stage/posters/living-room.webp
 * The server must be running. Uses Playwright's Chromium with the GPU when available.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { chromium } from "@playwright/test";

const [base, path, out, seconds = "6"] = process.argv.slice(2);
if (!base || !path || !out) {
  console.error("Usage: capture-poster.ts <base-url> <scene-path> <output.webp> [seconds]");
  process.exit(1);
}

const browser = await chromium.launch({ args: ["--enable-gpu", "--ignore-gpu-blocklist", "--use-angle=default"] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
await page.addInitScript(() => localStorage.setItem("xplor9.stage.quality", JSON.stringify("full")));
await page.goto(`${base}${path}?stage-capture`);
await page.waitForFunction(() => typeof (window as unknown as { __xplor9CaptureScene?: unknown }).__xplor9CaptureScene === "function", null, { timeout: 60_000 });
await page.waitForTimeout(Number(seconds) * 1000); // assets loaded, animation settled
const dataUrl = await page.evaluate(() => (window as unknown as { __xplor9CaptureScene: (q?: number) => string }).__xplor9CaptureScene(0.86));
if (!dataUrl.startsWith("data:image/webp")) throw new Error(`Browser did not produce WebP (${dataUrl.slice(0, 30)})`);
const bytes = Buffer.from(dataUrl.split(",")[1], "base64");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log(`Wrote ${out} (${Math.round(bytes.length / 1024)} KB)`);
await browser.close();
