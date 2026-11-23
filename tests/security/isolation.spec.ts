import { expect, test, type Frame, type Page } from "@playwright/test";

const PORT = 3010;
const READER = `http://127.0.0.1:${PORT}`;
const FIX = "test-fixtures/security";

const readerFrame = (page: Page) => page.frames().find((f) => f.url().startsWith(`${READER}/isolated/reader`));
const bookFrames = (page: Page) => page.frames().filter((f) => f.url().startsWith(`blob:${READER}`));

/**
 * Counts requests to the outside test host that actually reach the network layer, made by the
 * XPLOR9 page or any frame inside it (book pages included). A new tab opened by the user clicking
 * an http(s) link is allowed by design; those are collected separately and checked for opener.
 */
async function trapExternal(page: Page) {
  const hits: string[] = [];
  const popups: Page[] = [];
  const tabNavigations: string[] = [];
  page.on("popup", (p) => popups.push(p));
  await page.context().route("https://example.com/**", (route) => {
    const req = route.request();
    let fromPage: Page | null = null;
    try {
      fromPage = req.frame().page();
    } catch {
      // Playwright can't attribute the first request of a NEW TAB to a frame. Record it and
      // check later that a new tab really was opened for exactly this URL.
      if (req.isNavigationRequest()) {
        tabNavigations.push(req.url());
        return route.fulfill({ status: 200, contentType: "text/html", body: "<p>outside</p>" });
      }
    }
    // Any other page in this test's browser context can only be a tab opened from the book.
    if (fromPage !== null && fromPage !== page) {
      return route.fulfill({ status: 200, contentType: "text/html", body: "<p>outside</p>" });
    }
    hits.push(req.url());
    return route.fulfill({ status: 204, body: "" });
  });
  return { hits, popups, tabNavigations };
}

async function openInHarness(page: Page, file: string) {
  await page.goto("/reading/isolation-harness");
  await page.evaluate(() => {
    localStorage.setItem("xplor9.secret-marker", "keep-me");
    localStorage.removeItem("xplor9.pwned");
  });
  await page.getByTestId("file-input").setInputFiles(file);
  await expect(page.getByTestId("host-state")).toHaveText(/^(ready|error)$/, { timeout: 30_000 });
}

async function waitForBookFrame(page: Page): Promise<Frame> {
  await expect.poll(() => bookFrames(page).length, { timeout: 15_000 }).toBeGreaterThan(0);
  return bookFrames(page)[0];
}

async function assertNothingReached(page: Page, { hits: externalHits, popups, tabNavigations }: Awaited<ReturnType<typeof trapExternal>>) {
  expect(new URL(page.url()).pathname).toBe("/reading/isolation-harness"); // XPLOR9 wasn't navigated away
  for (const url of tabNavigations) expect(popups.map((p) => p.url())).toContain(url); // only real new tabs
  for (const p of popups) {
    await p.waitForLoadState().catch(() => {});
    expect(new URL(p.url()).protocol).toMatch(/^(https?|about):$/);
    expect(await p.evaluate(() => window.opener === null).catch(() => true)).toBe(true); // no handle back to XPLOR9
  }
  expect(await page.evaluate(() => (window as unknown as { __xplor9_attack?: unknown }).__xplor9_attack ?? null)).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem("xplor9.pwned"))).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem("xplor9.secret-marker"))).toBe("keep-me");
  const reader = readerFrame(page);
  if (reader) expect(await reader.evaluate(() => (window as unknown as { __xplor9_attack?: unknown }).__xplor9_attack ?? null)).toBeNull();
  expect(externalHits).toEqual([]);
}

