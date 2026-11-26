"use client";

import { useSyncExternalStore } from "react";
import type { EmbedPlayerHandle, PlayerTime } from "@/features/media/EmbedPlayer";
import { NO_RESPONSE, UNAVAILABLE_CODES, type PlayerEvent } from "@/features/media/playerMessages";
import { getPlaybackEngine } from "@/lib/playback/browser";
import { STORAGE_KEYS } from "@/lib/storage/local";
import { createLocalStore } from "@/lib/storage/store";
import { ensureGraph, setEq } from "./audioGraph";
import type { MediaLanguage, MediaRights } from "@/features/media/catalogue";
import type { Cassette, Track } from "./catalogue";
import { DEFAULT_EQ, parseEq, type EqSettings } from "./eq";
import { addedId, isAddedId, type AddedVideo } from "./library";
import { musicLibrary, recordMusicPlay } from "./musicStores";
import { EMPTY_PLAYLIST, parsePlaylist, step, type Playlist } from "./playlist";
import { parseTrackId, trackSource } from "./queue";

/**
 * The Music player (one per tab, outside React, like the shared audio player): the playlist,
 * and which of the two ways the current song plays:
 *   - a public-domain record → the shared audio player (keeps playing with the window closed,
 *     shown in the tray), through the equaliser graph;
 *   - an official upload → YouTube's player in the Music window's video pane (YouTube requires
 *     its player to be visible, so these need the window open).
 * The playlist, equaliser and panel layout are remembered in this browser.
 */

export type VideoStatus = "loading" | "playing" | "paused" | "ended" | "unavailable" | "no-response" | "offline";
export interface VideoNow {
  trackId: string;
  status: VideoStatus;
  attempt: number;
  time: PlayerTime;
}
/** A song as the player sees it: a catalogue track, or a video added from Video or TV. */
export type EntryTrack = Omit<Track, "language" | "rights"> & { language: MediaLanguage | null; rights: MediaRights | null };
export interface Entry {
  cassette: Cassette;
  track: EntryTrack;
  /** Set for a video added from Video or TV. */
  added?: AddedVideo;
}

/** Where added videos sit in the library (not a real tape: it has no tracks of its own). */
export const ADDED_TAPE: Cassette = {
  id: "added",
  name: "From Video and TV",
  description: "Videos you added to your playlists from the Video and TV windows.",
  colours: { shell: "#8a3b2f", label: "#f2e6c9" },
  tracks: [],
};

export function addedEntry(v: AddedVideo): Entry {
  return {
    cassette: ADDED_TAPE,
    added: v,
    track: { id: addedId(v.videoId), title: v.title, artist: v.by, film: null, year: null, language: null, source: { provider: "youtube", videoId: v.videoId }, rights: null },
  };
}

/** How a song plays: as audio through the shared player (public-domain records) or in YouTube's player. */
export const entryPlayback = (e: Entry): "audio" | "video" => (e.track.source.provider === "archive-audio" ? "audio" : "video");

function lookup(id: string | undefined): Entry | undefined {
  if (!id) return undefined;
  if (!isAddedId(id)) return byId.get(id);
  const v = musicLibrary.get().videos.find((x) => addedId(x.videoId) === id);
  return v ? addedEntry(v) : undefined;
}

export const musicEq = createLocalStore<EqSettings>(STORAGE_KEYS.musicEq, DEFAULT_EQ, parseEq);
export interface MusicView {
  eq: boolean;
  playlist: boolean;
  /** Show time remaining instead of elapsed. */
  remaining: boolean;
}
export const musicView = createLocalStore<MusicView>(STORAGE_KEYS.musicView, { eq: true, playlist: true, remaining: false }, (raw) => {
  const r = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  return { eq: r.eq !== false, playlist: r.playlist !== false, remaining: r.remaining === true };
});

