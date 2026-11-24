import { describe, expect, it } from "vitest";
import {
  AudioMixer,
  DEFAULT_SOUND_PREFS,
  DUCK_LEVEL,
  MAX_VOICES,
  busGain,
  masterGain,
  parseSoundPrefs,
  radioOutput,
  suddenGain,
  thunderDelay,
  type ContextLike,
  type GainLike,
  type SoundPrefs,
} from "./mixer";

class FakeGain implements GainLike {
  target = 0;
  gain = {
    value: 0,
    setTargetAtTime: (v: number) => {
      this.target = v;
    },
  };
  connected: unknown = null;
  connect(dest: unknown) {
    this.connected = dest;
  }
}

class FakeContext implements ContextLike {
  state = "suspended";
  currentTime = 0;
  destination = { name: "speakers" };
  gains: FakeGain[] = [];
  createGain() {
    const g = new FakeGain();
    this.gains.push(g);
    return g;
  }
  async resume() {
    this.state = "running";
  }
  async suspend() {
    this.state = "suspended";
  }
  async close() {
    this.state = "closed";
  }
}

const on: SoundPrefs = { ...DEFAULT_SOUND_PREFS, soundOn: true };
const tick = () => new Promise((r) => setTimeout(r, 0));

function setup(prefs = on) {
  const contexts: FakeContext[] = [];
  const mixer = new AudioMixer(() => {
    const c = new FakeContext();
    contexts.push(c);
    return c;
  });
  mixer.setPrefs(prefs);
  // gains[0] = master, then ambience, music, effects, dialogue
  return { mixer, contexts, gains: () => contexts[0].gains };
}

describe("saved settings", () => {
  it("default to silent with sensible volumes", () => {
    expect(parseSoundPrefs(null)).toEqual(DEFAULT_SOUND_PREFS);
    expect(DEFAULT_SOUND_PREFS.soundOn).toBe(false);
  });
  it("repair each corrupted field on its own", () => {
    const p = parseSoundPrefs({ soundOn: "yes", master: 7, ambience: -1, music: Number.NaN, effects: "0.5", dialogue: 0.3, reduceSudden: true });
    expect(p).toEqual({ ...DEFAULT_SOUND_PREFS, master: 1, ambience: 0, dialogue: 0.3, reduceSudden: true });
  });
});

describe("volume maths", () => {
  it("is silent overall until the visitor turns sound on", () => {
    expect(masterGain(DEFAULT_SOUND_PREFS)).toBe(0);
    expect(masterGain(on)).toBe(on.master);
  });
  it("ducks only ambience while the radio plays", () => {
    expect(busGain(on, "ambience", true)).toBeCloseTo(on.ambience * DUCK_LEVEL);
    expect(busGain(on, "ambience", false)).toBe(on.ambience);
    expect(busGain(on, "effects", true)).toBe(on.effects);
  });
  it("scales the radio by master × music, whether or not world sound is on", () => {
    expect(radioOutput({ ...DEFAULT_SOUND_PREFS, master: 0.5, music: 0.6 })).toBeCloseTo(0.3);
  });
  it("delays thunder by distance and softens it on request", () => {
    expect(thunderDelay(343)).toBe(1);
    expect(thunderDelay(-5)).toBe(0);
    expect(suddenGain(on)).toBe(1);
    expect(suddenGain({ ...on, reduceSudden: true })).toBeLessThan(0.5);
  });
});

describe("the mixer", () => {
  it("creates nothing before a gesture, and nothing on a gesture while sound is off", () => {
    const { mixer, contexts } = setup(DEFAULT_SOUND_PREFS);
    expect(contexts).toHaveLength(0);
    mixer.unlock();
    expect(contexts).toHaveLength(0);
    expect(mixer.context).toBeNull();
  });
  it("remembered 'on' still waits for a gesture, then builds the bus graph", async () => {
    const { mixer, contexts, gains } = setup();
    expect(contexts).toHaveLength(0);
    mixer.unlock();
    await tick();
    expect(mixer.context).toBe(contexts[0]);
    const [master, ambience, ...rest] = gains();
    expect(master.connected).toBe(contexts[0].destination);
    expect(ambience.connected).toBe(master);
    expect(rest.every((g) => g.connected === master)).toBe(true);
    expect(master.target).toBe(on.master);
    expect(mixer.bus("ambience")).toBe(ambience);
  });
  it("applies slider changes and ducking with a fade", async () => {
    const { mixer, gains } = setup();
    mixer.unlock();
    await tick();
    mixer.setPrefs({ ...on, ambience: 0.5 });
    expect(gains()[1].target).toBe(0.5);
    mixer.setRadioPlaying(true);
    expect(gains()[1].target).toBeCloseTo(0.5 * DUCK_LEVEL);
  });
  it("turning sound off silences and suspends; hidden tab fades out and resumes when visible", async () => {
    const { mixer, contexts, gains } = setup();
    let events = 0;
    mixer.subscribe(() => events++);
    mixer.unlock();
    await tick();
    mixer.setHidden(true);
    await tick();
    expect(gains()[0].target).toBe(0);
    expect(contexts[0].state).toBe("suspended");
    mixer.setHidden(false);
    await tick();
    expect(contexts[0].state).toBe("running");
    expect(gains()[0].target).toBe(on.master);
    mixer.setPrefs({ ...on, soundOn: false });
    await tick();
    expect(gains()[0].target).toBe(0);
    expect(contexts[0].state).toBe("suspended");
    expect(mixer.context).toBeNull();
    expect(events).toBeGreaterThanOrEqual(4);
  });
  it("reports a browser without Web Audio instead of failing", () => {
    const mixer = new AudioMixer(() => null);
    let events = 0;
    mixer.subscribe(() => events++);
    mixer.setPrefs(on);
    mixer.unlock();
    expect(mixer.supported).toBe(false);
    expect(mixer.context).toBeNull();
    expect(events).toBe(1);
    mixer.unlock(); // never retried in a loop
    expect(events).toBe(1);
  });
  it("caps simultaneous voices", () => {
    const { mixer } = setup();
    for (let i = 0; i < MAX_VOICES; i++) expect(mixer.acquireVoice()).toBe(true);
    expect(mixer.acquireVoice()).toBe(false);
    mixer.releaseVoice();
    expect(mixer.acquireVoice()).toBe(true);
  });
});
