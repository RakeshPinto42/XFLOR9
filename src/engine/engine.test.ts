import { describe, expect, it, vi } from "vitest";
import { AdaptiveQuality, QUALITY_LEVELS } from "./adaptive";
import { chooseMode, parseQualityPreference, type DeviceSignals } from "./quality";
import { ResourceTracker } from "./resources";

const capable: DeviceSignals = { reducedMotion: false, webgl: true, saveData: false, deviceMemoryGB: 8, cores: 8 };

describe("chooseMode", () => {
  it("automatic: full on a capable device", () => expect(chooseMode("auto", capable).mode).toBe("full"));
  it("automatic: reduced motion → still, even with WebGL", () =>
    expect(chooseMode("auto", { ...capable, reducedMotion: true }).mode).toBe("still"));
  it.each([
    ["no WebGL", { webgl: false }],
    ["data saver", { saveData: true }],
    ["2 GB memory", { deviceMemoryGB: 2 }],
    ["2 cores", { cores: 2 }],
  ])("automatic: %s → lite", (_, s) => expect(chooseMode("auto", { ...capable, ...s }).mode).toBe("lite"));
  it("unknown memory/cores don't count against the device", () =>
    expect(chooseMode("auto", { ...capable, deviceMemoryGB: null, cores: null }).mode).toBe("full"));
  it("an explicit choice wins, except Full without WebGL", () => {
    expect(chooseMode("still", capable).mode).toBe("still");
    expect(chooseMode("full", { ...capable, reducedMotion: true }).mode).toBe("full");
    expect(chooseMode("full", { ...capable, webgl: false }).mode).toBe("lite");
  });
  it("parses stored preferences defensively", () => {
    expect(parseQualityPreference("lite")).toBe("lite");
    expect(parseQualityPreference("ultra")).toBe("auto");
    expect(parseQualityPreference(null)).toBe("auto");
  });
});

describe("AdaptiveQuality", () => {
  const feed = (a: AdaptiveQuality, ms: number, seconds: number) => {
    const events = [];
    for (let t = 0; t < seconds * 1000; t += ms) {
      const e = a.frame(ms);
      if (e) events.push(e);
    }
    return events;
  };

  it("stays at high quality at 60 fps", () => {
    const a = new AdaptiveQuality();
    expect(feed(a, 16.7, 20)).toEqual([]);
    expect(a.current.name).toBe("high");
  });

  it("steps down one level after ~3 s of slow frames, then suggests Lite at the bottom", () => {
    const a = new AdaptiveQuality();
    const events = feed(a, 40, 3.2);
    expect(events).toEqual([{ type: "down", level: 1 }]);
    feed(a, 40, 3 * (QUALITY_LEVELS.length - 2) + 0.5);
    expect(a.current.name).toBe("minimal");
    expect(feed(a, 40, 3.2)).toContainEqual({ type: "suggest-lite" });
  });

  it("steps up only after a long fast stretch (hysteresis)", () => {
    const a = new AdaptiveQuality();
    feed(a, 40, 3.2);
    expect(a.level).toBe(1);
    expect(feed(a, 8, 5)).toEqual([]); // 5 s of fast frames is not enough
    expect(feed(a, 8, 6)).toEqual([{ type: "up", level: 0 }]);
  });

  it("ignores pauses such as a hidden tab", () => {
    const a = new AdaptiveQuality();
    expect(a.frame(5000)).toBeNull();
    expect(feed(a, 16.7, 4)).toEqual([]);
  });

  it("a borderline frame rate resets the counters instead of drifting", () => {
    const a = new AdaptiveQuality();
    feed(a, 40, 2.1); // two slow windows
    feed(a, 16.7, 1.1); // one normal window resets
    expect(feed(a, 40, 2.1)).toEqual([]);
    expect(a.level).toBe(0);
  });
});

describe("ResourceTracker", () => {
  it("creates once, shares, and disposes only after the last release", () => {
    const dispose = vi.fn();
    const create = vi.fn(() => ({ id: "tv" }));
    const t = new ResourceTracker(dispose);
    const a = t.acquire("tv", create);
    const b = t.acquire("tv", create);
    expect(a).toBe(b);
    expect(create).toHaveBeenCalledTimes(1);
    expect(t.release("tv")).toBe(false);
    expect(dispose).not.toHaveBeenCalled();
    expect(t.release("tv")).toBe(true);
    expect(dispose).toHaveBeenCalledWith({ id: "tv" }, "tv");
    expect(t.keys()).toEqual([]);
    expect(t.release("tv")).toBe(false); // releasing too often is harmless
  });
});
