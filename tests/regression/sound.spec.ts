import { expect, test, type Page } from "@playwright/test";

/**
 * A1 — the shared audio system: silent first visit, keyboard-operable sound switch, remembered
 * settings, audio only after a gesture, and the radio following the overall/music volumes.
 */

const errors: string[] = [];
test.beforeEach(async ({ page }) => {
  errors.length = 0;
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error" && /audio|sound/i.test(m.text())) errors.push(m.text());
  });
  await page.addInitScript(() => {
    localStorage.setItem("xplor9.introSeen", "true");
    const w = window as unknown as { __audio: { contexts: AudioContext[]; volumes: number[] } };
    w.__audio = { contexts: [], volumes: [] };
    // Count audio contexts, and record what the radio element's volume is set to.
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

const audio = (page: Page) => page.evaluate(() => {
  const a = (window as unknown as { __audio: { contexts: AudioContext[]; volumes: number[] } }).__audio;
  return { contexts: a.contexts.length, states: a.contexts.map((c) => c.state), lastVolume: a.volumes.at(-1) ?? null };
});
const hasWebAudio = (page: Page) => page.evaluate(() => "AudioContext" in window || "webkitAudioContext" in window);
const soundSwitch = (page: Page) => page.getByTestId("sound-control").getByRole("button", { name: /^Sound (on|off)$/ });

test("first visit is silent: no audio starts, even after clicking around", async ({ page }) => {
  await page.goto("/");
  await expect(soundSwitch(page)).toHaveAttribute("aria-pressed", "false");
  await expect(soundSwitch(page)).toHaveText("Sound off");
  await page.locator("main").click();
  await page.keyboard.press("Tab");
  expect((await audio(page)).contexts).toBe(0);
});

test("the sound switch works from the keyboard and starts audio only then", async ({ page }) => {
  await page.goto("/");
  await soundSwitch(page).focus();
  await page.keyboard.press("Enter");
  await expect(soundSwitch(page)).toHaveAttribute("aria-pressed", "true");
  await expect(soundSwitch(page)).toHaveText("Sound on");
  if (await hasWebAudio(page)) await expect.poll(async () => (await audio(page)).states).toEqual(["running"]);
  else {
    // Some browsers (e.g. WebKit test builds on Windows) have no Web Audio: say so, don't fail.
    await page.getByRole("button", { name: "Sound settings" }).click();
    await expect(page.getByTestId("sound-status")).toHaveText("This browser can't play the world's sounds. The radio still works.");
    await soundSwitch(page).focus();
  }
  await page.keyboard.press("Space"); // off again
  await expect(soundSwitch(page)).toHaveAttribute("aria-pressed", "false");
  if (await hasWebAudio(page)) await expect.poll(async () => (await audio(page)).states).toEqual(["suspended"]);
});

test("settings are remembered; remembered sound still waits for a gesture", async ({ page }) => {
  await page.goto("/");
  await soundSwitch(page).click();
  await page.getByRole("button", { name: "Sound settings" }).click();
  await page.getByLabel("Overall volume").fill("40");
  await page.getByLabel("Reduce sudden sounds (softer thunder)").check();
  await page.reload();
  await expect(soundSwitch(page)).toHaveAttribute("aria-pressed", "true");
  expect((await audio(page)).contexts).toBe(0); // nothing before the visitor interacts
  await page.getByRole("button", { name: "Sound settings" }).click(); // any gesture unlocks
  await expect(page.getByLabel("Overall volume")).toHaveValue("40");
  await expect(page.getByLabel("Reduce sudden sounds (softer thunder)")).toBeChecked();
  if (await hasWebAudio(page)) {
    await expect.poll(async () => (await audio(page)).states).toEqual(["running"]);
    await expect(page.getByTestId("sound-status")).toHaveText("World sounds are on.");
  } else await expect(page.getByTestId("sound-status")).toHaveText("This browser can't play the world's sounds. The radio still works.");
});

test("the radio follows overall × music volume without changing its own setting", async ({ page }) => {
  await page.goto("/radio");
  await page.getByRole("button", { name: "Sound settings" }).click();
  await page.getByLabel("Overall volume").fill("50");
  await page.getByLabel("Music and radio").fill("50");
  // Radio's own volume defaults to 80%: 0.8 × 0.5 × 0.5.
  await expect.poll(async () => (await audio(page)).lastVolume).toBeCloseTo(0.2, 3);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("xplor9.playbackPrefs") ?? "null"));
  expect(saved?.volume ?? 0.8).toBe(0.8);
  // Turning world sound on or off never mutes the radio: it has its own mute.
  await soundSwitch(page).click();
  await soundSwitch(page).click();
  await expect(page.getByTestId("sound-status")).toHaveText("World sounds are off. The radio has its own play and mute buttons.");
});

test("the settings panel closes with Escape and returns focus", async ({ page }) => {
  await page.goto("/");
  const settings = page.getByRole("button", { name: "Sound settings" });
  await settings.click();
  await expect(page.getByRole("region", { name: "Sound settings" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("region", { name: "Sound settings" })).toHaveCount(0);
  await expect(settings).toBeFocused();
});
