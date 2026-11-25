import type { MediaSource } from "@/features/media/catalogue";

/**
 * Reads a pasted YouTube address (or a bare video id) into something the official player can
 * play. Untrusted input: only YouTube's own hosts are accepted, and ids must have YouTube's shape,
 * so nothing from the paste ever reaches the embed address except a validated id.
 */

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
/** Playlists (PL…), channel uploads (UU…), mixes and other list ids YouTube embeds. */
const LIST_ID = /^(PL|UU|OL|FL|RD)[A-Za-z0-9_-]{10,64}$/;
const HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be", "www.youtube-nocookie.com", "youtube-nocookie.com"]);

export type LinkResult = { ok: true; source: Extract<MediaSource, { provider: "youtube" | "youtube-playlist" }> } | { ok: false; reason: string };

export function parseYouTubeLink(input: string): LinkResult {
  const text = input.trim();
  if (!text) return { ok: false, reason: "Paste a YouTube link first." };
  if (text.length > 2000) return { ok: false, reason: "That link is too long to be a YouTube address." };
  if (VIDEO_ID.test(text)) return video(text);

  let url: URL;
  try {
    url = new URL(/^[a-z]+:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return { ok: false, reason: "That isn't a web address. Copy the link from YouTube's Share button." };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return { ok: false, reason: "Only YouTube links can be played here." };
  if (!HOSTS.has(url.hostname.toLowerCase())) return { ok: false, reason: "Only links to youtube.com or youtu.be can be played here." };

  const parts = url.pathname.split("/").filter(Boolean);
  const v = url.searchParams.get("v");
  const list = url.searchParams.get("list");
  let id: string | undefined;
  if (url.hostname.toLowerCase() === "youtu.be") id = parts[0];
  else if (v) id = v;
  else if (["shorts", "embed", "live", "v"].includes(parts[0] ?? "") && parts[1] !== "videoseries") id = parts[1];

  if (id && VIDEO_ID.test(id)) return video(id);
  if (list && LIST_ID.test(list)) return { ok: true, source: { provider: "youtube-playlist", playlistId: list } };
  if (parts[0]?.startsWith("@") || parts[0] === "channel" || parts[0] === "c" || parts[0] === "user")
    return { ok: false, reason: "That's a channel page. Open one of its videos and copy that link instead." };
  return { ok: false, reason: "No video found in that link. Copy the link from YouTube's Share button." };
}

function video(videoId: string): LinkResult {
  return { ok: true, source: { provider: "youtube", videoId } };
}

/** A channel's public uploads, as YouTube's automatic playlist (UC… → UU…). */
export function uploadsPlaylist(channelId: string): string {
  if (!/^UC[A-Za-z0-9_-]{22}$/.test(channelId)) throw new Error(`Not a YouTube channel id: ${channelId}`);
  return `UU${channelId.slice(2)}`;
}
