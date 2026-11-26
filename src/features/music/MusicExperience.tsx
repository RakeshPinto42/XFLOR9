"use client";

import { useEffect, useRef, useState } from "react";
import { EmbedPlayer, type EmbedPlayerHandle } from "@/features/media/EmbedPlayer";
import { MEDIA_LANGUAGES, PROVIDER_NAMES, sourcePage } from "@/features/media/catalogue";
import { getPlaybackEngine, usePlayback } from "@/lib/playback/browser";
import { useMediaSession } from "@/lib/playback/mediaFocus";
import { useLocalStore } from "@/lib/storage/store";
import { getAnalyser } from "./audioGraph";
import { cassettePlayback, type Cassette } from "./catalogue";
import { EQ_BANDS, EQ_LIMIT, EQ_PRESETS, bandLabel, presetName } from "./eq";
import { addedId, deletePlaylist, findByName, removeFromPlaylist, removeVideo, renamePlaylist, savePlaylist } from "./library";
import { entryPlayback, initMusic, music, musicEq, musicView, useMusic, type Entry, type EntryTrack, type VideoNow } from "./musicPlayer";
import { musicFavourites, musicLibrary, musicRecents, toggleMusicFavourite } from "./musicStores";
import { append, clear, clock, move, removeAt, replaceAll } from "./playlist";
import { parseTrackId } from "./queue";
import "./amp.css";

/**
 * Music (D2): "XPLOR9 Amp", a desktop media player in the spirit of the classic skinned players.
 * Main panel (display, visualiser, transport, seek, volume, balance, shuffle, repeat), a 10-band
 * equaliser, a playlist you build and reorder, a media library of tapes, favourites and recently
 * played, and a video pane for official uploads (YouTube's own player, which must stay visible).
 *
 * Every control does something real. The equaliser, balance and visualiser need the sound itself,
 * which only the public-domain records allow (YouTube's player keeps its sound to itself); with a
 * video playing they say so instead of pretending.
 */

const trackMeta = (t: EntryTrack) => [t.film, t.year, t.artist].filter(Boolean).join(" · ") || (t.language ? MEDIA_LANGUAGES[t.language] : "");
const isVideoEntry = (e: Entry | undefined) => !!e && entryPlayback(e) === "video";

function rightsLine(t: EntryTrack, uploaders: Record<string, string>): string {
  if (!t.rights) return `YouTube video by ${t.artist ?? "its uploader"}, added from Video or TV · YouTube`;
  return t.rights.basis === "official-upload"
    ? `Official upload by ${uploaders[t.rights.uploaderChannelId] ?? "its label"} · ${PROVIDER_NAMES[t.source.provider]}`
    : "Public-domain recording (India and US) · Internet Archive";
}

type PlayState = "playing" | "paused" | "stopped" | "loading" | "problem";

export function MusicExperience({ cassettes, uploaders }: { cassettes: Cassette[]; uploaders: Record<string, string> }) {
  useState(() => initMusic(cassettes)); // once, before the first render reads the player
  useEffect(() => music.mount(), []);
  const { playlist, video, skip } = useMusic();
  const audio = usePlayback();
  const view = useLocalStore(musicView);
  const libraryRef = useRef<HTMLElement>(null);

  const current = music.entry(playlist.items[playlist.index]);
  const currentIsVideo = isVideoEntry(current);
  const audioAt = parseTrackId(audio.source?.id);
  const audioIsCurrent = !!current && audioAt?.trackId === current.track.id && !currentIsVideo;

  const state: PlayState = video
    ? video.status === "playing"
      ? "playing"
      : video.status === "paused"
        ? "paused"
        : video.status === "loading"
          ? "loading"
          : video.status === "ended"
            ? "stopped"
            : "problem"
    : audioIsCurrent
      ? audio.status === "playing"
        ? "playing"
        : audio.status === "paused"
          ? "paused"
          : audio.status === "loading" || audio.status === "buffering"
            ? "loading"
            : audio.status === "error"
              ? "problem"
              : "stopped"
      : "stopped";

  // One sound at a time: a video playing here pauses TV, Video and the radio, and the other way round.
  // (Records play through the shared player, which claims the speakers as "audio"; that must not pause them.)
  // The tray shows a video playing here (records are shown through the shared player).
  useMediaSession(
    "music",
    video && current
      ? {
          app: "music",
          title: current.track.title,
          subtitle: current.track.artist ?? current.cassette.name,
          status: state === "problem" ? "problem" : state,
          detail: state === "problem" ? (videoProblem(video, current) ?? "Can't be played") : undefined,
          toggle: () => music.toggle(),
          stop: () => music.stop(),
        }
      : null,
    () => music.pauseVideo(),
  );

  const problem = video ? videoProblem(video, current) : audioIsCurrent && audio.status === "error" ? (audio.error?.message ?? "This record couldn't play.") : null;

  // Classic player keys: Z previous, X play, C pause, V stop, B next.
  const onKeyDown = (e: React.KeyboardEvent) => {
    const t = e.target as HTMLElement;
    if (e.ctrlKey || e.metaKey || e.altKey || t.closest("input, select, textarea, [role=listbox]")) return;
    const k = e.key.toLowerCase();
    const run: Record<string, () => void> = {
      z: () => music.prev(),
      x: () => (state === "playing" ? undefined : music.toggle()),
      c: () => music.pause(),
      v: () => music.stop(),
      b: () => music.next(),
    };
    if (run[k]) {
      e.preventDefault();
      run[k]();
    }
  };

  return (
    <div className="amp" onKeyDown={onKeyDown} data-testid="music-player">
      <h1 className="sr-only">Music</h1>
      <p className="sr-only" aria-live="polite" data-testid="music-announce">
        {problem ?? (current ? `${state === "playing" ? "Playing" : state === "paused" ? "Paused" : state === "loading" ? "Loading" : "Stopped"}: ${current.track.title}` : "")}
      </p>
      <div className="amp-stack">
        <MainPanel current={current} state={state} video={video} audioIsCurrent={audioIsCurrent} problem={problem} />
        {view.eq && <EqPanel videoPlaying={currentIsVideo} />}
        {view.playlist && <PlaylistPanel skip={skip} onAdd={() => libraryRef.current?.querySelector<HTMLElement>("button")?.focus()} />}
      </div>
      <div className="amp-side">
        {video && current && <VideoPane video={video} entry={current} uploaders={uploaders} />}
        <Library ref={libraryRef} cassettes={cassettes} uploaders={uploaders} currentId={current?.track.id ?? null} />
      </div>
    </div>
  );
}

