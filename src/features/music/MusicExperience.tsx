"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Icon } from "@/components/Icon";
import { MEDIA_LANGUAGES, PROVIDER_NAMES, sourcePage } from "@/features/media/catalogue";
import { EmbedPlayer, type EmbedPlayerHandle } from "@/features/media/EmbedPlayer";
import { PlayerFrame } from "@/features/media/PlayerFrame";
import { NO_RESPONSE, UNAVAILABLE_CODES, type PlayerEvent } from "@/features/media/playerMessages";
import { screenView } from "@/features/media/screenState";
import { getPlaybackEngine, usePlayback } from "@/lib/playback/browser";
import { setMediaPlaying } from "@/lib/sound/browser";
import { useLocalStore } from "@/lib/storage/store";
import { cassettePlayback, type Cassette, type Track } from "./catalogue";
import { musicFavourites, musicRecents, recordMusicPlay, toggleMusicFavourite } from "./musicStores";
import { neighbour, parseTrackId, playAudioTrack } from "./queue";
import { shopState } from "./shopState";

/**
 * The Music module (M4): a cassette shop on the monsoon street. Each tape plays one way:
 *   - video tapes (official label uploads) play in YouTube's player on the shop's TV (YouTube
 *     requires its player to be visible), and the view moves to the TV;
 *   - the public-domain tape plays as audio in the deck through the site's shared player, so it
 *     keeps playing across pages (mini-player) and moves on to the next track by itself.
 * One sound at a time: a video tape pauses the shared player, and the shared player starting
 * (radio or a tape) pauses the video.
 */

type VideoStatus = "loading" | "playing" | "paused" | "ended" | "unavailable" | "no-response" | "offline";
interface VideoNow {
  cassette: Cassette;
  track: Track;
  status: VideoStatus;
  attempt: number;
}

const trackMeta = (t: Track) => [t.film, t.year, t.artist].filter(Boolean).join(" · ") || MEDIA_LANGUAGES[t.language];

