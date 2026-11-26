"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { EmbedPlayer, type EmbedPlayerHandle, type PlayerTime } from "@/features/media/EmbedPlayer";
import { MEDIA_LANGUAGES, PROVIDER_NAMES, sourcePage } from "@/features/media/catalogue";
import { isPermanentError, nextStatus, sessionDetail, sessionStatus, type EmbedStatus } from "@/features/media/embedStatus";
import { MediaTransport, fullscreen, revealPlayer } from "@/features/media/MediaTransport";
import type { PlayerEvent } from "@/features/media/playerMessages";
import { getPlaybackEngine, usePlayback } from "@/lib/playback/browser";
import { AddToMusic, addableVideo } from "@/features/music/AddToMusic";
import { useMediaSession } from "@/lib/playback/mediaFocus";
import { useLocalStore } from "@/lib/storage/store";
import { WATCH_ACCESS, type Programme, type TvCatalogue, type TvChannel } from "./catalogue";
import { recordTvWatch, toggleTvFavourite, tvFavourites, tvRecents } from "./tvStores";

/**
 * Television (D2): the family set as a desktop media player. A channel selector (numbered, like
 * the buttons on the set), the screen with a transport bar, and the programme guide for the
 * chosen channel; favourites, recently watched and Where to Watch beside it.
 *
 * Programmes play in their owners' official players (YouTube or the Internet Archive), which load
 * only when you choose something. One sound at a time: the TV pauses the radio and other players.
 */

type Status = EmbedStatus | "offline";
interface Now {
  channel: TvChannel;
  programme: Programme;
  status: Status;
  /** Bumped by "Try again" so the player reloads. */
  attempt: number;
}
type Pane = "guide" | "where";

