import { THEMES, type ReaderSettings } from "@/features/reading/reader/settings";
import { ImportError, PDF_LIMITS } from "../limits";

/**
 * PDF reading for IMPORTED files (pdfjs-dist 6.5.438, pinned). Runs only in the isolated reader
 * origin. Safety settings:
 *  - PDF.js 6 contains no eval-based code paths (the old isEvalSupported option is gone);
 *  - no scripting (the scripting sandbox is never loaded), no XFA, no annotation layer, so
 *    document JavaScript, Launch/URI/SubmitForm/GoToR actions and embedded files never run;
 *  - parsing happens in PDF.js's own worker; page count, image size, canvas size and time limits.
 * One page is shown at a time: a canvas plus a transparent text layer (selectable, readable by
 * screen readers).
 */

export interface PdfController {
  next(): Promise<void>;
  prev(): Promise<void>;
  setSettings(settings: ReaderSettings): Promise<void>;
  destroy(): void;
}

export interface OpenedPdf {
  controller: PdfController;
  title: string | null;
  pages: number;
}

const TEXT_LAYER_CSS = `
.x9-pdf-page{position:relative;margin:auto;box-shadow:0 2px 12px rgb(0 0 0/.18)}
.x9-pdf-page canvas{display:block;width:100%;height:100%}
.textLayer{position:absolute;inset:0;overflow:clip;line-height:1;text-align:initial;transform-origin:0 0;z-index:0;
  -webkit-text-size-adjust:none;text-size-adjust:none;forced-color-adjust:none;
  --min-font-size:1;--text-scale-factor:calc(var(--total-scale-factor)*var(--min-font-size));--min-font-size-inv:calc(1/var(--min-font-size))}
.textLayer span,.textLayer br{color:transparent;position:absolute;white-space:pre;cursor:text;transform-origin:0% 0%;user-select:text}
.textLayer > :not(.markedContent),.textLayer .markedContent span:not(.markedContent){z-index:1;--font-height:0;
  font-size:calc(var(--text-scale-factor)*var(--font-height));--scale-x:1;--rotate:0deg;
  transform:rotate(var(--rotate)) scaleX(var(--scale-x)) scale(var(--min-font-size-inv))}
.textLayer .markedContent{display:contents}
.textLayer ::selection{background:rgb(0 0 255/.25);color:transparent}
.textLayer .endOfContent{display:block;position:absolute;inset:100% 0 0;z-index:0;cursor:default;user-select:none}
`;

/** Rejects with `code` if `work` hasn't finished in time. */
function within<T>(work: Promise<T>, ms: number, onTimeout: () => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      onTimeout();
      reject(new ImportError("timeout"));
    }, ms);
    work.then(
      (v) => (clearTimeout(timer), resolve(v)),
      (e) => (clearTimeout(timer), reject(e)),
    );
  });
}