export function MusicExperience({ cassettes, uploaders }: { cassettes: Cassette[]; uploaders: Record<string, string> }) {
  const [video, setVideo] = useState<VideoNow | null>(null);
  const [announce, setAnnounce] = useState("");
  const unavailable = useRef(new Set<string>());
  const player = useRef<EmbedPlayerHandle>(null);
  const audio = usePlayback();
  const favourites = useLocalStore(musicFavourites);
  const recents = useLocalStore(musicRecents);
  const view = useSyncExternalStore(screenView.subscribe, screenView.get, screenView.server);
  const byTrack = useMemo(() => {
    const m = new Map<string, { cassette: Cassette; track: Track }>();
    for (const cassette of cassettes) for (const track of cassette.tracks) m.set(track.id, { cassette, track });
    return m;
  }, [cassettes]);

  // The audio tape the shared player holds (if any), and whether it is playing.
  const audioAt = parseTrackId(audio.source?.id);
  const audioNow = audioAt ? byTrack.get(audioAt.trackId) : undefined;
  const audioPlaying = !!audioNow && (audio.status === "playing" || audio.status === "buffering" || audio.status === "loading");

  // Tell the shop which tapes stand on the counter, which is in the deck, and whether it plays.
  useEffect(() => {
    shopState.set({ tapes: cassettes.map((c) => ({ id: c.id, shell: c.colours.shell, label: c.colours.label })) });
    return () => shopState.set({ tapes: [], inDeck: null, playing: false });
  }, [cassettes]);
  const deckTape = video?.cassette.id ?? audioNow?.cassette.id ?? null;
  const deckPlaying = video ? video.status === "playing" : audioPlaying;
  useEffect(() => {
    shopState.set({ inDeck: deckTape, playing: deckPlaying });
  }, [deckTape, deckPlaying]);

  const play = useCallback(
    (cassette: Cassette, track: Track) => {
      recordMusicPlay(track.id);
      if (cassettePlayback(cassette) === "audio") {
        setVideo(null);
        screenView.set({ on: false, watching: false });
        playAudioTrack(cassettes, cassette, track);
        setAnnounce(`Playing “${track.title}” from ${cassette.name} in the tape deck.`);
        return;
      }
      if (!navigator.onLine) {
        setVideo({ cassette, track, status: "offline", attempt: 0 });
        return;
      }
      setVideo((prev) => ({ cassette, track, status: "loading", attempt: (prev?.attempt ?? 0) + 1 }));
      setAnnounce(`Playing “${track.title}” from ${cassette.name} on the shop's TV.`);
      screenView.set({ on: true, watching: true });
    },
    [cassettes],
  );

  const stopVideo = useCallback(() => {
    setVideo(null);
    setAnnounce("Stopped.");
    screenView.set({ on: false, watching: false });
  }, []);

  /** Next or previous track on the same tape that hasn't failed during this visit. */
  const stepVideo = useCallback(
    (dir: 1 | -1) => {
      if (!video) return;
      let t = neighbour(video.cassette, video.track.id, dir);
      while (t && unavailable.current.has(t.id)) t = neighbour(video.cassette, t.id, dir);
      if (t) play(video.cassette, t);
      else if (dir === 1) {
        setAnnounce(`That was the end of ${video.cassette.name}.`);
        stopVideo();
      }
    },
    [video, play, stopVideo],
  );

  const onPlayerEvent = useCallback((e: PlayerEvent) => {
    setVideo((cur) => {
      if (!cur) return cur;
      if (e.type === "error") {
        if (e.code === NO_RESPONSE) return { ...cur, status: "no-response" };
        if (UNAVAILABLE_CODES.has(e.code)) unavailable.current.add(cur.track.id);
        return { ...cur, status: "unavailable" };
      }
      if (e.type === "state") {
        const map: Partial<Record<string, VideoStatus>> = { playing: "playing", buffering: "playing", paused: "paused", ended: "ended" };
        const status = map[e.state];
        return status ? { ...cur, status } : cur;
      }
      return cur;
    });
  }, []);

  // A finished or unavailable song moves on to the next on the tape.
  const status = video?.status;
  const trackId = video?.track.id;
  useEffect(() => {
    if (status !== "ended" && status !== "unavailable") return;
    const t = window.setTimeout(() => stepVideo(1), status === "ended" ? 800 : 3000);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reacts to status/track changes only
  }, [status, trackId]);

  // One sound at a time; the rain dips under the video.
  const videoPlaying = status === "playing";
  useEffect(() => {
    if (!videoPlaying) return;
    const engine = getPlaybackEngine();
    if (["playing", "loading", "buffering"].includes(engine.getState().status)) engine.pause();
    setMediaPlaying("music", true);
    const unsubscribe = engine.subscribe(() => {
      const s = engine.getState().status;
      if (s === "playing" || s === "loading") player.current?.pause();
    });
    return () => {
      unsubscribe();
      setMediaPlaying("music", false);
    };
  }, [videoPlaying]);

  // Leaving the page switches the shop's TV off (an audio tape keeps playing in the mini-player).
  useEffect(() => () => screenView.set({ on: false, watching: false }), []);

  const favouriteItems = favourites.map((id) => byTrack.get(id)).filter((x) => x !== undefined);
  const recentItems = recents.map((id) => byTrack.get(id)).filter((x) => x !== undefined);
  const onGlass = view.room3d && view.screen !== null;
  const problem = video && videoProblem(video);
  const currentId = video?.track.id ?? audioNow?.track.id ?? null;

  return (
    <section className="mx-auto max-w-6xl px-4 py-6 sm:px-6" aria-labelledby="music-title">
      <p className="sr-only" aria-live="polite" data-testid="music-announce">
        {problem ?? announce}
      </p>

      {!video ? (
        <div className="max-w-2xl rounded-2xl bg-ink/85 p-5 text-panel shadow-lg backdrop-blur" data-testid="music-shop">
          <h1 id="music-title" className="font-display text-4xl leading-tight">
            Music
          </h1>
          <p className="mt-1 text-sm text-panel/85">
            The cassette shop on the corner. Tapes of film songs play in the labels&apos; official YouTube player on the shop&apos;s TV;
            the old records tape plays in the deck. Nothing loads from YouTube or the Internet Archive until you press play.
          </p>
          {audioNow && (
            <InTheDeck
              cassette={audioNow.cassette}
              track={audioNow.track}
              status={audio.status}
              onPlay={play}
            />
          )}
          <ul className="mt-4 space-y-3">
            {cassettes.map((c) => (
              <li key={c.id}>
                <CassetteCard cassette={c} onPlay={play} favourites={favourites} currentId={currentId} uploaders={uploaders} />
              </li>
            ))}
          </ul>
          {favouriteItems.length > 0 && (
            <section className="mt-6" aria-labelledby="music-favourites">
              <h2 id="music-favourites" className="text-lg font-bold">
                Favourites
              </h2>
              <TrackList items={favouriteItems} onPlay={play} favourites={favourites} currentId={currentId} uploaders={uploaders} showTape />
            </section>
          )}
          {recentItems.length > 0 && (
            <section className="mt-6" aria-labelledby="music-recent">
              <h2 id="music-recent" className="text-lg font-bold">
                Recently played
              </h2>
              <TrackList items={recentItems.slice(0, 6)} onPlay={play} favourites={favourites} currentId={currentId} uploaders={uploaders} showTape />
            </section>
          )}
        </div>
      ) : (
        <h1 id="music-title" className="sr-only">
          Music: playing {video.track.title}
        </h1>
      )}

      {video && video.status !== "offline" && (
        <PlayerFrame onGlass={onGlass} visible={!onGlass || view.settled} rect={view.screen}>
          <EmbedPlayer
            key={`${video.track.id}:${video.attempt}`}
            ref={player}
            source={video.track.source}
            title={`${video.track.title} (YouTube player)`}
            onEvent={onPlayerEvent}
            className="h-full w-full border-0"
          />
        </PlayerFrame>
      )}

      {video && (
        <DeckControls
          video={video}
          favourite={favourites.includes(video.track.id)}
          uploaders={uploaders}
          problem={problem}
          onPrev={() => stepVideo(-1)}
          onNext={() => stepVideo(1)}
          onRetry={() => play(video.cassette, video.track)}
          onStop={stopVideo}
        />
      )}
    </section>
  );
}

