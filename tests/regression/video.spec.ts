import { expect, test, type Page, type Route } from "@playwright/test";

/**
 * D2 Video: collections, watching in YouTube's official player (stand-in), History and Favourites
 * remembered across visits, and the transport bar driving the player. No outside sites.
 */

const errors: string[] = [];
test.beforeEach(({ page }) => {
  errors.length = 0;
  page.on("pageerror", (e) => errors.push(e.message));
});
test.afterEach(() => expect(errors, "uncaught page errors").toEqual([]));

async function stubYouTube(page: Page) {
  const commands: string[] = [];
  await page.exposeFunction("__ytCommand", (c: string) => void commands.push(c));
  await page.route("https://www.youtube-nocookie.com/embed/**", (route: Route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<body style="margin:0;background:#123;color:#fff">video stand-in<script>
        let started=false; const send=(o)=>parent.postMessage(JSON.stringify(o),"*");
        addEventListener("message",(e)=>{ try{ const m=JSON.parse(e.data);
          if(m.event==="listening" && !started){ started=true; send({event:"onReady"}); send({event:"onStateChange",info:1});
            let t=0; setInterval(()=>send({event:"infoDelivery",info:{currentTime:t+=1,duration:300}}),300); }
          if(m.event==="command" && m.func!=="addEventListener"){ parent.postMessage(JSON.stringify({stand_in_command:m.func,args:m.args}),"*");
            if(m.func==="pauseVideo") send({event:"onStateChange",info:2});
            if(m.func==="playVideo") send({event:"onStateChange",info:1}); }
        }catch{} });
      </script></body>`,
    }),
  );
  // Commands the page sends to the player, as the stand-in reports them back.
  await page.addInitScript(() =>
    addEventListener("message", (e) => {
      try {
        const m = JSON.parse(e.data);
        if (m.stand_in_command) (window as unknown as { __ytCommand: (c: string) => void }).__ytCommand(`${m.stand_in_command}:${JSON.stringify(m.args)}`);
      } catch {}
    }),
  );
  return commands;
}

async function openVideo(page: Page) {
  await page.addInitScript(() => sessionStorage.setItem("xplor9.session", "in"));
  await page.goto("/?open=video");
  await expect(page.getByTestId("video-app")).toBeVisible({ timeout: 30_000 });
}

test("watching a featured video records it in History, and the heart keeps it in Favourites", async ({ page }) => {
  await stubYouTube(page);
  await openVideo(page);
  const first = page.getByRole("region", { name: "Featured" }).getByRole("button", { name: /^Watch / }).first();
  const title = (await first.getAttribute("aria-label"))!.replace(/^Watch /, "");
  await first.click();
  await expect(page.getByTestId("video-app").getByTestId("embed-player")).toBeVisible();
  await expect(page.locator(".mx-nowline")).toContainText("Playing");
  await page.getByRole("group", { name: "Player controls" }).getByRole("button", { name: "Add to favourites" }).click();
  await page.goto("/?open=video");
  await page.getByRole("tab", { name: /History/ }).click();
  await expect(page.getByRole("region", { name: "History" })).toContainText(title);
  await page.getByRole("tab", { name: /Favourites/ }).click();
  await expect(page.getByRole("region", { name: "Favourites" })).toContainText(title);
  await page.getByRole("tab", { name: /History/ }).click();
  await page.getByRole("button", { name: "Clear history" }).click();
  await expect(page.getByText("Videos you watch appear here.")).toBeVisible();
});

test("the transport bar drives YouTube's player: pause, seek, volume", async ({ page }) => {
  const commands = await stubYouTube(page);
  await openVideo(page);
  await page.getByRole("tab", { name: /Official channels/ }).click();
  await page.getByRole("button", { name: /^Watch Films Division/ }).click();
  const controls = page.getByRole("group", { name: "Player controls" });
  await expect(controls.getByRole("slider", { name: "Position" })).toBeEnabled({ timeout: 10_000 });
  await controls.getByRole("button", { name: "Pause" }).click();
  await expect(page.locator(".mx-nowline")).toContainText("Paused");
  await controls.getByRole("slider", { name: "Position" }).fill("120");
  await controls.getByRole("slider", { name: "Position" }).press("ArrowRight");
  await controls.getByRole("slider", { name: "Volume" }).fill("40");
  await expect.poll(() => commands.some((c) => c.startsWith("pauseVideo"))).toBe(true);
  await expect.poll(() => commands.some((c) => c.startsWith("seekTo"))).toBe(true);
  await expect.poll(() => commands.some((c) => c === "setVolume:[40]")).toBe(true);
  await controls.getByRole("button", { name: "Stop" }).click();
  await expect(page.getByTestId("video-app").getByTestId("embed-player")).toHaveCount(0);
});

test("search without an API key on the server says so, and links still play", async ({ page }) => {
  await stubYouTube(page);
  await openVideo(page);
  // The regression server has no YOUTUBE_API_KEY: the real route answers "not configured".
  await page.getByLabel("Search or address").fill("doordarshan 1990");
  await expect(page.getByRole("button", { name: "Search", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByTestId("search-state")).toContainText("isn't set up");
  await page.getByLabel("Search or address").fill("https://youtu.be/dQw4w9WgXcQ");
  await page.getByLabel("Search or address").press("Enter");
  await expect(page.locator(".mx-nowline")).toContainText("Playing");
});

test("search results: thumbnails after searching, watch one, more results", async ({ page }) => {
  await stubYouTube(page);
  const thumbs: string[] = [];
  await page.route("https://i.ytimg.com/**", (route) => {
    thumbs.push(route.request().url());
    return route.fulfill({ status: 200, contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>' });
  });
  const queries: string[] = [];
  await page.route("**/api/video/search?*", (route) => {
    const u = new URL(route.request().url());
    queries.push(`${u.searchParams.get("q")}|${u.searchParams.get("pageToken") ?? ""}`);
    const page2 = u.searchParams.get("pageToken") === "NEXT1";
    const r = (id: string, title: string) => ({ videoId: id, title, channelTitle: "Archive Channel", publishedAt: "1992-01-01T00:00:00.000Z", thumbnail: `https://i.ytimg.com/vi/${id}/mqdefault.jpg` });
    return route.fulfill({
      json: page2 ? { results: [r("ccccccccccc", "Third result")], nextPageToken: null } : { results: [r("aaaaaaaaaaa", "First result"), r("bbbbbbbbbbb", "Second result")], nextPageToken: "NEXT1" },
    });
  });
  await openVideo(page);
  expect(thumbs).toEqual([]); // nothing from YouTube before a search
  await page.getByLabel("Search or address").fill("  surabhi   episode ");
  await page.getByLabel("Search or address").press("Enter");
  const list = page.getByRole("region", { name: "Search" });
  await expect(list.getByText("First result")).toBeVisible();
  expect(queries).toEqual(["surabhi episode|"]);
  await expect.poll(() => thumbs.length).toBeGreaterThan(0);
  await list.getByRole("button", { name: "More results" }).click();
  await expect(list.getByText("Third result")).toBeVisible();
  await expect(list.getByRole("button", { name: "More results" })).toHaveCount(0);
  await list.getByRole("button", { name: "Watch Second result" }).click();
  const src = new URL((await page.getByTestId("video-app").getByTestId("embed-player").getAttribute("src"))!);
  expect(src.origin + src.pathname).toBe("https://www.youtube-nocookie.com/embed/bbbbbbbbbbb");
  await page.getByRole("tab", { name: /History/ }).click();
  await expect(page.getByRole("region", { name: "History" })).toContainText("Second result");
});
