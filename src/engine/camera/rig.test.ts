import { describe, expect, it } from "vitest";
import { damp, fly, forward, framingDistance, FREE_SPEED, lookFrom, loopPhase, pathAim, PITCH_LIMIT, turn, wheelSpeed } from "./rig";

const close = (a: number[], b: number[], digits = 6) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i], digits));

describe("damp", () => {
  it("ends in the same place at 30, 60 and 144 fps", () => {
    const run = (fps: number) => {
      let v = 0;
      for (let i = 0; i < fps * 2; i++) v = damp(v, 10, 1.5, 1 / fps);
      return v;
    };
    const at60 = run(60);
    expect(run(30)).toBeCloseTo(at60, 9);
    expect(run(144)).toBeCloseTo(at60, 9);
    expect(at60).toBeCloseTo(10 * (1 - Math.exp(-3)), 9);
  });
  it("does not move with no time and arrives with a lot", () => {
    expect(damp(2, 8, 5, 0)).toBe(2);
    expect(damp(2, 8, 5, 100)).toBeCloseTo(8, 9);
  });
});

describe("cinematic path", () => {
  it("loops its phase, including negative times", () => {
    expect(loopPhase(0, 95)).toBe(0);
    expect(loopPhase(47.5, 95)).toBeCloseTo(0.5);
    expect(loopPhase(95 * 3 + 19, 95)).toBeCloseTo(0.2);
    expect(loopPhase(-19, 95)).toBeCloseTo(0.8);
  });
  it("aims ahead along -z, towards the centre line, never below 1 m", () => {
    expect(pathAim([4, 6, 10], 15)).toEqual([1.4, 2.7, -5]);
    expect(pathAim([-2, 1, 0], 15)[1]).toBe(1);
  });
});

describe("looking around", () => {
  it("yaw 0 looks along -z; positive yaw turns left (towards -x)", () => {
    close(forward({ yaw: 0, pitch: 0 }), [0, 0, -1]);
    close(forward({ yaw: Math.PI / 2, pitch: 0 }), [-1, 0, 0]);
  });
  it("lookFrom points forward() at the target", () => {
    const from = [1, 2, 3] as [number, number, number];
    const to = [-4, 5, -9] as [number, number, number];
    const d = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
    const n = Math.hypot(...d);
    close(forward(lookFrom(from, to)), d.map((v) => v / n));
  });
  it("dragging right turns right, dragging up looks up, and pitch stops short of vertical", () => {
    const l = turn({ yaw: 0, pitch: 0 }, 100, -100, 0.003);
    expect(l.yaw).toBeCloseTo(-0.3);
    expect(l.pitch).toBeCloseTo(0.3);
    expect(turn(l, 0, -100_000, 0.003).pitch).toBe(PITCH_LIMIT);
    expect(turn(l, 0, 100_000, 0.003).pitch).toBe(-PITCH_LIMIT);
    expect(lookFrom([0, 0, 0], [0, 10, 0]).pitch).toBe(PITCH_LIMIT);
  });
});

describe("free camera", () => {
  const level = { yaw: 0, pitch: 0 };
  it("moves forward along the look, strafes level, rises straight up", () => {
    close(fly([0, 0, 0], level, { forward: 1, right: 0, up: 0 }, 1, 6), [0, 0, -6]);
    close(fly([0, 0, 0], level, { forward: 0, right: 1, up: 0 }, 1, 6), [6, 0, 0]);
    close(fly([0, 0, 0], { yaw: 0, pitch: -0.5 }, { forward: 0, right: 1, up: 0 }, 1, 6), [6, 0, 0]);
    close(fly([0, 0, 0], level, { forward: 0, right: 0, up: 1 }, 1, 6), [0, 6, 0]);
  });
  it("diagonals are no faster, and nothing held means no movement", () => {
    const p = fly([0, 0, 0], level, { forward: 1, right: 1, up: 0 }, 1, 6);
    expect(Math.hypot(...p)).toBeCloseTo(6);
    const still: [number, number, number] = [1, 2, 3];
    expect(fly(still, level, { forward: 0, right: 0, up: 0 }, 1, 6)).toBe(still);
  });
  it("the wheel changes speed in steps, within limits", () => {
    expect(wheelSpeed(6, -100)).toBeCloseTo(7.2);
    expect(wheelSpeed(6, 100)).toBeCloseTo(5);
    expect(wheelSpeed(6, 0)).toBe(6);
    expect(wheelSpeed(FREE_SPEED.max, -1)).toBe(FREE_SPEED.max);
    expect(wheelSpeed(FREE_SPEED.min, 1)).toBe(FREE_SPEED.min);
  });
});

describe("framing a screen", () => {
  const fov = (45 * Math.PI) / 180;
  it("on a wide window, the screen's height decides the distance", () => {
    const d = framingDistance(0.375, 0.31, fov, 16 / 9, 0.55, 0.9);
    expect(0.31 / (2 * d * Math.tan(fov / 2))).toBeCloseTo(0.55);
  });
  it("on a tall phone window, the width decides, and the screen still fits", () => {
    const d = framingDistance(0.375, 0.31, fov, 0.5, 0.55, 0.9);
    const visibleH = 2 * d * Math.tan(fov / 2);
    expect(0.375 / (visibleH * 0.5)).toBeCloseTo(0.9);
    expect(0.31 / visibleH).toBeLessThan(0.55);
  });
});
