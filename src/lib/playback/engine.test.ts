import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BUFFER_TIMEOUT_MS, LOAD_TIMEOUT_MS, PlaybackEngine, type AudioLike, type EngineDeps } from "./engine";
import type { PlaybackSource } from "./types";

/** Minimal stand-in for HTMLAudioElement that we can drive by hand. */
class FakeAudio extends EventTarget implements AudioLike {
  src = "";
  preload = "";
  muted = false;
  paused = true;
  error: { code: number } | null = null;
  ignoreVolume = false; // simulate iOS
  playResult: () => Promise<void> = () => Promise.resolve();
  loads = 0;
  private _volume = 1;
  get volume() {
    return this._volume;
  }
  set volume(v: number) {
    if (!this.ignoreVolume) this._volume = v;
  }
  play() {
    this.paused = false;
    return this.playResult();
  }
  pause() {
    if (!this.paused) {
      this.paused = true;
      this.emit("pause");
    }
  }
  load() {
    this.loads++;
  }
  removeAttribute(name: string) {
    if (name === "src") this.src = "";
  }
  canPlayType(t: string) {
    return t === "audio/mpeg" ? "probably" : "";
  }
  emit(type: string) {
    this.dispatchEvent(new Event(type));
  }
  fail(code: number) {
    this.error = { code };
    this.emit("error");
  }
}

const station = (n: number, live = true): PlaybackSource => ({
  id: `radio:${n}`,
  kind: "radio",
  title: `Station ${n}`,
  url: `https://stream${n}.example/live`,
  live,
});

function setup(overrides: Partial<EngineDeps> = {}, configure?: (a: FakeAudio) => void) {
  const audio = new FakeAudio();
  configure?.(audio);
  let online = true;
  let connectivity: (online: boolean) => void = () => {};
  const saved: { volume: number; muted: boolean }[] = [];
  const engine = new PlaybackEngine({
    createAudio: () => audio,
    isOnline: () => online,
    onConnectivityChange: (h) => (connectivity = h),
    loadPrefs: () => ({ volume: 0.8, muted: false }),
    savePrefs: (p) => saved.push(p),
    ...overrides,
  });
  return {
    engine,
    audio,
    saved,
    goOffline: () => {
      online = false;
      connectivity(false);
    },
    setOnline: (v: boolean) => (online = v),
  };
}

// Lets pending promise callbacks run; timers are faked, so a real setTimeout would never fire.
const flush = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] }));
afterEach(() => vi.useRealTimers());

describe("loading and playing", () => {
  it("goes idle → loading → playing and reports the first start once", () => {
    const { engine, audio } = setup();
    const onStarted = vi.fn();
    expect(engine.getState().status).toBe("idle");
    engine.load(station(1), { onStarted });
    expect(engine.getState()).toMatchObject({ status: "loading", source: { id: "radio:1" } });
    expect(audio.src).toBe("https://stream1.example/live");
    audio.emit("playing");
    audio.emit("playing");
    expect(engine.getState().status).toBe("playing");
    expect(onStarted).toHaveBeenCalledTimes(1);
  });

  it("notifies subscribers on every change", () => {
    const { engine, audio } = setup();
    const listener = vi.fn();
    engine.subscribe(listener);
    engine.load(station(1));
    audio.emit("playing");
    expect(listener).toHaveBeenCalledTimes(3); // source set, loading, playing
  });

  it("uses one audio element: a new station replaces the old one", () => {
    const { engine, audio } = setup();
    engine.load(station(1));
    audio.emit("playing");
    engine.load(station(2));
    expect(audio.src).toBe("https://stream2.example/live");
    expect(engine.getState()).toMatchObject({ status: "loading", source: { id: "radio:2" } });
  });
});

describe("buffering", () => {
  it("shows buffering while playing and recovers", () => {
    const { engine, audio } = setup();
    engine.load(station(1));
    audio.emit("playing");
    audio.emit("waiting");
    expect(engine.getState().status).toBe("buffering");
    audio.emit("playing");
    expect(engine.getState().status).toBe("playing");
  });

  it("gives up with a network error if buffering never ends", () => {
    const { engine, audio } = setup();
    engine.load(station(1));
    audio.emit("playing");
    audio.emit("waiting");
    vi.advanceTimersByTime(BUFFER_TIMEOUT_MS);
    expect(engine.getState()).toMatchObject({ status: "error", error: { kind: "network" } });
    expect(audio.src).toBe(""); // stream released
  });
});

