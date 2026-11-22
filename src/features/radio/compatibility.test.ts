import { describe, expect, it } from "vitest";
import { getPlayability } from "./compatibility";
import type { Availability, StreamFormat } from "./types";

const available: Availability = { status: "available" };
const station = (format: StreamFormat, availability: Availability = available) => ({ format, availability });

// Rough stand-ins for real browsers' canPlayType answers.
const chromeLike = (t: string) => (t.startsWith("audio/") ? "maybe" : "");
const safariLike = (t: string) => (t.includes("ogg") ? "" : "maybe");

describe("getPlayability", () => {
  it("is playable when the browser can decode the format", () => {
    expect(getPlayability(station("mp3"), chromeLike)).toBe("playable");
    expect(getPlayability(station("aac"), chromeLike)).toBe("playable");
  });

  it("is unsupported when the browser cannot decode it", () => {
    expect(getPlayability(station("hls"), chromeLike)).toBe("unsupported");
    expect(getPlayability(station("ogg"), safariLike)).toBe("unsupported");
  });

  it("depends on the browser, not the station", () => {
    expect(getPlayability(station("hls"), safariLike)).toBe("playable");
  });

  it("is unverified when the format is unknown", () => {
    expect(getPlayability(station("unknown"), chromeLike)).toBe("unverified");
  });

  it("is unavailable when the server already ruled the stream out, whatever the browser says", () => {
    const blocked = station("mp3", { status: "unavailable", reason: "insecure-stream" });
    expect(getPlayability(blocked, () => "probably")).toBe("unavailable");
  });
});
