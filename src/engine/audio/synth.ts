/**
 * Procedural sound for the world (A1): rain, roof patter, eave drips and thunder, generated in the
 * browser. No recordings, so no rights questions, nothing to download, and every sound can follow
 * the scene (rain amount, each lightning strike).
 *
 * The sample generators are pure functions (unit-tested); the graph builders use Web Audio.
 */

/** Deterministic random numbers (the same sound on every visit; testable). */
export function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Pink noise (equal energy per octave: the soft "hiss" of steady rain), peak about ±1. */
export function fillPink(out: Float32Array, random: () => number) {
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < out.length; i++) {
    const w = random() * 2 - 1;
    // Paul Kellet's refined pink filter.
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856;
    b4 = 0.55 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.016898;
    out[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
    b6 = w * 0.115926;
  }
  return out;
}

/** Brown noise (energy falling with pitch: rumble), peak about ±1. */
export function fillBrown(out: Float32Array, random: () => number) {
  let last = 0;
  for (let i = 0; i < out.length; i++) {
    last = (last + 0.02 * (random() * 2 - 1)) / 1.02;
    out[i] = last * 3.5;
  }
  return out;
}

/**
 * Raindrops hitting a surface: `perSecond` tiny decaying bursts at random times and strengths.
 * Dense and short for clay tiles; the bursts are noise, shaped later by a filter.
 */
export function fillPatter(out: Float32Array, sampleRate: number, perSecond: number, random: () => number) {
  out.fill(0);
  const drops = Math.round((out.length / sampleRate) * perSecond);
  for (let d = 0; d < drops; d++) {
    const start = Math.floor(random() * out.length);
    const amp = 0.15 + random() ** 2 * 0.85;
    const decay = sampleRate * (0.0015 + random() * 0.004); // 1.5–5.5 ms
    const len = Math.min(out.length - start, Math.floor(decay * 5));
    for (let i = 0; i < len; i++) out[start + i] += (random() * 2 - 1) * amp * Math.exp(-i / decay);
  }
  return normalise(out, 0.9);
}

/** Water dripping from eaves: sparse "plinks" (a short falling tone with a soft click). */
export function fillDrips(out: Float32Array, sampleRate: number, perSecond: number, random: () => number) {
  out.fill(0);
  const drips = Math.max(1, Math.round((out.length / sampleRate) * perSecond));
  for (let d = 0; d < drips; d++) {
    const start = Math.floor(random() * out.length);
    const f0 = 1100 + random() * 1500;
    const decay = sampleRate * (0.025 + random() * 0.035);
    const amp = 0.3 + random() * 0.7;
    const len = Math.min(out.length - start, Math.floor(decay * 5));
    let phase = 0;
    for (let i = 0; i < len; i++) {
      const f = f0 * (1 - 0.35 * Math.min(1, i / (decay * 1.5))); // the pitch falls as the drop rings out
      phase += (2 * Math.PI * f) / sampleRate;
      const click = i < sampleRate * 0.002 ? (random() * 2 - 1) * 0.4 : 0;
      out[start + i] += (Math.sin(phase) + click) * amp * Math.exp(-i / decay);
    }
  }
  return normalise(out, 0.9);
}

/** Scales so the loudest sample is `peak` (silence stays silence). */
export function normalise(out: Float32Array, peak: number) {
  let max = 0;
  for (const v of out) max = Math.max(max, Math.abs(v));
  if (max > 0) for (let i = 0; i < out.length; i++) out[i] = (out[i] / max) * peak;
  return out;
}

/** The loudness shape of one thunder roll (time in seconds → gain), seeded per strike. */
export function thunderEnvelope(random: () => number, strength: number): [number, number][] {
  const points: [number, number][] = [[0, 0]];
  // Near strikes start with a crack; distant ones only rumble.
  if (strength > 0.6) points.push([0.04, strength]);
  let t = 0.3 + random() * 0.4;
  const swells = 3 + Math.floor(random() * 3);
  for (let i = 0; i < swells; i++) {
    points.push([t, strength * (0.35 + random() * 0.5) * (1 - i / (swells + 1))]);
    t += 0.6 + random() * 1.4;
  }
  points.push([t + 2.5, 0]);
  return points;
}

// ---------- Web Audio graph builders -------------------------------------------------------

export interface Voice {
  /** Fades out and releases everything. */
  stop(): void;
}

const buffers = new WeakMap<BaseAudioContext, Map<string, AudioBuffer>>();
/** One generated buffer per kind per context, reused by every source. */
function buffer(ctx: BaseAudioContext, key: string, seconds: number, fill: (data: Float32Array, rate: number) => void): AudioBuffer {
  let map = buffers.get(ctx);
  if (!map) buffers.set(ctx, (map = new Map()));
  let b = map.get(key);
  if (!b) {
    b = ctx.createBuffer(1, Math.floor(seconds * ctx.sampleRate), ctx.sampleRate);
    fill(b.getChannelData(0), ctx.sampleRate);
    map.set(key, b);
  }
  return b;
}

export const sounds = {
  pink: (ctx: BaseAudioContext) => buffer(ctx, "pink", 6, (d) => fillPink(d, rng(1))),
  brown: (ctx: BaseAudioContext) => buffer(ctx, "brown", 12, (d) => fillBrown(d, rng(2))),
  tiles: (ctx: BaseAudioContext) => buffer(ctx, "tiles", 4, (d, r) => fillPatter(d, r, 420, rng(3))),
  drips: (ctx: BaseAudioContext) => buffer(ctx, "drips", 7, (d, r) => fillDrips(d, r, 2.2, rng(4))),
};

