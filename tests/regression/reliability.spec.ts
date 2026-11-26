import { expect, test, type Page, type Route } from "@playwright/test";
import { canPlayAudio } from "./support/media";

/**
 * P1 Reliability: an application that fails stays inside its window; open windows come back after
 * a reload; keyboard focus follows windows; a dropped radio stream reconnects by itself.
 */

const pageErrors: string[] = [];
test.beforeEach(({ page }) => {
  pageErrors.length = 0;
  page.on("pageerror", (e) => pageErrors.push(e.message));
});

const win = (page: Page, app: string) => page.locator(`[data-app="${app}"]`);
const taskbar = (page: Page) => page.getByRole("toolbar", { name: "Taskbar" });

async function desktop(page: Page, path = "/") {
  await page.addInitScript(() => sessionStorage.setItem("xplor9.session", "in"));
  await page.goto(path);
  await expect(taskbar(page)).toBeVisible();
  await expect(page.locator("html[data-desktop-ready]")).toHaveCount(1);
}

/** Serves Notepad with a bug: it throws while drawing, as a real fault inside an app would. */
async function breakNotepad(page: Page) {
  await page.route("**/_next/static/chunks/*.js", async (route: Route) => {
    const res = await route.fetch();
    const body = await res.text();
    if (!body.includes("Saved in this browser")) return route.fulfill({ response: res, body });
    const broken = body.replace(/(["'])Saved in this browser\1/, '(() => { throw new Error("Notepad test fault"); })()');
    return route.fulfill({ response: res, body: broken });
  });
}

/** Makes Notepad's code fail to download, as on a dropped connection. */
async function cutNotepadDownload(page: Page) {
  await page.route("**/_next/static/chunks/*.js", async (route: Route) => {
    const res = await route.fetch();
    const body = await res.text();
    if (body.includes("Saved in this browser")) return route.abort("connectionreset");
    return route.fulfill({ response: res, body });
  });
}

test("a failing app stays in its window: the desktop and other apps carry on, and it can be closed", async ({ page }) => {
  await breakNotepad(page);
  await desktop(page);
  await page.getByRole("button", { name: /^Notepad:/ }).dblclick();
  await page.getByRole("button", { name: "Start menu" }).click();
  await page.getByRole("menuitem", { name: /^Arcade/ }).click();
  const crashed = win(page, "notepad").getByTestId("app-crashed");
  await expect(crashed).toBeVisible({ timeout: 15_000 });
  await expect(crashed).toContainText("Notepad has stopped working");
  // Everything else still works.
  await page.getByRole("button", { name: "Start menu" }).click();
  await expect(page.getByRole("menu", { name: "Start menu" })).toBeVisible();
  await page.keyboard.press("Escape");
  await win(page, "games").getByRole("button", { name: "Play Saanp" }).click();
  await expect(win(page, "saanp")).toBeVisible();
  await taskbar(page).getByRole("button", { name: "Notepad" }).click(); // bring it to the front
  await win(page, "notepad").getByRole("button", { name: "Close", exact: true }).click();
  await expect(win(page, "notepad")).toHaveCount(0);
});

test("an app whose code couldn't download says so; after a reload the windows come back and it works", async ({ page }) => {
  await cutNotepadDownload(page);
  await desktop(page);
  await page.getByRole("button", { name: /^Notepad:/ }).dblclick();
  await expect(win(page, "notepad").getByTestId("app-crashed")).toContainText("couldn't be loaded", { timeout: 15_000 });
  await page.getByRole("button", { name: "Start menu" }).click();
  await page.getByRole("menuitem", { name: /^Arcade/ }).click();
  await page.getByRole("button", { name: "Maximise Arcade" }).click();
  await page.unroute("**/_next/static/chunks/*.js");
  await page.reload();
  await expect(win(page, "games")).toHaveAttribute("data-maximized", "true");
  await expect(win(page, "notepad").locator("#notepad-text")).toBeAttached({ timeout: 15_000 });
  await expect(win(page, "notepad").getByTestId("app-crashed")).toHaveCount(0);
  // Logging off closes everything for the next session.
  await page.getByRole("button", { name: "Start menu" }).click();
  await page.getByRole("menuitem", { name: "Log off" }).click();
  await page.getByRole("button", { name: "Guest" }).click();
  await expect(taskbar(page).getByRole("listitem")).toHaveCount(0);
});

test("minimised windows come back minimised after a reload", async ({ page }) => {
  await desktop(page);
  await page.getByRole("button", { name: /^Notepad:/ }).dblclick();
  await page.getByRole("button", { name: "Minimise Notepad" }).click();
  await page.reload();
  await expect(taskbar(page).getByRole("button", { name: "Notepad" })).toBeVisible();
  await expect(win(page, "notepad")).toBeHidden();
});

test("keyboard focus follows windows: into the new window, to its taskbar button, back to Start", async ({ page }) => {
  await desktop(page);
  await page.getByRole("button", { name: /^Notepad:/ }).focus();
  await page.keyboard.press("Enter");
  await expect.poll(() => page.evaluate(() => document.activeElement?.closest("[data-app]")?.getAttribute("data-app"))).toBe("notepad");
  await page.getByRole("button", { name: "Minimise Notepad" }).click();
  await expect(taskbar(page).getByRole("button", { name: "Notepad" })).toBeFocused();
  await page.keyboard.press("Enter"); // restore from the taskbar
  await expect.poll(() => page.evaluate(() => document.activeElement?.closest("[data-app]")?.getAttribute("data-app"))).toBe("notepad");
  await page.getByRole("button", { name: "Close Notepad" }).click();
  await expect(page.getByRole("button", { name: "Start menu" })).toBeFocused();
  expect(pageErrors).toEqual([]);
});

test("a radio stream that drops reconnects by itself", async ({ page }) => {
  const station = {
    id: "00000001-0000-4000-8000-000000000001",
    name: "Reconnect FM",
    streamUrl: "https://stream1.radio.test/live",
    homepage: null,
    favicon: null,
    country: "India",
    countryCode: "IN",
    languages: ["hindi"],
    tags: [],
    format: "mp3",
    codecLabel: "MP3",
    bitrate: 128,
    votes: 1,
    clicks: 1,
    lastCheckedAt: "2026-11-20T00:00:00Z",
    availability: { status: "available" },
  };
  await page.route("**/api/radio/stations?*", (r) => r.fulfill({ json: { stations: [station], offset: 0, limit: 30, hasMore: false } }));
  await page.route("**/api/radio/facets/**", (r) => r.fulfill({ json: { facets: [] } }));
  await page.route("**/api/radio/stations/*/click", (r) => r.fulfill({ status: 204, body: "" }));
  // The first connection carries a second of sound, then the broadcaster drops it (the stream
  // ends); the next connection carries a minute.
  const rate = 8000;
  const tone = (seconds: number) => {
  const n = rate * seconds;
  const wav = Buffer.alloc(44 + n * 2);
  wav.write("RIFF", 0);
  wav.writeUInt32LE(36 + n * 2, 4);
  wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(rate, 24);
  wav.writeUInt32LE(rate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(n * 2, 40);
  return wav;
  };
  let requests = 0;
  await page.route("https://stream1.radio.test/**", (route) => route.fulfill({ status: 200, contentType: "audio/wav", body: tone(++requests === 1 ? 1 : 60) }));

  await desktop(page, "/?open=radio");
  test.skip(!(await canPlayAudio(page)), "this browser build can't play audio (Playwright WebKit on Windows)");
  await page.locator(".rt-table").getByRole("button", { name: "Play Reconnect FM" }).click();
  await expect(page.getByRole("region", { name: "Radio tuner" })).toContainText(/Reconnecting/, { timeout: 10_000 });
  await expect(page.locator(".rt-lamp")).toHaveAttribute("data-on", "true", { timeout: 15_000 });
  expect(requests).toBeGreaterThanOrEqual(2);
});