/** The public-domain tape in the deck (played by the shared audio player). */
function InTheDeck({ cassette: c, track: t, status, onPlay }: { cassette: Cassette; track: Track; status: string; onPlay: (c: Cassette, t: Track) => void }) {
  const engine = getPlaybackEngine();
  const active = status === "playing" || status === "buffering" || status === "loading";
  const prev = neighbour(c, t.id, -1);
  const next = neighbour(c, t.id, 1);
  const btn = "rounded-full p-2 hover:bg-panel/15 disabled:opacity-40 focus-visible:outline-2";
  const label = status === "loading" ? "Loading…" : status === "buffering" ? "Buffering…" : status === "paused" ? "Paused" : status === "ended" ? "Finished" : status === "error" ? "Couldn't play (see the player below)" : "Playing";
  return (
    <div role="region" aria-label="In the tape deck" className="mt-4 flex items-center gap-3 rounded-xl bg-panel/15 p-3" data-testid="music-deck">
      <TapeSwatch c={c} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{t.title}</p>
        <p className="truncate text-xs text-panel/70">
          {c.name} · {trackMeta(t)}
        </p>
        <p className="text-xs text-panel/60" data-testid="music-deck-status">
          {label}
        </p>
      </div>
      <button type="button" className={btn} disabled={!prev} onClick={() => prev && onPlay(c, prev)} aria-label="Previous song on this tape">
        <Icon name="prev" />
      </button>
      <button type="button" className={btn} onClick={() => engine.toggle()} aria-label={active ? "Pause" : "Play"}>
        <Icon name={active ? "pause" : "play"} />
      </button>
      <button type="button" className={btn} disabled={!next} onClick={() => next && onPlay(c, next)} aria-label="Next song on this tape">
        <Icon name="next" />
      </button>
    </div>
  );
}