export function TvExperience({ catalogue, uploaders }: { catalogue: TvCatalogue; uploaders: Record<string, string> }) {
  const [channelId, setChannelId] = useState(catalogue.channels[0].id);
  const [pane, setPane] = useState<Pane>("guide");
  const [now, setNow] = useState<Now | null>(null);
  const [time, setTime] = useState<PlayerTime | null>(null);
  const [announce, setAnnounce] = useState("");
  const unavailable = useRef(new Set<string>());
  const player = useRef<EmbedPlayerHandle>(null);
  const screen = useRef<HTMLDivElement>(null);
  const audio = usePlayback();
  const favourites = useLocalStore(tvFavourites);
  const recents = useLocalStore(tvRecents);
  const byId = useMemo(() => {
    const m = new Map<string, { channel: TvChannel; programme: Programme }>();
    for (const channel of catalogue.channels) for (const programme of channel.programmes) m.set(programme.id, { channel, programme });
    return m;
  }, [catalogue]);

  const watch = useCallback((channel: TvChannel, programme: Programme) => {
    setTime(null);
    if (!navigator.onLine) {
      setNow({ channel, programme, status: "offline", attempt: 0 });
      return;
    }
    setNow((prev) => ({ channel, programme, status: "loading", attempt: (prev?.attempt ?? 0) + 1 }));
    setChannelId(channel.id);
    setAnnounce(`Now on ${channel.name}: ${programme.title}.`);
    recordTvWatch(programme.id);
    revealPlayer(screen.current);
  }, []);

  const switchOff = useCallback(() => {
    setNow(null);
    setTime(null);
    setAnnounce("The TV is off.");
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

  const onPlayerEvent = useCallback((e: PlayerEvent) => {
    setNow((cur) => {
      if (!cur || cur.status === "offline") return cur;
      if (isPermanentError(e)) unavailable.current.add(cur.programme.id);
      const status = nextStatus(cur.status, e);
      return status === cur.status ? cur : { ...cur, status };
    });
    if (e.type === "ready") player.current?.setVolume(getPlaybackEngine().getState().volume * 100);
  }, []);

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

  // One sound at a time: the radio (or another window) starting pauses the set; Archive films
  // have no remote control, so they're switched off instead.
  const playing = status === "playing";
  const archive = now?.programme.source.provider === "archive";
  const canControl = !!now && !archive && now.status !== "offline";
  useMediaSession(
    "tv",
    now && {
      app: "tv",
      title: now.programme.title,
      subtitle: now.channel.name,
      status: sessionStatus(now.status),
      detail: sessionDetail(now.status),
      toggle: canControl ? () => (now.status === "playing" ? player.current?.pause() : player.current?.play()) : undefined,
      stop: switchOff,
    },
    () => (archive ? switchOff() : player.current?.pause()),
  );

  const channel = catalogue.channels.find((c) => c.id === channelId) ?? catalogue.channels[0];
  const favouriteItems = favourites.map((id) => byId.get(id)).filter((x) => x !== undefined);
  const recentItems = recents.map((id) => byId.get(id)).filter((x) => x !== undefined);
  const problem = now && problemText(now);
  const controllable = canControl;
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const index = catalogue.channels.findIndex((c) => c.id === channel.id);
  const onTabKey = (e: React.KeyboardEvent) => {
    const n = catalogue.channels.length;
    const to = e.key === "ArrowDown" || e.key === "ArrowRight" ? (index + 1) % n : e.key === "ArrowUp" || e.key === "ArrowLeft" ? (index - 1 + n) % n : e.key === "Home" ? 0 : e.key === "End" ? n - 1 : -1;
    if (to < 0) return;
    e.preventDefault();
    setChannelId(catalogue.channels[to].id);
    setPane("guide");
    tabs.current[to]?.focus();
  };
  const fav = !!now && favourites.includes(now.programme.id);

  return (
    <div className="mx" data-testid="tv-app">
      <h1 className="sr-only">{now ? `TV: watching ${now.programme.title}` : "TV"}</h1>
      <p className="sr-only" aria-live="polite" data-testid="tv-announce">
        {problem ?? announce}
      </p>

      <aside className="mx-side" aria-label="Channels and lists">
        <p className="xp-sidebar-heading">Channels</p>
        <div role="tablist" aria-label="Channels" aria-orientation="vertical" className="mx-side-section mx-tabs-row" onKeyDown={onTabKey}>
          {catalogue.channels.map((c, i) => (
            <button
              key={c.id}
              ref={(el) => {
                tabs.current[i] = el;
              }}
              role="tab"
              id={`tab-${c.id}`}
              aria-selected={pane === "guide" && c.id === channel.id}
              aria-controls="tv-channel-panel"
              tabIndex={c.id === channel.id ? 0 : -1}
              onClick={() => {
                setChannelId(c.id);
                setPane("guide");
              }}
              className="mx-nav-item"
            >
              <span className="mx-ch" aria-hidden>
                {i + 1}
              </span>
              <span className="min-w-0">
                <span className="sr-only">{i + 1} </span>
                {c.name}
                <span className="mx-nav-sub">{c.programmes.length} programmes</span>
              </span>
            </button>
          ))}
        </div>
        <SideList title="Favourites" items={favouriteItems} onWatch={watch} empty="Press the heart next to a programme to keep it here." />
        <SideList title="Recently watched" items={recentItems.slice(0, 8)} onWatch={watch} empty="Programmes you watch appear here." />
        <div className="mx-side-section">
          <button type="button" className="mx-nav-item" aria-current={pane === "where" ? "true" : undefined} onClick={() => setPane("where")}>
            <Icon name="external" className="h-4 w-4 shrink-0" />
            Where to Watch
          </button>
        </div>
      </aside>

      <div className="mx-main">
        <div className="mx-stage">
          <div className="mx-device">
            <div ref={screen} className="mx-screen mx-screen--tv" data-testid="tv-player" data-placement="frame">
              {now && now.status !== "offline" ? (
                <EmbedPlayer
                  key={`${now.programme.id}:${now.attempt}`}
                  ref={player}
                  source={now.programme.source}
                  title={`${now.programme.title} (${PROVIDER_NAMES[now.programme.source.provider]} player)`}
                  onEvent={onPlayerEvent}
                  onTime={setTime}
                  className="h-full w-full border-0"
                />
              ) : (
                <>
                  <div className="mx-bars" aria-hidden />
                  <div className="mx-idle">
                    <div>
                      <strong>{now ? "No signal" : `Channel ${index + 1}: ${channel.name}`}</strong>
                      {now ? "You're offline. Connect, then press Try again." : "Choose a programme from the guide to switch the set on."}
                    </div>
                  </div>
                </>
              )}
            </div>
            {now && (
              <p className="mx-nowline">
                <b>{now.programme.title}</b>
                <span>
                  {now.channel.name} · {meta(now.programme)}
                </span>
              </p>
            )}
            {problem && <p className="mx-problem">{problem}</p>}
            <MediaTransport
              playing={playing}
              controllable={controllable}
              time={time}
              onPlayPause={() => (playing ? player.current?.pause() : player.current?.play())}
              onStop={switchOff}
              stopLabel="Switch off"
              onPrev={now ? () => step(-1) : undefined}
              onNext={now ? () => step(1) : undefined}
              prevLabel="Previous programme on this channel"
              nextLabel="Next programme on this channel"
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
                  <button type="button" className="mx-key" onClick={() => toggleTvFavourite(now.programme.id)} aria-pressed={fav} aria-label={fav ? "Remove from favourites" : "Add to favourites"}>
                    <Icon name={fav ? "heart" : "heartOutline"} className="h-4 w-4" />
                  </button>
                  <AddToMusic
                    video={addableVideo(
                      now.programme.source,
                      now.programme.title,
                      (now.programme.rights.basis === "official-upload" ? uploaders[now.programme.rights.uploaderChannelId] : undefined) ?? now.channel.name,
                      "tv",
                    )}
                  />
                  {(now.status === "no-response" || now.status === "offline") && (
                    <button type="button" className="mx-key" onClick={() => watch(now.channel, now.programme)}>
                      <Icon name="retry" className="h-4 w-4" /> Try again
                    </button>
                  )}
                  <a className="mx-key" href={sourcePage(now.programme.source)} target="_blank" rel="noopener noreferrer" aria-label={`Open on ${PROVIDER_NAMES[now.programme.source.provider]} (new tab)`}>
                    <Icon name="external" className="h-4 w-4" />
                  </a>
                </>
              )}
            </MediaTransport>
          </div>
        </div>

        {pane === "guide" ? (
          <section className="mx-library" data-testid="tv-guide" aria-label="Programme guide">
            <div role="tabpanel" id="tv-channel-panel" aria-labelledby={`tab-${channel.id}`}>
              <div className="mx-library-head">
                <div>
                  <h2>
                    Channel {index + 1}: {channel.name}
                  </h2>
                  <p>{channel.description}</p>
                </div>
              </div>
              <ProgrammeList items={channel.programmes.map((p) => ({ channel, programme: p }))} onWatch={watch} favourites={favourites} uploaders={uploaders} currentId={now?.programme.id ?? null} />
            </div>
          </section>
        ) : (
          <WhereToWatch catalogue={catalogue} />
        )}

        <div className="xp-statusbar mx-statusbar">
          <span className="truncate" data-testid="tv-status">
            {now ? (problem ?? statusLine(now, uploaders)) : "Off"}
          </span>
          <span className="shrink-0">Official players only. Nothing loads until you choose a programme.</span>
        </div>
      </div>
    </div>
  );
}

