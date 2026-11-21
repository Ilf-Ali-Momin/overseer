import type { AgentEvent } from '@overseer/shared';
import { describe, expect, it } from 'vitest';
import {
  CONFETTI_LIFE,
  SHAKE_MS,
  isErrorEvent,
  isSuccessEvent,
  newestSince,
  shakeOffset,
  spawnConfetti,
  stepConfetti,
} from './reactions';

const e = (ts: number, kind: AgentEvent['kind'], extra: Partial<AgentEvent> = {}): AgentEvent => ({
  id: `e${ts}`,
  ts,
  sessionId: 's',
  agentId: 's',
  project: 'p',
  kind,
  ...extra,
});
const bash = { name: 'Bash', useId: 'u', summary: 'pnpm test' };

describe('reaction triggers', () => {
  it('classifies errors and successes', () => {
    expect(isErrorEvent(e(1, 'error'))).toBe(true);
    expect(isErrorEvent(e(1, 'tool_end', { tool: { ...bash, isError: true } }))).toBe(true);
    expect(isErrorEvent(e(1, 'tool_end', { tool: bash, text: 'tests failed' }))).toBe(true);
    expect(isErrorEvent(e(1, 'tool_end', { tool: bash }))).toBe(false);
    expect(isSuccessEvent(e(1, 'tool_end', { tool: bash, text: 'tests passed' }))).toBe(true);
    expect(isSuccessEvent(e(1, 'subagent_end'))).toBe(true);
    expect(isSuccessEvent(e(1, 'message'))).toBe(false);
  });

  it('finds only new matching events', () => {
    const evs = [e(1, 'error'), e(2, 'message'), e(3, 'thinking')];
    expect(newestSince(evs, 0, isErrorEvent)?.ts).toBe(1);
    expect(newestSince(evs, 1, isErrorEvent)).toBeUndefined();
  });
});

describe('shake', () => {
  it('starts, decays and stops', () => {
    expect(shakeOffset(-1)).toEqual({ x: 0, z: 0 });
    const early = shakeOffset(20);
    const late = shakeOffset(SHAKE_MS - 20);
    expect(Math.hypot(early.x, early.z)).toBeGreaterThan(Math.hypot(late.x, late.z));
    expect(Math.hypot(early.x, early.z)).toBeLessThan(0.1);
    expect(shakeOffset(SHAKE_MS)).toEqual({ x: 0, z: 0 });
  });
});

describe('confetti', () => {
  it('bursts up, falls and disappears within its life', () => {
    let seed = 1;
    const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    let ps = spawnConfetti(2, 3, 60, rng);
    expect(ps).toHaveLength(60);
    ps = stepConfetti(ps, 0.1);
    expect(ps.every((p) => p.y > 1.0)).toBe(true);
    for (let t = 0; t < CONFETTI_LIFE + 0.1; t += 1 / 60) ps = stepConfetti(ps, 1 / 60);
    expect(ps).toHaveLength(0);
  });
});
