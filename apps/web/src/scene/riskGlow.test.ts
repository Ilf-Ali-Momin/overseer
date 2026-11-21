import type { AgentEvent, RiskLevel } from '@overseer/shared';
import { describe, expect, it } from 'vitest';
import { GLOW_MS, PULSE_MS, deskGlow, newestHigh, pulseAmount } from './riskGlow';

const ev = (ts: number, level?: RiskLevel): AgentEvent => ({
  id: `e${ts}`,
  ts,
  sessionId: 's',
  agentId: 's',
  project: 'p',
  kind: 'tool_start',
  tool: { name: 'Bash', useId: 'u', summary: 'x' },
  ...(level ? { risk: { level, reasons: ['r'] } } : {}),
});

describe('deskGlow', () => {
  const now = 100_000;
  it('is off without recent medium or high events', () => {
    expect(deskGlow([ev(now - 1000, 'low'), ev(now - 500)], now).level).toBe('none');
    expect(deskGlow([ev(now - GLOW_MS - 1, 'high')], now).level).toBe('none');
  });

  it('prefers high over medium and fades at the end', () => {
    expect(deskGlow([ev(now - 15_000, 'high'), ev(now - 1000, 'medium')], now)).toEqual({
      level: 'high',
      strength: 5000 / 6000,
    });
    expect(deskGlow([ev(now - 1000, 'medium')], now)).toEqual({ level: 'medium', strength: 1 });
  });
});

describe('pulse', () => {
  it('finds new high events only', () => {
    const evs = [ev(1, 'high'), ev(2, 'medium'), ev(3)];
    expect(newestHigh(evs, 0)?.ts).toBe(1);
    expect(newestHigh(evs, 1)).toBeUndefined();
  });

  it('rises then fades to zero', () => {
    expect(pulseAmount(-1)).toBe(0);
    expect(pulseAmount(PULSE_MS * 0.15)).toBeCloseTo(1);
    expect(pulseAmount(PULSE_MS * 0.6)).toBeGreaterThan(0);
    expect(pulseAmount(PULSE_MS)).toBe(0);
  });
});
