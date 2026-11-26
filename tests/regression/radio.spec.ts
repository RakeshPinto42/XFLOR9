import { expect, test, type Page, type Route } from "@playwright/test";
import { canPlayAudio } from "./support/media";

/**
 * D2 Radio ("XPLOR9 Tuner"): the station table, playing a station (into the tray), memory presets
 * stored and recalled across visits, sorting, browsing languages, favourites, and the knob from the
 * keyboard. The station directory and the streams are stand-ins (no outside sites).
 */

const errors: string[] = [];
test.beforeEach(({ page }) => {
  errors.length = 0;
  page.on("pageerror", (e) => errors.push(e.message));
});
test.afterEach(() => expect(errors, "uncaught page errors").toEqual([]));

const station = (n: number, name: string, bitrate: number, language = "hindi") => ({
  id: `0000000${n}-0000-4000-8000-00000000000${n}`,
  name,
  streamUrl: `https://stream${n}.radio.test/live`,
  homepage: null,
  favicon: null,
  country: "India",
  countryCode: "IN",
  languages: [language],
  tags: [],
  format: "mp3",
  codecLabel: "MP3",
  bitrate,
  votes: 10 - n,
  clicks: 1,
  lastCheckedAt: "2026-11-20T00:00:00Z",
  availability: { status: "available" },
});
const STATIONS = [station(1, "Akashvani Classics", 64), station(2, "Bollywood Evergreen", 128), station(3, "Carnatic Morning", 96, "tamil")];

/** A WAV tone: long enough to keep "playing" through a test. */
function wav(seconds: number): Buffer {
  const rate = 8000;
  const n = Math.round(rate * seconds);
  const b = Buffer.alloc(44 + n * 2);
  b.write("RIFF", 0);
  b.writeUInt32LE(36 + n * 2, 4);
  b.write("WAVEfmt ", 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write("data", 36);
  b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin((i / rate) * 2 * Math.PI * 330) * 4000), 44 + i * 2);
  return b;
}

async function stubRadio(page: Page) {
  const queries: URLSearchParams[] = [];
  await page.route("**/api/radio/stations?*", (route: Route) => {
    const params = new URL(route.request().url()).searchParams;
    queries.push(params);
    const language = params.get("language");
    const list = STATIONS.filter((s) => !language || s.languages.includes(language));
    return route.fulfill({ json: { stations: list, offset: 0, limit: 30, hasMore: false } });
  });
  await page.route("**/api/radio/facets/**", (route) => route.fulfill({ json: { facets: [] } }));
  await page.route("**/api/radio/stations/*/click", (route) => route.fulfill({ status: 204, body: "" }));
  const tone = wav(60);
  await page.route(/https:\/\/stream\d\.radio\.test\/live/, (route) => route.fulfill({ status: 200, contentType: "audio/wav", body: tone }));
  return queries;
}

async function openRadio(page: Page) {
  await page.addInitScript(() => sessionStorage.setItem("xplor9.session", "in"));
  await page.goto("/?open=radio");
  await expect(page.getByTestId("radio-app")).toBeVisible({ timeout: 30_000 });
}
const table = (page: Page) => page.getByRole("region", { name: "Stations" }).getByRole("table");

test("plays a station from the table; the tuner and tray follow; Pause stops it", async ({ page }) => {
  await stubRadio(page);
  await openRadio(page);
  test.skip(!(await canPlayAudio(page)), "this browser build can't play audio (Playwright WebKit on Windows)");
  await expect(table(page).getByRole("row")).toHaveCount(4); // header + 3
  await page.getByRole("button", { name: "Play Bollywood Evergreen" }).click();
  await expect(page.getByRole("region", { name: "Radio tuner" })).toContainText("Bollywood Evergreen");
  await expect(page.getByTestId("tray-now-playing")).toBeVisible();
  await expect(page.locator(".rt-lamp")).toHaveAttribute("data-on", "true", { timeout: 15_000 });
  await page.getByRole("button", { name: "Pause Bollywood Evergreen" }).first().click();
  await expect(page.locator(".rt-lamp")).not.toHaveAttribute("data-on", "true");
});

test("memory presets store the selected station, recall it, and are remembered", async ({ page }) => {
  await stubRadio(page);
  await openRadio(page);
  await table(page).getByRole("row", { name: /Carnatic Morning/ }).click();
  await page.getByRole("button", { name: "Preset 1: empty. Press to store Carnatic Morning" }).click();
  await table(page).getByRole("row", { name: /Akashvani Classics/ }).click();
  await page.getByRole("button", { name: "Store", exact: true }).click();
  await page.getByRole("button", { name: "Store Akashvani Classics in preset 4" }).click();
  await page.goto("/?open=radio"); // a new visit
  const presets = page.getByRole("group", { name: "Memory presets" });
  await expect(presets.getByRole("button", { name: "Preset 1: Carnatic Morning" })).toBeVisible();
  await expect(presets.getByRole("button", { name: "Preset 4: Akashvani Classics" })).toBeVisible();
  // Recalling a preset plays it: that part needs a browser that can play audio.
  if (!(await canPlayAudio(page))) return;
  await presets.getByRole("button", { name: "Preset 1: Carnatic Morning" }).click();
  await expect(page.getByTestId("tray-now-playing")).toHaveAccessibleName(/Carnatic Morning/);
  await expect(presets.getByRole("button", { name: "Preset 1: Carnatic Morning" })).toHaveAttribute("data-lit", "true", { timeout: 15_000 });
});

test("columns sort, the tree browses languages, and favourites collect", async ({ page }) => {
  const queries = await stubRadio(page);
  await openRadio(page);
  await table(page).getByRole("button", { name: "Quality" }).click();
  await expect(table(page).getByRole("row").nth(1)).toContainText("Bollywood Evergreen"); // 128 kbps first
  await table(page).getByRole("button", { name: /Station/ }).click();
  await expect(table(page).getByRole("row").nth(1)).toContainText("Akashvani Classics");
  await page.getByRole("navigation", { name: "Browse stations" }).getByRole("button", { name: "Tamil" }).click();
  await expect(table(page).getByRole("row")).toHaveCount(2);
  expect(queries.at(-1)?.get("language")).toBe("tamil");
  await table(page).getByRole("button", { name: "Add Carnatic Morning to favourites" }).click();
  await page.getByRole("navigation", { name: "Browse stations" }).getByRole("button", { name: /Favourites/ }).click();
  await expect(table(page).getByRole("row")).toHaveCount(2);
  await expect(page.getByRole("navigation", { name: "Browse stations" }).getByRole("button", { name: /Favourites/ })).toContainText("1");
});

test("the tuning knob works from the keyboard and moves the dial", async ({ page }) => {
  await stubRadio(page);
  await openRadio(page);
  const knob = page.getByRole("slider", { name: "Tuning knob" });
  await knob.focus();
  await page.keyboard.press("End");
  await expect(knob).toHaveAttribute("aria-valuetext", "Station 3 of 3: Carnatic Morning");
  await page.keyboard.press("ArrowLeft");
  await expect(knob).toHaveAttribute("aria-valuetext", "Station 2 of 3: Bollywood Evergreen");
  await expect(table(page).getByRole("row", { name: /Bollywood Evergreen/ })).toHaveAttribute("aria-selected", "true");
});