function videoProblem(v: VideoNow, e: Entry | undefined): string | null {
  const title = e?.track.title ?? "This song";
  if (v.status === "unavailable") return `“${title}” can't be played here (it may have been removed, or its owner doesn't allow it). Moving on…`;
  if (v.status === "no-response") return "YouTube's player didn't respond. Check the connection, then press Play.";
  if (v.status === "offline") return "You're offline, so songs can't play. Connect, then press Play.";
  return null;
}

// ---------------------------------------------------------------------------- main panel

function MainPanel({ current, state, video, audioIsCurrent, problem }: { current: Entry | undefined; state: PlayState; video: VideoNow | null; audioIsCurrent: boolean; problem: string | null }) {
  const view = useLocalStore(musicView);
  const { playlist } = useMusic();
  const audio = usePlayback();
  const favourites = useLocalStore(musicFavourites);
  const time = usePosition(video, audioIsCurrent);
  const [scrub, setScrub] = useState<number | null>(null);
  const [balance, setBalanceValue] = useState(0);
  const isVideo = isVideoEntry(current);
  const volume = Math.round(audio.volume * 100);

  const shown = view.remaining && time.duration !== null ? `-${clock(Math.max(0, time.duration - time.current))}` : clock(current ? time.current : null);
  const title = current ? `${playlist.index + 1}. ${current.track.title}${current.track.film ? ` (${current.track.film})` : ""}` : "XPLOR9 Amp: add a tape from the library";
  const fav = !!current && favourites.includes(current.track.id);

  return (
    <section className="amp-panel amp-main" aria-label="Player">
      <header className="amp-strip">
        <span>
          <span className="amp-brand">XPLOR9</span> Amp
        </span>
      </header>
      <div className="amp-display">
        {current && <TapeArt cassette={current.cassette} size={58} className="amp-art" />}
        <div className="amp-display-left">
          <div className="amp-readout">
          <span className="amp-state" aria-hidden>
            {state === "playing" ? "▶" : state === "paused" ? "❚❚" : state === "loading" ? "…" : state === "problem" ? "!" : "■"}
          </span>
          <button
            type="button"
            className="amp-time"
            onClick={() => musicView.set((v) => ({ ...v, remaining: !v.remaining }))}
            aria-label={`${view.remaining ? "Time remaining" : "Time elapsed"} ${shown}. Switch display.`}
            data-testid="music-time"
          >
            {shown}
          </button>
          </div>
          <Visualiser active={!isVideo && audioIsCurrent && state === "playing"} mode={isVideo ? "video" : "spectrum"} />
        </div>
        <div className="amp-display-right">
          <div className="amp-marquee" title={title}>
            <span className={title.length > 34 && state === "playing" ? "amp-marquee-run" : undefined}>{title}</span>
          </div>
          <p className="amp-info" data-testid="music-status">
            {problem ? <span className="amp-warn">{problem}</span> : current ? `${isVideo ? "Video · YouTube" : "Record · Internet Archive"} · ${current.cassette.name}` : "No tape"}
          </p>
        </div>
      </div>

      <label className="sr-only" htmlFor="amp-seek">
        Position
      </label>
      <input
        id="amp-seek"
        className="amp-seek"
        type="range"
        min={0}
        max={time.duration ?? 1}
        step={0.5}
        value={scrub ?? Math.min(time.current, time.duration ?? 0)}
        disabled={time.duration === null}
        onChange={(e) => setScrub(Number(e.target.value))}
        onPointerUp={() => {
          if (scrub !== null) music.seek(scrub);
          setScrub(null);
        }}
        onKeyUp={() => {
          if (scrub !== null) music.seek(scrub);
          setScrub(null);
        }}
        aria-valuetext={`${clock(scrub ?? time.current)} of ${clock(time.duration)}`}
      />

      <div className="amp-controls">
        <div className="amp-transport" role="group" aria-label="Transport">
          <AmpButton label="Previous (Z)" onClick={() => music.prev()} glyph="prev" />
          <AmpButton label="Play (X)" onClick={() => (state === "playing" ? undefined : music.toggle())} glyph="play" pressed={state === "playing"} />
          <AmpButton label="Pause (C)" onClick={() => music.pause()} glyph="pause" pressed={state === "paused"} />
          <AmpButton label="Stop (V)" onClick={() => music.stop()} glyph="stop" />
          <AmpButton label="Next (B)" onClick={() => music.next()} glyph="next" />
        </div>
        <div className="amp-toggles">
          <button type="button" className="amp-toggle" aria-pressed={playlist.shuffle} onClick={() => music.setPlaylist((p) => ({ ...p, shuffle: !p.shuffle }))}>
            Shuffle
          </button>
          <button
            type="button"
            className="amp-toggle"
            aria-pressed={playlist.repeat !== "off"}
            aria-label={`Repeat: ${playlist.repeat === "off" ? "off" : playlist.repeat === "all" ? "whole playlist" : "this song"}`}
            onClick={() => music.setPlaylist((p) => ({ ...p, repeat: p.repeat === "off" ? "all" : p.repeat === "all" ? "one" : "off" }))}
          >
            {playlist.repeat === "one" ? "Repeat 1" : "Repeat"}
          </button>
          <button type="button" className="amp-toggle" aria-pressed={view.eq} onClick={() => musicView.set((v) => ({ ...v, eq: !v.eq }))}>
            EQ
          </button>
          <button type="button" className="amp-toggle" aria-pressed={view.playlist} onClick={() => musicView.set((v) => ({ ...v, playlist: !v.playlist }))}>
            PL
          </button>
          <button
            type="button"
            className="amp-toggle"
            aria-pressed={fav}
            disabled={!current}
            aria-label={current ? `${fav ? "Remove" : "Add"} ${current.track.title} ${fav ? "from" : "to"} favourites` : "Favourite"}
            onClick={() => current && toggleMusicFavourite(current.track.id)}
          >
            ♥
          </button>
        </div>
      </div>

      <div className="amp-sliders">
        <label className="amp-slider">
          <span>Volume</span>
          <input type="range" min={0} max={100} step={1} value={volume} onChange={(e) => music.setVolume(Number(e.target.value))} aria-valuetext={`${volume}%`} disabled={!audio.volumeControllable && !isVideo} />
        </label>
        <label className="amp-slider" title={isVideo ? "Balance works on the public-domain records" : undefined}>
          <span>Balance</span>
          <input
            type="range"
            min={-100}
            max={100}
            step={5}
            value={balance}
            disabled={isVideo}
            onChange={(e) => {
              const v = Number(e.target.value);
              setBalanceValue(v);
              void import("./audioGraph").then((m) => m.setBalance(v / 100));
            }}
            onDoubleClick={() => {
              setBalanceValue(0);
              void import("./audioGraph").then((m) => m.setBalance(0));
            }}
            aria-valuetext={balance === 0 ? "Centre" : balance < 0 ? `${-balance}% left` : `${balance}% right`}
          />
        </label>
        {problem && current && (
          <button type="button" className="amp-toggle" onClick={() => music.playAt(playlist.index)}>
            Try again
          </button>
        )}
      </div>
    </section>
  );
}