describe("errors", () => {
  it.each([
    [4, "unplayable"], // also what Chrome reports for a refused connection
    [3, "decode"],
    [2, "network"],
  ])("maps media error code %i to %s and releases the stream", (code, kind) => {
    const { engine, audio } = setup();
    engine.load(station(1));
    audio.fail(code);
    expect(engine.getState()).toMatchObject({ status: "error", error: { kind } });
    expect(engine.getState().error?.message).toBeTruthy();
    expect(audio.src).toBe("");
  });

  it("ignores aborted-load errors (code 1)", () => {
    const { engine, audio } = setup();
    engine.load(station(1));
    audio.fail(1);
    expect(engine.getState().status).toBe("loading");
  });

  it("times out if the station never starts", () => {
    const { engine } = setup();
    engine.load(station(1));
    vi.advanceTimersByTime(LOAD_TIMEOUT_MS - 1);
    expect(engine.getState().status).toBe("loading");
    vi.advanceTimersByTime(1);
    expect(engine.getState()).toMatchObject({ status: "error", error: { kind: "timeout" } });
  });

  it("does not let an old station's timeout break the new one", () => {
    const { engine, audio } = setup();
    engine.load(station(1));
    vi.advanceTimersByTime(LOAD_TIMEOUT_MS - 100);
    engine.load(station(2));
    audio.emit("playing");
    vi.advanceTimersByTime(LOAD_TIMEOUT_MS);
    expect(engine.getState()).toMatchObject({ status: "playing", source: { id: "radio:2" } });
  });

  it("reports blocked autoplay", async () => {
    const { engine } = setup({}, (a) => {
      a.playResult = () => Promise.reject(Object.assign(new Error("x"), { name: "NotAllowedError" }));
    });
    engine.load(station(1));
    await flush();
    expect(engine.getState().error?.kind).toBe("blocked");
  });

  it("ignores AbortError from a play() superseded by a newer load", async () => {
    const { engine } = setup({}, (a) => {
      a.playResult = () => Promise.reject(Object.assign(new Error("x"), { name: "AbortError" }));
    });
    engine.load(station(1));
    await flush();
    expect(engine.getState().status).toBe("loading");
  });

  it("treats a live stream ending as the station dropping out", () => {
    const { engine, audio } = setup();
    engine.load(station(1));
    audio.emit("playing");
    audio.emit("ended");
    expect(engine.getState().error?.kind).toBe("network");
  });

  it("retries by playing again after an error", () => {
    const { engine, audio } = setup();
    engine.load(station(1));
    audio.fail(2);
    engine.play();
    expect(engine.getState()).toMatchObject({ status: "loading", error: null });
    expect(audio.src).toBe("https://stream1.example/live");
  });

  it("ignores errors fired by releasing the stream on purpose", () => {
    const { engine, audio } = setup();
    engine.load(station(1));
    audio.emit("playing");
    engine.pause();
    audio.fail(4); // Chrome fires "empty src" errors after we clear src
    expect(engine.getState().status).toBe("paused");
  });
});

describe("offline", () => {
  it("fails immediately when loading while offline, without touching the network", () => {
    const { engine, audio, setOnline } = setup();
    setOnline(false);
    engine.load(station(1));
    expect(engine.getState().error?.kind).toBe("offline");
    expect(audio.src).toBe("");
  });

  it("stops with an offline error when the connection drops mid-play", () => {
    const { engine, audio, goOffline } = setup();
    engine.load(station(1));
    audio.emit("playing");
    goOffline();
    expect(engine.getState()).toMatchObject({ status: "error", error: { kind: "offline" } });
  });

  it("reports offline rather than a generic network error when a stream fails offline", () => {
    const { engine, audio, setOnline } = setup();
    engine.load(station(1));
    setOnline(false);
    audio.fail(2);
    expect(engine.getState().error?.kind).toBe("offline");
  });
});