export async function openPdf(
  container: HTMLElement,
  bytes: ArrayBuffer,
  opts: { page: number | null; settings: ReaderSettings; onRelocate: (page: number, pages: number) => void },
): Promise<OpenedPdf> {
  const pdfjs = await import("pdfjs-dist");
  const port = new Worker(new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url), { type: "module" });
  // PDF.js documents `port` as a Worker; its generated type wrongly says null. Our own worker
  // lets us terminate it for certain on timeout or close.
  const pdfWorker = new pdfjs.PDFWorker({ port } as unknown as ConstructorParameters<typeof pdfjs.PDFWorker>[0]);
  const task = pdfjs.getDocument({
    data: new Uint8Array(bytes),
    worker: pdfWorker,
    enableXfa: false,
    maxImageSize: PDF_LIMITS.maxImageSize,
    disableWorkerRendering: true,
    stopAtErrors: false,
  });
  let destroyed = false;
  const destroyAll = () => {
    if (destroyed) return;
    destroyed = true;
    void task.destroy().catch(() => {});
    pdfWorker.destroy();
    port.terminate();
  };

  let doc: Awaited<typeof task.promise>;
  try {
    doc = await within(task.promise, PDF_LIMITS.timeoutMs, destroyAll);
  } catch (err) {
    destroyAll();
    if (err instanceof ImportError) throw err;
    const name = (err as { name?: string })?.name;
    if (name === "PasswordException") throw new ImportError("password-protected");
    if (name === "InvalidPDFException") throw new ImportError("not-zip"); // shown as "doesn't look like an EPUB or PDF"
    throw new ImportError("parse-failed");
  }
  const pages = doc.numPages;
  if (!Number.isInteger(pages) || pages < 1) {
    destroyAll();
    throw new ImportError("parse-failed");
  }
  if (pages > PDF_LIMITS.maxPages) {
    destroyAll();
    throw new ImportError("too-many-pages");
  }

  let title: string | null = null;
  try {
    const meta = await within(doc.getMetadata(), 5_000, () => {});
    const t = (meta.info as { Title?: unknown } | undefined)?.Title;
    if (typeof t === "string" && t.trim()) title = t.replace(/[\u0000-\u001f]/g, " ").trim().slice(0, 200);
  } catch {
    /* title is optional */
  }

  // Layout: a scrollable surface with one page centred in it.
  const style = document.createElement("style");
  style.textContent = TEXT_LAYER_CSS;
  const surface = document.createElement("div");
  surface.style.cssText = "position:absolute;inset:0;overflow:auto;display:flex;padding:16px;box-sizing:border-box";
  surface.tabIndex = 0;
  surface.setAttribute("aria-label", "PDF page");
  container.append(style, surface);

  let settings = opts.settings;
  let current = Math.min(Math.max(opts.page ?? 1, 1), pages);
  let renderTask: { cancel(): void; promise: Promise<unknown> } | null = null;
  let generation = 0;

  function applyTheme() {
    const t = THEMES[settings.theme];
    surface.style.background = t.bg;
    // Dark: invert the page so long reading isn't a white glare; warm: a gentle paper tone.
    surface.style.setProperty(
      "--x9-filter",
      settings.theme === "dark" ? "invert(0.9) hue-rotate(180deg)" : settings.theme === "warm" ? "sepia(0.3)" : "none",
    );
  }

  async function render(pageNumber: number) {
    const gen = ++generation;
    renderTask?.cancel();
    const page = await within(doc.getPage(pageNumber), PDF_LIMITS.timeoutMs, () => {});
    if (gen !== generation || destroyed) return;
    const base = page.getViewport({ scale: 1 });
    const availW = Math.max(100, surface.clientWidth - 32);
    const availH = Math.max(100, surface.clientHeight - 32);
    const fit = Math.min(availW / base.width, availH / base.height);
    const cssScale = fit * (settings.fontScale / 100);
    const viewport = page.getViewport({ scale: cssScale });
    // Sharp on high-DPI screens, but never above the canvas pixel limit.
    let ratio = window.devicePixelRatio || 1;
    while (viewport.width * viewport.height * ratio * ratio > PDF_LIMITS.maxCanvasPixels && ratio > 0.25) ratio /= 1.5;
    const pixelViewport = page.getViewport({ scale: cssScale * ratio });

    const wrap = document.createElement("div");
    wrap.className = "x9-pdf-page";
    wrap.style.width = `${Math.floor(viewport.width)}px`;
    wrap.style.height = `${Math.floor(viewport.height)}px`;
    wrap.style.setProperty("--scale-factor", String(cssScale));
    wrap.style.setProperty("--total-scale-factor", String(cssScale));
    wrap.style.background = "#fff";
    wrap.style.filter = "var(--x9-filter)";
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(pixelViewport.width);
    canvas.height = Math.floor(pixelViewport.height);
    canvas.setAttribute("aria-hidden", "true");
    const textLayer = document.createElement("div");
    textLayer.className = "textLayer";
    wrap.append(canvas, textLayer);

    const task = page.render({ canvas, viewport: pixelViewport });
    renderTask = task;
    try {
      await within(task.promise, PDF_LIMITS.timeoutMs, () => task.cancel());
    } catch (err) {
      if ((err as { name?: string })?.name === "RenderingCancelledException") return;
      throw err instanceof ImportError ? err : new ImportError("parse-failed");
    }
    if (gen !== generation || destroyed) return;
    try {
      await new pdfjs.TextLayer({ textContentSource: page.streamTextContent(), container: textLayer, viewport }).render();
    } catch {
      /* text layer is a convenience (selection, screen readers); the page itself rendered */
    }
    if (gen !== generation || destroyed) return;
    surface.replaceChildren(wrap);
    current = pageNumber;
    opts.onRelocate(current, pages);
  }

  const go = async (n: number) => {
    if (n >= 1 && n <= pages && n !== current) await render(n).catch(() => {});
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowRight" || e.key === "PageDown" || (e.key === " " && !e.shiftKey)) void go(current + 1);
    else if (e.key === "ArrowLeft" || e.key === "PageUp" || (e.key === " " && e.shiftKey)) void go(current - 1);
    else return;
    e.preventDefault();
  };
  window.addEventListener("keydown", onKey);
  let resizeTimer: ReturnType<typeof setTimeout> | undefined;
  const resize = new ResizeObserver(() => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => void render(current).catch(() => {}), 150);
  });

  applyTheme();
  try {
    await render(current); // the first page must render, or the file counts as unreadable
  } catch (err) {
    window.removeEventListener("keydown", onKey);
    destroyAll();
    throw err instanceof ImportError ? err : new ImportError("parse-failed");
  }
  resize.observe(surface);

  return {
    title,
    pages,
    controller: {
      next: () => go(current + 1),
      prev: () => go(current - 1),
      async setSettings(next) {
        const rerender = next.fontScale !== settings.fontScale;
        settings = next;
        applyTheme();
        if (rerender) await render(current).catch(() => {});
      },
      destroy() {
        window.removeEventListener("keydown", onKey);
        clearTimeout(resizeTimer);
        resize.disconnect();
        renderTask?.cancel();
        destroyAll();
      },
    },
  };
}
