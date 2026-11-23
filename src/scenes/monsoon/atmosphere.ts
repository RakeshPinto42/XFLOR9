"use client";

/**
 * Shared atmosphere state for the monsoon scene: one clock for wind and water shaders, and the
 * lightning flash (0..1) that the sky, lights and mist all react to, so everything stays in sync.
 * Plain module state: read inside useFrame, never via React state (no re-renders per frame).
 */
export const atmosphere = {
  /** Shader uniforms shared by every material that animates with wind or water. */
  uniforms: {
    uTime: { value: 0 },
    uWind: { value: 1 },
    uFlash: { value: 0 },
    /** Direction of the latest lightning strike on the horizon (-1..1). */
    uBearing: { value: 0 },
  },
  /** Seconds until the next lightning strike. */
  nextStrike: 9,
  /** Current flash envelope (0 = none). */
  flash: 0,
  /** Small random offset for where the next strike appears on the horizon (-1..1). */
  strikeBearing: 0,
  /**
   * Called at each lightning strike with its horizon bearing (-1..1). The audio system (A1)
   * subscribes here to play thunder after a distance delay, in sync with the flash.
   */
  onStrike: new Set<(bearing: number) => void>(),
};

/** Deterministic pseudo-random numbers, so the neighbourhood is identical on every visit. */
export function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Advances the clock and lightning. Strikes are distant and soft (a double flicker that fades),
 * 12–30 s apart: atmosphere, not horror.
 */
export function tickAtmosphere(delta: number, random: () => number) {
  const u = atmosphere.uniforms;
  u.uTime.value += delta;
  u.uWind.value = 0.85 + Math.sin(u.uTime.value * 0.23) * 0.25 + Math.sin(u.uTime.value * 0.71) * 0.1;
  atmosphere.nextStrike -= delta;
  if (atmosphere.nextStrike <= 0) {
    atmosphere.nextStrike = 12 + random() * 18;
    atmosphere.flash = 1;
    atmosphere.strikeBearing = random() * 2 - 1;
    u.uBearing.value = atmosphere.strikeBearing;
    atmosphere.onStrike.forEach((listener) => listener(atmosphere.strikeBearing));
  }
  // Double-flicker envelope: quick decay with a second pulse.
  const f = atmosphere.flash;
  atmosphere.flash = Math.max(0, f - delta * 1.8);
  const pulse = f > 0.55 && f < 0.7 ? 0.6 : 1;
  u.uFlash.value = atmosphere.flash * atmosphere.flash * pulse;
}
