"use client";

import { useEffect, useRef, useState } from "react";
import { EPUB_LIMITS, IMPORT_ERROR_MESSAGES, type ImportErrorCode } from "./limits";
import { readerOriginFor } from "./origins";
import { PROTOCOL, isFrom, newRequestId, parseReaderMessage } from "./protocol";

export interface HostState {
  status: "disabled" | "loading" | "opening" | "ready" | "error";
  error: ImportErrorCode | null;
  title: string | null;
  fraction: number;
  chapter: string | null;
  position: string | null;
}

/**
 * Main-origin side of imported-file reading. Embeds the isolated reader (a different origin),
 * hands it the file's bytes once, and only ever receives validated position/status messages.
 * The file never leaves this device, and the reader frame can't reach XPLOR9's storage.
 */
export function IsolatedReaderHost({ file, onChange }: { file: File; onChange?: (s: HostState) => void }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [readerOrigin] = useState(() => (typeof window === "undefined" ? null : readerOriginFor(window.location)));
  const [state, setState] = useState<HostState>({
    status: readerOrigin ? "loading" : "disabled",
    error: null,
    title: null,
    fraction: 0,
    chapter: null,
    position: null,
  });
  const requestId = useRef<string | null>(null);

  useEffect(() => onChange?.(state), [state, onChange]);

  useEffect(() => {
    if (!readerOrigin) return;
    const update = (patch: Partial<HostState>) => setState((s) => ({ ...s, ...patch }));
    const onMessage = async (event: MessageEvent) => {
      if (!isFrom(event, readerOrigin, frame.current?.contentWindow)) return; // exact origin + our frame only
      const msg = parseReaderMessage(event.data);
      if (!msg) return;
      if (msg.type === "ready") {
        if (file.size === 0 || file.size > EPUB_LIMITS.maxFileBytes) return update({ status: "error", error: "too-large" });
        update({ status: "opening" });
        const bytes = await file.arrayBuffer();
        const id = newRequestId();
        requestId.current = id;
        frame.current?.contentWindow?.postMessage(
          { protocol: PROTOCOL, type: "open", requestId: id, format: "epub", name: file.name.slice(0, 200), bytes, position: null },
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
  }, [file, readerOrigin]);

  const nav = (action: "next" | "prev") =>
    readerOrigin &&
    requestId.current &&
    frame.current?.contentWindow?.postMessage({ protocol: PROTOCOL, type: "nav", requestId: requestId.current, action }, readerOrigin);

  if (!readerOrigin)
    return <p role="alert">Reading your own files isn&apos;t available here, because the separate reader isn&apos;t configured.</p>;

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex items-center gap-3 text-sm" aria-live="polite" data-testid="host-status">
        <span data-testid="host-state">{state.status}</span>
        {state.status === "error" && state.error && (
          <span role="alert" data-testid="host-error" data-code={state.error}>
            {IMPORT_ERROR_MESSAGES[state.error]}
          </span>
        )}
        {state.title && <span data-testid="host-title">{state.title}</span>}
        {state.status === "ready" && <span data-testid="host-fraction">{Math.round(state.fraction * 100)}%</span>}
        <button type="button" onClick={() => nav("prev")} disabled={state.status !== "ready"}>
          Previous
        </button>
        <button type="button" onClick={() => nav("next")} disabled={state.status !== "ready"}>
          Next
        </button>
      </div>
      <iframe
        ref={frame}
        src={`${readerOrigin}/isolated/reader`}
        title="Imported book"
        // A different origin already blocks access to XPLOR9; the sandbox additionally removes
        // top navigation, forms, downloads and modals. Popups are allowed only for http(s) links.
        sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
        referrerPolicy="no-referrer"
        allow=""
        className="min-h-0 w-full flex-1 rounded-xl border-2 border-ink/15"
        data-testid="reader-frame"
      />
    </div>
  );
}
