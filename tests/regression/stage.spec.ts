import { expect, test, type Page } from "@playwright/test";

/** F1: the shared 3D stage (src/stage) and its quality modes, against a normal production build. */

const LAB = "/lab/living-room";
const errors: string[] = [];
test.beforeEach(({ page }) => {
  errors.length = 0;
  page.on("pageerror", (e) => errors.push(e.message));
});
test.afterEach(() => expect(errors, "uncaught page errors").toEqual([]));

const stage = (page: Page) => page.getByTestId("stage");
const stats = async (page: Page) => JSON.parse((await page.getByTestId("stage-diagnostics").getAttribute("data-stats")) ?? "{}");
const hasWebGL = (page: Page) =>
  page.evaluate(() => {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") ?? c.getContext("webgl"));
  });

test("Full mode draws the scene (real pixels), with diagnostics", async ({ page, browserName }) => {
  await page.goto("/");
  test.skip(!(await hasWebGL(page)), `${browserName}: no WebGL in this headless browser (fallback covered below)`);
  await page.goto(`${LAB}?stage-debug&stage-capture`);
  await expect(stage(page)).toHaveAttribute("data-mode", "full");
  await expect(page.locator('[data-testid="stage"] canvas')).toHaveCount(1);
  await page.waitForFunction(() => typeof (window as unknown as { __xplor9CaptureScene?: unknown }).__xplor9CaptureScene === "function", null, { timeout: 30_000 });
  await expect.poll(async () => (await stats(page)).drawCalls, { timeout: 15_000 }).toBeGreaterThan(5);
  // Decode a rendered frame and count distinct colours: a blank or failed render has very few.
  const colours = await page.evaluate(async () => {
    const url = (window as unknown as { __xplor9CaptureScene: (q?: number) => string }).__xplor9CaptureScene(0.9);
    const img = new Image();
    img.src = url;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = 160;
    c.height = 90;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(img, 0, 0, 160, 90);
    const d = ctx.getImageData(0, 0, 160, 90).data;
    const set = new Set<number>();
    for (let i = 0; i < d.length; i += 4) set.add((d[i] >> 3) * 1024 + (d[i + 1] >> 3) * 32 + (d[i + 2] >> 3));
    return set.size;
  });
  expect(colours).toBeGreaterThan(40);
});

test("reduced motion shows Still (no motion, no 3D)", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(LAB);
  await expect(stage(page)).toHaveAttribute("data-mode", "still");
  await expect(page.getByTestId("stage-poster")).toBeVisible();
  await expect(page.getByTestId("stage-lite-motion")).toHaveCount(0);
  await expect(page.locator('[data-testid="stage"] canvas')).toHaveCount(0);
  await expect(page.getByTestId("stage-reason")).toContainText("reduced motion");
});

test("without WebGL the scene falls back to Lite, with a reason", async ({ page }) => {
  await page.addInitScript(() => {
    const orig = HTMLCanvasElement.prototype.getContext as (this: HTMLCanvasElement, ...a: unknown[]) => unknown;
    (HTMLCanvasElement.prototype as unknown as { getContext: (...a: unknown[]) => unknown }).getContext = function (
      this: HTMLCanvasElement,
      type: unknown,
      ...rest: unknown[]
    ) {
      if (typeof type === "string" && /webgl/i.test(type)) return null;
      return orig.call(this, type, ...rest);
    };
  });
  await page.goto(LAB);
  await expect(stage(page)).toHaveAttribute("data-mode", "lite");
  await expect(page.getByTestId("stage-lite-motion")).toHaveCount(1);
  await expect(page.getByTestId("stage-reason")).toContainText("WebGL");
});

test("the visitor's quality choice is remembered", async ({ page }) => {
  await page.goto(LAB);
  await page.getByRole("group", { name: "Scene quality" }).getByText("Still", { exact: true }).click();
  await expect(stage(page)).toHaveAttribute("data-mode", "still");
  await page.reload();
  await expect(stage(page)).toHaveAttribute("data-mode", "still");
  await expect(page.getByTestId("stage-reason")).toContainText("You chose Still");
  await page.getByRole("group", { name: "Scene quality" }).getByText("Automatic", { exact: true }).click();
  await expect(page.getByTestId("stage-reason")).not.toContainText("You chose");
});

