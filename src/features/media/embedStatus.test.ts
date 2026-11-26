import { describe, expect, it } from "vitest";
import { isPermanentError, nextStatus, statusLabel } from "./embedStatus";
import { NO_RESPONSE } from "./playerMessages";

describe("embedded player status", () => {
  it("follows the player's own state reports", () => {
    expect(nextStatus("loading", { type: "state", state: "playing" })).toBe("playing");
    expect(nextStatus("playing", { type: "state", state: "buffering" })).toBe("playing");
    expect(nextStatus("playing", { type: "state", state: "paused" })).toBe("paused");
    expect(nextStatus("playing", { type: "state", state: "ended" })).toBe("ended");
    expect(nextStatus("paused", { type: "state", state: "cued" })).toBe("paused");
    expect(nextStatus("loading", { type: "ready" })).toBe("loading");
  });
  it("tells a removed video from a player that never answered", () => {
    expect(nextStatus("loading", { type: "error", code: 150 })).toBe("unavailable");
    expect(isPermanentError({ type: "error", code: 150 })).toBe(true);
    expect(nextStatus("loading", { type: "error", code: NO_RESPONSE })).toBe("no-response");
    expect(isPermanentError({ type: "error", code: NO_RESPONSE })).toBe(false);
    expect(statusLabel("no-response")).toBe("Not responding");
  });
});
