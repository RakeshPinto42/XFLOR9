import { readFileSync } from "node:fs";
import { expect, test, type Frame, type Page } from "@playwright/test";

/** R5: every catalogue book opens in the real reader; search, filters and Indic rendering. */

const catalogue = JSON.parse(readFileSync("content/books/catalogue.json", "utf8")) as { books: { id: string; title: string }[] };

const errors: string[] = [];
test.beforeEach(({ page }) => {
  errors.length = 0;
  page.on("pageerror", (e) => {
    // Known transient foliate layout error (see tests/regression/imports.spec.ts).
    if (/Cannot destructure property 'style' of '\w+' as it is null/.test(e.message)) return;
    errors.push(e.message);
  });
});
test.afterEach(() => expect(errors, "uncaught page errors").toEqual([]));

async function openCatalogueBook(page: Page, id: string) {
  await page.goto(`/reading/${id}/read`);
  await expect
    .poll(() => page.evaluate(() => !!(document.querySelector("foliate-view") as unknown as { lastLocation?: unknown })?.lastLocation), { timeout: 30_000 })
    .toBe(true);
}

/** Text of the book page frames currently shown by foliate. */
async function bookText(page: Page): Promise<string> {
  const texts = await Promise.all(
    page.frames().filter((f: Frame) => f.url().startsWith("blob:")).map((f) => f.evaluate(() => document.body?.textContent ?? "").catch(() => "")),
  );
  return texts.join("\n");
}

test("every catalogue book opens in the reader", async ({ page }) => {
  test.setTimeout(240_000);
  expect(catalogue.books.length).toBeGreaterThanOrEqual(17);
  for (const b of catalogue.books) {
    await openCatalogueBook(page, b.id);
    await expect.poll(async () => (await bookText(page)).trim().length, { message: b.id, timeout: 15_000 }).toBeGreaterThan(10); // a title page may be mostly image
  }
});

test("Treasure Island: chapter openings are complete and there are no stray markers", async ({ page }) => {
  await openCatalogueBook(page, "treasure-island");
  await page.getByRole("button", { name: "Contents and bookmarks" }).click();
  await page.getByRole("navigation", { name: "Chapters" }).getByRole("button", { name: /Admiral Benbow/ }).first().click();
  await expect.poll(() => bookText(page), { timeout: 15_000 }).toContain("Squire Trelawney, Doctor Livesey");
  expect(await bookText(page)).not.toMatch(/\b\d{4}m\b/);
});

test("search and filters work across the larger shelf", async ({ page }) => {
  await page.goto("/reading", { waitUntil: "networkidle" }); // typing before hydration would be lost
  const search = page.getByPlaceholder("Try Kipling or Sherlock");
  await search.fill("tagore");
  await expect(page.getByText(/^2 of \d+ books$/)).toBeVisible();
  await expect(page.locator('a[href="/reading/gitanjali"]').first()).toBeVisible();
  await search.fill("");
  await page.getByRole("group", { name: "Genre" }).getByRole("button", { name: "Poetry" }).click();
  await expect(page.getByText(/^4 of \d+ books$/)).toBeVisible();
  await page.getByRole("group", { name: "Genre" }).getByRole("button", { name: "Folklore" }).click();
  await expect(page.locator('a[href="/reading/indian-fairy-tales"]').first()).toBeVisible();
});

test("Devanagari and Kannada render with the reader's Indic fonts and shaping", async ({ page }) => {
  // The Indic sample goes through the same reader fonts as catalogue books (via the import path).
  await page.goto("/reading");
  await page.locator("#import-file").setInputFiles("test-fixtures/indic-sample.epub");
  await expect(page.getByRole("status").filter({ hasText: /^Added “/ })).toBeVisible({ timeout: 15_000 });
  await page.getByRole("link", { name: /^Open indic-sample/i }).click();
  await expect(page.getByTestId("imported-reader")).toHaveAttribute("data-state", "ready", { timeout: 30_000 });

  const probe = async (id: string, family: string) => {
    for (let i = 0; i < 6; i++) {
      const frame = page.frames().find((f) => f.url().startsWith("blob:http://127.0.0.1"));
      const result = frame
        ? await frame
            .evaluate(
              async ({ id, family }) => {
                const el = document.getElementById(id);
                if (!el) return null;
                await document.fonts.ready;
                const loaded = [...document.fonts].some((f) => f.family.replace(/"/g, "") === family && f.status === "loaded");
                // Shaping check: a conjunct is narrower than its letters drawn separately with a visible virama.
                const span = (t: string) => {
                  const s = document.createElement("span");
                  s.textContent = t;
                  s.style.cssText = "position:absolute;white-space:nowrap;visibility:hidden";
                  el.append(s);
                  const w = s.getBoundingClientRect().width;
                  s.remove();
                  return w;
                };
                const text = el.textContent ?? "";
                const conjunct = text.split(" ")[0]; // e.g. ಕ್ಷ / क्ष
                const parts = [...conjunct].join("‌"); // ZWNJ blocks the conjunct
                return { loaded, conjunctWidth: span(conjunct), brokenWidth: span(parts) };
              },
              { id, family },
            )
            .catch(() => null)
        : null;
      if (result) return result;
      await page.getByRole("button", { name: "Next page" }).click();
      await page.waitForTimeout(500);
    }
    return null;
  };

  const kn = await probe("kn-probe", "Noto Serif Kannada");
  expect(kn, "Kannada chapter reached").not.toBeNull();
  expect(kn!.loaded).toBe(true);
  expect(kn!.conjunctWidth).toBeLessThan(kn!.brokenWidth);

  const hi = await probe("hi-probe", "Noto Serif Devanagari");
  expect(hi, "Devanagari chapter reached").not.toBeNull();
  expect(hi!.loaded).toBe(true);
  expect(hi!.conjunctWidth).toBeLessThan(hi!.brokenWidth);
});