describe("pause, resume and stop", () => {
  it("releases a live stream on pause and reconnects on play", () => {
    const { engine, audio } = setup();
    engine.load(station(1));
    audio.emit("playing");
    engine.pause();
    expect(engine.getState().status).toBe("paused");
    expect(audio.src).toBe(""); // no background download
    engine.play();
    expect(engine.getState().status).toBe("loading");
    expect(audio.src).toBe("https://stream1.example/live");
  });

  it("treats an external pause (media key, headphones) as a pause", () => {
    const { engine, audio } = setup();
    engine.load(station(1));
    audio.emit("playing");
    audio.pause();
    expect(engine.getState().status).toBe("paused");
  });

  it("toggle switches between playing and paused", () => {
    const { engine, audio } = setup();
    engine.load(station(1));
    audio.emit("playing");
    engine.toggle();
    expect(engine.getState().status).toBe("paused");
    engine.toggle();
    expect(engine.getState().status).toBe("loading");
  });

  it("stop clears the source", () => {
    const { engine, audio } = setup();
    engine.load(station(1));
    audio.emit("playing");
    engine.stop();
    expect(engine.getState()).toMatchObject({ status: "idle", source: null });
    expect(audio.src).toBe("");
  });
});

describe("volume and mute", () => {
  it("clamps and saves volume", () => {
    const { engine, audio, saved } = setup();
    engine.setVolume(1.7);
    expect(audio.volume).toBe(1);
    engine.setVolume(-1);
    expect(engine.getState().volume).toBe(0);
    expect(saved.at(-1)).toEqual({ volume: 0, muted: false });
  });

  it("toggles mute and unmutes when the slider moves up", () => {
    const { engine, audio } = setup();
    engine.toggleMute();
    expect(audio.muted).toBe(true);
    engine.setVolume(0.5);
    expect(engine.getState().muted).toBe(false);
    expect(audio.muted).toBe(false);
  });

  it("restores saved preferences", () => {
    const { engine, audio } = setup({ loadPrefs: () => ({ volume: 0.3, muted: true }) });
    expect(engine.getState()).toMatchObject({ volume: 0.3, muted: true });
    expect(audio.volume).toBe(0.3);
    expect(audio.muted).toBe(true);
  });

  it("detects browsers that ignore volume (iOS)", () => {
    const { engine } = setup({}, (a) => (a.ignoreVolume = true));
    expect(engine.getState().volumeControllable).toBe(false);
  });
});

describe("other tabs", () => {
  it("pauses when another XPLOR9 tab starts playing, but not for its own message", () => {
    let deliver: (m: unknown) => void = () => {};
    const sent: unknown[] = [];
    const { engine, audio } = setup({
      channel: { post: (m) => sent.push(m), onMessage: (h) => (deliver = h) },
    });
    engine.load(station(1));
    audio.emit("playing");
    deliver(sent[0]); // echo of our own message
    expect(engine.getState().status).toBe("playing");
    deliver({ type: "started", tabId: "another-tab" });
    expect(engine.getState().status).toBe("paused");
  });
});

describe("site-wide sound settings (A1)", () => {
  it("scale the element's volume and mute it without changing the player's own settings", () => {
    const { engine, audio, saved } = setup();
    engine.setVolume(0.5);
    engine.setOutput(0.4, false);
    expect(audio.volume).toBeCloseTo(0.2);
    expect(engine.getState().volume).toBe(0.5);
    engine.setOutput(0.4, true);
    expect(audio.muted).toBe(true);
    expect(engine.getState().muted).toBe(false);
    engine.setVolume(0.8); // the player's slider still works under site settings
    expect(audio.volume).toBeCloseTo(0.32);
    expect(audio.muted).toBe(true);
    engine.setOutput(1, false);
    expect(audio.volume).toBeCloseTo(0.8);
    expect(audio.muted).toBe(false);
    expect(saved.at(-1)).toEqual({ volume: 0.8, muted: false });
  });
});