let byId = new Map<string, Entry>();
let playlistStore = createLocalStore<Playlist>(STORAGE_KEYS.musicPlaylist, EMPTY_PLAYLIST, () => EMPTY_PLAYLIST);
let video: VideoNow | null = null;
/** Songs that couldn't play this visit (passed over by Next and auto-advance). */
const skip = new Set<string>();
let handle: EmbedPlayerHandle | null = null;
let windows = 0;
let advanceTimer: number | null = null;
let initialised = false;
let snapshot: { playlist: Playlist; video: VideoNow | null; skip: ReadonlySet<string> } = { playlist: EMPTY_PLAYLIST, video: null, skip };
const listeners = new Set<() => void>();

const emit = () => {
  snapshot = { playlist: playlistStore.get(), video, skip: new Set(skip) };
  listeners.forEach((l) => l());
};

export function initMusic(cassettes: readonly Cassette[]) {
  byId = new Map(cassettes.flatMap((cassette) => cassette.tracks.map((track) => [track.id, { cassette, track }] as const)));
  if (initialised) return;
  initialised = true;
  const known = new Set(byId.keys());
  const playable = { has: (id: string) => known.has(id) || !!lookup(id) };
  playlistStore = createLocalStore<Playlist>(STORAGE_KEYS.musicPlaylist, EMPTY_PLAYLIST, (raw) => parsePlaylist(raw, playable));
  playlistStore.subscribe(emit);
  musicLibrary.subscribe(emit); // added videos' titles
  setEq(musicEq.get());
  musicEq.subscribe(() => setEq(musicEq.get()));

  // A record that ends moves on by the playlist rules; one that can't play is passed over.
  const engine = getPlaybackEngine();
  // Act only on a real change of status for the same source: loading a new source publishes the
  // source first (still showing the old "ended"), which must not count as that song ending too.
  let prev = { id: engine.getState().source?.id, status: engine.getState().status };
  engine.subscribe(() => {
    const s = engine.getState();
    const changed = prev.id === s.source?.id && prev.status !== s.status;
    prev = { id: s.source?.id, status: s.status };
    const at = parseTrackId(s.source?.id);
    if (!changed || !at || video) return;
    const p = playlistStore.get();
    if (p.items[p.index] !== at.trackId) return; // played from elsewhere, not this playlist
    if (s.status === "ended") advance(1, true, 0);
    if (s.status === "error") {
      skip.add(at.trackId);
      emit();
      advance(1, true, 2500);
    }
  });
  emit();
}