test.describe("isolated reader: legitimate books", () => {
  test("renders a real EPUB in the separate reader origin and reports progress", async ({ page }) => {
    await openInHarness(page, "public/books/the-time-machine.epub");
    await expect(page.getByTestId("host-state")).toHaveText("ready");
    await expect(page.getByTestId("host-title")).toHaveText("The Time Machine");
    expect(new URL(readerFrame(page)!.url()).origin).toBe(READER);
    const book = await waitForBookFrame(page);
    await expect.poll(() => book.evaluate(() => document.body?.textContent?.trim().length ?? 0), { timeout: 10_000 }).toBeGreaterThan(100);
    // Book styling survived sanitising (stylesheet links kept, fonts from the reader origin).
    expect(await book.evaluate(() => document.querySelectorAll("link[rel~=stylesheet], style").length)).toBeGreaterThan(0);
    const before = await page.getByTestId("host-fraction").innerText();
    for (let i = 0; i < 4; i++) await page.getByRole("button", { name: "Next" }).click();
    await expect.poll(() => page.getByTestId("host-fraction").innerText(), { timeout: 10_000 }).not.toBe(before);
  });
});

test.describe("isolation: code inside a book cannot reach XPLOR9", () => {
  test("book page and reader page are cut off from the main origin", async ({ page }) => {
    await openInHarness(page, "public/books/the-time-machine.epub");
    await expect(page.getByTestId("host-state")).toHaveText("ready"); // a really rendered book, not a refused frame
    const book = await waitForBookFrame(page);
    await expect.poll(() => book.evaluate(() => document.body?.textContent?.trim().length ?? 0)).toBeGreaterThan(100);
    // Run code inside the book page exactly like an injected script would.
    const fromBook = await book.evaluate(async () => {
      const tryIt = (fn: () => unknown) => {
        try {
          fn();
          return "REACHED";
        } catch (e) {
          return (e as Error).name;
        }
      };
      return {
        topDocument: tryIt(() => window.top!.document.title),
        topLocalStorage: tryIt(() => window.top!.localStorage.getItem("xplor9.secret-marker")),
        topIndexedDb: tryIt(() => window.top!.indexedDB.open("xplor9-reading")),
        ownOrigin: location.origin,
      };
    });
    expect(fromBook.topDocument).not.toBe("REACHED");
    expect(fromBook.topLocalStorage).not.toBe("REACHED");
    expect(fromBook.topIndexedDb).not.toBe("REACHED");
    expect(fromBook.ownOrigin).toBe(READER);
    // The reader origin holds no XPLOR9 data at all.
    const readerData = await readerFrame(page)!.evaluate(async () => ({
      keys: Object.keys(localStorage).filter((k) => k.startsWith("xplor9.") && k !== "xplor9.introSeen"),
      dbs: "databases" in indexedDB ? (await indexedDB.databases()).map((d) => d.name) : "n/a",
    }));
    expect(readerData.keys).toEqual([]);
    if (Array.isArray(readerData.dbs)) expect(readerData.dbs).not.toContain("xplor9-reading");
  });
});

// mustRender: the attack is inside an otherwise valid book, so the book has to open and the
// attack has to be neutralised in the rendered page (not merely avoided by failing to open).
for (const [fixture, mustRender] of [
  ["bypass-links-forms", true],
  ["external-resources", true],
  ["xslt-script", true],
  ["html-mutation", true],
  ["svg-document", false], // SVG-only chapters can't be laid out by foliate; may fail cleanly
] as const) {
  test(`malicious EPUB: ${fixture} runs nothing and reaches nothing`, async ({ page }) => {
    const hits = await trapExternal(page);
    await openInHarness(page, `${FIX}/${fixture}.epub`);
    if (mustRender) await expect(page.getByTestId("host-state")).toHaveText("ready");
    if ((await page.getByTestId("host-state").innerText()) === "ready") {
      const book = await waitForBookFrame(page);
      await page.waitForTimeout(2_000); // let onload/onerror/autoplay attempts fire
      const dom = await book.evaluate(() => ({
        scripts: document.querySelectorAll("script").length,
        handlers: [...document.querySelectorAll("*")].reduce((n, el) => n + [...el.attributes].filter((a) => a.name.startsWith("on")).length, 0),
      }));
      expect(dom).toEqual({ scripts: 0, handlers: 0 });
      for (const id of ["tab-js", "nl-js", "fbtn", "top"]) {
        const el = await book.$(`#${id}`);
        if (el) await el.click({ timeout: 2_000 }).catch(() => {});
      }
      await page.waitForTimeout(800);
    }
    await assertNothingReached(page, hits);
  });
}

