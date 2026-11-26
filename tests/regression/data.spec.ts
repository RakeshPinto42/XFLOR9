import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";

/**
 * P2 Your data: back up everything to a file, clear, restore it (checked first, all or nothing),
 * refuse bad files, and clear a single app. Representative data is created through the apps and
 * browser storage; the file-level failure cases are covered in depth by src/features/data/backup.test.ts.
 */

const errors: string[] = [];
test.beforeEach(({ page }) => {
  errors.length = 0;
  page.on("pageerror", (e) => errors.push(e.message));
});
test.afterEach(() => expect(errors, "uncaught page errors").toEqual([]));

const win = (page: Page, app: string) => page.locator(`[data-app="${app}"]`);
const panel = (page: Page) => win(page, "control");

async function desktop(page: Page) {
  await page.addInitScript(() => sessionStorage.setItem("xplor9.session", "in"));
  await page.goto("/");
  await expect(page.locator("html[data-desktop-ready]")).toHaveCount(1);
}

async function openYourData(page: Page) {
  await page.getByRole("button", { name: "Start menu" }).click();
  await page.getByRole("menuitem", { name: "Back up and restore" }).click();
  await expect(panel(page).getByRole("tab", { name: "Your data" })).toHaveAttribute("aria-selected", "true");
  await expect(panel(page).getByRole("table")).toBeVisible();
}

/** Some data in several apps: a note, a wallpaper and colours, radio favourites. */
async function seed(page: Page) {
  await page.evaluate(() => {
    localStorage.setItem("xplor9.desktop.prefs", JSON.stringify({ wallpaper: "dusk", theme: "olive", userName: "Asha", systemSounds: true }));
    localStorage.setItem("xplor9.notepad", JSON.stringify({ text: "Shopping: Parle-G, Rasna", wrap: true }));
  });
  await page.reload();
  await expect(page.locator(".xp-root")).toHaveAttribute("data-wallpaper", "dusk");
}

async function backUp(page: Page): Promise<string> {
  const download = page.waitForEvent("download");
  await panel(page).getByRole("button", { name: "Back up to a file…" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^xplor9-backup-\d{4}-\d{2}-\d{2}\.json$/);
  await expect(panel(page).getByRole("status").filter({ hasText: "Backup saved as" })).toBeVisible();
  return readFile((await file.path())!, "utf8");
}

async function chooseFile(page: Page, text: string, name = "backup.json") {
  await panel(page).locator('input[type="file"]').setInputFiles({ name, mimeType: "application/json", buffer: Buffer.from(text) });
}

test("back up, clear everything, then restore: all the data comes back", async ({ page }) => {
  await desktop(page);
  await seed(page);
  await openYourData(page);
  const backup = await backUp(page);
  expect(JSON.parse(backup)).toMatchObject({ format: "xplor9-backup", version: 1 });
  expect(backup).toContain("Parle-G");

  // Clear everything (asks first; Cancel keeps it).
  await panel(page).getByRole("button", { name: "Clear everything…" }).click();
  await panel(page).getByRole("alertdialog").getByRole("button", { name: "Cancel" }).click();
  await expect(panel(page).getByRole("alertdialog")).toHaveCount(0);
  await panel(page).getByRole("button", { name: "Clear everything…" }).click();
  await panel(page).getByRole("alertdialog").getByRole("button", { name: "Clear everything" }).click();
  // XPLOR9 restarts; the panel comes back on Your data and says what happened.
  await expect(panel(page).getByRole("status").filter({ hasText: "All of XPLOR9's data was cleared." })).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(".xp-root")).not.toHaveAttribute("data-wallpaper", "dusk");
  expect(await page.evaluate(() => localStorage.getItem("xplor9.notepad"))).toBeNull();

  // Restore from the file: it's checked and summarised first.
  await chooseFile(page, backup);
  const form = panel(page).getByRole("form", { name: "Restore this backup" });
  await expect(form).toContainText("Notepad");
  await expect(form).toContainText("Desktop and sound");
  await form.getByRole("button", { name: "Restore" }).click();
  await expect(panel(page).getByRole("status").filter({ hasText: "Restored from the backup made on" })).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(".xp-root")).toHaveAttribute("data-wallpaper", "dusk");
  await expect(page.locator(".xp-root")).toHaveAttribute("data-theme", "olive");
  await page.getByRole("button", { name: "Start menu" }).click();
  await page.getByRole("menuitem", { name: /^Notepad/ }).click();
  await expect(page.locator("#notepad-text")).toHaveValue("Shopping: Parle-G, Rasna");
});

test("bad backup files are refused and nothing changes", async ({ page }) => {
  await desktop(page);
  await seed(page);
  await openYourData(page);
  const backup = await backUp(page);
  const alert = panel(page).getByRole("alert");

  await chooseFile(page, backup.slice(0, Math.floor(backup.length / 2))); // an incomplete download
  await expect(alert).toContainText("incomplete or damaged");
  await chooseFile(page, JSON.stringify({ hello: "world" }));
  await expect(alert).toContainText("isn't an XPLOR9 backup");
  await chooseFile(page, backup.replace('"version":1', '"version":99'));
  await expect(alert).toContainText("newer version of XPLOR9");
  await chooseFile(page, backup.replace("Parle-G", "Parle-X")); // edited by hand
  await expect(alert).toContainText("damaged or was changed");
  await expect(panel(page).getByRole("form", { name: "Restore this backup" })).toHaveCount(0);

  await page.reload();
  await expect(page.locator(".xp-root")).toHaveAttribute("data-wallpaper", "dusk");
  expect(await page.evaluate(() => localStorage.getItem("xplor9.notepad"))).toContain("Parle-G");
});

