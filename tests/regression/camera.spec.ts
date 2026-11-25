import { expect, test, type Page } from "@playwright/test";

/** F3: shared camera modes (cinematic for visitors, free fly camera in developer mode). */

const errors: string[] = [];
test.beforeEach(({ page }) => {
  errors.length = 0;
  page.on("pageerror", (e) => errors.push(e.message));
});
test.afterEach(() => expect(errors, "uncaught page errors").toEqual([]));

const hasWebGL = (page: Page) =>
  page.evaluate(() => {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") ?? c.getContext("webgl"));
  });
type Hooks = { __xplor9CameraPosition?: () => number[] };
const position = (page: Page) => page.evaluate(() => (window as unknown as Hooks).__xplor9CameraPosition!());
const ready = (page: Page) => page.waitForFunction(() => typeof (window as unknown as Hooks).__xplor9CameraPosition === "function", null, { timeout: 30_000 });
const distance = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

async function open(page: Page, url: string, browserName: string) {
  await page.goto("/");
  test.skip(!(await hasWebGL(page)), `${browserName}: no WebGL in this headless browser`);
  // ?stage-stats: the scene (and its camera's key listeners) is lazy-loaded after the canvas, so
  // wait until it is actually drawing before pressing anything.
  await page.goto(`${url}&stage-stats`);
  await expect(page.getByTestId("stage")).toHaveAttribute("data-mode", "full");
  await ready(page);
  await expect.poll(async () => JSON.parse((await page.getByTestId("stage-diagnostics").getAttribute("data-stats")) ?? "{}").drawCalls ?? 0, { timeout: 30_000 }).toBeGreaterThan(5);
}

test("visitors: the room holds its start shot and movement keys do nothing", async ({ page, browserName }) => {
  await open(page, "/lab/living-room?stage-capture", browserName);
  const start = await position(page);
  expect(distance(start, [0, 1.4, 4.2])).toBeLessThan(0.01);
  await page.keyboard.down("KeyW");
  await page.waitForTimeout(600);
  await page.keyboard.up("KeyW");
  expect(distance(await position(page), start)).toBeLessThan(0.01);
});

test("visitors: the monsoon camera follows its cinematic path by itself", async ({ page, browserName }) => {
  await open(page, "/lab/monsoon?stage-capture", browserName);
  const a = await position(page);
  await expect.poll(async () => distance(await position(page), a), { timeout: 10_000 }).toBeGreaterThan(0.05);
});

test("developer mode: the free camera flies with W/E and stops when keys are released", async ({ page, browserName }) => {
  await open(page, "/lab/living-room?stage-debug&stage-capture", browserName);
  const start = await position(page);
  await page.keyboard.down("KeyW");
  await expect.poll(async () => start[2] - (await position(page))[2], { timeout: 5_000 }).toBeGreaterThan(0.3); // towards the room (-z)
  await page.keyboard.up("KeyW");
  const stopped = await position(page);
  await page.waitForTimeout(400);
  expect(distance(await position(page), stopped)).toBeLessThan(0.01);
  await page.keyboard.down("KeyE");
  await expect.poll(async () => (await position(page))[1] - stopped[1], { timeout: 5_000 }).toBeGreaterThan(0.3); // straight up
  await page.keyboard.up("KeyE");
});

test("developer mode: keys are released when the window loses focus (nothing sticks)", async ({ page, browserName }) => {
  await open(page, "/lab/living-room?stage-debug&stage-capture", browserName);
  await page.keyboard.down("KeyW");
  await page.waitForTimeout(200);
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  const after = await position(page);
  await page.waitForTimeout(400);
  expect(distance(await position(page), after)).toBeLessThan(0.01);
  await page.keyboard.up("KeyW");
});

test("developer mode: dragging over the page turns the view, but not when the drag starts on a control", async ({ page, browserName }) => {
  await open(page, "/lab/living-room?stage-debug&stage-capture", browserName);
  const dir = () => page.evaluate(() => (window as unknown as { __xplor9CameraDirection: () => number[] }).__xplor9CameraDirection());
  await page.waitForTimeout(300); // the camera takes its look from the start shot on the first frame
  const start = await dir();
  // The page's content covers the canvas: drags must still reach the camera (found in F3 review).
  await page.mouse.move(900, 600);
  await page.mouse.down();
  await page.mouse.move(700, 600, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => distance(await dir(), start)).toBeGreaterThan(0.3);
  const turned = await dir();
  const link = page.locator('body > header a[href="/reading"]');
  const box = (await link.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 300, box.y + 200, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(200);
  expect(distance(await dir(), turned)).toBeLessThan(0.01);
});
