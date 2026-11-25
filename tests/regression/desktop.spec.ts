import { expect, test, type Page } from "@playwright/test";

/**
 * The XPLOR9 desktop: switching on and logging in, desktop icons, windows (open, focus, move,
 * minimise, maximise, close, remembered place), the start menu by keyboard, personalisation,
 * log off / turn off, phones, and the new apps (Video, Reading Room window, Notepad).
 */

const errors: string[] = [];
test.beforeEach(({ page }) => {
  errors.length = 0;
  page.on("pageerror", (e) => errors.push(e.message));
});
test.afterEach(() => expect(errors, "uncaught page errors").toEqual([]));

const win = (page: Page, app: string) => page.locator(`[data-app="${app}"]`);
const taskbar = (page: Page) => page.getByRole("toolbar", { name: "Taskbar" });

/** Straight to the desktop (as after logging in this session). */
async function desktop(page: Page) {
  await page.addInitScript(() => sessionStorage.setItem("xplor9.session", "in"));
  await page.goto("/");
  await expect(taskbar(page)).toBeVisible();
}

test("switching on: start-up, welcome screen, then the desktop; a reload stays logged in", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("boot")).toBeVisible();
  await expect(page.getByTestId("welcome")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Guest" }).click();
  await expect(page.getByRole("list", { name: "Desktop" }).getByRole("button")).toHaveCount(7);
  await page.reload();
  await expect(taskbar(page)).toBeVisible();
  await expect(page.getByTestId("welcome")).toHaveCount(0);
});

test("icons: double-click opens, Enter opens, one window per app", async ({ page }) => {
  await desktop(page);
  await page.getByRole("button", { name: /^Notepad:/ }).dblclick();
  await expect(win(page, "notepad")).toBeVisible();
  await page.getByRole("button", { name: /^Games:/ }).focus();
  await page.keyboard.press("Enter");
  await expect(win(page, "games")).toBeVisible();
  await expect(win(page, "games")).toHaveAttribute("data-focused", "true");
  await page.getByRole("button", { name: "Start menu" }).click();
  await page.getByRole("menuitem", { name: /^Notepad/ }).click();
  await expect(win(page, "notepad")).toHaveCount(1);
  await expect(win(page, "notepad")).toHaveAttribute("data-focused", "true");
});

test("windows: focus, minimise keeps the app running, taskbar restores, maximise, close", async ({ page }) => {
  await desktop(page);
  await page.getByRole("button", { name: /^Notepad:/ }).dblclick();
  await page.locator("#notepad-text").fill("still here");
  await page.getByRole("button", { name: "Minimise Notepad" }).click();
  await expect(win(page, "notepad")).toBeHidden();
  const task = taskbar(page).getByRole("button", { name: "Notepad" });
  await expect(task).toHaveAttribute("aria-pressed", "false");
  await task.click();
  await expect(win(page, "notepad")).toBeVisible();
  await expect(page.locator("#notepad-text")).toHaveValue("still here"); // never unmounted
  await page.getByRole("button", { name: "Maximise Notepad" }).click();
  await expect(win(page, "notepad")).toHaveAttribute("data-maximized", "true");
  await page.getByRole("button", { name: "Restore Notepad" }).click();
  await page.getByRole("button", { name: "Close Notepad" }).click();
  await expect(win(page, "notepad")).toHaveCount(0);
  await expect(task).toHaveCount(0);
});

test("windows move by the title bar and reopen where they were left", async ({ page }) => {
  await desktop(page);
  await page.getByRole("button", { name: /^Notepad:/ }).dblclick();
  const title = win(page, "notepad").locator("header");
  const before = (await win(page, "notepad").boundingBox())!;
  const t = (await title.boundingBox())!;
  await page.mouse.move(t.x + 120, t.y + 12);
  await page.mouse.down();
  await page.mouse.move(t.x + 320, t.y + 112, { steps: 6 });
  await page.mouse.up();
  const after = (await win(page, "notepad").boundingBox())!;
  expect(Math.round(after.x - before.x)).toBe(200);
  expect(Math.round(after.y - before.y)).toBe(100);
  await page.getByRole("button", { name: "Close Notepad" }).click();
  await page.getByRole("button", { name: /^Notepad:/ }).dblclick();
  const reopened = (await win(page, "notepad").boundingBox())!;
  expect(Math.round(reopened.x)).toBe(Math.round(after.x));
  expect(Math.round(reopened.y)).toBe(Math.round(after.y));
});

test("start menu: keyboard (Ctrl+Esc, arrows, Enter, Escape) opens apps", async ({ page }) => {
  await desktop(page);
  await page.keyboard.press("Control+Escape");
  const menu = page.getByRole("menu", { name: "Start menu" });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem").first()).toBeFocused();
  await page.keyboard.press("ArrowDown"); // Television
  await page.keyboard.press("Enter");
  await expect(menu).toHaveCount(0);
  await expect(win(page, "tv")).toBeVisible();
  await page.getByRole("button", { name: "Start menu" }).click();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Start menu" })).toBeFocused();
});

