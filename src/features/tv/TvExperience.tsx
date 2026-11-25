"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Icon } from "@/components/Icon";
import { EmbedPlayer, type EmbedPlayerHandle } from "@/features/media/EmbedPlayer";
import { PlayerFrame } from "@/features/media/PlayerFrame";
import { MEDIA_LANGUAGES, PROVIDER_NAMES, sourcePage } from "@/features/media/catalogue";
import { NO_RESPONSE, UNAVAILABLE_CODES, type PlayerEvent } from "@/features/media/playerMessages";
import { getPlaybackEngine } from "@/lib/playback/browser";
import { setMediaPlaying } from "@/lib/sound/browser";
import { useLocalStore } from "@/lib/storage/store";
import { WATCH_ACCESS, type Programme, type TvCatalogue, type TvChannel } from "./catalogue";
import { recordTvWatch, toggleTvFavourite, tvFavourites, tvRecents } from "./tvStores";
import { screenView as tvView } from "@/features/media/screenState";

/**
 * The TV module (M3). In the room: a programme guide (channels, favourites, recently watched,
 * Where to Watch). Choosing a programme switches the family set on and the view moves to its
 * screen, where the provider's official player sits on the glass; a remote control appears
 * below. Without the 3D room (Lite, Still), the player has its own CRT frame on the page.
 *
 * One sound at a time: the TV pauses the radio when it starts, and stops when the radio starts.
 */

type Status = "loading" | "playing" | "paused" | "ended" | "unavailable" | "no-response" | "offline";
interface Now {
  channel: TvChannel;
  programme: Programme;
  status: Status;
  /** Bumped by "Try again" so the player reloads. */
  attempt: number;
}
const STATUS_TEXT: Partial<Record<Status, string>> = {
  loading: "Tuning in…",
  paused: "Paused",
  ended: "Finished",
};

