"use client";

import { useRef, useState } from "react";

/**
 * The Reading Room runs as its own page inside the window (a same-origin frame), exactly as it
 * works on its own: catalogue, EPUB/PDF reader, bookmarks, search and personal imports, with
 * the reader's own security rules (imports open in the separate isolated-reader origin).
 * The toolbar works like an old browser's: Back, Forward, Home.
 */
export function ReadingRoomApp() {
  const frame = useRef<HTMLIFrameElement>(null);
  const [path, setPath] = useState("/reading");
  const [loading, setLoading] = useState(true);

  const history = () => frame.current?.contentWindow?.history;
  const onLoad = () => {
    setLoading(false);
    try {
      const loc = frame.current?.contentWindow?.location;
      if (loc) setPath(loc.pathname + loc.search);
    } catch {
      // A page from another origin (never expected here): keep the last known address.
    }
  };

  return (
    <div className="flex h-full flex-col bg-[var(--xp-face)] text-[13px]">
      <div className="xp-toolbar flex items-center gap-1 px-1 py-1" role="toolbar" aria-label="Reading Room navigation">
        <button type="button" className="xp-button" onClick={() => history()?.back()}>
          Back
        </button>
        <button type="button" className="xp-button" onClick={() => history()?.forward()}>
          Forward
        </button>
        <button
          type="button"
          className="xp-button"
          onClick={() => {
            if (frame.current) frame.current.src = "/reading";
          }}
        >
          Home
        </button>
        <span className="xp-input ml-1 min-w-0 flex-1 truncate" aria-label="Page address">
          xplor9{path}
        </span>
        <a href={path} target="_blank" rel="noopener" className="xp-button no-underline">
          Open in new tab
        </a>
      </div>
      <div className="relative min-h-0 flex-1 bg-white">
        {loading && (
          <p className="absolute inset-0 grid place-items-center" role="status">
            Opening the Reading Room…
          </p>
        )}
        <iframe ref={frame} src="/reading" title="Reading Room" onLoad={onLoad} className="absolute inset-0 h-full w-full border-0" allow="fullscreen" />
      </div>
    </div>
  );
}
