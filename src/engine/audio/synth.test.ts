import { describe, expect, it } from "vitest";
import { fillBrown, fillDrips, fillPatter, fillPink, normalise, rng, thunderEnvelope } from "./synth";

const RATE = 48_000;
const peak = (a: Float32Array) => a.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
const rms = (a: Float32Array) => Math.sqrt(a.reduce((s, v) => s + v * v, 0) / a.length);
/** Energy of the sample-to-sample change: high for hiss, low for rumble. */
const brightness = (a: Float32Array) => {
  let d = 0;
  for (let i = 1; i < a.length; i++) d += (a[i] - a[i - 1]) ** 2;
  return Math.sqrt(d / a.length) / rms(a);
};

describe("generated sound", () => {
  it("is deterministic (same seed, same sound)", () => {
    const a = fillPatter(new Float32Array(RATE), RATE, 400, rng(3));
    const b = fillPatter(new Float32Array(RATE), RATE, 400, rng(3));
    expect(a).toEqual(b);
  });
  it("never clips and never contains NaN", () => {
    for (const buf of [fillPink(new Float32Array(RATE * 2), rng(1)), fillBrown(new Float32Array(RATE * 2), rng(2)), fillPatter(new Float32Array(RATE), RATE, 400, rng(3)), fillDrips(new Float32Array(RATE * 3), RATE, 2, rng(4))]) {
      expect(buf.every(Number.isFinite)).toBe(true);
      expect(peak(buf)).toBeLessThanOrEqual(1);
      expect(rms(buf)).toBeGreaterThan(0.001);
    }
  });
  it("rumble is darker than hiss, and roof patter is dense while drips are sparse", () => {
    const pink = fillPink(new Float32Array(RATE), rng(1));
    const brown = fillBrown(new Float32Array(RATE), rng(2));
    expect(brightness(brown)).toBeLessThan(brightness(pink) / 2);
    const loud = (a: Float32Array) => a.filter((v) => Math.abs(v) > 0.05).length / a.length;
    const tiles = fillPatter(new Float32Array(RATE), RATE, 420, rng(3));
    const drips = fillDrips(new Float32Array(RATE * 4), RATE, 2, rng(4));
    expect(loud(tiles)).toBeGreaterThan(loud(drips));
  });
  it("normalise leaves silence silent", () => {
    expect(normalise(new Float32Array(10), 0.9).every((v) => v === 0)).toBe(true);
  });
});

describe("thunder", () => {
  it("rises, rolls and fades to silence; only strong strikes crack", () => {
    const strong = thunderEnvelope(rng(5), 0.9);
    const weak = thunderEnvelope(rng(5), 0.4);
    for (const env of [strong, weak]) {
      expect(env[0]).toEqual([0, 0]);
      expect(env.at(-1)![1]).toBe(0);
      for (let i = 1; i < env.length; i++) expect(env[i][0]).toBeGreaterThan(env[i - 1][0]);
      expect(env.at(-1)![0]).toBeGreaterThan(3);
    }
    expect(strong[1]).toEqual([0.04, 0.9]);
    expect(weak[1][0]).toBeGreaterThan(0.2);
  });
});
