import { expect, test, type Page } from "@playwright/test";

/**
 * Sound on the desktop: nothing plays (no audio context) before the visitor's first click, the
 * welcome-screen click starts it, the tray volume and mute are remembered, and the radio follows
 * the overall volume (master × music) without changing its own setting.
 */

const errors: string[] = [];
test.beforeEach(async ({ page }) => {
  errors.length = 0;
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error" && /audio|sound/i.test(m.text())) errors.push(m.text());
  });
  await page.addInitScript(() => {
    const w = window as unknown as { __audio: { contexts: AudioContext[]; volumes: number[] } };
    w.__audio = { contexts: [], volumes: [] };
    const Original = window.AudioContext;
    if (Original)
      window.AudioContext = class extends Original {
        constructor(...args: ConstructorParameters<typeof AudioContext>) {
          super(...args);
          w.__audio.contexts.push(this);
        }
      };
    const desc = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, "volume")!;
    Object.defineProperty(HTMLMediaElement.prototype, "volume", {
      configurable: true,
      get() {
        return desc.get!.call(this);
      },
      set(v: number) {
        w.__audio.volumes.push(v);
        desc.set!.call(this, v);
      },
    });
  });
});
test.afterEach(() => expect(errors).toEqual([]));

const audio = (page: Page) =>
  page.evaluate(() => {
    const a = (window as unknown as { __audio: { contexts: AudioContext[]; volumes: number[] } }).__audio;
    return { contexts: a.contexts.length, states: a.contexts.map((c) => c.state), lastVolume: a.volumes.at(-1) ?? null };
  });
const hasWebAudio = (page: Page) => page.evaluate(() => "AudioContext" in window || "webkitAudioContext" in window);

test("silent until the first click; the welcome screen's click starts sound", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("boot")).toBeVisible();
  await page.waitForTimeout(500);
  expect((await audio(page)).contexts).toBe(0);
  await page.keyboard.press("Enter"); // skips the start-up
  await page.getByRole("button", { name: "Guest" }).click();
  await expect(page.getByRole("toolbar", { name: "Taskbar" })).toBeVisible();
  test.skip(!(await hasWebAudio(page)), "no Web Audio in this browser");
  await expect.poll(async () => (await audio(page)).states.at(-1)).toBe("running");
});

test("muted: the welcome click makes no sound at all", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("xplor9.sound.prefs", JSON.stringify({ soundOn: false })));
  await page.goto("/");
  await expect(page.getByTestId("boot")).toBeVisible();
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Guest" }).click();
  await expect(page.getByRole("toolbar", { name: "Taskbar" })).toBeVisible();
  await page.waitForTimeout(500);
  expect((await audio(page)).contexts).toBe(0);
});

test("tray volume: slider and mute are remembered, and Escape closes the panel", async ({ page }) => {
  await page.goto("/?open=notepad");
  const tray = page.getByTestId("tray-volume");
  await tray.click();
  const panel = page.getByRole("dialog", { name: /Volume/ });
  await panel.getByRole("slider", { name: "Volume" }).fill("40");
  await panel.getByRole("checkbox", { name: "Mute" }).check();
  await expect(tray).toHaveAccessibleName("Volume (muted)");
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("xplor9.sound.prefs")!));
  expect(saved).toMatchObject({ master: 0.4, soundOn: false });
  await page.reload();
  await expect(page.getByTestId("tray-volume")).toHaveAccessibleName("Volume (muted)");
});

test("the radio follows overall × music volume without changing its own setting", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("xplor9.sound.prefs", JSON.stringify({ soundOn: true, master: 0.5, music: 0.5 })));
  await page.goto("/radio");
  await expect(page.locator('[data-app="radio"]')).toBeVisible();
  // The radio element's volume = the player's own volume (default 0.8) × master 0.5 × music 0.5.
  await expect.poll(async () => (await audio(page)).lastVolume).toBeCloseTo(0.8 * 0.25, 5);
  expect(await page.evaluate(() => localStorage.getItem("xplor9.playbackPrefs"))).toBeNull(); // own setting untouched
});
