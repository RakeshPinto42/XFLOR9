"use client";

import type { FoliateBook, FoliateTocItem } from "foliate-js/view.js";
import { isMarkupType, sanitizeBookMarkup } from "./sanitize";

/**
 * Thin wrapper around foliate-js. It owns:
 *  - sanitising every page before render (see sanitize.ts),
 *  - safe external links (http/https only, opened with noopener),
 *  - keyboard and tap-zone page turns inside the book frames,
 *  - reporting position changes, and cleaning up on close.
 * Loaded only on the reader page (dynamic import), so other pages never download it.
 */

export interface TocItem {
  label: string;
  href: string;
  children: TocItem[];
}

export interface ReaderLocation {
  cfi: string;
  fraction: number;
  chapter: string | null;
  chapterHref: string | null;
}

export interface EpubController {
  toc: TocItem[];
  next(): Promise<void>;
  prev(): Promise<void>;
  goTo(target: string): Promise<void>;
  goToFraction(fraction: number): Promise<void>;
  setStyles(css: string): void;
  destroy(): void;
}

interface FoliateView extends HTMLElement {
  open(book: FoliateBook): Promise<void>;
  init(opts: { lastLocation?: string | null; showTextStart?: boolean }): Promise<void>;
  next(): Promise<void>;
  prev(): Promise<void>;
  goTo(target: string): Promise<unknown>;
  goToFraction(fraction: number): Promise<void>;
  close(): void;
  renderer: HTMLElement & { setStyles(css: string): void };
}

export async function openEpub(
  container: HTMLElement,
  file: Blob,
  opts: { lastCfi: string | null; styles: string; onRelocate: (loc: ReaderLocation) => void },
): Promise<EpubController> {
  const { makeBook } = await import("foliate-js/view.js"); // also registers <foliate-view>
  const book = await makeBook(new File([file], "book.epub", { type: "application/epub+zip" }));

  // Clean every (X)HTML/SVG page before it becomes a blob URL inside the reader frame.
  book.transformTarget?.addEventListener("data", (event) => {
    const detail = (event as CustomEvent<{ data: unknown; type: string }>).detail;
    if (!isMarkupType(detail.type)) return;
    detail.data = Promise.resolve(detail.data).then(async (d) => {
      if (typeof d === "string") return sanitizeBookMarkup(d, detail.type);
      if (d instanceof Blob) return sanitizeBookMarkup(await d.text(), detail.type);
      return d;
    });
  });

  const view = document.createElement("foliate-view") as FoliateView;
  view.style.display = "block";
  view.style.width = "100%";
  view.style.height = "100%";
  container.append(view);

  view.addEventListener("relocate", (e) => {
    const d = (e as CustomEvent).detail as { cfi: string; fraction: number; tocItem?: { label?: string; href?: string } };
    opts.onRelocate({
      cfi: d.cfi,
      fraction: typeof d.fraction === "number" ? d.fraction : 0,
      chapter: d.tocItem?.label?.trim() || null,
      chapterHref: d.tocItem?.href ?? null,
    });
  });

  // External links: only http(s), opened without giving the new tab access to this page.
  view.addEventListener("external-link", (e) => {
    e.preventDefault();
    const href = String((e as CustomEvent<{ href: string }>).detail.href);
    if (/^https?:\/\//i.test(href)) window.open(href, "_blank", "noopener,noreferrer");
  });

  // Inside each page frame: arrow keys and tap zones (left third back, right third forward).
  view.addEventListener("load", (e) => {
    const doc = (e as CustomEvent<{ doc: Document }>).detail.doc;
    doc.addEventListener("keydown", (ev) => turnOnKey(ev, view));
    doc.addEventListener("click", (ev) => {
      if (ev.defaultPrevented || (ev.target as Element | null)?.closest?.("a")) return;
      if (doc.getSelection()?.toString()) return; // the reader is selecting text
      const frame = doc.defaultView?.frameElement?.getBoundingClientRect();
      const box = container.getBoundingClientRect();
      const x = (frame?.left ?? 0) + ev.clientX - box.left;
      if (x < box.width / 3) void view.prev();
      else if (x > (box.width * 2) / 3) void view.next();
    });
  });

  await view.open(book);
  view.renderer.setAttribute("max-inline-size", "40em");
  view.renderer.setAttribute("gap", "6%");
  view.renderer.setAttribute("max-column-count", "2");
  view.renderer.setStyles(opts.styles);
  await view.init({ lastLocation: opts.lastCfi, showTextStart: !opts.lastCfi });

  return {
    toc: mapToc(book.toc ?? []),
    next: () => view.next(),
    prev: () => view.prev(),
    goTo: async (target) => {
      await view.goTo(target);
    },
    goToFraction: (f) => view.goToFraction(Math.min(1, Math.max(0, f))),
    setStyles: (css) => view.renderer.setStyles(css),
    destroy: () => {
      view.close();
      view.remove();
      book.destroy?.(); // releases the blob URLs holding the book's pages
    },
  };
}

export function turnOnKey(ev: KeyboardEvent, view: { next(): Promise<void>; prev(): Promise<void> }) {
  if (ev.altKey || ev.ctrlKey || ev.metaKey) return;
  if (ev.key === "ArrowRight" || ev.key === "PageDown") {
    ev.preventDefault();
    void view.next();
  } else if (ev.key === "ArrowLeft" || ev.key === "PageUp") {
    ev.preventDefault();
    void view.prev();
  }
}

function mapToc(items: FoliateTocItem[]): TocItem[] {
  return items.map((i) => ({ label: (i.label ?? "").trim() || "Untitled", href: i.href, children: mapToc(i.subitems ?? []) }));
}
