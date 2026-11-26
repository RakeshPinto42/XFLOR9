import { expect, test, type Page, type Route } from "@playwright/test";

/**
 * P3 One media system: the tray shows and controls whatever plays in any window (TV, Video,
 * Music's videos), and videos from Video and TV can be added to saved Music playlists.
 * YouTube and the Internet Archive are replaced by stand-ins; nothing leaves the machine.
 */

const errors: string[] = [];
test.beforeEach(({ page }) => {
  errors.length = 0;
  page.on("pageerror", (e) => errors.push(e.message));
});
test.afterEach(() => expect(errors, "uncaught page errors").toEqual([]));

const win = (page: Page, app: string) => page.locator(`[data-app="${app}"]`);
const tray = (page: Page) => page.getByTestId("tray-now-playing");
const trayPanel = (page: Page) => page.getByRole("dialog", { name: /^Now playing:/ });

/** YouTube stand-in: reports ready + playing, and obeys pause/play like the real player. */
async function stubPlayers(page: Page) {
  await page.route("https://www.youtube-nocookie.com/embed/**", (route: Route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<body style="margin:0;background:#123;color:#fff">stand-in<script>
        let started=false; const send=(o)=>parent.postMessage(JSON.stringify(o),"*");
        addEventListener("message",(e)=>{ try{ const m=JSON.parse(e.data);
          if(m.event==="listening" && !started){ started=true; send({event:"onReady"}); send({event:"onStateChange",info:1}); }
          if(m.event==="command" && m.func==="pauseVideo") send({event:"onStateChange",info:2});
          if(m.event==="command" && m.func==="playVideo") send({event:"onStateChange",info:1});
        }catch{} });
      </script></body>`,
    }),
  );
  await page.route("https://archive.org/**", (route) => route.fulfill({ contentType: "text/html", body: "<body>archive stand-in</body>" }));
}

async function desktop(page: Page, path = "/") {
  await page.addInitScript(() => sessionStorage.setItem("xplor9.session", "in"));
  await page.goto(path);
  await expect(page.locator("html[data-desktop-ready]")).toHaveCount(1);
}

async function playLink(page: Page) {
  const video = win(page, "video");
  await video.getByLabel("Address").fill("https://youtu.be/dQw4w9WgXcQ");
  await video.locator("form").filter({ has: page.getByLabel("Address") }).getByRole("button", { name: "Play", exact: true }).click();
  await expect(video.locator(".mx-nowline")).toContainText("Playing");
}

async function openFromStart(page: Page, name: RegExp) {
  await page.getByRole("button", { name: "Start menu" }).click();
  await page.getByRole("menuitem", { name }).click();
}

test("the tray shows a video playing in Video, and pauses, shows and stops it", async ({ page }) => {
  await stubPlayers(page);
  await desktop(page, "/?open=video");
  await expect(tray(page)).toHaveCount(0); // nothing playing yet
  await playLink(page);

  await expect(tray(page)).toHaveAttribute("aria-label", "Now playing: Pasted link");
  await tray(page).click();
  await expect(trayPanel(page)).toContainText("Playing · YouTube · Video");
  await trayPanel(page).getByRole("button", { name: "Pause" }).click();
  await expect(win(page, "video").locator(".mx-nowline")).toContainText("Paused");
  await expect(trayPanel(page)).toContainText("Paused");
  await trayPanel(page).getByRole("button", { name: "Play", exact: true }).click();
  await expect(win(page, "video").locator(".mx-nowline")).toContainText("Playing");

  // Show player brings a minimised window back.
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Minimise Video" }).click();
  await expect(win(page, "video")).toBeHidden();
  await tray(page).click();
  await trayPanel(page).getByRole("button", { name: "Show player" }).click();
  await expect(win(page, "video")).toBeVisible();

  await tray(page).click();
  await trayPanel(page).getByRole("button", { name: "Stop" }).click();
  await expect(win(page, "video").getByTestId("embed-player")).toHaveCount(0);
  await expect(tray(page)).toHaveCount(0);
});

test("the tray follows the latest player: TV starting pauses Video and takes over the tray", async ({ page }) => {
  await stubPlayers(page);
  await desktop(page, "/?open=video");
  await playLink(page);
  await openFromStart(page, /^Television/);
  await win(page, "tv").getByRole("tab", { name: /Cartoon Time/ }).click();
  await win(page, "tv").getByRole("tabpanel").getByRole("button", { name: "Watch Ek Anek Aur Ekta" }).click();

  await expect(tray(page)).toHaveAttribute("aria-label", "Now playing: Ek Anek Aur Ekta");
  await expect(win(page, "video").locator(".mx-nowline")).toContainText("Paused"); // one sound at a time
  await tray(page).click();
  await expect(trayPanel(page)).toContainText("Cartoon Time · Television");
  await trayPanel(page).getByRole("button", { name: "Stop" }).click();
  await expect(win(page, "tv").getByTestId("embed-player")).toHaveCount(0);
  // The paused video is what's left, so the tray shows it.
  await expect(tray(page)).toHaveAttribute("aria-label", "Now playing: Pasted link");
});

test("a video from Video goes into a new Music playlist, and plays from Music", async ({ page }) => {
  await stubPlayers(page);
  await desktop(page, "/?open=video");
  await playLink(page);
  const controls = win(page, "video").getByRole("group", { name: "Player controls" });
  await controls.getByRole("button", { name: /\+ Music/ }).click();
  const pop = page.getByRole("dialog", { name: "Add to a Music playlist" });
  await pop.getByLabel("New playlist").fill("Road trip");
  await pop.getByRole("button", { name: "Create and add" }).click();
  await expect(pop.getByRole("status")).toHaveText("Added to “Road trip”.");
  await pop.getByRole("button", { name: "Road trip (1)" }).click();
  await expect(pop.getByRole("status")).toHaveText("Already in “Road trip”."); // no duplicates
  await page.keyboard.press("Escape");
  await expect(pop).toHaveCount(0);

  await openFromStart(page, /^Music/);
  const music = win(page, "music");
  const library = music.getByRole("region", { name: "Media library" });
  await library.getByRole("button", { name: "Road trip (1)" }).click();
  await expect(library.getByTestId("music-track")).toHaveCount(1);
  await expect(library.getByTestId("music-track")).toContainText("Pasted link");
  await library.getByRole("button", { name: "Play all: Road trip" }).click();
  await expect(music.getByRole("region", { name: "Video" }).getByTestId("embed-player")).toBeVisible();
  await expect(tray(page)).toHaveAttribute("aria-label", "Now playing: Pasted link");
  await tray(page).click();
  await expect(trayPanel(page)).toContainText("Music");
  await expect(win(page, "video").locator(".mx-nowline")).toContainText("Paused"); // Music took the speakers

  // Remembered: after a reload the playlist and the added video are still there.
  await page.reload();
  await expect(page.locator("html[data-desktop-ready]")).toHaveCount(1);
  await win(page, "music").getByRole("button", { name: "From Video and TV (1)" }).click();
  await expect(win(page, "music").getByTestId("music-track")).toContainText("Pasted link");
});

test("TV: a single YouTube programme can be added; a YouTube series can't", async ({ page }) => {
  await stubPlayers(page);
  await desktop(page, "/?open=tv");
  const tv = win(page, "tv");
  await tv.getByRole("tab", { name: /Story Hour/ }).click();
  await tv.getByRole("tabpanel").getByRole("button", { name: "Watch Godaan" }).click();
  await expect(tv.getByRole("button", { name: /\+ Music/ })).toBeDisabled();
  await tv.getByRole("tab", { name: /Cartoon Time/ }).click();
  await tv.getByRole("tabpanel").getByRole("button", { name: "Watch Ek Anek Aur Ekta" }).click();
  await tv.getByRole("button", { name: /\+ Music/ }).click();
  const pop = page.getByRole("dialog", { name: "Add to a Music playlist" });
  await pop.getByLabel("New playlist").fill("Cartoons");
  await pop.getByRole("button", { name: "Create and add" }).click();
  await expect(pop.getByRole("status")).toHaveText("Added to “Cartoons”.");
  const lib = await page.evaluate(() => JSON.parse(localStorage.getItem("xplor9.music.library") ?? "null"));
  expect(lib.videos).toEqual([{ videoId: "bI376UnsUMg", title: "Ek Anek Aur Ekta", by: expect.any(String), from: "tv" }]);
});

test("Music: save the playlist under a name, replace it, remove a song, rename it, delete it", async ({ page }) => {
  await stubPlayers(page);
  await desktop(page, "/?open=music");
  const music = win(page, "music");
  const library = music.getByRole("region", { name: "Media library" });
  const panel = music.getByRole("region", { name: "Playlist" });
  await library.getByRole("button", { name: "Add to playlist" }).click();
  const songs = await panel.getByRole("option").count();
  expect(songs).toBeGreaterThan(0);

  await panel.getByRole("button", { name: "Save…" }).click();
  await panel.getByPlaceholder("Playlist name").fill("Evening");
  await panel.getByRole("button", { name: "Save", exact: true }).click();
  await expect(panel.getByRole("status")).toHaveText("Saved as “Evening”.");
  await library.getByRole("button", { name: `Evening (${songs})` }).click();
  await expect(library.getByTestId("music-track")).toHaveCount(songs);

  // Saving again under the same name offers to replace it.
  await panel.getByRole("button", { name: "Save…" }).click();
  await panel.getByPlaceholder("Playlist name").fill("evening");
  await expect(panel.getByText("This replaces the songs in “Evening”.")).toBeVisible();
  await panel.getByRole("button", { name: "Replace" }).click();
  await expect(panel.getByRole("status")).toHaveText("Replaced “Evening”.");

  // A song can be taken out of a saved playlist.
  await library.getByRole("button", { name: `Remove ${await library.getByTestId("music-track").first().locator("td").first().innerText()} from Evening` }).click();
  await expect(library.getByTestId("music-track")).toHaveCount(songs - 1);

  await library.getByRole("button", { name: "Rename…" }).click();
  await library.getByRole("textbox", { name: "New name" }).fill("Late night");
  await library.getByRole("button", { name: "Rename", exact: true }).click();
  await expect(library.getByRole("heading", { name: "Late night" })).toBeVisible();

  await library.getByRole("button", { name: "Delete…" }).click();
  await library.getByRole("alertdialog").getByRole("button", { name: "Delete playlist" }).click();
  await expect(library.getByRole("button", { name: /^Late night/ })).toHaveCount(0);
  await expect(library.getByText("None yet. Use Save under the playlist.")).toBeVisible();
});