function videoProblem({ status, track }: VideoNow): string | null {
  if (status === "unavailable") return `“${track.title}” can't be played here (it may have been removed, or its owner doesn't allow it). Moving to the next song…`;
  if (status === "no-response") return "The player didn't respond. Check your internet connection, then try again.";
  if (status === "offline") return "You're offline, so songs can't play. Connect to the internet and try again.";
  return null;
}

function rightsLine(t: Track, uploaders: Record<string, string>): string {
  return t.rights.basis === "official-upload"
    ? `Official upload by ${uploaders[t.rights.uploaderChannelId] ?? "its label"} · ${PROVIDER_NAMES[t.source.provider]}`
    : "Public-domain recording (India and US) · Internet Archive";
}

function TapeSwatch({ c }: { c: Cassette }) {
  return (
    <span aria-hidden className="relative inline-block h-10 w-16 shrink-0 rounded-md shadow-inner" style={{ background: c.colours.shell }}>
      <span className="absolute inset-x-1.5 top-1.5 h-3 rounded-sm" style={{ background: c.colours.label }} />
      <span className="absolute bottom-1.5 left-4 h-3 w-3 rounded-full border-2 border-panel/70" />
      <span className="absolute bottom-1.5 right-4 h-3 w-3 rounded-full border-2 border-panel/70" />
    </span>
  );
}

function CassetteCard({
  cassette: c,
  onPlay,
  favourites,
  currentId,
  uploaders,
}: {
  cassette: Cassette;
  onPlay: (c: Cassette, t: Track) => void;
  favourites: string[];
  currentId: string | null;
  uploaders: Record<string, string>;
}) {
  const how = cassettePlayback(c) === "audio" ? "Plays in the tape deck" : "Plays on the shop's TV (YouTube)";
  return (
    <div className="rounded-xl bg-panel/10 p-3" data-testid="music-cassette" data-id={c.id}>
      <div className="flex items-start gap-3">
        <TapeSwatch c={c} />
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">{c.name}</h2>
          <p className="text-sm text-panel/85">{c.description}</p>
          <p className="text-xs text-panel/65">
            {c.tracks.length} songs · {how}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onPlay(c, c.tracks[0])}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-panel px-3 py-1.5 text-sm font-bold text-ink hover:bg-plastic focus-visible:outline-2 focus-visible:outline-offset-2"
          aria-label={`Play the tape ${c.name}`}
        >
          <Icon name="play" className="h-4 w-4" /> Play tape
        </button>
      </div>
      <details className="mt-2">
        <summary className="cursor-pointer text-sm font-semibold text-panel/85 focus-visible:outline-2">Songs on this tape</summary>
        <TrackList items={c.tracks.map((track) => ({ cassette: c, track }))} onPlay={onPlay} favourites={favourites} currentId={currentId} uploaders={uploaders} />
      </details>
    </div>
  );
}