/** A looping buffer starting at a random point (so many copies never sound in step). */
export function loop(ctx: BaseAudioContext, b: AudioBuffer, random: () => number): AudioBufferSourceNode {
  const s = ctx.createBufferSource();
  s.buffer = b;
  s.loop = true;
  s.start(ctx.currentTime, random() * b.duration);
  return s;
}

function filter(ctx: BaseAudioContext, type: BiquadFilterType, frequency: number, q = 0.7) {
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = frequency;
  f.Q.value = q;
  return f;
}

/** Fades a gain to zero, then stops sources and disconnects nodes. */
function release(ctx: BaseAudioContext, out: GainNode, sources: AudioScheduledSourceNode[], nodes: AudioNode[], seconds = 0.6): Voice {
  let stopped = false;
  return {
    stop() {
      if (stopped) return;
      stopped = true;
      const t = ctx.currentTime;
      out.gain.cancelScheduledValues(t);
      out.gain.setTargetAtTime(0, t, seconds / 4);
      for (const s of sources) s.stop(t + seconds);
      setTimeout(() => nodes.forEach((n) => n.disconnect()), seconds * 1000 + 100);
    },
  };
}

/**
 * The rain bed: high hiss, low rumble and a scatter of drops, swelling slowly. `amount` (0..1) is
 * the scene's rain amount. Non-positional: it is everywhere.
 */
export function rainBed(ctx: BaseAudioContext, destination: AudioNode, amount: number): Voice {
  const random = rng(11);
  const out = ctx.createGain();
  out.gain.value = 0;
  out.gain.setTargetAtTime(0.9 * amount, ctx.currentTime, 0.8); // gentle fade in
  out.connect(destination);

  const hiss = loop(ctx, sounds.pink(ctx), random);
  const hissHp = filter(ctx, "highpass", 500);
  const hissLp = filter(ctx, "lowpass", 6500);
  const hissGain = ctx.createGain();
  hissGain.gain.value = 0.55;
  hiss.connect(hissHp).connect(hissLp).connect(hissGain).connect(out);

  const rumble = loop(ctx, sounds.brown(ctx), random);
  const rumbleLp = filter(ctx, "lowpass", 260);
  const rumbleGain = ctx.createGain();
  rumbleGain.gain.value = 0.35;
  rumble.connect(rumbleLp).connect(rumbleGain).connect(out);

  const drops = loop(ctx, sounds.tiles(ctx), random);
  const dropsBp = filter(ctx, "bandpass", 3200, 0.6);
  const dropsGain = ctx.createGain();
  dropsGain.gain.value = 0.12;
  drops.connect(dropsBp).connect(dropsGain).connect(out);

  // A slow swell (gusts): ±15% on the whole bed.
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.07;
  const depth = ctx.createGain();
  depth.gain.value = 0.15 * amount;
  lfo.connect(depth).connect(out.gain);
  lfo.start();

  return release(ctx, out, [hiss, rumble, drops, lfo], [out, hissHp, hissLp, hissGain, rumbleLp, rumbleGain, dropsBp, dropsGain, depth]);
}

/** Rain on a clay-tile roof, or water dripping off its eaves, into a positioned output. */
export function surfaceLoop(ctx: BaseAudioContext, destination: AudioNode, kind: "tiles" | "drips", random: () => number): Voice {
  const out = ctx.createGain();
  out.gain.value = 0;
  out.gain.setTargetAtTime(kind === "tiles" ? 0.7 : 0.45, ctx.currentTime, 0.8);
  out.connect(destination);
  const src = loop(ctx, kind === "tiles" ? sounds.tiles(ctx) : sounds.drips(ctx), random);
  // Tiles: a bright "tick" band; drips keep their ringing tone.
  const shape = kind === "tiles" ? filter(ctx, "bandpass", 2400, 0.5) : filter(ctx, "highpass", 700);
  src.playbackRate.value = 0.9 + random() * 0.2; // each roof slightly different
  src.connect(shape).connect(out);
  return release(ctx, out, [src], [out, shape]);
}

/**
 * One roll of thunder: brown noise through a closing low-pass filter, shaped by a seeded
 * envelope, panned towards the strike (`pan` -1..1). Starts after `delay` seconds.
 */
export function thunder(ctx: BaseAudioContext, destination: AudioNode, opts: { delay: number; strength: number; pan: number; seed: number }): Voice {
  const random = rng(opts.seed);
  const t0 = ctx.currentTime + opts.delay;
  const src = ctx.createBufferSource();
  src.buffer = sounds.brown(ctx);
  const lp = filter(ctx, "lowpass", 900);
  lp.frequency.setValueAtTime(700 + 600 * opts.strength, t0);
  lp.frequency.exponentialRampToValueAtTime(140, t0 + 3);
  const env = ctx.createGain();
  env.gain.value = 0;
  const points = thunderEnvelope(random, opts.strength);
  for (const [t, g] of points) env.gain.linearRampToValueAtTime(g, t0 + t);
  const panner = ctx.createStereoPanner();
  panner.pan.value = Math.max(-1, Math.min(1, opts.pan));
  const out = ctx.createGain();
  out.gain.value = 1;
  src.connect(lp).connect(env).connect(panner).connect(out).connect(destination);
  const end = points[points.length - 1][0];
  src.start(t0, random() * 2);
  src.stop(t0 + end + 0.1);
  const nodes = [lp, env, panner, out];
  src.onended = () => nodes.forEach((n) => n.disconnect());
  return release(ctx, out, [src], nodes, 0.4);
}