export function TvExperience({ catalogue, uploaders }: { catalogue: TvCatalogue; uploaders: Record<string, string> }) {
  const [channelId, setChannelId] = useState(catalogue.channels[0].id);
  const [now, setNow] = useState<Now | null>(null);
  const [announce, setAnnounce] = useState("");
  const unavailable = useRef(new Set<string>());
  const player = useRef<EmbedPlayerHandle>(null);
  const favourites = useLocalStore(tvFavourites);
  const recents = useLocalStore(tvRecents);
  const view = useSyncExternalStore(tvView.subscribe, tvView.get, tvView.server);
  const byId = useMemo(() => {
    const m = new Map<string, { channel: TvChannel; programme: Programme }>();
    for (const channel of catalogue.channels) for (const programme of channel.programmes) m.set(programme.id, { channel, programme });
    return m;
  }, [catalogue]);

  const watch = useCallback((channel: TvChannel, programme: Programme) => {
    if (!navigator.onLine) {
      setNow({ channel, programme, status: "offline", attempt: 0 });
      return;
    }
    setNow((prev) => ({ channel, programme, status: "loading", attempt: (prev?.attempt ?? 0) + 1 }));
    setAnnounce(`Now on ${channel.name}: ${programme.title}.`);
    recordTvWatch(programme.id);
    tvView.set({ on: true, watching: true });
  }, []);

  const switchOff = useCallback(() => {
    setNow(null);
    setAnnounce("The TV is off.");
    tvView.set({ on: false, watching: false });
  }, []);

  /** Next (or previous) programme on the same channel that hasn't failed during this visit. */
  const step = useCallback(
    (dir: 1 | -1) => {
      if (!now) return;
      const list = now.channel.programmes;
      const i = list.findIndex((p) => p.id === now.programme.id);
      for (let k = 1; k < list.length; k++) {
        const p = list[(i + dir * k + list.length) % list.length];
        if (!unavailable.current.has(p.id)) return watch(now.channel, p);
      }
      setAnnounce(`Nothing else on ${now.channel.name} can be played right now.`);
    },
    [now, watch],
  );

  const onPlayerEvent = useCallback(
    (e: PlayerEvent) => {
      setNow((cur) => {
        if (!cur) return cur;
        if (e.type === "error") {
          if (e.code === NO_RESPONSE) return { ...cur, status: "no-response" };
          if (UNAVAILABLE_CODES.has(e.code)) {
            unavailable.current.add(cur.programme.id);
            return { ...cur, status: "unavailable" };
          }
          return { ...cur, status: "unavailable" };
        }
        if (e.type === "state") {
          const map: Partial<Record<string, Status>> = { playing: "playing", buffering: "playing", paused: "paused", ended: "ended" };
          const status = map[e.state];
          return status ? { ...cur, status } : cur;
        }
        return cur;
      });
    },
    [],
  );

  // Move on from unavailable or finished single programmes (problems are announced from the status).
  const status = now?.status;
  const programmeId = now?.programme.id;
  useEffect(() => {
    if (!now) return;
    if (status === "unavailable") {
      const t = window.setTimeout(() => step(1), 3000);
      return () => window.clearTimeout(t);
    }
    // Playlists play through by themselves; a single programme moves on to the next when it ends.
    if (status === "ended" && now.programme.source.provider === "youtube") {
      const t = window.setTimeout(() => step(1), 1500);
      return () => window.clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reacts to status/programme changes only
  }, [status, programmeId]);

  // One sound at a time, and the rain dips under the TV.
  const playing = status === "playing";
  useEffect(() => {
    if (!playing) return;
    const radio = getPlaybackEngine();
    if (["playing", "loading", "buffering"].includes(radio.getState().status)) radio.pause();
    setMediaPlaying("tv", true);
    const unsubscribe = radio.subscribe(() => {
      const s = radio.getState().status;
      if (s === "playing" || s === "loading") {
        if (now?.programme.source.provider === "archive") switchOff();
        else player.current?.pause();
      }
    });
    return () => {
      unsubscribe();
      setMediaPlaying("tv", false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run only when playing starts/stops
  }, [playing]);

  // Leaving the page switches the set off.
  useEffect(() => () => tvView.set({ on: false, watching: false }), []);

  const channel = catalogue.channels.find((c) => c.id === channelId) ?? catalogue.channels[0];
  const favouriteItems = favourites.map((id) => byId.get(id)).filter((x) => x !== undefined);
  const recentItems = recents.map((id) => byId.get(id)).filter((x) => x !== undefined);
  const showPlayer = now && now.status !== "offline";
  const onGlass = view.room3d && view.screen !== null;

  return (
    <section className="mx-auto max-w-6xl px-4 py-6 sm:px-6" aria-labelledby="tv-title">
      <p className="sr-only" aria-live="polite" data-testid="tv-announce">
        {(now && problemText(now)) ?? announce}
      </p>

      {!now ? (
        <Guide
          catalogue={catalogue}
          channel={channel}
          onChannel={setChannelId}
          onWatch={watch}
          favourites={favourites}
          favouriteItems={favouriteItems}
          recentItems={recentItems}
          uploaders={uploaders}
        />
      ) : (
        <h1 id="tv-title" className="sr-only">
          TV: watching {now.programme.title}
        </h1>
      )}

      {showPlayer && (
        <PlayerFrame onGlass={onGlass} visible={!onGlass || view.settled} rect={view.screen}>
          <EmbedPlayer
            key={`${now.programme.id}:${now.attempt}`}
            ref={player}
            source={now.programme.source}
            title={`${now.programme.title} (${PROVIDER_NAMES[now.programme.source.provider]} player)`}
            onEvent={onPlayerEvent}
            className="h-full w-full border-0"
          />
        </PlayerFrame>
      )}

      {now && (
        <Remote
          now={now}
          favourite={favourites.includes(now.programme.id)}
          uploaders={uploaders}
          onPrev={() => step(-1)}
          onNext={() => step(1)}
          onRetry={() => watch(now.channel, now.programme)}
          onOff={switchOff}
        />
      )}
    </section>
  );
}

function Guide({
  catalogue,
  channel,
  onChannel,
  onWatch,
  favourites,
  favouriteItems,
  recentItems,
  uploaders,
}: {
  catalogue: TvCatalogue;
  channel: TvChannel;
  onChannel: (id: string) => void;
  onWatch: (c: TvChannel, p: Programme) => void;
  favourites: string[];
  favouriteItems: { channel: TvChannel; programme: Programme }[];
  recentItems: { channel: TvChannel; programme: Programme }[];
  uploaders: Record<string, string>;
}) {
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const index = catalogue.channels.findIndex((c) => c.id === channel.id);
  const onTabKey = (e: React.KeyboardEvent) => {
    const n = catalogue.channels.length;
    const to = e.key === "ArrowRight" ? (index + 1) % n : e.key === "ArrowLeft" ? (index - 1 + n) % n : e.key === "Home" ? 0 : e.key === "End" ? n - 1 : -1;
    if (to < 0) return;
    e.preventDefault();
    onChannel(catalogue.channels[to].id);
    tabs.current[to]?.focus();
  };
  return (
    <div className="max-w-2xl rounded-2xl bg-ink/85 p-5 text-panel shadow-lg backdrop-blur" data-testid="tv-guide">
      <h1 id="tv-title" className="font-display text-4xl leading-tight">
        TV
      </h1>
      <p className="mt-1 text-sm text-panel/85">
        Classic Indian television and silent-era films on the family set. Programmes play in their owners&apos; official players
        (YouTube or the Internet Archive), which load only when you choose something to watch.
      </p>

      <div role="tablist" aria-label="Channels" className="mt-4 flex flex-wrap gap-2" onKeyDown={onTabKey}>
        {catalogue.channels.map((c, i) => (
          <button
            key={c.id}
            ref={(el) => {
              tabs.current[i] = el;
            }}
            role="tab"
            id={`tab-${c.id}`}
            aria-selected={c.id === channel.id}
            aria-controls="tv-channel-panel"
            tabIndex={c.id === channel.id ? 0 : -1}
            onClick={() => onChannel(c.id)}
            className="rounded-full border border-panel/40 px-3 py-1.5 text-sm font-semibold aria-selected:bg-panel aria-selected:text-ink focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            <span className="font-pixel text-xs opacity-70">{i + 1}</span> {c.name}
          </button>
        ))}
      </div>

      <div role="tabpanel" id="tv-channel-panel" aria-labelledby={`tab-${channel.id}`} className="mt-3">
        <p className="text-sm text-panel/80">{channel.description}</p>
        <ProgrammeList items={channel.programmes.map((p) => ({ channel, programme: p }))} onWatch={onWatch} favourites={favourites} uploaders={uploaders} />
      </div>

      {favouriteItems.length > 0 && (
        <section className="mt-6" aria-labelledby="tv-favourites">
          <h2 id="tv-favourites" className="text-lg font-bold">
            Favourites
          </h2>
          <ProgrammeList items={favouriteItems} onWatch={onWatch} favourites={favourites} uploaders={uploaders} showChannel />
        </section>
      )}
      {recentItems.length > 0 && (
        <section className="mt-6" aria-labelledby="tv-recent">
          <h2 id="tv-recent" className="text-lg font-bold">
            Recently watched
          </h2>
          <ProgrammeList items={recentItems.slice(0, 6)} onWatch={onWatch} favourites={favourites} uploaders={uploaders} showChannel />
        </section>
      )}

      <section className="mt-6" aria-labelledby="tv-where">
        <h2 id="tv-where" className="text-lg font-bold">
          Where to Watch
        </h2>
        <p className="text-sm text-panel/80">Much-loved classics that can&apos;t be shown here, and where their owners offer them.</p>
        <ul className="mt-2 space-y-3">
          {catalogue.guide.map((g) => (
            <li key={g.id} className="rounded-xl bg-panel/10 p-3">
              <p className="font-semibold">
                {g.title} <span className="text-sm font-normal text-panel/75">· {g.years} · {MEDIA_LANGUAGES[g.language]}</span>
              </p>
              <p className="text-sm text-panel/85">{g.description}</p>
              <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                {g.watch.map((w) => (
                  <li key={w.url}>
                    <a href={w.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold underline underline-offset-4">
                      {w.platform} ({WATCH_ACCESS[w.access]})
                      <Icon name="external" className="h-4 w-4" />
                      <span className="sr-only">(opens in a new tab)</span>
                    </a>
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-xs text-panel/60">Checked {g.verifiedAt}. Availability can change; XPLOR9 has no link with these services.</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function problemText({ status, programme }: Now): string | null {
  if (status === "unavailable") return `“${programme.title}” can't be played here (it may have been removed, or its owner doesn't allow it). Moving to the next programme…`;
  if (status === "no-response") return "The player didn't respond. Check your internet connection, then try again.";
  if (status === "offline") return "You're offline, so programmes can't play. Connect to the internet and try again.";
  return null;
}

function rightsLine(p: Programme, uploaders: Record<string, string>): string {
  return p.rights.basis === "official-upload"
    ? `Official upload by ${uploaders[p.rights.uploaderChannelId] ?? "its owner"} · ${PROVIDER_NAMES[p.source.provider]}`
    : "Public domain in India and the US · Internet Archive";
}

function meta(p: Programme): string {
  return [MEDIA_LANGUAGES[p.language], p.year, p.source.provider === "youtube-playlist" ? "Series" : null].filter(Boolean).join(" · ");
}

function ProgrammeList({
  items,
  onWatch,
  favourites,
  uploaders,
  showChannel = false,
}: {
  items: { channel: TvChannel; programme: Programme }[];
  onWatch: (c: TvChannel, p: Programme) => void;
  favourites: string[];
  uploaders: Record<string, string>;
  showChannel?: boolean;
}) {
  return (
    <ul className="mt-2 divide-y divide-panel/15">
      {items.map(({ channel, programme: p }) => {
        const fav = favourites.includes(p.id);
        return (
          <li key={`${channel.id}:${p.id}`} className="flex items-start gap-3 py-2.5" data-testid="tv-programme" data-id={p.id}>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{p.title}</p>
              <p className="text-xs text-panel/70">
                {showChannel ? `${channel.name} · ` : ""}
                {meta(p)}
              </p>
              <p className="mt-0.5 text-sm text-panel/85">{p.description}</p>
              <p className="mt-0.5 text-xs text-panel/60">{rightsLine(p, uploaders)}</p>
            </div>
            <button
              type="button"
              onClick={() => toggleTvFavourite(p.id)}
              aria-pressed={fav}
              aria-label={`${fav ? "Remove" : "Add"} ${p.title} ${fav ? "from" : "to"} favourites`}
              className="rounded-full p-2 hover:bg-panel/15 aria-pressed:text-brand focus-visible:outline-2"
            >
              <Icon name="heart" />
            </button>
            <button
              type="button"
              onClick={() => onWatch(channel, p)}
              className="inline-flex items-center gap-1.5 rounded-full bg-panel px-3 py-1.5 text-sm font-bold text-ink hover:bg-plastic focus-visible:outline-2 focus-visible:outline-offset-2"
              aria-label={`Watch ${p.title}`}
            >
              <Icon name="play" className="h-4 w-4" /> Watch
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function Remote({
  now,
  favourite,
  uploaders,
  onPrev,
  onNext,
  onRetry,
  onOff,
}: {
  now: Now;
  favourite: boolean;
  uploaders: Record<string, string>;
  onPrev: () => void;
  onNext: () => void;
  onRetry: () => void;
  onOff: () => void;
}) {
  const { programme: p, channel, status } = now;
  const fullscreenOk = typeof document !== "undefined" && document.fullscreenEnabled;
  const fullscreen = () => {
    const el = document.querySelector<HTMLElement>('[data-testid="tv-player"]');
    void el?.requestFullscreen?.().catch(() => {});
  };
  const problem = problemText(now);
  const btn = "inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-semibold hover:bg-panel/15 focus-visible:outline-2 focus-visible:outline-offset-2";
  return (
    <div
      role="region"
      aria-label="TV remote control"
      className="fixed inset-x-2 bottom-3 z-20 mx-auto max-w-3xl rounded-2xl bg-ink/90 p-3 text-panel shadow-xl backdrop-blur sm:inset-x-4"
      data-testid="tv-remote"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">
            <span className="font-pixel text-xs text-phosphor">{channel.name}</span> {p.title}
          </p>
          <p className="truncate text-xs text-panel/70" data-testid="tv-status">
            {problem ?? STATUS_TEXT[status] ?? rightsLine(p, uploaders)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <button type="button" className={btn} onClick={onPrev} aria-label="Previous programme on this channel">
            <Icon name="prev" />
          </button>
          <button type="button" className={btn} onClick={onNext} aria-label="Next programme on this channel">
            <Icon name="next" />
          </button>
          <button
            type="button"
            className={`${btn} aria-pressed:text-brand`}
            onClick={() => toggleTvFavourite(p.id)}
            aria-pressed={favourite}
            aria-label={favourite ? "Remove from favourites" : "Add to favourites"}
          >
            <Icon name="heart" />
          </button>
          {fullscreenOk && (
            <button type="button" className={btn} onClick={fullscreen} aria-label="Fullscreen">
              <Icon name="expand" />
            </button>
          )}
          {(status === "no-response" || status === "offline") && (
            <button type="button" className={btn} onClick={onRetry}>
              <Icon name="retry" /> Try again
            </button>
          )}
          <a className={btn} href={sourcePage(p.source)} target="_blank" rel="noopener noreferrer" aria-label={`Open on ${PROVIDER_NAMES[p.source.provider]} (new tab)`}>
            <Icon name="external" />
          </a>
          <button type="button" className={`${btn} bg-panel text-ink hover:bg-plastic`} onClick={onOff}>
            <Icon name="stop" /> Switch off
          </button>
        </div>
      </div>
    </div>
  );
}
