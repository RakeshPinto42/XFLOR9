"use client";

import { getPlaybackEngine } from "@/lib/playback/browser";
import { EQ_BANDS, type EqSettings } from "./eq";

/**
 * The equaliser and visualiser's Web Audio graph, built on the playback engine's CORS element
 * (used only by the public-domain records; radio never passes through it):
 *
 *   records ─► preamp ─► 10 peaking filters ─► balance ─► analyser ─► speakers
 *
 * Built once, on the visitor's first click to play a record (browsers only start audio from a
 * gesture). It has its own audio context, never suspended in a hidden tab, so music carries on
 * in the background. Where Web Audio is missing, records play without the equaliser.
 */

interface Graph {
  ctx: AudioContext;
  preamp: GainNode;
  filters: BiquadFilterNode[];
  balance: StereoPannerNode | null;
  analyser: AnalyserNode;
}

let graph: Graph | null = null;
let failed = false;
let eq: EqSettings | null = null;
let pan = 0;

export function ensureGraph(): Graph | null {
  if (graph || failed) {
    if (graph?.ctx.state === "suspended") void graph.ctx.resume();
    return graph;
  }
  const w = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
  const Ctor = w.AudioContext ?? w.webkitAudioContext;
  if (!Ctor) {
    failed = true;
    return null;
  }
  try {
    const el = getPlaybackEngine().ensureCorsElement() as unknown as HTMLAudioElement;
    const ctx = new Ctor();
    const source = ctx.createMediaElementSource(el);
    const preamp = ctx.createGain();
    const filters = EQ_BANDS.map((hz, i) => {
      const f = ctx.createBiquadFilter();
      // Shelves at the ends, peaks in between, as graphic equalisers do.
      f.type = i === 0 ? "lowshelf" : i === EQ_BANDS.length - 1 ? "highshelf" : "peaking";
      f.frequency.value = hz;
      f.Q.value = 1.1;
      return f;
    });
    const balance = typeof ctx.createStereoPanner === "function" ? ctx.createStereoPanner() : null;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.72;
    let node: AudioNode = source.connect(preamp);
    for (const f of filters) node = node.connect(f);
    if (balance) node = node.connect(balance);
    node.connect(analyser).connect(ctx.destination);
    graph = { ctx, preamp, filters, balance, analyser };
    apply();
    if (ctx.state === "suspended") void ctx.resume();
    return graph;
  } catch {
    failed = true;
    return null;
  }
}

/** Equaliser settings changed (applied now if the graph exists, or when it's built). */
export function setEq(settings: EqSettings) {
  eq = settings;
  apply();
}

/** -1 (left) … 1 (right). */
export function setBalance(value: number) {
  pan = Math.max(-1, Math.min(1, value));
  apply();
}

export function getAnalyser(): AnalyserNode | null {
  return graph?.analyser ?? null;
}

export const balanceSupported = () => !failed;

function apply() {
  if (!graph) return;
  const t = graph.ctx.currentTime;
  const on = eq?.enabled ?? false;
  graph.preamp.gain.setTargetAtTime(on && eq ? 10 ** (eq.preamp / 20) : 1, t, 0.02);
  graph.filters.forEach((f, i) => f.gain.setTargetAtTime(on && eq ? eq.gains[i] : 0, t, 0.02));
  graph.balance?.pan.setTargetAtTime(pan, t, 0.02);
}