test("pages without a scene download no 3D code", async ({ page }) => {
  const scripts: string[] = [];
  page.on("response", async (r) => {
    if (r.request().resourceType() === "script" && r.ok()) scripts.push(await r.text().catch(() => ""));
  });
  for (const path of ["/", "/reading", "/radio", "/reading/the-time-machine"]) {
    await page.goto(path, { waitUntil: "networkidle" });
  }
  expect(scripts.length).toBeGreaterThan(0);
  expect(scripts.filter((s) => s.includes("WebGLRenderer")).length).toBe(0);
  await expect(page.locator('[data-testid="stage"]')).toHaveCount(0);
  // Positive control: the scene page does load three.js.
  await page.goto(LAB, { waitUntil: "networkidle" });
  await expect.poll(() => scripts.some((s) => s.includes("WebGLRenderer")), { timeout: 15_000 }).toBe(true);
});

test("leaving and returning: one renderer, no growth in GPU resources, header restored", async ({ page, browserName }) => {
  await page.goto("/");
  test.skip(!(await hasWebGL(page)), `${browserName}: no WebGL in this headless browser`);
  await page.goto(`${LAB}?stage-debug`, { waitUntil: "networkidle" });
  await expect.poll(async () => (await stats(page)).geometries, { timeout: 20_000 }).toBeGreaterThan(0);
  await page.waitForTimeout(1_500);
  const first = await stats(page);
  for (let i = 0; i < 3; i++) {
    await page.locator('body > header a[href="/reading"]').click(); // client-side navigation
    await expect(page).toHaveURL(/\/reading$/);
    await expect(page.locator('[data-testid="stage"]')).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.stageActive ?? null)).toBeNull();
    await page.goBack();
    await expect(stage(page)).toHaveAttribute("data-mode", "full");
  }
  await expect(page.locator("canvas")).toHaveCount(1);
  await page.waitForTimeout(1_500);
  const last = await stats(page);
  expect(last.geometries).toBe(first.geometries);
  expect(last.textures).toBe(first.textures);
});

test("adaptive quality steps down under load, then switches to Lite", async ({ page, browserName }) => {
  await page.goto("/");
  test.skip(!(await hasWebGL(page)), `${browserName}: no WebGL in this headless browser`);
  test.setTimeout(60_000);
  // Record every quality level the diagnostics report, from the very first frame.
  await page.addInitScript(() => {
    const seen: string[] = [];
    (window as unknown as { __levels: string[] }).__levels = seen;
    new MutationObserver(() => {
      const el = document.querySelector('[data-testid="stage-diagnostics"]');
      const level = el ? (JSON.parse(el.getAttribute("data-stats") ?? "{}").level as string) : null;
      if (level && level !== "-" && seen[seen.length - 1] !== level) seen.push(level);
    }).observe(document, { subtree: true, attributes: true, attributeFilter: ["data-stats"], childList: true });
  });
  // Adds 40 ms to every measured frame (simulated slow device).
  await page.goto(`${LAB}?stage-debug&stage-simulate-slow=40`);
  await expect(stage(page)).toHaveAttribute("data-mode", "lite", { timeout: 40_000 });
  // It stepped down through the levels in order before giving up on Full.
  const levels = await page.evaluate(() => (window as unknown as { __levels: string[] }).__levels);
  expect(levels.slice(0, 2)).toEqual(["high", "medium"]);
  expect(levels).toContain("minimal");
  await expect(page.getByTestId("stage-reason")).toContainText("running slowly");
});

test("if the GPU context is lost, the scene falls back to Lite", async ({ page, browserName }) => {
  await page.goto("/");
  test.skip(!(await hasWebGL(page)), `${browserName}: no WebGL in this headless browser`);
  await page.goto(LAB);
  await expect(page.locator('[data-testid="stage"] canvas')).toHaveCount(1);
  await page.waitForTimeout(1_000);
  await page.evaluate(() => {
    const c = document.querySelector<HTMLCanvasElement>('[data-testid="stage"] canvas')!;
    const gl = (c.getContext("webgl2") ?? c.getContext("webgl")) as WebGLRenderingContext;
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  });
  await expect(stage(page)).toHaveAttribute("data-mode", "lite");
  await expect(page.getByTestId("stage-reason")).toContainText("graphics card");
});
