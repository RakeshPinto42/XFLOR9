import { SLUG } from "@/features/media/catalogue";
import { MAX_ITEMS } from "./playlist";

/**
 * Music's saved playlists, and the videos added to them from Video and TV (unit-tested).
 *
 * A saved playlist is a name and a list of song ids, in the same form as the playlist being
 * played: a catalogue track id, or "yt:<videoId>" for a video added from Video or TV (its title
 * and channel are kept here, so Music can show it without its catalogue). Only single YouTube
 * videos can be added: the Music player needs YouTube's player to say when a song ends.
 *
 * Stored in this browser; parseLibrary validates it on every read (it may be old, damaged or
 * edited by hand).
 */

export const ADDED_PREFIX = "yt:";
export const MAX_PLAYLISTS = 50;
export const MAX_ADDED_VIDEOS = 500;
export const MAX_PLAYLIST_NAME = 60;
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const PLAYLIST_ID = /^[a-z0-9-]{1,40}$/;

export interface AddedVideo {
  videoId: string;
  title: string;
  /** The channel or uploader, as shown where it was added. */
  by: string;
  from: "video" | "tv";
}

export interface SavedPlaylist {
  id: string;
  name: string;
  items: string[];
}

export interface MusicLibrary {
  playlists: SavedPlaylist[];
  /** Every video added from Video or TV ("From Video and TV" in the library). */
  videos: AddedVideo[];
}

export const EMPTY_LIBRARY: MusicLibrary = { playlists: [], videos: [] };

export const addedId = (videoId: string) => `${ADDED_PREFIX}${videoId}`;
export const isAddedId = (id: string) => id.startsWith(ADDED_PREFIX);

const text = (v: unknown, max: number) =>
  typeof v === "string"
    ? v
        .replace(/[\u0000-\u001f\u007f-\u009f]/g, "")
        .trim()
        .slice(0, max)
    : "";

/** A playlist name as typed: no control characters, trimmed, at most 60 characters. */
export const cleanPlaylistName = (v: unknown) => text(v, MAX_PLAYLIST_NAME);

export function parseAddedVideo(raw: unknown): AddedVideo | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.videoId !== "string" || !VIDEO_ID.test(r.videoId)) return null;
  const title = text(r.title, 160);
  if (!title) return null;
  return { videoId: r.videoId, title, by: text(r.by, 100) || "YouTube", from: r.from === "tv" ? "tv" : "video" };
}

export function parseLibrary(raw: unknown): MusicLibrary {
  const r = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  const videos: AddedVideo[] = [];
  for (const v of Array.isArray(r.videos) ? r.videos : []) {
    const ok = parseAddedVideo(v);
    if (ok && !videos.some((x) => x.videoId === ok.videoId) && videos.length < MAX_ADDED_VIDEOS) videos.push(ok);
  }
  const added = new Set(videos.map((v) => addedId(v.videoId)));
  const playlists: SavedPlaylist[] = [];
  for (const p of Array.isArray(r.playlists) ? r.playlists : []) {
    if (typeof p !== "object" || p === null || playlists.length >= MAX_PLAYLISTS) continue;
    const q = p as Record<string, unknown>;
    if (typeof q.id !== "string" || !PLAYLIST_ID.test(q.id) || playlists.some((x) => x.id === q.id)) continue;
    const items = (Array.isArray(q.items) ? q.items : [])
      .filter((id): id is string => typeof id === "string" && (added.has(id) || (id.length <= 100 && SLUG.test(id))))
      .slice(0, MAX_ITEMS);
    playlists.push({ id: q.id, name: cleanPlaylistName(q.name) || "Playlist", items });
  }
  return { playlists, videos };
}

export const findByName = (lib: MusicLibrary, name: string) => lib.playlists.find((p) => p.name.toLowerCase() === cleanPlaylistName(name).toLowerCase());

export type SaveResult = { ok: true; lib: MusicLibrary; id: string; replaced: boolean } | { ok: false; reason: string };

/** Saves songs under a name: a new playlist, or the one with that name replaced. */
export function savePlaylist(lib: MusicLibrary, name: string, items: readonly string[], newId: () => string): SaveResult {
  const clean = cleanPlaylistName(name);
  if (!clean) return { ok: false, reason: "Type a name for the playlist." };
  const list = items.slice(0, MAX_ITEMS);
  const existing = findByName(lib, clean);
  if (existing) return { ok: true, lib: { ...lib, playlists: lib.playlists.map((p) => (p.id === existing.id ? { ...p, items: list } : p)) }, id: existing.id, replaced: true };
  if (lib.playlists.length >= MAX_PLAYLISTS) return { ok: false, reason: `You can keep up to ${MAX_PLAYLISTS} playlists. Delete one first.` };
  const id = newId();
  return { ok: true, lib: { ...lib, playlists: [...lib.playlists, { id, name: clean, items: list }] }, id, replaced: false };
}

export function renamePlaylist(lib: MusicLibrary, id: string, name: string): SaveResult {
  const clean = cleanPlaylistName(name);
  if (!clean) return { ok: false, reason: "Type a name for the playlist." };
  const clash = findByName(lib, clean);
  if (clash && clash.id !== id) return { ok: false, reason: `There's already a playlist called “${clash.name}”.` };
  return { ok: true, lib: { ...lib, playlists: lib.playlists.map((p) => (p.id === id ? { ...p, name: clean } : p)) }, id, replaced: false };
}

export function deletePlaylist(lib: MusicLibrary, id: string): MusicLibrary {
  return { ...lib, playlists: lib.playlists.filter((p) => p.id !== id) };
}

export function removeFromPlaylist(lib: MusicLibrary, id: string, index: number): MusicLibrary {
  return { ...lib, playlists: lib.playlists.map((p) => (p.id === id ? { ...p, items: p.items.filter((_, i) => i !== index) } : p)) };
}

export type AddResult = { ok: true; lib: MusicLibrary; added: boolean } | { ok: false; reason: string };

/** Adds a video from Video or TV to a saved playlist (once: adding it again changes nothing). */
export function addVideo(lib: MusicLibrary, playlistId: string, video: AddedVideo): AddResult {
  const v = parseAddedVideo(video);
  if (!v) return { ok: false, reason: "This video can't be added." };
  const target = lib.playlists.find((p) => p.id === playlistId);
  if (!target) return { ok: false, reason: "That playlist no longer exists." };
  const known = lib.videos.some((x) => x.videoId === v.videoId);
  if (!known && lib.videos.length >= MAX_ADDED_VIDEOS) return { ok: false, reason: `Music can keep up to ${MAX_ADDED_VIDEOS} videos from Video and TV. Remove some first.` };
  const id = addedId(v.videoId);
  if (target.items.includes(id)) return { ok: true, lib, added: false };
  if (target.items.length >= MAX_ITEMS) return { ok: false, reason: `A playlist holds up to ${MAX_ITEMS} songs.` };
  return {
    ok: true,
    added: true,
    lib: {
      videos: known ? lib.videos.map((x) => (x.videoId === v.videoId ? v : x)) : [...lib.videos, v],
      playlists: lib.playlists.map((p) => (p.id === playlistId ? { ...p, items: [...p.items, id] } : p)),
    },
  };
}

/** Removes a video from Music altogether (from every saved playlist too). */
export function removeVideo(lib: MusicLibrary, videoId: string): MusicLibrary {
  const id = addedId(videoId);
  return { videos: lib.videos.filter((v) => v.videoId !== videoId), playlists: lib.playlists.map((p) => ({ ...p, items: p.items.filter((x) => x !== id) })) };
}
