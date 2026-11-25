"use client";

import { forwardRef, useEffect, useId, useImperativeHandle, useMemo, useRef } from "react";
import { embedUrl, type MediaSource } from "./catalogue";
import { command, listen, NO_RESPONSE, readPlayerMessage, type PlayerEvent } from "./playerMessages";

/** Origin the YouTube player's messages come from (we embed its reduced-cookie domain). */
const YOUTUBE_ORIGIN = "https://www.youtube-nocookie.com";
/** How long to wait for the player to say anything before reporting it as not responding. */
const RESPONSE_TIMEOUT_MS = 20_000;

export interface EmbedPlayerHandle {
  /** Pause (YouTube) or stop (Internet Archive, which has no remote control). */
  pause(): void;
}

/**
 * The provider's official player in a frame. Mounted only after the visitor chose to watch, so
 * nothing loads from YouTube or the Internet Archive before that (and it starts playing at once).
 *
 * YouTube reports ready / playing / ended / errors (see playerMessages.ts). The Internet Archive
 * player reports nothing, so its film counts as "on" while shown.
 */
export const EmbedPlayer = forwardRef<EmbedPlayerHandle, { source: MediaSource; title: string; onEvent: (e: PlayerEvent) => void; className?: string }>(
  function EmbedPlayer({ source, title, onEvent, className }, ref) {
    const frame = useRef<HTMLIFrameElement>(null);
    const id = useId();
    const youtube = source.provider !== "archive";
    const onEventRef = useRef(onEvent);
    useEffect(() => {
      onEventRef.current = onEvent;
    });
    // The address depends only on what plays (not on re-renders), so the frame never reloads mid-film.
    // Client-only: this player is mounted after the visitor chooses something to watch.
    const key = JSON.stringify(source);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` is the source's value identity
    const src = useMemo(() => embedUrl(source, window.location.origin, { autoplay: true }), [key]);

    useImperativeHandle(ref, () => ({
      pause() {
        if (youtube) frame.current?.contentWindow?.postMessage(command(id, "pauseVideo"), YOUTUBE_ORIGIN);
      },
    }));

    useEffect(() => {
      if (!youtube) {
        onEventRef.current({ type: "state", state: "playing" });
        return;
      }
      let heard = false;
      const onMessage = (e: MessageEvent) => {
        if (e.origin !== YOUTUBE_ORIGIN || e.source !== frame.current?.contentWindow) return;
        const ev = readPlayerMessage(e.data);
        if (!ev) return;
        heard = true;
        onEventRef.current(ev);
      };
      window.addEventListener("message", onMessage);
      // Ask the player to report; repeated until it answers (it ignores requests while loading).
      const ask = () => {
        const w = frame.current?.contentWindow;
        if (!w) return;
        w.postMessage(listen(id), YOUTUBE_ORIGIN);
        for (const name of ["onReady", "onStateChange", "onError"]) w.postMessage(command(id, "addEventListener", [name]), YOUTUBE_ORIGIN);
      };
      const asking = window.setInterval(() => (heard ? window.clearInterval(asking) : ask()), 500);
      const timeout = window.setTimeout(() => {
        if (!heard) onEventRef.current({ type: "error", code: NO_RESPONSE });
      }, RESPONSE_TIMEOUT_MS);
      return () => {
        window.removeEventListener("message", onMessage);
        window.clearInterval(asking);
        window.clearTimeout(timeout);
      };
    }, [youtube, id, key]);

    return (
      <iframe
        ref={frame}
        key={key}
        src={src}
        title={title}
        className={className}
        allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
        allowFullScreen
        // YouTube refuses to play without knowing the embedding site (error 153).
        referrerPolicy="strict-origin-when-cross-origin"
        sandbox="allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox"
        data-testid="embed-player"
      />
    );
  },
);
