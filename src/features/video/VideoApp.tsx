"use client";

import { useCallback, useRef, useState } from "react";
import { EmbedPlayer, type EmbedPlayerHandle } from "@/features/media/EmbedPlayer";
import { sourcePage, type MediaSource } from "@/features/media/catalogue";
import { NO_RESPONSE, UNAVAILABLE_CODES, type PlayerEvent } from "@/features/media/playerMessages";
import { useExclusiveMedia } from "@/lib/playback/mediaFocus";
import { parseYouTubeLink, uploadsPlaylist } from "./youtubeLink";

/**
 * Video: YouTube in its official embedded player (reduced-cookie domain; nothing loads from
 * YouTube until the visitor picks something). Three ways in:
 *   - Featured: programmes and songs already in XPLOR9's TV and Music catalogues, each an
 *     official upload by a verified rights-holder channel;
 *   - Channels: the full public uploads of those verified channels;
 *   - a pasted YouTube link (any video whose owner allows embedding; YouTube decides).
 * Searching all of YouTube needs a YouTube Data API key and is not part of this version.
 */

export interface VideoChannel {
  channelId: string;
  name: string;
  owner: string;
}
export interface FeaturedVideo {
  id: string;
  title: string;
  meta: string;
  uploader: string;
  source: MediaSource;
}

type Status = "loading" | "playing" | "paused" | "ended" | "unavailable" | "no-response";
interface Now {
  title: string;
  by: string;
  source: MediaSource;
  status: Status;
  attempt: number;
}

export function VideoApp({ channels, featured }: { channels: VideoChannel[]; featured: FeaturedVideo[] }) {
  const [now, setNow] = useState<Now | null>(null);
  const [link, setLink] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);
  const [tab, setTab] = useState<"featured" | "channels">("featured");
  const player = useRef<EmbedPlayerHandle>(null);

  const play = useCallback((title: string, by: string, source: MediaSource) => {
    setNow((prev) => ({ title, by, source, status: "loading", attempt: (prev?.attempt ?? 0) + 1 }));
  }, []);

  const onEvent = useCallback((e: PlayerEvent) => {
    setNow((cur) => {
      if (!cur) return cur;
      if (e.type === "error") return { ...cur, status: e.code === NO_RESPONSE ? "no-response" : UNAVAILABLE_CODES.has(e.code) ? "unavailable" : "unavailable" };
      if (e.type === "state") {
        const map: Partial<Record<string, Status>> = { playing: "playing", buffering: "playing", paused: "paused", ended: "ended" };
        const s = map[e.state];
        return s ? { ...cur, status: s } : cur;
      }
      return cur;
    });
  }, []);

  const playing = now?.status === "playing";
  useExclusiveMedia("video", playing, () => player.current?.pause());

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const r = parseYouTubeLink(link);
    if (!r.ok) {
      setLinkError(r.reason);
      return;
    }
    setLinkError(null);
    play("Pasted link", "YouTube", r.source);
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--xp-face)] text-[13px]">
      <form onSubmit={submit} className="xp-toolbar flex items-center gap-2 px-2 py-1.5">
        <label htmlFor="video-link" className="shrink-0">
          Address
        </label>
        <input
          id="video-link"
          value={link}
          onChange={(e) => setLink(e.target.value)}
          placeholder="Paste a YouTube link"
          className="xp-input min-w-0 flex-1"
          autoComplete="off"
          spellCheck={false}
          aria-describedby={linkError ? "video-link-error" : undefined}
          aria-invalid={linkError ? true : undefined}
        />
        <button type="submit" className="xp-button">
          Play
        </button>
      </form>
      {linkError && (
        <p id="video-link-error" role="alert" className="border-b border-[#c9a34a] bg-[#fff4c2] px-3 py-1">
          {linkError}
        </p>
      )}

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <nav aria-label="Videos" className="xp-sidebar flex max-h-[40%] min-h-0 flex-col md:max-h-none md:w-64 md:shrink-0">
          <div role="tablist" aria-label="Lists" className="flex gap-1 px-2 pt-2">
            {(["featured", "channels"] as const).map((t) => (
              <button key={t} role="tab" type="button" aria-selected={tab === t} onClick={() => setTab(t)} className="xp-tab">
                {t === "featured" ? "Featured" : "Channels"}
              </button>
            ))}
          </div>
          <ul className="xp-list min-h-0 flex-1 overflow-auto" role="tabpanel" aria-label={tab === "featured" ? "Featured videos" : "Official channels"}>
            {tab === "featured"
              ? featured.map((v) => (
                  <li key={v.id}>
                    <button type="button" className="xp-list-item" onClick={() => play(v.title, v.uploader, v.source)} aria-current={now?.title === v.title || undefined}>
                      <span className="block truncate font-bold">{v.title}</span>
                      <span className="block truncate opacity-75">{v.meta || v.uploader}</span>
                    </button>
                  </li>
                ))
              : channels.map((c) => (
                  <li key={c.channelId}>
                    <button
                      type="button"
                      className="xp-list-item"
                      onClick={() => play(`${c.name}: latest uploads`, c.name, { provider: "youtube-playlist", playlistId: uploadsPlaylist(c.channelId) })}
                    >
                      <span className="block truncate font-bold">{c.name}</span>
                      <span className="block truncate opacity-75">{c.owner}</span>
                    </button>
                  </li>
                ))}
          </ul>
        </nav>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-black">
          {now ? (
            <>
              <div className="relative min-h-0 flex-1">
                <EmbedPlayer
                  key={`${JSON.stringify(now.source)}:${now.attempt}`}
                  ref={player}
                  source={now.source}
                  title={`${now.title} (YouTube player)`}
                  onEvent={onEvent}
                  className="absolute inset-0 h-full w-full border-0"
                />
              </div>
              <div className="xp-statusbar flex flex-wrap items-center gap-x-3 gap-y-1 px-2 py-1" aria-live="polite">
                <span className="min-w-0 flex-1 truncate">
                  <b>{now.title}</b> · {now.by} · {statusText(now.status)}
                </span>
                {(now.status === "unavailable" || now.status === "no-response") && (
                  <button type="button" className="xp-button" onClick={() => play(now.title, now.by, now.source)}>
                    Try again
                  </button>
                )}
                <a href={sourcePage(now.source)} target="_blank" rel="noopener noreferrer" className="underline">
                  Open on YouTube
                </a>
                <button type="button" className="xp-button" onClick={() => setNow(null)}>
                  Stop
                </button>
              </div>
            </>
          ) : (
            <div className="grid flex-1 place-items-center p-6 text-center text-[#d6dcef]">
              <div className="max-w-sm">
                <p className="text-base font-bold text-white">Pick a video, a channel, or paste a YouTube link.</p>
                <p className="mt-2">Videos play in YouTube&apos;s own player. Nothing is loaded from YouTube until you choose something.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function statusText(s: Status): string {
  switch (s) {
    case "loading":
      return "Loading…";
    case "playing":
      return "Playing";
    case "paused":
      return "Paused";
    case "ended":
      return "Finished";
    case "unavailable":
      return "This video can't be played here (its owner may not allow embedding).";
    case "no-response":
      return "YouTube isn't responding. Check the connection and try again.";
  }
}
