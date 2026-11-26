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

describe("player position reports", () => {
  it("reads current time and duration from infoDelivery", async () => {
    const { readPlayerTime } = await import("./playerMessages");
    expect(readPlayerTime(JSON.stringify({ event: "infoDelivery", info: { currentTime: 12.5, duration: 200 } }))).toEqual({ current: 12.5, duration: 200 });
    expect(readPlayerTime({ event: "infoDelivery", info: { currentTime: 3 } })).toEqual({ current: 3 });
  });
  it("ignores anything else", async () => {
    const { readPlayerTime } = await import("./playerMessages");
    expect(readPlayerTime(JSON.stringify({ event: "onReady" }))).toBeNull();
    expect(readPlayerTime({ event: "infoDelivery", info: { currentTime: -1, duration: Number.NaN } })).toBeNull();
    expect(readPlayerTime({ event: "infoDelivery", info: { currentTime: "5" } })).toBeNull();
    expect(readPlayerTime("not json")).toBeNull();
  });
});
