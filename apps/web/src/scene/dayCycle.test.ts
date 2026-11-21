import { describe, expect, it } from 'vitest';
import { NIGHT_AFTER_MS, dayPhase, lightingFor, sessionStart } from './dayCycle';

describe('day cycle', () => {
  it('goes from morning to night over the session', () => {
    expect(dayPhase(0)).toBe(0);
    expect(dayPhase(NIGHT_AFTER_MS / 2)).toBe(0.5);
    expect(dayPhase(NIGHT_AFTER_MS * 3)).toBe(1);
    expect(dayPhase(-5)).toBe(0);
  });

  it('dims and cools the light toward night', () => {
    const morning = lightingFor(0);
    const evening = lightingFor(0.5);
    const night = lightingFor(1);
    expect(morning.keyIntensity).toBeGreaterThan(evening.keyIntensity);
    expect(evening.keyIntensity).toBeGreaterThan(night.keyIntensity);
    expect(night.key.b).toBeGreaterThan(night.key.r);
    expect(morning.key.r).toBeGreaterThan(morning.key.b);
    expect(morning.key.getHexString()).toBe('ffe2b8');
  });

  it('uses the earliest session start', () => {
    expect(sessionStart([5000, undefined, 3000], 9000)).toBe(3000);
    expect(sessionStart([], 9000)).toBe(9000);
  });
});
