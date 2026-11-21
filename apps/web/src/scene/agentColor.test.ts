import { describe, expect, it } from 'vitest';
import { PALETTE_HUES, agentColor, agentHue, fnv1a, hslToHex } from './agentColor';

describe('agentColor', () => {
  it('is stable for the same id', () => {
    expect(agentColor('3f9a1c2e-session')).toBe(agentColor('3f9a1c2e-session'));
    expect(agentColor('a')).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('spreads many ids across the palette', () => {
    const used = new Set<number>();
    for (let i = 0; i < 200; i++) used.add(agentHue(`session-${i}`).hue);
    expect(used.size).toBe(PALETTE_HUES.length);
  });

  it('gives subagents a lighter shade near the parent hue', () => {
    const parent = agentHue('sess-1');
    const sub = agentHue('sess-1:agent-a');
    expect(sub.lightness).toBeGreaterThan(parent.lightness);
    const d = Math.abs(((sub.hue - parent.hue + 540) % 360) - 180);
    expect(d).toBeLessThanOrEqual(8);
    expect(agentColor('sess-1:agent-a')).not.toBe(agentColor('sess-1'));
  });

  it('hashes and converts colors correctly', () => {
    expect(fnv1a('')).toBe(0x811c9dc5);
    expect(fnv1a('a')).toBe(0xe40c292c);
    expect(hslToHex(0, 1, 0.5)).toBe('#ff0000');
    expect(hslToHex(120, 1, 0.5)).toBe('#00ff00');
    expect(hslToHex(240, 1, 0.5)).toBe('#0000ff');
  });
});