function TrackList({
  items,
  onPlay,
  favourites,
  currentId,
  uploaders,
  showTape = false,
}: {
  items: { cassette: Cassette; track: Track }[];
  onPlay: (c: Cassette, t: Track) => void;
  favourites: string[];
  currentId: string | null;
  uploaders: Record<string, string>;
  showTape?: boolean;
}) {
  return (
    <ol className="mt-1 divide-y divide-panel/15">
      {items.map(({ cassette: c, track: t }) => {
        const fav = favourites.includes(t.id);
        const current = currentId === t.id;
        return (
          <li key={`${c.id}:${t.id}`} className="flex items-center gap-2 py-2" data-testid="music-track" data-id={t.id} aria-current={current ? "true" : undefined}>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">
                {current && <span className="mr-1 font-pixel text-xs text-phosphor">▶</span>}
                {t.title}
              </p>
              <p className="truncate text-xs text-panel/70">
                {showTape ? `${c.name} · ` : ""}
                {trackMeta(t)}
              </p>
              <p className="truncate text-xs text-panel/55">{rightsLine(t, uploaders)}</p>
            </div>
            <button
              type="button"
              onClick={() => toggleMusicFavourite(t.id)}
              aria-pressed={fav}
              aria-label={`${fav ? "Remove" : "Add"} ${t.title} ${fav ? "from" : "to"} favourites`}
              className="rounded-full p-2 hover:bg-panel/15 aria-pressed:text-brand focus-visible:outline-2"
            >
              <Icon name="heart" />
            </button>
            <button
              type="button"
              onClick={() => onPlay(c, t)}
              aria-label={`Play ${t.title}`}
              className="rounded-full bg-panel/90 p-2 text-ink hover:bg-plastic focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              <Icon name="play" className="h-4 w-4" />
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function DeckControls({
  video,
  favourite,
  uploaders,
  problem,
  onPrev,
  onNext,
  onRetry,
  onStop,
}: {
  video: VideoNow;
  favourite: boolean;
  uploaders: Record<string, string>;
  problem: string | null;
  onPrev: () => void;
  onNext: () => void;
  onRetry: () => void;
  onStop: () => void;
}) {
  const { track: t, cassette: c, status } = video;
  const fullscreenOk = typeof document !== "undefined" && document.fullscreenEnabled;
  const btn = "inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-semibold hover:bg-panel/15 focus-visible:outline-2 focus-visible:outline-offset-2";
  const statusText = problem ?? (status === "loading" ? "Loading…" : status === "paused" ? "Paused" : rightsLine(t, uploaders));
  return (
    <div role="region" aria-label="Tape controls" className="fixed inset-x-2 bottom-3 z-20 mx-auto max-w-3xl rounded-2xl bg-ink/90 p-3 text-panel shadow-xl backdrop-blur sm:inset-x-4" data-testid="music-controls">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">
            <span className="font-pixel text-xs text-phosphor">{c.name}</span> {t.title}
          </p>
          <p className="truncate text-xs text-panel/70">{trackMeta(t)}</p>
          <p className="truncate text-xs text-panel/60" data-testid="music-status">
            {statusText}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <button type="button" className={btn} onClick={onPrev} aria-label="Previous song on this tape">
            <Icon name="prev" />
          </button>
          <button type="button" className={btn} onClick={onNext} aria-label="Next song on this tape">
            <Icon name="next" />
          </button>
          <button type="button" className={`${btn} aria-pressed:text-brand`} onClick={() => toggleMusicFavourite(t.id)} aria-pressed={favourite} aria-label={favourite ? "Remove from favourites" : "Add to favourites"}>
            <Icon name="heart" />
          </button>
          {fullscreenOk && (
            <button type="button" className={btn} onClick={() => void document.querySelector<HTMLElement>('[data-testid="tv-player"]')?.requestFullscreen?.().catch(() => {})} aria-label="Fullscreen">
              <Icon name="expand" />
            </button>
          )}
          {(status === "no-response" || status === "offline") && (
            <button type="button" className={btn} onClick={onRetry}>
              <Icon name="retry" /> Try again
            </button>
          )}
          <a className={btn} href={sourcePage(t.source)} target="_blank" rel="noopener noreferrer" aria-label={`Open on ${PROVIDER_NAMES[t.source.provider]} (new tab)`}>
            <Icon name="external" />
          </a>
          <button type="button" className={`${btn} bg-panel text-ink hover:bg-plastic`} onClick={onStop}>
            <Icon name="stop" /> Stop
          </button>
        </div>
      </div>
    </div>
  );
}