const GLYPHS: Record<string, React.ReactNode> = {
  prev: <path d="M3 3h2v10H3zM14 3v10L6 8z" />,
  play: <path d="M4 2.5v11L13.5 8z" />,
  pause: <path d="M3.5 3h3v10h-3zM9.5 3h3v10h-3z" />,
  stop: <path d="M3.5 3.5h9v9h-9z" />,
  next: <path d="M11 3h2v10h-2zM2 3v10l8-5z" />,
};
function AmpButton({ label, onClick, glyph, pressed }: { label: string; onClick: () => void; glyph: string; pressed?: boolean }) {
  return (
    <button type="button" className="amp-button" onClick={onClick} aria-label={label} title={label} aria-pressed={pressed}>
      <svg viewBox="0 0 16 16" aria-hidden>
        <g fill="currentColor">{GLYPHS[glyph]}</g>
      </svg>
    </button>
  );
}

/** Where the current song is: from YouTube's reports for videos, from the audio element for records. */
function usePosition(video: VideoNow | null, audioIsCurrent: boolean) {
  const [pos, setPos] = useState({ current: 0, duration: null as number | null });
  useEffect(() => {
    if (video || !audioIsCurrent) return;
    const engine = getPlaybackEngine();
    const t = window.setInterval(() => {
      const p = engine.position();
      setPos((old) => (old.current === p.current && old.duration === p.duration ? old : p));
    }, 250);
    return () => window.clearInterval(t);
  }, [video, audioIsCurrent]);
  if (video) return video.time;
  return audioIsCurrent ? pos : { current: 0, duration: null };
}

