import { describe, expect, it } from "vitest";
import { chooseNowPlaying, type MediaSession } from "./mediaFocus";

const session = (status: MediaSession["status"]): MediaSession => ({ app: "tv", title: "x", status, stop: () => {} });

describe("which player the tray shows", () => {
  it("the player that most recently took the speakers, while it still has something", () => {
    const s = new Map([
      ["tv", session("paused")],
      ["video", session("playing")],
    ]);
    expect(chooseNowPlaying(s, "tv", true)).toBe("tv");
    expect(chooseNowPlaying(s, "audio", true)).toBe("audio");
  });

  it("falls back to a playing window, then the shared player, then any window", () => {
    const s = new Map([
      ["tv", session("paused")],
      ["video", session("playing")],
    ]);
    expect(chooseNowPlaying(s, "music", false)).toBe("video"); // Music closed its player
    expect(chooseNowPlaying(s, "audio", false)).toBe("video"); // the radio was stopped and cleared
    expect(chooseNowPlaying(new Map([["tv", session("paused")]]), "video", true)).toBe("audio");
    expect(chooseNowPlaying(new Map([["tv", session("paused")]]), null, false)).toBe("tv");
    expect(chooseNowPlaying(new Map(), null, false)).toBeNull();
  });
});
