import { Color } from 'three';

/**
 * Day/night shift with session length: morning when the longest session starts, evening after
 * ~2 h, night after ~4 h. Pure so it can be tested.
 */

/** Session length at which it is fully night. */
export const NIGHT_AFTER_MS = 4 * 60 * 60 * 1000;

/** 0 = morning, 0.5 = evening, 1 = night. */
export function dayPhase(elapsedMs: number): number {
  return Math.max(0, Math.min(1, elapsedMs / NIGHT_AFTER_MS));
}

export interface Lighting {
  key: Color;
  keyIntensity: number;
  ambient: Color;
  ambientIntensity: number;
  sky: Color;
  skyIntensity: number;
}

interface Stop {
  key: string;
  keyIntensity: number;
  ambient: string;
  ambientIntensity: number;
  sky: string;
  skyIntensity: number;
}

const MORNING: Stop = {
  key: '#ffe2b8',
  keyIntensity: 2.2,
  ambient: '#c9d4ff',
  ambientIntensity: 0.55,
  sky: '#fff1dd',
  skyIntensity: 0.5,
};
const EVENING: Stop = {
  key: '#ffad6b',
  keyIntensity: 1.7,
  ambient: '#d9c2ff',
  ambientIntensity: 0.48,
  sky: '#ffcf9e',
  skyIntensity: 0.45,
};
const NIGHT: Stop = {
  key: '#9fb4ff',
  keyIntensity: 0.9,
  ambient: '#7a86d9',
  ambientIntensity: 0.4,
  sky: '#6a78b8',
  skyIntensity: 0.35,
};

const mix = (a: string, b: string, t: number) => new Color(a).lerp(new Color(b), t);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function lightingFor(phase: number): Lighting {
  const p = Math.max(0, Math.min(1, phase));
  const [a, b, t] = p < 0.5 ? [MORNING, EVENING, p / 0.5] : [EVENING, NIGHT, (p - 0.5) / 0.5];
  return {
    key: mix(a.key, b.key, t),
    keyIntensity: lerp(a.keyIntensity, b.keyIntensity, t),
    ambient: mix(a.ambient, b.ambient, t),
    ambientIntensity: lerp(a.ambientIntensity, b.ambientIntensity, t),
    sky: mix(a.sky, b.sky, t),
    skyIntensity: lerp(a.skyIntensity, b.skyIntensity, t),
  };
}

/** Start of the longest-running session among `firstEventTs`, or `fallback` when there is none. */
export function sessionStart(firstEventTs: Iterable<number | undefined>, fallback: number): number {
  let start = Infinity;
  for (const ts of firstEventTs) if (ts !== undefined && ts < start) start = ts;
  return Number.isFinite(start) ? start : fallback;
}
