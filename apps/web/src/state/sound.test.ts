import { describe, expect, it } from 'vitest';
import { createLimiter, useSoundStore } from './sound';

describe('sound', () => {
  it('is muted by default and toggles', () => {
    expect(useSoundStore.getState().muted).toBe(true);
    useSoundStore.getState().toggle();
    expect(useSoundStore.getState().muted).toBe(false);
    useSoundStore.getState().toggle();
    expect(useSoundStore.getState().muted).toBe(true);
  });

  it('rate limits', () => {
    const allow = createLimiter(100);
    expect(allow(0)).toBe(true);
    expect(allow(50)).toBe(false);
    expect(allow(100)).toBe(true);
  });
});
