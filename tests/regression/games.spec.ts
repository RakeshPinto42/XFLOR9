import { expect, test, type Page } from "@playwright/test";

/**
 * Games (D2): the Arcade launcher opens Saanp and Mines in their own windows, with menu bars.
 * Saanp plays from the keyboard and pointer; Mines keeps a best time per level; best results and
 * settings are remembered in this browser across visits.
 */

const errors: string[] = [];
test.beforeEach(({ page }) => {
  errors.length = 0;
  page.on("pageerror", (e) => errors.push(e.message));
});
test.afterEach(() => expect(errors, "uncaught page errors").toEqual([]));

const win = (page: Page, app: string) => page.locator(`[data-app="${app}"]`);

async function launch(page: Page, game: "Saanp" | "Mines") {
  await page.goto("/games");
  await expect(page.getByTestId("arcade")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: new RegExp(`^${game}:`) }).click();
  await page.getByRole("button", { name: `Play ${game}` }).click();
  await expect(win(page, game.toLowerCase())).toBeVisible();
}

test("Saanp: starts from the keyboard, ends at the wall, and the best score survives a new visit", async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem("seeded")) {
      localStorage.setItem("xplor9.games.best", JSON.stringify({ saanp: 3, minesSeconds: null }));
      sessionStorage.setItem("seeded", "1");
    }
  });
  await launch(page, "Saanp");
  const game = win(page, "saanp");
  await expect(game.getByText("Best 3")).toBeVisible();
  await game.getByTestId("saanp-board").focus();
  await page.keyboard.press("ArrowUp"); // steering starts the game
  await expect(game.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
  // Heading straight up from the middle of a 16-row board hits the wall in about a second.
  await expect(game.getByRole("status").filter({ hasText: "Game over" })).toBeVisible({ timeout: 5_000 });
  await expect(game.getByRole("button", { name: "Play again" })).toBeVisible();
  await launch(page, "Saanp");
  await expect(win(page, "saanp").getByText("Best 3")).toBeVisible(); // a lower score doesn't replace the best
  await expect(page.getByTestId("arcade").getByText("Saanp", { exact: true }).locator("xpath=following-sibling::dd[1]")).toHaveText("3");
});

test("Saanp: Space pauses and resumes; the Speed menu is remembered", async ({ page }) => {
  await launch(page, "Saanp");
  const game = win(page, "saanp");
  await game.getByRole("button", { name: "Start", exact: true }).click();
  await page.keyboard.press(" ");
  await expect(game.getByText("Paused. Press Space or Start.")).toBeVisible();
  await page.keyboard.press(" ");
  await expect(game.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
  await game.getByRole("menuitem", { name: "Speed" }).click();
  await game.getByRole("menuitemradio", { name: "Fast" }).click();
  await expect(game.getByText("Speed: Fast")).toBeVisible();
  await launch(page, "Saanp");
  await expect(win(page, "saanp").getByText("Speed: Fast")).toBeVisible();
});

test("Mines: first square is safe, flags work by right-click and keyboard, a mine ends the game", async ({ page }) => {
  await launch(page, "Mines");
  const game = win(page, "mines");
  const board = game.getByTestId("mines-board");
  await board.getByRole("button", { name: "Row 5, column 5: closed" }).click();
  await expect(board.getByRole("button", { name: /Row 5, column 5: (empty|\d)/ })).toBeVisible();
  await expect(game.getByText("Boom")).toHaveCount(0);

  // Flag a still-closed square by right-click, then unflag it from the keyboard.
  const closed = board.getByRole("button", { name: /: closed$/ }).first();
  const name = (await closed.getAttribute("aria-label"))!.replace(/closed$/, "");
  await closed.click({ button: "right" });
  await expect(game.getByRole("img", { name: "Mines left 9" })).toBeVisible();
  const flagged = board.getByRole("button", { name: `${name}flagged` });
  await flagged.focus();
  await page.keyboard.press("f");
  await expect(game.getByRole("img", { name: "Mines left 10" })).toBeVisible();

  // Open closed squares until either a mine goes off or the board is cleared.
  for (let n = 0; n < 81; n++) {
    if (await game.getByText(/Boom|Cleared in/).count()) break;
    await board.getByRole("button", { name: /: closed$/ }).first().click();
  }
  await expect(game.getByText(/Boom\. That was a mine\.|Cleared in \d+ seconds!/)).toBeVisible();
  await game.getByRole("button", { name: "New game", exact: true }).click();
  await expect(board.getByRole("button", { name: /: closed$/ })).toHaveCount(81);
});

test("Mines: levels from the Game menu change the field and fit the window; the level is remembered", async ({ page }) => {
  await launch(page, "Mines");
  const game = win(page, "mines");
  const before = (await game.boundingBox())!;
  await game.getByRole("menuitem", { name: "Game" }).click();
  await game.getByRole("menuitemradio", { name: "Intermediate" }).click();
  await expect(game.getByTestId("mines-board").getByRole("button")).toHaveCount(256);
  await expect(game.getByRole("img", { name: "Mines left 40" })).toBeVisible();
  const after = (await game.boundingBox())!;
  expect(after.width).toBeGreaterThan(before.width);
  await expect(game.getByText("Intermediate · Best –")).toBeVisible();
  await launch(page, "Mines");
  await expect(win(page, "mines").getByTestId("mines-board").getByRole("button")).toHaveCount(256);
});

test("the menu bar works from the keyboard", async ({ page }) => {
  await launch(page, "Mines");
  const game = win(page, "mines");
  await game.getByRole("menuitem", { name: "Game" }).click();
  await expect(game.getByRole("menuitem", { name: /New game/ })).toBeFocused();
  await page.keyboard.press("ArrowRight"); // to the Help menu
  await expect(game.getByRole("menuitemradio", { name: "How to play" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(game.getByText(/Open every square without a mine/)).toBeVisible();
  await game.getByRole("menuitem", { name: "Help" }).click();
  await page.keyboard.press("Escape");
  await expect(game.getByRole("menu")).toHaveCount(0);
});