/** The spectrum of what the records actually sound like (Web Audio analyser). Draws nothing it doesn't measure. */
function Visualiser({ active, mode }: { active: boolean; mode: "spectrum" | "video" }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = canvas.current;
    const g = c?.getContext("2d");
    if (!c || !g) return;
    g.clearRect(0, 0, c.width, c.height);
    const analyser = active ? getAnalyser() : null;
    if (!analyser || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const data = new Uint8Array(analyser.frequencyBinCount);
    const bars = 19;
    const peaks = new Array(bars).fill(0);
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      if (document.hidden) return;
      analyser.getByteFrequencyData(data);
      g.clearRect(0, 0, c.width, c.height);
      const w = c.width / bars;
      for (let i = 0; i < bars; i++) {
        // Logarithmic bands, like the ear hears.
        const from = Math.floor(2 ** ((i / bars) * Math.log2(data.length / 2)));
        const to = Math.max(from + 1, Math.floor(2 ** (((i + 1) / bars) * Math.log2(data.length / 2))));
        let v = 0;
        for (let k = from; k < to; k++) v = Math.max(v, data[k]);
        const h = Math.round((v / 255) * c.height);
        peaks[i] = Math.max(h, peaks[i] - 0.6);
        const grad = g.createLinearGradient(0, c.height, 0, 0);
        grad.addColorStop(0, "#1fbf3a");
        grad.addColorStop(0.6, "#d8d82a");
        grad.addColorStop(1, "#e8452a");
        g.fillStyle = grad;
        g.fillRect(i * w + 1, c.height - h, w - 2, h);
        g.fillStyle = "#c8c8d8";
        g.fillRect(i * w + 1, c.height - Math.round(peaks[i]) - 1, w - 2, 1);
      }
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [active]);
  return (
    <div className="amp-vis">
      <canvas ref={canvas} width={114} height={30} aria-hidden data-testid="music-visualiser" data-active={active || undefined} />
      {mode === "video" && <span className="amp-vis-note">VIDEO</span>}
    </div>
  );
}

// ---------------------------------------------------------------------------- equaliser