test("personalisation: wallpaper, colours and name are remembered", async ({ page }) => {
  await desktop(page);
  await page.mouse.click(900, 300, { button: "right" });
  await page.getByRole("menuitem", { name: "Change wallpaper…" }).click();
  await win(page, "control").getByText("Dusk over the city").click();
  await win(page, "control").getByText("Olive green").click();
  await win(page, "control").getByRole("tab", { name: "Your name" }).click();
  await page.getByLabel("Name on the welcome screen").fill("  Asha\u0007 ");
  await page.getByRole("button", { name: "Save name" }).click();
  await page.reload();
  const root = page.locator(".xp-root");
  await expect(root).toHaveAttribute("data-wallpaper", "dusk");
  await expect(root).toHaveAttribute("data-theme", "olive");
  await page.getByRole("button", { name: "Start menu" }).click();
  await expect(page.getByRole("menu", { name: "Start menu" })).toContainText("Asha");
});

test("log off returns to the welcome screen; turn off and switch on again", async ({ page }) => {
  await desktop(page);
  await page.getByRole("button", { name: /^Notepad:/ }).dblclick();
  await page.getByRole("button", { name: "Start menu" }).click();
  await page.getByRole("menuitem", { name: "Log off" }).click();
  await expect(page.getByTestId("welcome")).toBeVisible();
  await page.getByRole("button", { name: "Guest" }).click();
  await expect(win(page, "notepad")).toHaveCount(0); // logging off closed the windows
  await page.getByRole("button", { name: "Start menu" }).click();
  await page.getByRole("menuitem", { name: "Turn off computer" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Turn off" }).click();
  await expect(page.getByTestId("powered-off")).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: "Switch on" }).click();
  await expect(page.getByTestId("welcome")).toBeVisible({ timeout: 15_000 });
});

test("old addresses open their window on the desktop", async ({ page }) => {
  for (const [path, app] of [
    ["/radio", "radio"],
    ["/games", "games"],
    ["/music", "music"],
  ] as const) {
    await page.goto(path);
    await expect(win(page, app)).toBeVisible();
    expect(new URL(page.url()).pathname).toBe("/");
  }
});

test("Reading Room opens inside its window without its own top bar", async ({ page }) => {
  await desktop(page);
  await page.getByRole("button", { name: /^Reading Room:/ }).dblclick();
  const frame = page.frameLocator('iframe[title="Reading Room"]');
  await expect(frame.getByRole("heading", { name: "Reading Room", level: 1 })).toBeVisible({ timeout: 30_000 });
  await expect(frame.getByRole("link", { name: "Open the desktop" })).toBeHidden();
  // On its own, the page keeps the way back.
  await page.goto("/reading");
  await expect(page.getByRole("link", { name: "Open the desktop" })).toBeVisible();
});

test("Video: nothing loads from YouTube before a choice; a bad link is refused", async ({ page }) => {
  const youtube: string[] = [];
  page.on("request", (r) => /youtube|ytimg|googlevideo/.test(new URL(r.url()).hostname) && youtube.push(r.url()));
  await page.route(/youtube(-nocookie)?\.com/, (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<title>player</title>" }));
  await desktop(page);
  await page.getByRole("button", { name: /^Video:/ }).dblclick();
  await expect(win(page, "video").getByText("Pick a video, a channel, or paste a YouTube link.")).toBeVisible();
  await page.getByLabel("Address").fill("https://example.com/watch?v=dQw4w9WgXcQ");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(page.locator("#video-link-error")).toContainText("Only links to youtube.com or youtu.be");
  expect(youtube).toEqual([]);
  await page.getByLabel("Address").fill("https://youtu.be/dQw4w9WgXcQ");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  const src = await win(page, "video").getByTestId("embed-player").getAttribute("src");
  expect(new URL(src!).origin + new URL(src!).pathname).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
});

test("Notepad keeps its text in this browser", async ({ page }) => {
  await desktop(page);
  await page.getByRole("button", { name: /^Notepad:/ }).dblclick();
  await page.locator("#notepad-text").fill("Shopping: Parle-G, Rasna");
  await expect(win(page, "notepad").getByText("Saved in this browser")).toBeVisible();
  await page.waitForTimeout(600);
  await page.reload();
  await page.getByRole("button", { name: /^Notepad:/ }).dblclick();
  await expect(page.locator("#notepad-text")).toHaveValue("Shopping: Parle-G, Rasna");
});

test.describe("phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });
  test("one tap opens an app full screen; the taskbar switches between apps", async ({ page }) => {
    await desktop(page);
    await page.getByRole("button", { name: /^Notepad:/ }).tap();
    const box = (await win(page, "notepad").boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(389);
    await expect(page.getByRole("button", { name: "Maximise Notepad" })).toHaveCount(0);
    await page.getByRole("button", { name: "Minimise Notepad" }).tap();
    await page.getByRole("button", { name: /^Games:/ }).tap();
    await expect(win(page, "games")).toBeVisible();
    await taskbar(page).getByRole("button", { name: "Notepad" }).tap();
    await expect(win(page, "notepad")).toBeVisible();
  });
});
