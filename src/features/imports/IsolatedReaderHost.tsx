"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { ReaderSettings } from "@/features/reading/reader/settings";
import { EPUB_LIMITS, PDF_LIMITS, type ImportErrorCode } from "./limits";
import { readerOriginFor } from "./origins";
import { PROTOCOL, isFrom, newRequestId, parseReaderMessage, type ImportFormat } from "./protocol";

export interface BridgeState {
  status: "disabled" | "loading" | "opening" | "ready" | "error";
  error: ImportErrorCode | null;
  title: string | null;
  fraction: number;
  chapter: string | null;
  position: string | null;
}

export interface ReaderBridge {
  frameRef: RefObject<HTMLIFrameElement | null>;
  readerOrigin: string | null;
  state: BridgeState;
  nav: (action: "next" | "prev") => void;
}

/**
 * Main-origin side of imported-file reading. Embeds the isolated reader (a different origin),
 * hands it the file's bytes once, and only ever receives validated status/position messages.
 * The file never leaves this device, and the reader frame can't reach XPLOR9's storage.
 */
export function useReaderBridge(opts: {
  /** Loads the book's bytes when the reader is ready (a fresh buffer: it is transferred away). */
  load: () => Promise<ArrayBuffer | null>;
  name: string;
  format: ImportFormat;
  /** Saved position to open at (validated again inside the reader). */
  position: string | null;
  settings: ReaderSettings;
}): ReaderBridge {
  const { load, name, format, position, settings } = opts;
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [readerOrigin] = useState(() => (typeof window === "undefined" ? null : readerOriginFor(window.location)));
  const [state, setState] = useState<BridgeState>({
    status: readerOrigin ? "loading" : "disabled",
    error: null,
    title: null,
    fraction: 0,
    chapter: null,
    position: null,
  });
  const requestId = useRef<string | null>(null);
  const sentSettings = useRef<string | null>(null);
  // Latest values for the one-time "open" message without re-running the listener effect.
  const latest = useRef({ position, settings });
  useEffect(() => {
    latest.current = { position, settings };
  }, [position, settings]);

  useEffect(() => {
    if (!readerOrigin) return;
    const update = (patch: Partial<BridgeState>) => setState((s) => ({ ...s, ...patch }));
    const onMessage = async (event: MessageEvent) => {
      if (!isFrom(event, readerOrigin, frameRef.current?.contentWindow)) return; // exact origin + our frame only
      const msg = parseReaderMessage(event.data);
      if (!msg) return;
      if (msg.type === "ready") {
        update({ status: "opening" });
        const bytes = await load();
        if (!bytes || bytes.byteLength === 0) return update({ status: "error", error: "parse-failed" });
        const limit = format === "pdf" ? PDF_LIMITS.maxFileBytes : EPUB_LIMITS.maxFileBytes;
        if (bytes.byteLength > limit) return update({ status: "error", error: "too-large" });
        const id = newRequestId();
        requestId.current = id;
        const { position: pos, settings: set } = latest.current;
        sentSettings.current = `${set.theme}:${set.fontScale}`;
        frameRef.current?.contentWindow?.postMessage(
          { protocol: PROTOCOL, type: "open", requestId: id, format, name: name.slice(0, 200), bytes, position: pos, settings: set },
          readerOrigin, // never "*"
          [bytes], // transferred, not copied
        );
        return;
      }
      if (msg.requestId !== requestId.current) return;
      if (msg.type === "opened") update({ status: "ready", title: msg.title });
      else if (msg.type === "relocated") update({ fraction: msg.fraction, chapter: msg.chapter, position: msg.position });
      else if (msg.type === "error") update({ status: "error", error: msg.code });
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [load, name, format, readerOrigin]);

  // Theme / text size changes after opening. Only real changes are sent: re-applying the same
  // styles makes the reader lay out again, which swallowed page turns (found in testing).
  useEffect(() => {
    if (!readerOrigin || state.status !== "ready" || !requestId.current) return;
    const key = `${settings.theme}:${settings.fontScale}`;
    if (key === sentSettings.current) return;
    sentSettings.current = key;
    frameRef.current?.contentWindow?.postMessage(
      { protocol: PROTOCOL, type: "settings", requestId: requestId.current, settings: { theme: settings.theme, fontScale: settings.fontScale } },
      readerOrigin,
    );
  }, [settings.theme, settings.fontScale, state.status, readerOrigin]);

  const nav = useCallback(
    (action: "next" | "prev") => {
      if (!readerOrigin || !requestId.current) return;
      frameRef.current?.contentWindow?.postMessage({ protocol: PROTOCOL, type: "nav", requestId: requestId.current, action }, readerOrigin);
    },
    [readerOrigin],
  );

  return { frameRef, readerOrigin, state, nav };
}

/** The isolated reader frame. Renders nothing when imports are disabled (no reader origin). */
export function ReaderFrame({
  frameRef,
  readerOrigin,
  title,
  className = "",
}: Pick<ReaderBridge, "frameRef" | "readerOrigin"> & { title: string; className?: string }) {
  if (!readerOrigin) return null;
  return (
    <iframe
      ref={frameRef}
      src={`${readerOrigin}/isolated/reader`}
      title={title}
      // A different origin already blocks access to XPLOR9; the sandbox additionally removes
      // top navigation, forms, downloads and modals. Popups are allowed only for http(s) links.
      sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      referrerPolicy="no-referrer"
      allow=""
      className={className}
      data-testid="reader-frame"
    />
  );
}
