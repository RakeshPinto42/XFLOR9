import { describe, expect, it } from "vitest";
import {
  KNOB_MAX_DEG,
  KNOB_MIN_DEG,
  indexFromAngle,
  indexFromScale,
  knobAngle,
  normaliseAngle,
  scaleLabels,
  scalePercent,
  stepIndex,
} from "./dial";

describe("dial positions", () => {
  it("spreads stations across the window with padding at both ends", () => {
    expect(scalePercent(0, 24)).toBe(4);
    expect(scalePercent(23, 24)).toBe(96);
    expect(scalePercent(0, 1)).toBe(50);
  });

  it("maps a click on the window back to the nearest station", () => {
    for (const i of [0, 5, 11, 23]) expect(indexFromScale(scalePercent(i, 24) / 100, 24)).toBe(i);
    expect(indexFromScale(-1, 24)).toBe(0);
    expect(indexFromScale(2, 24)).toBe(23);
  });
});

describe("knob", () => {
  it("turns from -135° to +135° across the list", () => {
    expect(knobAngle(0, 10)).toBe(KNOB_MIN_DEG);
    expect(knobAngle(9, 10)).toBe(KNOB_MAX_DEG);
    expect(knobAngle(0, 1)).toBe(0);
  });

  it("round-trips angle and station", () => {
    for (const i of [0, 3, 7, 9]) expect(indexFromAngle(knobAngle(i, 10), 10)).toBe(i);
  });

  it("stops at the ends instead of jumping across the dead zone", () => {
    expect(indexFromAngle(170, 10)).toBe(9);
    expect(indexFromAngle(-170, 10)).toBe(0);
    expect(normaliseAngle(350)).toBe(-10);
  });
});

describe("stepping", () => {
  it("clamps at both ends like a real dial", () => {
    expect(stepIndex(0, -1, 5)).toBe(0);
    expect(stepIndex(4, 1, 5)).toBe(4);
    expect(stepIndex(2, 5, 5)).toBe(4);
    expect(stepIndex(0, 1, 0)).toBe(0);
  });
});

describe("scale labels", () => {
  it("labels every slot for short lists and first/last plus a few for long ones", () => {
    expect(scaleLabels(3)).toEqual([0, 1, 2]);
    const long = scaleLabels(24);
    expect(long[0]).toBe(0);
    expect(long.at(-1)).toBe(23);
    expect(long.length).toBeLessThanOrEqual(6);
    expect(scaleLabels(0)).toEqual([]);
  });
});
