/**
 * YouTube's embedded player reports what it is doing by window messages (its "widget" protocol,
 * the same one its own iframe API script uses). Messages are untrusted input: only the player's
 * own frame and origin are accepted (checked by the caller), and only these shapes are read.
 */

export type PlayerState = "unstarted" | "ended" | "playing" | "paused" | "buffering" | "cued";
export type PlayerEvent = { type: "ready" } | { type: "state"; state: PlayerState } | { type: "error"; code: number };

const STATES: Record<number, PlayerState> = { [-1]: "unstarted", 0: "ended", 1: "playing", 2: "paused", 3: "buffering", 5: "cued" };

/** YouTube player error codes that mean "this video can't play here" (removed, private, not embeddable…). */
export const UNAVAILABLE_CODES = new Set([2, 5, 100, 101, 150, 153]);
/** Our own code: the player never answered (offline, blocked, or the provider is down). */
export const NO_RESPONSE = -1;

export function readPlayerMessage(data: unknown): PlayerEvent | null {
  let msg: unknown = data;
  if (typeof data === "string") {
    if (data.length > 100_000) return null;
    try {
      msg = JSON.parse(data);
    } catch {
      return null;
    }
  }
  if (typeof msg !== "object" || msg === null) return null;
  const { event, info } = msg as { event?: unknown; info?: unknown };
  const state = (n: unknown): PlayerEvent | null => (typeof n === "number" && n in STATES ? { type: "state", state: STATES[n] } : null);
  switch (event) {
    case "onReady":
      return { type: "ready" };
    case "onStateChange":
      return state(info);
    case "infoDelivery":
    case "initialDelivery":
      return typeof info === "object" && info !== null ? state((info as { playerState?: unknown }).playerState) : null;
    case "onError":
      return typeof info === "number" && Number.isInteger(info) ? { type: "error", code: info } : null;
    default:
      return null;
  }
}

/** Messages we send to the player (commands are fire-and-forget). */
export const listen = (id: string) => JSON.stringify({ event: "listening", id, channel: "widget" });
export const command = (id: string, func: "pauseVideo" | "playVideo" | "addEventListener", args: unknown[] = []) =>
  JSON.stringify({ event: "command", func, args, id, channel: "widget" });