function SideList({ title, items, onWatch, empty }: { title: string; items: { channel: TvChannel; programme: Programme }[]; onWatch: (c: TvChannel, p: Programme) => void; empty: string }) {
  return (
    <section className="mx-side-section" aria-label={title}>
      <h2 className="xp-sidebar-heading !px-2">{title}</h2>
      {items.length === 0 ? (
        <p className="mx-mini-empty">{empty}</p>
      ) : (
        <ul className="mx-mini-list">
          {items.map(({ channel, programme }) => (
            <li key={programme.id}>
              <button type="button" onClick={() => onWatch(channel, programme)} title={`${programme.title} (${channel.name})`}>
                {programme.title}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function WhereToWatch({ catalogue }: { catalogue: TvCatalogue }) {
  return (
    <section className="mx-library" aria-labelledby="tv-where">
      <div className="mx-library-head">
        <div>
          <h2 id="tv-where">Where to Watch</h2>
          <p>Much-loved classics that can&apos;t be shown here, and where their owners offer them.</p>
        </div>
      </div>
      <ul className="mx-rows">
        {catalogue.guide.map((g) => (
          <li key={g.id}>
            <div className="mx-row-text">
              <p className="mx-row-title">{g.title}</p>
              <p className="mx-row-meta">
                {g.years} · {MEDIA_LANGUAGES[g.language]}
              </p>
              <p className="mx-row-desc">{g.description}</p>
              <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                {g.watch.map((w) => (
                  <li key={w.url}>
                    <a href={w.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-[var(--ui-accent)] underline underline-offset-4">
                      {w.platform} ({WATCH_ACCESS[w.access]})
                      <Icon name="external" className="h-3.5 w-3.5" />
                      <span className="sr-only">(opens in a new tab)</span>
                    </a>
                  </li>
                ))}
              </ul>
              <p className="mx-row-rights">Checked {g.verifiedAt}. Availability can change; XPLOR9 has no link with these services.</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function problemText({ status, programme }: Now): string | null {
  if (status === "unavailable") return `“${programme.title}” can't be played here (it may have been removed, or its owner doesn't allow it). Moving to the next programme…`;
  if (status === "no-response") return "The player didn't respond. Check your internet connection, then try again.";
  if (status === "offline") return "You're offline, so programmes can't play. Connect to the internet and try again.";
  return null;
}

function statusLine(now: Now, uploaders: Record<string, string>): string {
  if (now.status === "loading") return "Tuning in…";
  if (now.status === "paused") return "Paused";
  if (now.status === "ended") return "Finished";
  return rightsLine(now.programme, uploaders);
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
  currentId,
}: {
  items: { channel: TvChannel; programme: Programme }[];
  onWatch: (c: TvChannel, p: Programme) => void;
  favourites: string[];
  uploaders: Record<string, string>;
  currentId: string | null;
}) {
  return (
    <ul className="mx-rows">
      {items.map(({ channel, programme: p }) => {
        const fav = favourites.includes(p.id);
        return (
          <li key={`${channel.id}:${p.id}`} data-testid="tv-programme" data-id={p.id} aria-current={currentId === p.id ? "true" : undefined}>
            <div className="mx-row-text">
              <p className="mx-row-title">{p.title}</p>
              <p className="mx-row-meta">{meta(p)}</p>
              <p className="mx-row-desc">{p.description}</p>
              <p className="mx-row-rights">{rightsLine(p, uploaders)}</p>
            </div>
            <div className="mx-row-actions">
              <button
                type="button"
                className="mx-icon-btn"
                onClick={() => toggleTvFavourite(p.id)}
                aria-pressed={fav}
                aria-label={`${fav ? "Remove" : "Add"} ${p.title} ${fav ? "from" : "to"} favourites`}
              >
                <Icon name={fav ? "heart" : "heartOutline"} className="h-4 w-4" />
              </button>
              <button type="button" className="xp-button xp-button--primary" onClick={() => onWatch(channel, p)} aria-label={`Watch ${p.title}`}>
                <Icon name="play" className="h-4 w-4" /> Watch
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
