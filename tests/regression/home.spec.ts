import { expect, test } from "@playwright/test";

/**
 * Homepage: Monsoon Lane. With 3D, each module's painted sign gets a pointer target and choosing it
 * opens the module; without 3D (Still), the list of links is the way in. Keyboard users always
 * have the list.
 */

const errors: string[] = [];
test.beforeEach(async ({ page }) => {
  errors.length = 0;
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => localStorage.setItem("xplor9.introSeen", "true"));
});
test.afterEach(() => expect(errors, "uncaught page errors").toEqual([]));

test("with 3D, choosing a signboard walks to it and opens the module", async ({ page, browserName }) => {
  await page.goto("/");
  const webgl = await page.evaluate(() => !!document.createElement("canvas").getContext("webgl2"));
  test.skip(!webgl, `${browserName}: no WebGL in this headless browser`);
  await expect(page.getByTestId("stage")).toHaveAttribute("data-mode", "full");
  await expect(page.locator('[data-testid^="sign-"]')).toHaveCount(5, { timeout: 30_000 });
  await page.getByTestId("sign-games").click();
  // Headless browsers draw WebGL in software (about 1 frame a second in Chromium), so the walk and
  // the page change take far longer here than on a real device (see known issue ST-4).
  await expect(page).toHaveURL(/\/games$/, { timeout: 60_000 });
  await expect(page.getByRole("heading", { level: 1, name: "Games" })).toBeVisible();
});

test("without 3D, the list of places still works, from the keyboard too", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.setItem("xplor9.stage.quality", JSON.stringify("still")));
  await page.reload();
  await expect(page.getByTestId("stage")).toHaveAttribute("data-mode", "still");
  await expect(page.locator('[data-testid^="sign-"]')).toHaveCount(0);
  const places = page.getByRole("region", { name: "Where to tonight?" }).getByRole("link");
  await expect(places).toHaveCount(5);
  await places.filter({ hasText: "Reading Room" }).focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/reading$/);
});
