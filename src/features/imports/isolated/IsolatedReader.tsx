"use client";

import { strFromU8 } from "fflate";
import { useEffect, useRef, useState } from "react";
import { openEpubBook, type EpubController } from "@/features/reading/reader/epubEngine";
import { DEFAULT_SETTINGS, bookStylesheet } from "@/features/reading/reader/settings";
import { EPUB_LIMITS, ImportError, type ImportErrorCode } from "../limits";
import { mainOriginFor } from "../origins";
import { PROTOCOL, isFrom, parseHostMessage, type HostToReader, type ReaderToHost } from "../protocol";
import { purifyBookMarkup } from "./purify";

/**
 * The isolated reader. Runs ONLY on the reader origin, inside a frame owned by the main origin.
 * It holds no user data and never touches storage; it receives a file, renders it, and reports
 * the reading position back. Even if a hostile book escaped every layer here, it would be on an
 * origin with nothing to steal.
 */
export function IsolatedReader() {
  const surface = useRef<HTMLDivElement>(null);
  // Browser-only component (loaded with ssr:false), so window is available on first render.
  const [state, setState] = useState<"waiting" | "refused" | "opening" | "ready" | "error">(() =>
    !mainOriginFor(window.location) || window.parent === window ? "refused" : "waiting",
  );

  useEffect(() => {
    const main = mainOriginFor(window.location);
    if (!main || window.parent === window) return; // refused: never listen, never announce
    let controller: EpubController | null = null;
    let worker: Worker | null = null;
    const send = (msg: ReaderToHost) => window.parent.postMessage(msg, main);

    async function open(msg: Extract<HostToReader, { type: "open" }>) {
      controller?.destroy();
      controller = null;
      setState("opening");
      try {
        const files = await extractInWorker(msg.bytes, (w) => (worker = w));
        const book = await buildBook(files);
        if (!surface.current) return;
        surface.current.replaceChildren();
        controller = await failSafe(
          openEpubBook(surface.current, book, {
            lastCfi: msg.position,
            styles: bookStylesheet(DEFAULT_SETTINGS, window.location.origin),
            preSanitize: purifyBookMarkup,
            onRelocate: (loc) =>
              send({ protocol: PROTOCOL, type: "relocated", requestId: msg.requestId, fraction: loc.fraction, position: loc.cfi, chapter: loc.chapter?.slice(0, 200) ?? null }),
          }),
        );
        send({ protocol: PROTOCOL, type: "opened", requestId: msg.requestId, title: titleOf(book), sections: Math.min(book.sections.length, EPUB_LIMITS.maxEntries) });
        setState("ready");
      } catch (err) {
        const code: ImportErrorCode = err instanceof ImportError ? err.code : "parse-failed";
        send({ protocol: PROTOCOL, type: "error", requestId: msg.requestId, code });
        setState("error");
      }
    }

    const onMessage = (event: MessageEvent) => {
      if (!isFrom(event, main, window.parent)) return; // exact origin AND the parent window only
      const msg = parseHostMessage(event.data);
      if (!msg) return;
      if (msg.type === "open") void open(msg);
      else if (msg.type === "nav") void (msg.action === "next" ? controller?.next() : controller?.prev());
    };
    window.addEventListener("message", onMessage);
    send({ protocol: PROTOCOL, type: "ready" });
    return () => {
      window.removeEventListener("message", onMessage);
      (worker as Worker | null)?.terminate();
      controller?.destroy();
    };
  }, []);

  if (state === "refused")
    return (
      <p role="alert" className="fixed inset-0 z-50 grid place-items-center bg-panel p-6 text-center font-semibold">
        This reader only opens inside XPLOR9.
      </p>
    );
  return (
    <div className="fixed inset-0 z-50 bg-[#fffcf4]" data-state={state}>
      <div ref={surface} className="absolute inset-0" aria-label="Imported book" role="region" />
    </div>
  );
}

/** Runs validation + extraction in a Web Worker; the worker is killed if it takes too long. */
function extractInWorker(bytes: ArrayBuffer, track: (w: Worker) => void): Promise<Map<string, Uint8Array>> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./zip.worker.ts", import.meta.url), { type: "module" });
    track(worker);
    const timer = setTimeout(() => {
      worker.terminate();
      reject(new ImportError("timeout"));
    }, EPUB_LIMITS.workerTimeoutMs);
    worker.onmessage = (e: MessageEvent) => {
      clearTimeout(timer);
      worker.terminate();
      const d = e.data as { ok: boolean; entries?: [string, Uint8Array][]; code?: ImportErrorCode };
      if (d.ok && Array.isArray(d.entries)) resolve(new Map(d.entries));
      else reject(new ImportError(d.code ?? "parse-failed"));
    };
    worker.onerror = () => {
      clearTimeout(timer);
      worker.terminate();
      reject(new ImportError("parse-failed"));
    };
    worker.postMessage({ type: "extract", bytes }, [bytes]);
  });
}

/**
 * Some malformed books make the rendering library throw outside the promise chain (e.g. an SVG
 * page with no body) and the open would never settle. Treat any uncaught error, or no result
 * within the time limit, as "couldn't be read".
 */
function failSafe<T>(work: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const fail = () => {
      cleanup();
      reject(new ImportError("parse-failed"));
    };
    const timer = setTimeout(fail, EPUB_LIMITS.workerTimeoutMs);
    const cleanup = () => {
      clearTimeout(timer);
      window.removeEventListener("error", fail);
      window.removeEventListener("unhandledrejection", fail);
    };
    window.addEventListener("error", fail);
    window.addEventListener("unhandledrejection", fail);
    work.then(
      (v) => {
        cleanup();
        resolve(v);
      },
      () => fail(),
    );
  });
}

/** Builds a foliate book from already-extracted files: no decompression on this thread. */
async function buildBook(files: Map<string, Uint8Array>) {
  const { EPUB } = await import("foliate-js/epub.js");
  try {
    return await new EPUB({
      loadText: (name) => (files.has(name) ? strFromU8(files.get(name)!) : null),
      loadBlob: (name, type) => (files.has(name) ? new Blob([files.get(name)! as BlobPart], { type: type ?? "" }) : null),
      getSize: (name) => files.get(name)?.byteLength ?? 0,
    }).init();
  } catch {
    throw new ImportError("parse-failed");
  }
}

function titleOf(book: { metadata?: { title?: unknown } }): string {
  const t = book.metadata?.title;
  const text = typeof t === "string" ? t : t && typeof t === "object" ? String(Object.values(t)[0] ?? "") : "";
  return text.replace(/[\u0000-\u001f]/g, " ").trim().slice(0, 200) || "Untitled";
}
