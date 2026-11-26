import { NO_RESPONSE, UNAVAILABLE_CODES, type PlayerEvent } from "./playerMessages";

/**
 * What an embedded official player (YouTube, Internet Archive) is doing, from its own reports.
 * Shared by TV, Video and Music so they all read the players the same way. Unit-tested.
 */
export type EmbedStatus = "loading" | "playing" | "paused" | "ended" | "unavailable" | "no-response";

export function nextStatus(current: EmbedStatus, e: PlayerEvent): EmbedStatus {
  if (e.type === "error") return e.code === NO_RESPONSE ? "no-response" : "unavailable";
  if (e.type === "state") {
    if (e.state === "playing" || e.state === "buffering") return "playing";
    if (e.state === "paused") return "paused";
    if (e.state === "ended") return "ended";
  }
  return current;
}

/** True when the error means this item can never play here (removed, private, embedding refused). */
export function isPermanentError(e: PlayerEvent): boolean {
  return e.type === "error" && UNAVAILABLE_CODES.has(e.code);
}

export function statusLabel(s: EmbedStatus): string {
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
      return "Can't be played here";
    case "no-response":
      return "Not responding";
  }
}

/** How the tray shows an embedded player's status ("offline" = never loaded). */
export function sessionStatus(s: EmbedStatus | "offline"): "loading" | "playing" | "paused" | "stopped" | "problem" {
  if (s === "loading" || s === "playing" || s === "paused") return s;
  if (s === "ended") return "stopped";
  return "problem";
}

export function sessionDetail(s: EmbedStatus | "offline"): string {
  return s === "offline" ? "You're offline" : statusLabel(s);
}
