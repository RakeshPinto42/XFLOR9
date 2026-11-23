import { expect, test, type Page } from "@playwright/test";

const BOOK = "the-time-machine";
const errors: string[] = [];

test.beforeEach(({ page }) => {
  errors.length = 0;
  page.on("pageerror", (e) => errors.push(e.message));
});
test.afterEach(() => expect(errors, "uncaught page errors").toEqual([]));

async function openReader(page: Page) {
  await page.goto(`/reading/${BOOK}/read`);
  await expect
    .poll(() => page.evaluate(() => !!(document.querySelector("foliate-view") as unknown as { lastLocation?: unknown })?.lastLocation), { timeout: 20_000 })
    .toBe(true);
}
const percent = (page: Page) => page.getByRole("slider").getAttribute("aria-valuetext");

test("the test-only harness does not exist in a normal build", async ({ page }) => {
  const res = await page.goto("/reading/isolation-harness");
  // First request for an unknown page may stream with 200 (known Next 16 behaviour, noindex); the page shown is 404.
  expect([200, 404]).toContain(res?.status());
  await expect(page.getByText(/could not be found|404/i).first()).toBeVisible();
  await expect(page.getByTestId("file-input")).toHaveCount(0);
});

test("the isolated reader refuses to run on the main origin", async ({ page }) => {
  await page.goto("/isolated/reader");
  await expect(page.getByText("This reader only opens inside XPLOR9.")).toBeVisible();
});

test("Reading Room lists the five catalogue books", async ({ page }) => {
  await page.goto("/reading");
  await expect(page.getByRole("heading", { level: 1, name: "Reading Room" })).toBeVisible();
  for (const id of ["treasure-island", "adventures-of-sherlock-holmes", "the-jungle-book", "the-time-machine", "vikram-and-the-vampire"]) {
    await expect(page.locator(`a[href="/reading/${id}"]`).first()).toBeVisible();
  }
});

test("reading: page turns, progress is saved, bookmarks survive a reload", async ({ page }) => {
  await openReader(page);
  const start = await percent(page);
  for (let i = 0; i < 6; i++) await page.getByRole("button", { name: "Next page" }).click();
  await expect.poll(() => percent(page)).not.toBe(start);
  await page.getByRole("button", { name: "Bookmark this page" }).click();
  await expect(page.getByRole("button", { name: "Remove bookmark from this page" })).toBeVisible();
  const saved = await percent(page);
  await page.waitForTimeout(1_000); // progress save is debounced (600 ms)

  await openReader(page); // reload: opens at the saved place, still bookmarked
  await expect.poll(() => percent(page)).toBe(saved);
  await expect(page.getByRole("button", { name: "Remove bookmark from this page" })).toBeVisible();

  await page.goto(`/reading/${BOOK}`);
  await expect(page.getByRole("link", { name: /Continue reading \(\d+%\)/ })).toBeVisible();
});

test("reading: text size change keeps the reader working and the place", async ({ page }) => {
  await openReader(page);
  for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Next page" }).click();
  await page.getByRole("button", { name: "Text and theme settings" }).first().click();
  await page.getByRole("button", { name: "Larger text" }).click();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Next page" }).click();
  await expect.poll(() => percent(page)).not.toBe("0% through the book");
});

test("reading: search finds matches in the book", async ({ page }) => {
  await openReader(page);
  await page.getByRole("button", { name: "Search this book" }).first().click();
  await page.getByPlaceholder("Search this book").fill("Time Traveller");
  await page.getByPlaceholder("Search this book").press("Enter");
  await expect(page.getByText(/\d+\+? matches for “Time Traveller”/)).toBeVisible({ timeout: 30_000 });
});

test("favourites persist across reloads and appear in My Library", async ({ page }) => {
  await page.goto(`/reading/${BOOK}`);
  await page.getByRole("button", { name: /Add The Time Machine to favourites/ }).click();
  await expect(page.getByRole("button", { name: /Remove The Time Machine from favourites/ })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: /Remove The Time Machine from favourites/ })).toBeVisible();
  await page.goto("/reading");
  await expect(page.getByText("Your favourites")).toBeVisible();
});

test("radio page still loads its tuner", async ({ page }) => {
  await page.goto("/radio");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.locator("main")).not.toBeEmpty();
});
