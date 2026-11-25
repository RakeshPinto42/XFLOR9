/** Shared playback contracts. Module-agnostic: radio stations and Music's audio tracks. */

/** "ended": a track (not a live stream) played to its end. */
export type PlaybackStatus = "idle" | "loading" | "playing" | "buffering" | "paused" | "ended" | "error";

/**
 * "unplayable": the browser couldn't open the source. Browsers report an unreachable server
 * and an unsupported format with the same error (verified in Chrome: a refused connection
 * gives MEDIA_ERR_SRC_NOT_SUPPORTED), so we don't pretend to know which one it was.
 */
export type PlaybackErrorKind = "offline" | "network" | "unplayable" | "decode" | "timeout" | "blocked";

export interface PlaybackError {
  kind: PlaybackErrorKind;
  message: string;
}

export interface PlaybackSource {
  /** Stable id, e.g. "radio:<stationuuid>" or "music:<cassette>:<track>". */
  id: string;
  kind: "radio" | "music";
  title: string;
  subtitle?: string;
  url: string;
  /** Live streams can't be resumed where they paused: pausing stops the download. */
  live: boolean;
}

export interface PlaybackState {
  status: PlaybackStatus;
  source: PlaybackSource | null;
  error: PlaybackError | null;
  volume: number; // 0..1
  muted: boolean;
  /** False on iOS, where web pages cannot change audio volume. */
  volumeControllable: boolean;
}
