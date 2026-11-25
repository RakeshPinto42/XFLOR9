import { expect, test } from "@playwright/test";

/**
 * M5 — Games: Saanp (snake) and Mines play from the keyboard and pointer, and best results
 * are remembered in this browser across visits.
 */

const errors: string[] = [];
test.beforeEach(({ page }) => {
  errors.length = 0;
  page.on("pageerror", (e) => errors.push(e.message));
});
test.afterEach(() => expect(errors, "uncaught page errors").toEqual([]));

test("Saanp: starts from the keyboard, ends at the wall, and the best score survives a reload", async ({ page }) => {
  await page.goto("/games");
  await page.evaluate(() => localStorage.setItem("xplor9.games.best", JSON.stringify({ saanp: 3, minesSeconds: null })));
  await page.goto("/games"); // a reload returns to the desktop; the address reopens the window
  await expect(page.getByText("Best 3")).toBeVisible();

  const board = page.getByTestId("saanp-board");
  await board.focus();
  await page.keyboard.press("ArrowUp"); // steering starts the game
  await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
  // Heading straight up from the middle of a 16-row board hits the wall in ~1 s.
  await expect(page.getByRole("status").filter({ hasText: "Game over" })).toBeVisible({ timeout: 5_000 });
  await expect(page.getByRole("button", { name: "Play again" })).toBeVisible();
  await page.goto("/games"); // a reload returns to the desktop; the address reopens the window
  await expect(page.getByText("Best 3")).toBeVisible(); // a lower score doesn't replace the best
});

test("Saanp: Space pauses and resumes", async ({ page }) => {
  await page.goto("/games");
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await page.keyboard.press(" ");
  await expect(page.getByText("Paused. Press Space or Start.")).toBeVisible();
  await page.keyboard.press(" ");
  await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
});

test("Mines: first square is safe, flags work by right-click and keyboard, a mine ends the game", async ({ page }) => {
  await page.goto("/games");
  await page.getByRole("button", { name: "Mines", exact: true }).click();
  await expect(page.getByRole("button", { name: "Mines", exact: true })).toHaveAttribute("aria-pressed", "true");

  const board = page.getByTestId("mines-board");
  await board.getByRole("button", { name: "Row 5, column 5: closed" }).click();
  await expect(board.getByRole("button", { name: "Row 5, column 5: empty" })).toBeVisible();
  await expect(page.getByText("Boom")).toHaveCount(0);

  // Flag a still-closed square by right-click, then unflag it from the keyboard.
  const closed = board.getByRole("button", { name: /: closed$/ }).first();
  const name = (await closed.getAttribute("aria-label"))!.replace(/closed$/, "");
  await closed.click({ button: "right" });
  await expect(page.getByText("Mines left 9")).toBeVisible();
  const flagged = board.getByRole("button", { name: `${name}flagged` });
  await flagged.focus();
  await page.keyboard.press("f");
  await expect(page.getByText("Mines left 10")).toBeVisible();

  // Open closed squares until either a mine goes off or the board is cleared.
  for (let n = 0; n < 81; n++) {
    if (await page.getByText(/Boom|Cleared in/).count()) break;
    await board.getByRole("button", { name: /: closed$/ }).first().click();
  }
  await expect(page.getByText(/Boom\. That was a mine\.|Cleared in \d+ seconds!/)).toBeVisible();
  await page.getByRole("button", { name: "New game" }).click();
  await expect(board.getByRole("button", { name: /: closed$/ })).toHaveCount(81);
});

test("Games opens from its desktop icon", async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem("xplor9.session", "in"));
  await page.goto("/");
  await page.getByRole("button", { name: /^Games:/ }).dblclick();
  await expect(page.locator('[data-app="games"]').getByRole("heading", { level: 1, name: "Games" })).toBeVisible();
});