test("restore only the ticked apps", async ({ page }) => {
  await desktop(page);
  await seed(page);
  await openYourData(page);
  const backup = await backUp(page);
  await page.evaluate(() => {
    localStorage.setItem("xplor9.notepad", JSON.stringify({ text: "today's note", wrap: true }));
    localStorage.setItem("xplor9.desktop.prefs", JSON.stringify({ wallpaper: "hills", theme: "blue", userName: "Asha", systemSounds: true }));
  });
  await chooseFile(page, backup);
  const form = panel(page).getByRole("form", { name: "Restore this backup" });
  await form.getByRole("checkbox", { name: /Notepad/ }).uncheck();
  await form.getByRole("button", { name: "Restore" }).click();
  await expect(panel(page).getByRole("status").filter({ hasText: "Restored" })).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(".xp-root")).toHaveAttribute("data-wallpaper", "dusk");
  expect(await page.evaluate(() => localStorage.getItem("xplor9.notepad"))).toContain("today's note");
});

test("storage used per app, and clearing one app leaves the others", async ({ page }) => {
  await desktop(page);
  await seed(page);
  await openYourData(page);
  const row = (name: string) => panel(page).getByRole("row").filter({ has: page.getByRole("rowheader", { name: new RegExp(`^${name}`) }) });
  await expect(row("Television")).toContainText("Nothing saved");
  await expect(row("Television").getByRole("button")).toBeDisabled();
  await expect(row("Notepad")).toContainText(/\d+ bytes/);
  await panel(page).getByRole("button", { name: "Clear Notepad's data" }).click();
  await expect(panel(page).getByRole("alertdialog")).toContainText("your note");
  await panel(page).getByRole("alertdialog").getByRole("button", { name: "Clear Notepad's data" }).click();
  await expect(panel(page).getByRole("status").filter({ hasText: "Notepad's data was cleared." })).toBeVisible({ timeout: 15_000 });
  await expect(row("Notepad")).toContainText("Nothing saved");
  await expect(page.locator(".xp-root")).toHaveAttribute("data-wallpaper", "dusk");
});

/** Opens the Reading Room's database as the app creates it (version 3). */
function readingDb(page: Page, run: string) {
  return page.evaluate(async (body) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open("xplor9-reading", 3);
      req.onupgradeneeded = () => {
        const d = req.result;
        d.createObjectStore("progress", { keyPath: "bookKey" });
        d.createObjectStore("bookmarks", { keyPath: "id" }).createIndex("byBook", "bookKey");
        d.createObjectStore("favourites", { keyPath: "bookKey" });
        d.createObjectStore("recent", { keyPath: "bookKey" });
        d.createObjectStore("imports", { keyPath: "id" });
        d.createObjectStore("importFiles", { keyPath: "id" });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const tx = (stores: string[], mode: IDBTransactionMode) => db.transaction(stores, mode);
    const req = <T,>(r: IDBRequest<T>) => new Promise<T>((res, rej) => ((r.onsuccess = () => res(r.result)), (r.onerror = () => rej(r.error))));
    const result = await new Function("tx", "req", `return (async () => { ${body} })()`)(tx, req);
    db.close();
    return result;
  }, run);
}

test("imported books and reading progress are backed up and restored", async ({ page }) => {
  await desktop(page);
  const id = "0b7c6f3e-9a1d-4c2b-8e5f-123456789abc";
  await readingDb(
    page,
    `const t = tx(["imports", "importFiles", "progress"], "readwrite");
     const bytes = new TextEncoder().encode("%PDF-1.7 a small test book").buffer;
     t.objectStore("importFiles").put({ id: "${id}", data: bytes });
     t.objectStore("imports").put({ id: "${id}", format: "pdf", name: "Notes.pdf", title: "Notes", size: bytes.byteLength, addedAt: 1, openedAt: null });
     t.objectStore("progress").put({ bookKey: "local:${id}", cfi: "pdf:page=7", fraction: 0.3, chapter: null, updatedAt: 1 });
     await new Promise((r) => (t.oncomplete = r));`,
  );
  await openYourData(page);
  await expect(panel(page).getByRole("row").filter({ hasText: "Reading Room" })).toContainText("including 1 imported book");
  await expect(panel(page).getByRole("checkbox", { name: /Include my imported books \(1 book/ })).toBeChecked();
  const backup = await backUp(page);

  await panel(page).getByRole("button", { name: "Clear Reading Room's data" }).click();
  await panel(page).getByRole("alertdialog").getByRole("button", { name: "Clear Reading Room's data" }).click();
  await expect(panel(page).getByRole("status").filter({ hasText: "Reading Room's data was cleared." })).toBeVisible({ timeout: 15_000 });
  expect(await readingDb(page, `return (await req(tx(["imports"], "readonly").objectStore("imports").getAll())).length;`)).toBe(0);

  await chooseFile(page, backup);
  await expect(panel(page).getByRole("form", { name: "Restore this backup" })).toContainText("1 book with progress, 1 imported book");
  await panel(page).getByRole("form", { name: "Restore this backup" }).getByRole("button", { name: "Restore" }).click();
  await expect(panel(page).getByRole("status").filter({ hasText: "Restored" })).toBeVisible({ timeout: 15_000 });
  const restored = await readingDb(
    page,
    `const t = tx(["importFiles", "progress"], "readonly");
     const file = await req(t.objectStore("importFiles").get("${id}"));
     const progress = await req(t.objectStore("progress").get("local:${id}"));
     return { text: new TextDecoder().decode(file.data), page: progress.cfi };`,
  );
  expect(restored).toEqual({ text: "%PDF-1.7 a small test book", page: "pdf:page=7" });
});
