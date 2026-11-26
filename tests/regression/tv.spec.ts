import { expect, test, type Page, type Route } from "@playwright/test";

/**
 * M3 — TV: privacy (nothing from YouTube or the Internet Archive before Watch), watching,
 * unavailable programmes skipped, finished programmes followed by the next, favourites and
 * recently watched remembered, keyboard channel tabs, offline, and the no-3D frame.
 *
 * The providers' players are replaced by stand-ins that speak YouTube's message protocol, so the
 * tests never depend on outside sites (and can simulate removed videos).
 */

const errors: string[] = [];
test.beforeEach(({ page }) => {
  errors.length = 0;
  page.on("pageerror", (e) => errors.push(e.message));
});
test.afterEach(() => expect(errors, "uncaught page errors").toEqual([]));

type Behaviour = "play" | "unavailable" | "ends" | "silent";

/** Serves a stand-in player per video id; returns the list of provider requests seen. */
async function stubProviders(page: Page, behaviour: Record<string, Behaviour> = {}) {
  const requests: string[] = [];
  page.on("request", (r) => {
    const u = new URL(r.url());
    if (/(^|\.)youtube(-nocookie)?\.com$|(^|\.)archive\.org$|(^|\.)ytimg\.com$|(^|\.)googlevideo\.com$/.test(u.hostname)) requests.push(r.url());
  });
  await page.route("https://www.youtube-nocookie.com/embed/**", (route: Route) => {
    const id = new URL(route.request().url()).pathname.split("/").pop()!;
    const b = behaviour[id] ?? "play";
    const script = {
      play: `send({event:"onReady"}); send({event:"onStateChange",info:1});`,
      unavailable: `send({event:"onReady"}); send({event:"onError",info:150});`,
      ends: `send({event:"onReady"}); send({event:"onStateChange",info:1}); setTimeout(()=>send({event:"onStateChange",info:0}),400);`,
      silent: ``,
    }[b];
    return route.fulfill({
      contentType: "text/html",
      body: `<body style="margin:0;background:#123">stand-in ${id}<script>
        let started=false; const send=(o)=>parent.postMessage(JSON.stringify(o),"*");
        addEventListener("message",(e)=>{ if(started) return; try{ if(JSON.parse(e.data).event==="listening"){ started=true; ${script} } }catch{} });
      </script></body>`,
    });
  });
  await page.route("https://archive.org/embed/**", (route) => route.fulfill({ contentType: "text/html", body: "<body style='margin:0;background:#321'>archive stand-in</body>" }));
  return requests;
}

const watch = async (page: Page, channel: RegExp, title: string) => {
  await page.getByRole("tab", { name: channel }).click();
  await page.getByRole("tabpanel").getByRole("button", { name: `Watch ${title}` }).click();
};
const player = (page: Page) => page.getByTestId("embed-player");

test("nothing loads from YouTube or the Internet Archive until Watch; then the official player plays", async ({ page }) => {
  const requests = await stubProviders(page);
  await page.goto("/tv");
  await expect(page.getByTestId("tv-guide")).toBeVisible();
  await page.waitForTimeout(1500);
  expect(requests).toEqual([]);

  await watch(page, /Cartoon Time/, "Ek Anek Aur Ekta");
  const src = new URL((await player(page).getAttribute("src"))!);
  expect(src.origin).toBe("https://www.youtube-nocookie.com");
  expect(src.pathname).toBe("/embed/bI376UnsUMg");
  expect(await player(page).getAttribute("sandbox")).toContain("allow-scripts");
  await expect(page.getByTestId("tv-status")).toHaveText("Official upload by Films Division · YouTube"); // = playing
  await expect(page.getByTestId("tv-guide")).toBeVisible(); // the guide stays beside the screen (D2)
  await expect(page.getByRole("group", { name: "Player controls" })).toBeVisible();

  await page.getByRole("button", { name: "Switch off" }).click();
  await expect(page.getByTestId("tv-guide")).toBeVisible();
  await expect(player(page)).toHaveCount(0);
});