export const music = {
  subscribe(l: () => void) {
    listeners.add(l);
    return () => void listeners.delete(l);
  },
  get: () => snapshot,
  entry: lookup,

  /** The Music window opened (videos can play) or closed (a playing video stops). */
  mount() {
    windows++;
    return () => {
      windows--;
      if (windows === 0 && video) {
        video = null;
        handle = null;
        emit();
      }
    };
  },
  registerVideo(h: EmbedPlayerHandle | null) {
    handle = h;
  },

  setPlaylist(next: Playlist | ((p: Playlist) => Playlist)) {
    playlistStore.set(typeof next === "function" ? next(playlistStore.get()) : next);
  },

  /** Play the playlist entry at `index` (a click: may build the equaliser graph). */
  playAt(index: number) {
    clearAdvance();
    const p = playlistStore.get();
    const id = p.items[index];
    const e = lookup(id);
    if (!e) return;
    playlistStore.set({ ...p, index });
    if (!e.added) recordMusicPlay(e.track.id);
    const engine = getPlaybackEngine();
    if (entryPlayback(e) === "audio") {
      video = null;
      handle = null;
      ensureGraph();
      engine.load(trackSource(e.cassette, e.track));
    } else {
      // A video: the shared player steps aside (radio or a record).
      if (["playing", "loading", "buffering"].includes(engine.getState().status)) engine.pause();
      if (windows === 0) return;
      video = {
        trackId: e.track.id,
        status: navigator.onLine ? "loading" : "offline",
        attempt: (video?.attempt ?? 0) + 1,
        time: { current: 0, duration: null },
      };
    }
    emit();
  },

  next: () => advance(1, false, 0),
  prev: () => advance(-1, false, 0),

  /** Play/pause the current song (or start the selected one). */
  toggle() {
    const engine = getPlaybackEngine();
    if (video) {
      if (video.status === "playing") handle?.pause();
      else if (video.status === "paused") handle?.play();
      else if (video.status !== "loading") music.playAt(playlistStore.get().index);
      return;
    }
    if (parseTrackId(engine.getState().source?.id) && currentIsAudio()) {
      if (engine.getState().status === "error") music.playAt(playlistStore.get().index);
      else {
        ensureGraph();
        engine.toggle();
      }
      return;
    }
    const p = playlistStore.get();
    if (p.index >= 0) music.playAt(p.index);
  },

  /** Another window or the shared player took the speakers: only a video here needs pausing. */
  pauseVideo() {
    if (video) handle?.pause();
  },

  pause() {
    if (video) handle?.pause();
    else if (currentIsAudio()) getPlaybackEngine().pause();
  },

  stop() {
    clearAdvance();
    if (video) {
      video = null;
      handle = null;
      emit();
    }
    const engine = getPlaybackEngine();
    if (parseTrackId(engine.getState().source?.id)) engine.stop();
  },

  seek(seconds: number) {
    if (video) {
      handle?.seek(seconds);
      video = { ...video, time: { ...video.time, current: seconds } };
      emit();
    } else if (currentIsAudio()) getPlaybackEngine().seek(seconds);
  },

  /** 0–100: the shared player's saved volume (the radio uses it too), mirrored to YouTube's player. */
  setVolume(volume: number) {
    getPlaybackEngine().setVolume(volume / 100);
    handle?.setVolume(volume);
  },

  onVideoEvent(e: PlayerEvent) {
    if (!video) return;
    const cur: VideoNow = video;
    if (e.type === "ready") handle?.setVolume(getPlaybackEngine().getState().volume * 100);
    if (e.type === "error") {
      if (e.code !== NO_RESPONSE && UNAVAILABLE_CODES.has(e.code)) skip.add(cur.trackId);
      video = { ...cur, status: e.code === NO_RESPONSE ? "no-response" : "unavailable" };
      if (video.status === "unavailable") advance(1, true, 3000);
    } else if (e.type === "state") {
      const map: Partial<Record<string, VideoStatus>> = { playing: "playing", buffering: "playing", paused: "paused", ended: "ended" };
      const status = map[e.state];
      if (!status) return;
      video = { ...cur, status };
      if (status === "ended") advance(1, true, 600);
    }
    emit();
  },

  onVideoTime(t: PlayerTime) {
    if (!video) return;
    video = { ...video, time: t };
    emit();
  },
};

function currentIsAudio(): boolean {
  const p = playlistStore.get();
  const e = lookup(p.items[p.index]);
  const at = parseTrackId(getPlaybackEngine().getState().source?.id);
  return !!e && !!at && at.trackId === e.track.id;
}

function clearAdvance() {
  if (advanceTimer !== null) window.clearTimeout(advanceTimer);
  advanceTimer = null;
}

function advance(dir: 1 | -1, auto: boolean, delay: number) {
  clearAdvance();
  const go = () => {
    advanceTimer = null;
    const p = playlistStore.get();
    const i = step(p, dir, { auto, skip });
    if (i < 0) {
      if (auto) music.stop();
      return;
    }
    const e = lookup(p.items[i]);
    // Videos need the window open; with it closed, the playlist stops at the next video.
    if (e && entryPlayback(e) === "video" && windows === 0) {
      playlistStore.set({ ...p, index: i });
      music.stop();
      return;
    }
    music.playAt(i);
  };
  if (delay > 0) advanceTimer = window.setTimeout(go, delay);
  else go();
}

export function useMusic() {
  return useSyncExternalStore(music.subscribe, music.get, music.get);
}
