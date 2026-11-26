import { expect, test, type Page, type Route } from "@playwright/test";
import { canPlayAudio } from "./support/media";

/**
 * D2 Music ("XPLOR9 Amp"): tapes from the library, a playlist you edit and keep, records that
 * play through the shared player (with CORS, for the equaliser) and move on by themselves,
 * videos in YouTube's player in the video pane, the equaliser's settings remembered, and the
 * classic keyboard keys. Providers are stand-ins: no test depends on outside sites.
 */

const errors: string[] = [];
test.beforeEach(({ page }) => {
  errors.length = 0;
  page.on("pageerror", (e) => errors.push(e.message));
});
test.afterEach(() => expect(errors, "uncaught page errors").toEqual([]));

/** A short tone as a WAV file (seconds long), so records really play and end. */
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
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin((i / rate) * 2 * Math.PI * 440) * 6000), 44 + i * 2);
  return b;
}

async function stubProviders(page: Page, recordSeconds = 1.5) {
  const audio = wav(recordSeconds);
  const audioRequests: string[] = [];
  // Records: served with the CORS header the Internet Archive sends (the equaliser needs it).
  await page.route("https://archive.org/download/**", (route: Route) => {
    audioRequests.push(route.request().url());
    return route.fulfill({ status: 200, contentType: "audio/wav", headers: { "Access-Control-Allow-Origin": "*" }, body: audio });
  });
  await page.route("https://www.youtube-nocookie.com/embed/**", (route: Route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<body style="margin:0;background:#123;color:#fff">video stand-in<script>
        let started=false; const send=(o)=>parent.postMessage(JSON.stringify(o),"*");
        addEventListener("message",(e)=>{ try{ const m=JSON.parse(e.data);
          if(m.event==="listening" && !started){ started=true; send({event:"onReady"}); send({event:"onStateChange",info:1});
            let t=0; setInterval(()=>send({event:"infoDelivery",info:{currentTime:t+=1,duration:200}}),300); }
          if(m.event==="command" && m.func==="pauseVideo") send({event:"onStateChange",info:2});
          if(m.event==="command" && m.func==="playVideo") send({event:"onStateChange",info:1});
        }catch{} });
      </script></body>`,
    }),
  );
  return audioRequests;
}

async function openMusic(page: Page) {
  await page.addInitScript(() => sessionStorage.setItem("xplor9.session", "in"));
  await page.goto("/?open=music");
  await expect(page.getByTestId("music-player")).toBeVisible({ timeout: 30_000 });
}
const library = (page: Page) => page.getByRole("region", { name: "Media library" });
const playlist = (page: Page) => page.getByRole("listbox", { name: "Playlist songs" });

test("a record tape plays through the shared player, shows its time, and moves to the next song", async ({ page }) => {
  const audio = await stubProviders(page);
  await openMusic(page);
  test.skip(!(await canPlayAudio(page)), "this browser build can't play audio (Playwright WebKit on Windows)");
  await expect(page.getByText("The playlist is empty.")).toBeVisible();
  await library(page).getByRole("button", { name: "Old Records" }).click();
  await library(page).getByRole("button", { name: "Play tape: Old Records" }).click();
  await expect(playlist(page).getByRole("option")).toHaveCount(8);
  await expect(page.getByTestId("music-status")).toContainText("Record · Internet Archive");
  // It reaches the second song by itself when the first ends.
  await expect(playlist(page).getByRole("option").nth(1)).toHaveAttribute("aria-current", "true", { timeout: 15_000 });
  expect(audio.length).toBeGreaterThanOrEqual(2);
  // The tray shows the shared player's record.
  await expect(page.getByTestId("tray-now-playing")).toBeVisible();
  // V stops (classic key), Z/B step.
  await page.getByRole("button", { name: "Previous (Z)" }).focus();
  await page.keyboard.press("v");
  await expect(page.getByTestId("tray-now-playing")).toHaveCount(0);
});

test("the playlist can be built, reordered, trimmed and is remembered", async ({ page }) => {
  await stubProviders(page);
  await openMusic(page);
  await library(page).getByRole("button", { name: "Old Records" }).click();
  await library(page).getByRole("button", { name: "Add to playlist" }).click();
  await library(page).getByRole("button", { name: "Add Kafi to the playlist" }).click();
  const rows = playlist(page).getByRole("option");
  await expect(rows).toHaveCount(9);
  const first = await rows.nth(0).innerText();
  const second = await rows.nth(1).innerText();
  await rows.nth(0).click();
  await page.getByRole("button", { name: "Move down" }).click();
  await expect(rows.nth(1)).toContainText(first.replace(/^1\.\s*/, "").split("\n")[0].trim());
  await expect(rows.nth(0)).toContainText(second.replace(/^2\.\s*/, "").split("\n")[0].trim());
  await page.getByRole("region", { name: "Playlist" }).getByRole("button", { name: "Remove" }).click();
  await expect(rows).toHaveCount(8);
  await page.goto("/?open=music"); // a reload returns to the desktop; the address reopens Music
  await expect(playlist(page).getByRole("option")).toHaveCount(8);
  await page.getByRole("region", { name: "Playlist" }).getByRole("button", { name: "Clear" }).click();
  await expect(page.getByText("The playlist is empty.")).toBeVisible();
});

test("a video tape plays in the video pane with its time; transport pauses it", async ({ page }) => {
  await stubProviders(page);
  await openMusic(page);
  await library(page).getByRole("button", { name: "Play tape: Rainy Day Romance" }).click();
  const pane = page.getByRole("region", { name: "Video" });
  await expect(pane.getByTestId("embed-player")).toBeVisible();
  expect(new URL((await pane.getByTestId("embed-player").getAttribute("src"))!).origin).toBe("https://www.youtube-nocookie.com");
  await expect(page.getByTestId("music-time")).not.toHaveText("0:00", { timeout: 10_000 });
  await expect(page.getByRole("slider", { name: "Position" })).toBeEnabled();
  await page.getByRole("button", { name: "Pause (C)" }).click();
  await expect(page.getByRole("button", { name: "Pause (C)" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Stop (V)" }).click();
  await expect(pane).toHaveCount(0);
});

test("equaliser: presets, bands and on/off are remembered", async ({ page }) => {
  await openMusic(page);
  const eq = page.getByRole("region", { name: "Equaliser" });
  await eq.getByRole("combobox").selectOption("Bass boost");
  await eq.getByRole("slider", { name: "16K hertz" }).fill("5");
  await expect(eq.getByRole("combobox")).toHaveValue(""); // now Custom
  await eq.getByRole("button", { name: "On" }).click();
  await page.goto("/?open=music"); // a reload returns to the desktop; the address reopens Music
  const eq2 = page.getByRole("region", { name: "Equaliser" });
  await expect(eq2.getByRole("slider", { name: "60 hertz" })).toHaveValue("8");
  await expect(eq2.getByRole("slider", { name: "16K hertz" })).toHaveValue("5");
  await expect(eq2.getByRole("button", { name: "On" })).toHaveAttribute("aria-pressed", "false");
  await page.getByRole("button", { name: "EQ", exact: true }).click();
  await expect(page.getByRole("region", { name: "Equaliser" })).toHaveCount(0);
});

test("favourites from the player appear in the library", async ({ page }) => {
  await openMusic(page);
  await library(page).getByRole("button", { name: "Old Records" }).click();
  await library(page).getByRole("button", { name: "Add Kafi to favourites" }).click();
  await library(page).getByRole("button", { name: /Favourites \(1\)/ }).click();
  await expect(library(page).getByTestId("music-track")).toHaveCount(1);
  await expect(library(page).getByTestId("music-track")).toContainText("Kafi");
});