test("an unavailable programme is announced and skipped to the next one", async ({ page }) => {
  await stubProviders(page, { bI376UnsUMg: "unavailable" });
  await page.goto("/tv");
  await watch(page, /Cartoon Time/, "Ek Anek Aur Ekta");
  await expect(page.getByTestId("tv-status")).toContainText("can't be played here");
  await expect(page.getByTestId("tv-announce")).toContainText("can't be played here");
  await expect.poll(async () => player(page).getAttribute("src"), { timeout: 8000 }).toContain("/embed/Xor9hxZsdoA"); // The Balloon
  await expect(page.getByTestId("tv-status")).toHaveText("Official upload by Films Division · YouTube");
});

test("a finished programme is followed by the next on the channel", async ({ page }) => {
  await stubProviders(page, { pMsvJo9lZcU: "ends" });
  await page.goto("/tv");
  await watch(page, /Cartoon Time/, "Umbrella");
  await expect.poll(async () => player(page).getAttribute("src"), { timeout: 8000 }).toContain("/embed/QP80F1wudB8"); // Dancing Forms
});

test("a player that never answers says so and offers Try again", async ({ page }) => {
  await stubProviders(page, { bI376UnsUMg: "silent" });
  await page.goto("/tv");
  await expect(page.getByTestId("tv-guide")).toBeVisible();
  await watch(page, /Cartoon Time/, "Ek Anek Aur Ekta");
  await expect(page.getByTestId("tv-status")).toHaveText("Tuning in…");
  // The player waits 20 seconds for an answer (real time: a fake clock would also stall rendering).
  await expect(page.getByTestId("tv-status")).toContainText("didn't respond", { timeout: 30_000 });
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
});

test("favourites and recently watched are remembered across visits", async ({ page }) => {
  await stubProviders(page);
  await page.goto("/tv");
  await page.getByRole("tab", { name: /Story Hour/ }).click();
  await page.getByRole("button", { name: "Add Godaan to favourites" }).click();
  await watch(page, /Picture House/, "The General");
  expect(new URL((await player(page).getAttribute("src"))!).href).toBe("https://archive.org/embed/TheGeneral?autoplay=1");
  await expect(page.getByTestId("tv-status")).toHaveText("Public domain in India and the US · Internet Archive");
  await page.getByRole("button", { name: "Switch off" }).click();
  await page.goto("/tv");
  await expect(page.getByRole("region", { name: "Favourites" })).toContainText("Godaan");
  await expect(page.getByRole("region", { name: "Recently watched" })).toContainText("The General");
});

test("channels work from the keyboard (arrow keys move between tabs)", async ({ page }) => {
  await stubProviders(page);
  await page.goto("/tv");
  const first = page.getByRole("tab", { name: /Story Hour/ });
  await first.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: /Cartoon Time/ })).toBeFocused();
  await expect(page.getByRole("tab", { name: /Cartoon Time/ })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel")).toContainText("Ek Anek Aur Ekta");
  await page.keyboard.press("End");
  await expect(page.getByRole("tabpanel")).toContainText("The General");
});

test("offline: says so instead of loading a player", async ({ page, context }) => {
  const requests = await stubProviders(page);
  await page.goto("/tv");
  await expect(page.getByTestId("tv-guide")).toBeVisible();
  await context.setOffline(true);
  await watch(page, /Cartoon Time/, "Ek Anek Aur Ekta");
  await expect(page.getByTestId("tv-status")).toContainText("You're offline");
  await expect(player(page)).toHaveCount(0);
  expect(requests).toEqual([]);
  await context.setOffline(false);
});

test("the player plays in its own CRT frame inside the TV window", async ({ page }) => {
  await stubProviders(page);
  await page.goto("/tv");
  await watch(page, /Cartoon Time/, "Ek Anek Aur Ekta");
  await expect(page.getByTestId("tv-player")).toHaveAttribute("data-placement", "frame");
  await expect(page.locator('[data-app="tv"]').getByTestId("tv-player")).toBeVisible();
  await expect(player(page)).toBeVisible();
});