function EqPanel({ videoPlaying }: { videoPlaying: boolean }) {
  const eq = useLocalStore(musicEq);
  const preset = presetName(eq.gains);
  const setGain = (i: number, v: number) => musicEq.set((e) => ({ ...e, gains: e.gains.map((g, k) => (k === i ? v : g)) }));
  return (
    <section className="amp-panel amp-eqp" aria-label="Equaliser">
      <header className="amp-strip">
        <span>Equaliser</span>
      </header>
      <div className="amp-eq-top">
        <button type="button" className="amp-toggle" aria-pressed={eq.enabled} onClick={() => musicEq.set((e) => ({ ...e, enabled: !e.enabled }))}>
          On
        </button>
        <label className="flex items-center gap-1">
          <span>Preset</span>
          <select
            className="amp-select"
            value={preset ?? ""}
            onChange={(e) => {
              const g = EQ_PRESETS[e.target.value];
              if (g) musicEq.set((x) => ({ ...x, gains: [...g] }));
            }}
          >
            {!preset && <option value="">Custom</option>}
            {Object.keys(EQ_PRESETS).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="amp-toggle" onClick={() => musicEq.set((e) => ({ ...e, preamp: 0, gains: [...EQ_PRESETS.Flat] }))}>
          Reset
        </button>
      </div>
      <div className="amp-eq" data-off={!eq.enabled || undefined}>
        <EqSlider label="Preamp" short="PRE" value={eq.preamp} onChange={(v) => musicEq.set((e) => ({ ...e, preamp: v }))} />
        <span className="amp-eq-gap" aria-hidden />
        {EQ_BANDS.map((hz, i) => (
          <EqSlider key={hz} label={`${bandLabel(hz)} hertz`} short={bandLabel(hz)} value={eq.gains[i]} onChange={(v) => setGain(i, v)} />
        ))}
      </div>
      {videoPlaying && <p className="amp-note">The equaliser shapes the public-domain records. YouTube&apos;s player keeps its own sound.</p>}
    </section>
  );
}

function EqSlider({ label, short, value, onChange }: { label: string; short: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="amp-eq-band">
      <input
        type="range"
        min={-EQ_LIMIT}
        max={EQ_LIMIT}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        onDoubleClick={() => onChange(0)}
        aria-label={label}
        aria-valuetext={`${value > 0 ? "+" : ""}${value} decibels`}
      />
      <span aria-hidden>{short}</span>
    </label>
  );
}

// ---------------------------------------------------------------------------- playlist

function PlaylistPanel({ skip, onAdd }: { skip: ReadonlySet<string>; onAdd: () => void }) {
  const { playlist } = useMusic();
  const [selected, setSelected] = useState(0);
  const [saving, setSaving] = useState(false);
  const [savedNote, setSavedNote] = useState("");
  const list = useRef<HTMLOListElement>(null);
  const sel = Math.min(selected, playlist.items.length - 1);

  const focusRow = (i: number) => {
    setSelected(i);
    requestAnimationFrame(() => list.current?.querySelector<HTMLElement>(`[data-index="${i}"]`)?.scrollIntoView({ block: "nearest" }));
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    const n = playlist.items.length;
    if (!n) return;
    const go = (i: number) => {
      e.preventDefault();
      focusRow(Math.max(0, Math.min(n - 1, i)));
    };
    if (e.key === "ArrowDown") go(sel + 1);
    else if (e.key === "ArrowUp") go(sel - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(n - 1);
    else if (e.key === "Enter") {
      e.preventDefault();
      music.playAt(sel);
    } else if (e.key === "Delete") {
      e.preventDefault();
      music.setPlaylist((p) => removeAt(p, sel));
    }
  };

  return (
    <section className="amp-panel amp-playlist" aria-label="Playlist">
      <header className="amp-strip">
        <span>Playlist</span>
        <span>{playlist.items.length} songs</span>
      </header>
      {playlist.items.length === 0 ? (
        <p className="amp-empty">
          The playlist is empty. Choose a tape in the library, then <b>Play tape</b> or <b>Add to playlist</b>.
        </p>
      ) : (
        <ol
          ref={list}
          className="amp-pl-list"
          role="listbox"
          aria-label="Playlist songs"
          tabIndex={0}
          aria-activedescendant={`pl-row-${sel}`}
          onKeyDown={onKeyDown}
          data-testid="music-playlist"
        >
          {playlist.items.map((id, i) => {
            const e = music.entry(id);
            if (!e) return null;
            return (
              <li
                key={`${id}-${i}`}
                id={`pl-row-${i}`}
                data-index={i}
                role="option"
                aria-selected={i === sel}
                aria-current={i === playlist.index ? "true" : undefined}
                className="amp-pl-row"
                onClick={() => setSelected(i)}
                onDoubleClick={() => music.playAt(i)}
              >
                <span className="amp-pl-n">{i + 1}.</span>
                <span className="amp-pl-title">
                  {e.track.title}
                  {skip.has(id) && <em> (can&apos;t play)</em>}
                </span>
                <span className="amp-pl-kind">{isVideoEntry(e) ? "YT" : "REC"}</span>
              </li>
            );
          })}
        </ol>
      )}
      <div className="amp-pl-buttons">
        <button type="button" className="amp-toggle" onClick={onAdd}>
          Add…
        </button>
        <button type="button" className="amp-toggle" disabled={!playlist.items.length} onClick={() => music.playAt(sel)}>
          Play
        </button>
        <button type="button" className="amp-toggle" disabled={!playlist.items.length} onClick={() => music.setPlaylist((p) => removeAt(p, sel))}>
          Remove
        </button>
        <button
          type="button"
          className="amp-toggle"
          disabled={sel <= 0}
          aria-label="Move up"
          onClick={() => {
            music.setPlaylist((p) => move(p, sel, -1));
            focusRow(sel - 1);
          }}
        >
          ▲
        </button>
        <button
          type="button"
          className="amp-toggle"
          disabled={sel < 0 || sel >= playlist.items.length - 1}
          aria-label="Move down"
          onClick={() => {
            music.setPlaylist((p) => move(p, sel, 1));
            focusRow(sel + 1);
          }}
        >
          ▼
        </button>
        <button
          type="button"
          className="amp-toggle"
          disabled={!playlist.items.length}
          onClick={() => {
            music.stop();
            music.setPlaylist((p) => clear(p));
          }}
        >
          Clear
        </button>
        <button
          type="button"
          className="amp-toggle"
          disabled={!playlist.items.length}
          onClick={() => {
            setSaving(true);
            setSavedNote("");
          }}
        >
          Save…
        </button>
      </div>
      {saving && (
        <SaveForm
          items={playlist.items}
          onDone={(m) => {
            setSaving(false);
            setSavedNote(m);
          }}
        />
      )}
      <p className="amp-note" role="status">
        {savedNote}
      </p>
    </section>
  );
}

// ---------------------------------------------------------------------------- video pane

function VideoPane({ video, entry, uploaders }: { video: VideoNow; entry: Entry; uploaders: Record<string, string> }) {
  const player = useRef<EmbedPlayerHandle>(null);
  const pane = useRef<HTMLDivElement>(null);
  useEffect(() => {
    music.registerVideo(player.current);
    return () => music.registerVideo(null);
  }, [video.attempt, video.trackId]);
  const fullscreenOk = typeof document !== "undefined" && document.fullscreenEnabled;
  return (
    <section className="amp-panel amp-video" aria-label="Video">
      <header className="amp-strip">
        <span>Video</span>
        {fullscreenOk && (
          <button type="button" className="amp-strip-button" onClick={() => void pane.current?.requestFullscreen?.().catch(() => {})}>
            Full screen
          </button>
        )}
      </header>
      <div ref={pane} className="amp-video-screen" data-testid="tv-player">
        {video.status !== "offline" && (
          <EmbedPlayer
            key={`${video.trackId}:${video.attempt}`}
            ref={player}
            source={entry.track.source}
            title={`${entry.track.title} (YouTube player)`}
            onEvent={music.onVideoEvent}
            onTime={music.onVideoTime}
            className="h-full w-full border-0"
          />
        )}
      </div>
      <p className="amp-credit">
        {rightsLine(entry.track, uploaders)} ·{" "}
        <a href={sourcePage(entry.track.source)} target="_blank" rel="noopener noreferrer">
          Open on YouTube
        </a>
      </p>
    </section>
  );
}

// ---------------------------------------------------------------------------- library

type Shelf = { kind: "tape"; id: string } | { kind: "favourites" } | { kind: "recent" } | { kind: "saved"; id: string } | { kind: "added" };

const Library = function Library({
  ref,
  cassettes,
  uploaders,
  currentId,
}: {
  ref: React.Ref<HTMLElement>;
  cassettes: Cassette[];
  uploaders: Record<string, string>;
  currentId: string | null;
}) {
  const [shelf, setShelf] = useState<Shelf>({ kind: "tape", id: cassettes[0].id });
  const [editing, setEditing] = useState<"rename" | "delete" | null>(null);
  const favourites = useLocalStore(musicFavourites);
  const recents = useLocalStore(musicRecents);
  const lib = useLocalStore(musicLibrary);
  const tape = shelf.kind === "tape" ? cassettes.find((c) => c.id === shelf.id) : undefined;
  const saved = shelf.kind === "saved" ? lib.playlists.find((p) => p.id === shelf.id) : undefined;
  // Each row keeps its place in a saved playlist (the same song may appear twice).
  const listed: string[] = saved
    ? saved.items
    : shelf.kind === "added"
      ? lib.videos.map((v) => addedId(v.videoId))
      : shelf.kind === "favourites"
        ? favourites
        : shelf.kind === "recent"
          ? recents
          : [];
  const rows: { e: Entry; at: number }[] = tape
    ? tape.tracks.map((track, at) => ({ e: { cassette: tape, track }, at }))
    : listed.flatMap((id, at) => {
        const e = music.entry(id);
        return e ? [{ e, at }] : [];
      });
  const ids = rows.map((r) => r.e.track.id);
  const heading = tape
    ? tape.name
    : saved
      ? saved.name
      : shelf.kind === "added"
        ? "From Video and TV"
        : shelf.kind === "favourites"
          ? "Favourites"
          : shelf.kind === "recent"
            ? "Recently played"
            : "Playlist deleted";

  const playFrom = (start: number) => {
    music.setPlaylist((p) => replaceAll(p, ids, start));
    music.playAt(start);
  };
  const playOne = (id: string) => {
    const p = music.get().playlist;
    const at = p.items.indexOf(id);
    if (at >= 0) return music.playAt(at);
    music.setPlaylist(append(p, [id]));
    music.playAt(music.get().playlist.items.length - 1);
  };
  const open = (next: Shelf) => {
    setShelf(next);
    setEditing(null);
  };
  const empty =
    shelf.kind === "favourites"
      ? "No favourites yet. Press ♥ next to a song."
      : shelf.kind === "saved"
        ? saved
          ? "This playlist is empty. Add videos from Video or TV, or save the playlist you're playing under this name."
          : "This playlist was deleted."
        : shelf.kind === "added"
          ? "Nothing added yet. In Video or TV, press “Add to a Music playlist” while a video plays."
          : "Nothing played yet.";

  return (
    <section ref={ref} className="amp-panel amp-library" aria-label="Media library">
      <header className="amp-strip">
        <span>Media library</span>
      </header>
      <div className="amp-lib-body">
        <nav className="amp-lib-tree" aria-label="Library">
          <p className="amp-lib-group">Tapes</p>
          {cassettes.map((c) => (
            <button key={c.id} type="button" className="amp-lib-node" aria-current={shelf.kind === "tape" && shelf.id === c.id ? "true" : undefined} onClick={() => open({ kind: "tape", id: c.id })}>
              <TapeArt cassette={c} size={26} />
              {c.name}
            </button>
          ))}
          <p className="amp-lib-group">Your music</p>
          <button type="button" className="amp-lib-node" aria-current={shelf.kind === "favourites" ? "true" : undefined} onClick={() => open({ kind: "favourites" })}>
            ♥ Favourites ({favourites.length})
          </button>
          <button type="button" className="amp-lib-node" aria-current={shelf.kind === "recent" ? "true" : undefined} onClick={() => open({ kind: "recent" })}>
            Recently played
          </button>
          <button type="button" className="amp-lib-node" aria-current={shelf.kind === "added" ? "true" : undefined} onClick={() => open({ kind: "added" })}>
            From Video and TV ({lib.videos.length})
          </button>
          <p className="amp-lib-group">Saved playlists</p>
          {lib.playlists.length === 0 && <p className="amp-lib-hint">None yet. Use Save under the playlist.</p>}
          {lib.playlists.map((p) => (
            <button key={p.id} type="button" className="amp-lib-node" aria-current={shelf.kind === "saved" && shelf.id === p.id ? "true" : undefined} onClick={() => open({ kind: "saved", id: p.id })}>
              {p.name} ({p.items.length})
            </button>
          ))}
        </nav>
        <div className="amp-lib-main">
          <div className="amp-lib-head">
            {tape && <TapeArt cassette={tape} size={72} className="amp-art" />}
            <div className="min-w-0 flex-1">
              <h2 className="truncate font-bold">{heading}</h2>
              {tape && (
                <p className="amp-lib-desc">
                  {tape.description} {cassettePlayback(tape) === "audio" ? "Plays as audio, with the equaliser." : "Plays in YouTube's player, in the video pane."}
                </p>
              )}
              {saved && <p className="amp-lib-desc">{saved.items.length} songs, saved in this browser.</p>}
              {shelf.kind === "added" && <p className="amp-lib-desc">Videos you added from Video and TV. Removing one here takes it out of every saved playlist.</p>}
            </div>
            <div className="flex shrink-0 flex-wrap gap-1">
              <button type="button" className="amp-toggle" disabled={!ids.length} onClick={() => playFrom(0)} aria-label={tape ? `Play tape: ${heading}` : `Play all: ${heading}`}>
                {tape ? "Play tape" : "Play all"}
              </button>
              <button type="button" className="amp-toggle" disabled={!ids.length} onClick={() => music.setPlaylist((p) => append(p, ids))}>
                Add to playlist
              </button>
              {saved && (
                <>
                  <button type="button" className="amp-toggle" onClick={() => setEditing("rename")}>
                    Rename…
                  </button>
                  <button type="button" className="amp-toggle" onClick={() => setEditing("delete")}>
                    Delete…
                  </button>
                </>
              )}
            </div>
          </div>
          {saved && editing === "rename" && <RenameForm key={saved.id} id={saved.id} name={saved.name} onDone={() => setEditing(null)} />}
          {saved && editing === "delete" && (
            <div role="alertdialog" aria-labelledby="amp-delete-text" className="amp-inline-form">
              <p id="amp-delete-text">Delete the playlist “{saved.name}”? The songs stay in the library.</p>
              <button
                type="button"
                className="amp-toggle"
                onClick={() => {
                  musicLibrary.set((l) => deletePlaylist(l, saved.id));
                  open({ kind: "added" });
                }}
              >
                Delete playlist
              </button>
              <button type="button" className="amp-toggle" onClick={() => setEditing(null)} autoFocus>
                Cancel
              </button>
            </div>
          )}
          {rows.length === 0 ? (
            <p className="amp-empty">{empty}</p>
          ) : (
            <table className="amp-lib-table">
              <thead>
                <tr>
                  <th scope="col">Title</th>
                  <th scope="col">Film / artist</th>
                  <th scope="col" className="amp-col-src">
                    Source
                  </th>
                  <th scope="col">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ e, at }) => {
                  const fav = favourites.includes(e.track.id);
                  return (
                    <tr key={`${e.cassette.id}:${e.track.id}:${at}`} aria-current={currentId === e.track.id ? "true" : undefined} data-testid="music-track" onDoubleClick={() => playOne(e.track.id)}>
                      <td className="font-bold">{e.track.title}</td>
                      <td>{trackMeta(e.track)}</td>
                      <td className="amp-col-src" title={rightsLine(e.track, uploaders)}>
                        {isVideoEntry(e) ? "YouTube" : "Record"}
                      </td>
                      <td className="amp-lib-actions">
                        <button type="button" className="amp-mini" onClick={() => playOne(e.track.id)} aria-label={`Play ${e.track.title}`}>
                          ▶
                        </button>
                        <button type="button" className="amp-mini" onClick={() => music.setPlaylist((p) => append(p, [e.track.id]))} aria-label={`Add ${e.track.title} to the playlist`}>
                          +
                        </button>
                        {!e.added && (
                          <button
                            type="button"
                            className="amp-mini"
                            aria-pressed={fav}
                            onClick={() => toggleMusicFavourite(e.track.id)}
                            aria-label={`${fav ? "Remove" : "Add"} ${e.track.title} ${fav ? "from" : "to"} favourites`}
                          >
                            ♥
                          </button>
                        )}
                        {saved && (
                          <button type="button" className="amp-mini" onClick={() => musicLibrary.set((l) => removeFromPlaylist(l, saved.id, at))} aria-label={`Remove ${e.track.title} from ${saved.name}`}>
                            ✕
                          </button>
                        )}
                        {shelf.kind === "added" && e.added && (
                          <button type="button" className="amp-mini" onClick={() => musicLibrary.set((l) => removeVideo(l, e.added!.videoId))} aria-label={`Remove ${e.track.title} from Music`}>
                            ✕
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          <p className="amp-credit">Official uploads by the labels on YouTube, and public-domain records from the Internet Archive. Nothing loads from either until you press play.</p>
        </div>
      </div>
    </section>
  );
};

function RenameForm({ id, name, onDone }: { id: string; name: string; onDone: () => void }) {
  const [value, setValue] = useState(name);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="amp-inline-form"
      aria-label="Rename playlist"
      onSubmit={(e) => {
        e.preventDefault();
        const r = renamePlaylist(musicLibrary.get(), id, value);
        if (!r.ok) return setError(r.reason);
        musicLibrary.set(r.lib);
        onDone();
      }}
    >
      <label>
        <span className="sr-only">New name</span>
        <input className="amp-input" value={value} maxLength={60} onChange={(e) => setValue(e.target.value)} autoFocus />
      </label>
      <button type="submit" className="amp-toggle">
        Rename
      </button>
      <button type="button" className="amp-toggle" onClick={onDone}>
        Cancel
      </button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}

/** Saves the playlist being played under a name (a new saved playlist, or the one with that name replaced). */
function SaveForm({ items, onDone }: { items: readonly string[]; onDone: (message: string) => void }) {
  const lib = useLocalStore(musicLibrary);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const existing = name.trim() ? findByName(lib, name) : undefined;
  return (
    <form
      className="amp-inline-form"
      aria-label="Save playlist"
      onSubmit={(e) => {
        e.preventDefault();
        const r = savePlaylist(musicLibrary.get(), name, items, () => crypto.randomUUID());
        if (!r.ok) return setError(r.reason);
        musicLibrary.set(r.lib);
        const saved = r.lib.playlists.find((p) => p.id === r.id)!;
        onDone(r.replaced ? `Replaced “${saved.name}”.` : `Saved as “${saved.name}”.`);
      }}
    >
      <label>
        <span className="sr-only">Playlist name</span>
        <input className="amp-input" placeholder="Playlist name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} autoFocus />
      </label>
      <button type="submit" className="amp-toggle">
        {existing ? "Replace" : "Save"}
      </button>
      <button type="button" className="amp-toggle" onClick={() => onDone("")}>
        Cancel
      </button>
      {existing && !error && <p>This replaces the songs in “{existing.name}”.</p>}
      {error && <p role="alert">{error}</p>}
    </form>
  );
}

/** Cover art for a tape, drawn from its own colours (original artwork; no album covers are copied). */
function TapeArt({ cassette: c, size, className }: { cassette: Cassette; size: number; className?: string }) {
  const small = size < 40;
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className={className} aria-hidden data-testid="tape-art">
      <rect width="64" height="64" rx="6" fill={c.colours.shell} />
      <rect x="6" y="9" width="52" height="34" rx="3" fill={c.colours.label} />
      {!small && (
        <text x="32" y="19.5" textAnchor="middle" fontSize="6.2" fontWeight="700" fill="#1b2030" fontFamily="var(--font-geist), sans-serif">
          {c.name.length > 18 ? `${c.name.slice(0, 17)}…` : c.name}
        </text>
      )}
      <rect x="14" y="24" width="36" height="13" rx="6.5" fill="#1b2030" opacity="0.88" />
      <circle cx="21" cy="30.5" r="4" fill="#f4f1e8" />
      <circle cx="43" cy="30.5" r="4" fill="#f4f1e8" />
      <circle cx="21" cy="30.5" r="1.6" fill="#1b2030" />
      <circle cx="43" cy="30.5" r="1.6" fill="#1b2030" />
      <path d="M12 58 l5 -10 h30 l5 10z" fill="#000" opacity="0.18" />
      <rect width="64" height="22" rx="6" fill="#fff" opacity="0.08" />
    </svg>
  );
}
