"use client";

import { useCallback, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { EmbedPlayer, type EmbedPlayerHandle, type PlayerTime } from "@/features/media/EmbedPlayer";
import { sourcePage, type MediaSource } from "@/features/media/catalogue";
import { nextStatus, statusLabel, type EmbedStatus } from "@/features/media/embedStatus";
import { MediaTransport, fullscreen, revealPlayer } from "@/features/media/MediaTransport";
import type { PlayerEvent } from "@/features/media/playerMessages";
import { getPlaybackEngine, usePlayback } from "@/lib/playback/browser";
import { useExclusiveMedia } from "@/lib/playback/mediaFocus";
import { STORAGE_KEYS } from "@/lib/storage/local";
import { createLocalStore, useLocalStore } from "@/lib/storage/store";
import { parseSavedVideos, parseYouTubeLink, rememberVideo, toggleSavedVideo, uploadsPlaylist, videoKey, type SavedVideo } from "./youtubeLink";

/**
 * Video (D2): YouTube in its official embedded player (reduced-cookie domain; nothing loads from
 * YouTube until the visitor picks something), as a desktop media player. Ways in:
 *   - Featured: programmes and songs already in XPLOR9's TV and Music catalogues (each an official
 *     upload by a verified rights-holder channel);
 *   - Official channels: the full public uploads of those verified channels;
 *   - History and Favourites, kept in this browser;
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

type YtSource = SavedVideo["source"];
type Shelf = "featured" | "channels" | "history" | "favourites";
interface Now {
  video: SavedVideo;
  status: EmbedStatus;
  attempt: number;
}

const history = createLocalStore<SavedVideo[]>(STORAGE_KEYS.videoHistory, [], parseSavedVideos);
const favouriteVideos = createLocalStore<SavedVideo[]>(STORAGE_KEYS.videoFavourites, [], parseSavedVideos);
const isYt = (s: MediaSource): s is YtSource => s.provider === "youtube" || s.provider === "youtube-playlist";

export function VideoApp({ channels, featured }: { channels: VideoChannel[]; featured: FeaturedVideo[] }) {
  const [shelf, setShelf] = useState<Shelf>("featured");
  const [now, setNow] = useState<Now | null>(null);
  const [time, setTime] = useState<PlayerTime | null>(null);
  const [link, setLink] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);
  const player = useRef<EmbedPlayerHandle>(null);
  const screen = useRef<HTMLDivElement>(null);
  const audio = usePlayback();
  const seen = useLocalStore(history);
  const favs = useLocalStore(favouriteVideos);

  const play = useCallback((video: SavedVideo) => {
    setTime(null);
    setNow((prev) => ({ video, status: "loading", attempt: (prev?.attempt ?? 0) + 1 }));
    history.set((h) => rememberVideo(h, video));
    revealPlayer(screen.current);
  }, []);

  const onEvent = useCallback((e: PlayerEvent) => {
    setNow((cur) => (cur ? { ...cur, status: nextStatus(cur.status, e) } : cur));
    if (e.type === "ready") player.current?.setVolume(getPlaybackEngine().getState().volume * 100);
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
    play({ key: videoKey(r.source), title: "Pasted link", by: "YouTube", source: r.source });
  };

  const rows: { video: SavedVideo; meta: string }[] =
    shelf === "featured"
      ? featured.filter((f) => isYt(f.source)).map((f) => ({ video: { key: videoKey(f.source as YtSource), title: f.title, by: f.uploader || "YouTube", source: f.source as YtSource }, meta: [f.meta, f.uploader].filter(Boolean).join(" · ") }))
      : shelf === "channels"
        ? channels.map((c) => ({
            video: { key: uploadsPlaylist(c.channelId), title: `${c.name}: latest uploads`, by: c.name, source: { provider: "youtube-playlist", playlistId: uploadsPlaylist(c.channelId) } },
            meta: c.owner,
          }))
        : (shelf === "history" ? seen : favs).map((v) => ({ video: v, meta: v.by }));

  const SHELVES: { id: Shelf; label: string; sub: string }[] = [
    { id: "featured", label: "Featured", sub: "From the TV and Music collections" },
    { id: "channels", label: "Official channels", sub: "Verified rights holders" },
    { id: "history", label: "History", sub: `${seen.length} watched` },
    { id: "favourites", label: "Favourites", sub: `${favs.length} saved` },
  ];
  const heading = SHELVES.find((s) => s.id === shelf)!;
  const fav = !!now && favs.some((f) => f.key === now.video.key);

  return (
    <div className="mx" data-testid="video-app">
      <h1 className="sr-only">Video</h1>
      <aside className="mx-side" aria-label="Collections">
        <p className="xp-sidebar-heading">Discover</p>
        <div role="tablist" aria-label="Collections" aria-orientation="vertical" className="mx-side-section mx-tabs-row">
          {SHELVES.map((s) => (
            <button key={s.id} role="tab" type="button" aria-selected={shelf === s.id} className="mx-nav-item" onClick={() => setShelf(s.id)}>
              <span className="min-w-0">
                {s.label}
                <span className="mx-nav-sub">{s.sub}</span>
              </span>
            </button>
          ))}
        </div>
      </aside>

      <div className="mx-main">
        <form onSubmit={submit} className="xp-toolbar flex items-center gap-2 px-3 py-2">
          <label htmlFor="video-link" className="shrink-0 font-medium">
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
          <button type="submit" className="xp-button xp-button--primary">
            Play
          </button>
        </form>
        {linkError && (
          <p id="video-link-error" role="alert" className="border-b border-[var(--ui-warn-line)] bg-[var(--ui-warn-bg)] px-3 py-1.5">
            {linkError}
          </p>
        )}

        <div className="mx-stage">
          <div className="mx-device">
            <div ref={screen} className="mx-screen">
              {now ? (
                <EmbedPlayer
                  key={`${now.video.key}:${now.attempt}`}
                  ref={player}
                  source={now.video.source}
                  title={`${now.video.title} (YouTube player)`}
                  onEvent={onEvent}
                  onTime={setTime}
                  className="h-full w-full border-0"
                />
              ) : (
                <div className="mx-idle">
                  <div>
                    <strong>Pick a video, a channel, or paste a YouTube link.</strong>
                    Videos play in YouTube&apos;s own player. Nothing is loaded from YouTube until you choose something.
                  </div>
                </div>
              )}
            </div>
            {now && (
              <p className="mx-nowline" aria-live="polite">
                <b>{now.video.title}</b>
                <span>
                  {now.video.by} · {statusLabel(now.status)}
                  {now.status === "unavailable" ? " (its owner may not allow embedding)" : ""}
                </span>
              </p>
            )}
            <MediaTransport
              playing={playing}
              controllable={!!now}
              time={time}
              onPlayPause={() => (playing ? player.current?.pause() : player.current?.play())}
              onStop={() => {
                setNow(null);
                setTime(null);
              }}
              onSeek={(s) => player.current?.seek(s)}
              volume={Math.round(audio.volume * 100)}
              onVolume={(v) => {
                getPlaybackEngine().setVolume(v / 100);
                player.current?.setVolume(v);
              }}
              onFullscreen={now ? () => fullscreen(screen.current) : undefined}
            >
              {now && (
                <>
                  <button
                    type="button"
                    className="mx-key"
                    aria-pressed={fav}
                    aria-label={fav ? "Remove from favourites" : "Add to favourites"}
                    onClick={() => favouriteVideos.set((l) => toggleSavedVideo(l, now.video))}
                  >
                    <Icon name={fav ? "heart" : "heartOutline"} className="h-4 w-4" />
                  </button>
                  {(now.status === "unavailable" || now.status === "no-response") && (
                    <button type="button" className="mx-key" onClick={() => play(now.video)}>
                      <Icon name="retry" className="h-4 w-4" /> Try again
                    </button>
                  )}
                  <a className="mx-key" href={sourcePage(now.video.source)} target="_blank" rel="noopener noreferrer" aria-label="Open on YouTube (new tab)">
                    <Icon name="external" className="h-4 w-4" />
                  </a>
                </>
              )}
            </MediaTransport>
          </div>
        </div>

        <section className="mx-library" aria-label={heading.label}>
          <div className="mx-library-head">
            <div>
              <h2>{heading.label}</h2>
              <p>{heading.sub}</p>
            </div>
            {shelf === "history" && seen.length > 0 && (
              <button type="button" className="xp-button" onClick={() => history.set([])}>
                Clear history
              </button>
            )}
          </div>
          {rows.length === 0 ? (
            <p className="mx-mini-empty !py-6 text-center">{shelf === "history" ? "Videos you watch appear here." : "Press the heart while a video plays to keep it here."}</p>
          ) : (
            <ul className="mx-rows">
              {rows.map(({ video, meta }) => {
                const isFav = favs.some((f) => f.key === video.key);
                return (
                  <li key={video.key} aria-current={now?.video.key === video.key ? "true" : undefined}>
                    <div className="mx-row-text">
                      <p className="mx-row-title">{video.title}</p>
                      <p className="mx-row-meta">{meta}</p>
                    </div>
                    <div className="mx-row-actions">
                      <button
                        type="button"
                        className="mx-icon-btn"
                        aria-pressed={isFav}
                        aria-label={`${isFav ? "Remove" : "Add"} ${video.title} ${isFav ? "from" : "to"} favourites`}
                        onClick={() => favouriteVideos.set((l) => toggleSavedVideo(l, video))}
                      >
                        <Icon name={isFav ? "heart" : "heartOutline"} className="h-4 w-4" />
                      </button>
                      <button type="button" className="xp-button xp-button--primary" onClick={() => play(video)} aria-label={`Watch ${video.title}`}>
                        <Icon name="play" className="h-4 w-4" /> Watch
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
