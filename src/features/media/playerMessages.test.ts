import { describe, expect, it } from "vitest";
import { readPlayerMessage } from "./playerMessages";

describe("YouTube player messages", () => {
  it("reads ready, state changes (both forms) and errors", () => {
    expect(readPlayerMessage('{"event":"onReady","info":null}')).toEqual({ type: "ready" });
    expect(readPlayerMessage({ event: "onStateChange", info: 1 })).toEqual({ type: "state", state: "playing" });
    expect(readPlayerMessage('{"event":"infoDelivery","info":{"playerState":0,"currentTime":12}}')).toEqual({ type: "state", state: "ended" });
    expect(readPlayerMessage('{"event":"onError","info":150}')).toEqual({ type: "error", code: 150 });
  });
  it("ignores anything else: other events, junk, unknown states, huge strings", () => {
    expect(readPlayerMessage('{"event":"infoDelivery","info":{"currentTime":3}}')).toBeNull();
    expect(readPlayerMessage('{"event":"onStateChange","info":42}')).toBeNull();
    expect(readPlayerMessage("not json")).toBeNull();
    expect(readPlayerMessage(null)).toBeNull();
    expect(readPlayerMessage({ event: "onError", info: "150" })).toBeNull();
    expect(readPlayerMessage("x".repeat(200_000))).toBeNull();
  });
});
