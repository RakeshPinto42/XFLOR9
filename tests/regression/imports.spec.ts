import { writeFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { PDF_FIXTURES } from "../../scripts/books/make-pdf-security-fixtures";

/** The visitor's real flow: import → open in the isolated reader → read → resume → delete. */

const errors: string[] = [];
test.beforeEach(({ page }) => {
  errors.length = 0;
  page.on("pageerror", (e) => {
    // Known transient error inside foliate's page layout (a page laid out before its <body>
    // exists, seen under load). foliate recovers, and the reader tolerates it (see failSafe).
    if (/Cannot destructure property 'style' of '\w+' as it is null/.test(e.message)) return;
    errors.push(e.message);
  });
});
test.afterEach(() => expect(errors, "uncaught page errors").toEqual([]));

async function importBook(page: Page, path: string) {
  await page.goto("/reading");
  await expect(page.getByRole("heading", { name: "Your files" })).toBeVisible();
  await page.locator("#import-file").setInputFiles(path);
  await expect(page.getByRole("status").filter({ hasText: /^Added “/ })).toBeVisible({ timeout: 15_000 });
}

const reader = (page: Page) => page.getByTestId("imported-reader");
const percent = (page: Page) => page.getByTestId("imported-percent").innerText();

test("EPUB: import, read, resume, theme, delete", async ({ page }) => {
  await importBook(page, "public/books/the-time-machine.epub");
  await page.getByRole("link", { name: /^Open the.time.machine/i }).click();
  await expect(reader(page)).toHaveAttribute("data-state", "ready", { timeout: 30_000 });
  // Title comes from the book itself, via the isolated reader.
  await expect(page.getByRole("heading", { level: 1, name: "The Time Machine" })).toBeVisible();
  // The book is rendered on the separate reader origin.
  expect(page.frames().some((f) => f.url().startsWith("http://127.0.0.1:"))).toBe(true);

  const start = await percent(page);
  for (let i = 0; i < 6; i++) await page.getByRole("button", { name: "Next page" }).click();
  await expect.poll(() => percent(page)).not.toBe(start);
  const saved = await percent(page);
  await page.waitForTimeout(1_200); // debounced save

  // Theme applies to the reader page (dark background) and the setting is shared with catalogue books.
  await page.getByRole("button", { name: "Text and theme settings" }).click();
  await page.getByText("Dark", { exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(reader(page)).toHaveCSS("background-color", "rgb(20, 26, 44)");

  // Resume: reopening lands on the saved place.
  await page.goto("/reading");
  await expect(page.getByText(/% read/)).toBeVisible();
  await page.getByRole("link", { name: /^Continue the.time.machine/i }).click();
  await expect(reader(page)).toHaveAttribute("data-state", "ready", { timeout: 30_000 });
  await expect.poll(() => percent(page)).toBe(saved);

  // Delete removes it (and its progress) after an in-page confirmation.
  await page.goto("/reading");
  await page.getByRole("button", { name: /^Delete the.time.machine/i }).click();
  await page.getByRole("group", { name: /Delete The Time Machine/ }).getByRole("button", { name: "Delete" }).click();
  await expect(page.getByRole("status").filter({ hasText: /^Deleted “The Time Machine”/ })).toBeVisible();
  await expect(page.getByText("No imported books yet.")).toBeVisible();
  await page.reload();
  await expect(page.getByText("No imported books yet.")).toBeVisible();
});

test("PDF: import and read with selectable text", async ({ page }, info) => {
  // A small one-page PDF from the corpus builder.
  const path = info.outputPath("one-page.pdf");
  const clean = PDF_FIXTURES.find((f) => f.name === "clean")!;
  writeFileSync(path, clean.build());
  await importBook(page, path);
  await page.getByRole("link", { name: /^Open one-page/i }).click();
  await expect(reader(page)).toHaveAttribute("data-state", "ready", { timeout: 30_000 });
  await expect(page.getByText("Page 1 of 1")).toBeVisible();
  // Text is selectable/readable through PDF.js's text layer inside the isolated frame.
  const frame = page.frames().find((f) => f.url().includes("/isolated/reader"))!;
  await expect.poll(() => frame.evaluate(() => document.querySelector(".textLayer")?.textContent ?? "")).toContain("Clean test page");
});

test("refuses files that aren't what they claim to be, with a clear message", async ({ page }, info) => {
  const path = info.outputPath("not-really.pdf");
  writeFileSync(path, "<html><script>alert(1)</script></html>");
  await page.goto("/reading");
  await page.locator("#import-file").setInputFiles(path);
  await expect(page.getByRole("alert").filter({ hasText: "doesn't look like an EPUB or PDF" })).toBeVisible();
  await expect(page.getByText("No imported books yet.")).toBeVisible();
});
