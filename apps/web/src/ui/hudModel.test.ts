import { IDLE_AFTER_MS, LEAVE_AFTER_MS, initialMachine } from '@overseer/shared';
import { describe, expect, it } from 'vitest';
import type { OfficeAgent } from '@/state/agents';
import { STATUS_VIEW, activeCount, hudView } from './hudModel';

const agent = (id: string, lastTs: number, leaving = false): OfficeAgent => ({
  id,
  project: 'demo',
  deskIndex: 0,
  machine: leaving
    ? { ...initialMachine(lastTs), state: 'leaving', base: 'leaving' }
    : initialMachine(lastTs),
  events: [],
  fake: false,
});

describe('hud model', () => {
  it('counts agents that are not leaving, including idle ones', () => {
    const now = 10_000_000;
    const agents = {
      a: agent('a', now),
      b: agent('b', now - IDLE_AFTER_MS - 1),
      c: agent('c', now, true),
      d: agent('d', now - LEAVE_AFTER_MS - 1),
    };
    expect(activeCount(agents, now)).toBe(2);
  });

  it('has a label for every status', () => {
    expect(Object.keys(STATUS_VIEW).sort()).toEqual(['closed', 'connecting', 'off', 'open']);
  });

  it('shows demo mode and bridge status', () => {
    expect(hudView('demo', 'closed')).toMatchObject({
      label: 'Demo',
      hint: 'recording, no bridge',
    });
    expect(hudView('live', 'open').label).toBe('Live');
    expect(hudView('waiting', 'closed').label).toBe('Connecting');
    expect(hudView('waiting', 'off').label).toBe('Demo');
  });
});