const LIMIT_CASES: [string, string][] = [
  ["zip-bomb-150mb", "entry-too-large"],
  ["lying-bomb-150mb", "entry-too-large"],
  ["many-entries", "too-many-files"],
  ["path-traversal", "bad-path"],
  ["not-a-zip", "not-zip"],
  ["broken-opf", "parse-failed"],
];
// svg-document: a hostile SVG page as a chapter. The rendering library can't lay out SVG-only
// chapters; the security tests above cover it either rendering harmlessly or failing cleanly.
for (const [fixture, code] of LIMIT_CASES) {
  test(`limits: ${fixture} is refused with "${code}" while the page stays responsive`, async ({ page }) => {
    await page.goto("/reading/isolation-harness");
    await page.getByTestId("file-input").setInputFiles(`${FIX}/${fixture}.epub`);
    const started = Date.now();
    let slowest = 0;
    while (Date.now() - started < 15_000) {
      const t = Date.now();
      const state = await page.getByTestId("host-state").innerText();
      slowest = Math.max(slowest, Date.now() - t);
      if (state === "error" || state === "ready") break;
      await page.waitForTimeout(100);
    }
    await expect(page.getByTestId("host-error")).toHaveAttribute("data-code", code);
    expect(Date.now() - started).toBeLessThan(15_000);
    expect(slowest).toBeLessThan(1_000); // the XPLOR9 page never froze
  });
}

test("limits: truncated archive is refused", async ({ page }) => {
  await page.goto("/reading/isolation-harness");
  await page.getByTestId("file-input").setInputFiles(`${FIX}/truncated.epub`);
  await expect(page.getByTestId("host-error")).toHaveAttribute("data-code", /^(not-zip|not-epub)$/, { timeout: 15_000 });
});

test.describe("message protocol", () => {
  test("the host ignores messages that don't come from the reader frame", async ({ page }) => {
    await openInHarness(page, "public/books/the-time-machine.epub");
    await page.evaluate(() => {
      // Same window, same origin as the host: must still be ignored (wrong origin AND wrong source).
      const fake = { protocol: "xplor9.reader.v1", type: "opened", requestId: "0b5f6c2e-1234-4abc-9def-123456789abc", title: "SPOOFED", sections: 1 };
      window.postMessage(fake, location.origin);
    });
    await page.waitForTimeout(500);
    await expect(page.getByTestId("host-title")).toHaveText("The Time Machine");
  });

  test("the reader ignores messages from anything but its parent", async ({ page }) => {
    await openInHarness(page, "public/books/the-time-machine.epub");
    const reader = readerFrame(page)!;
    await reader.evaluate(() => {
      const fake = { protocol: "xplor9.reader.v1", type: "nav", requestId: "0b5f6c2e-1234-4abc-9def-123456789abc", action: "next" };
      window.postMessage(fake, location.origin);
    });
    await page.waitForTimeout(500);
    expect(await reader.evaluate(() => document.querySelector("[data-state]")?.getAttribute("data-state"))).toBe("ready");
  });

  test("the reader refuses to run outside an XPLOR9 frame", async ({ page }) => {
    await page.goto(`${READER}/isolated/reader`); // top level on the reader origin
    await expect(page.getByText("This reader only opens inside XPLOR9.")).toBeVisible();
    await page.goto(`http://localhost:${PORT}/isolated/reader`); // on the main origin
    await expect(page.getByText("This reader only opens inside XPLOR9.")).toBeVisible();
  });

  test("only XPLOR9 may embed the reader (frame-ancestors)", async ({ request }) => {
    const res = await request.get(`${READER}/isolated/reader`);
    expect(res.headers()["content-security-policy"]).toContain("frame-ancestors 'self' http://localhost:*");
    expect(res.headers()["content-security-policy"]).toContain("object-src 'none'");
  });
});

test("regression: catalogue books still open in the existing reader", async ({ page }) => {
  await page.goto("/reading/the-time-machine/read");
  await expect
    .poll(() => page.evaluate(() => !!(document.querySelector("foliate-view") as unknown as { lastLocation?: unknown })?.lastLocation), { timeout: 20_000 })
    .toBe(true);
});
