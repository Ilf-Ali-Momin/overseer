import { VISUAL_STATES, initialMachine, reduceEvent, resolveState } from '@overseer/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { useAgentsStore } from './agents';
import {
  dismissFakes,
  eventForState,
  fakeIds,
  forceState,
  randomizeFakes,
  spawnFakes,
} from './fakeAgents';

beforeEach(() => useAgentsStore.setState({ agents: {} }));

describe('fake agents', () => {
  it.each([...VISUAL_STATES])('eventForState drives an agent into %s', (state) => {
    const ev = eventForState('a', state);
    const m = reduceEvent(initialMachine(Date.now() - 1000), ev);
    expect(resolveState(m, Date.now())).toBe(state);
  });

  it('spawns typing agents up to the 12 desks, each at its own desk', () => {
    expect(spawnFakes(15)).toHaveLength(12);
    const agents = Object.values(useAgentsStore.getState().agents);
    expect(new Set(agents.map((a) => a.deskIndex)).size).toBe(12);
    for (const a of agents) {
      expect(a.fake).toBe(true);
      expect(resolveState(a.machine, Date.now())).toBe('typing');
    }
  });

  it('forces states and dismisses everyone', () => {
    const [id] = spawnFakes(1);
    forceState(id!, 'waiting');
    expect(resolveState(useAgentsStore.getState().agents[id!]!.machine, Date.now())).toBe(
      'waiting',
    );
    dismissFakes();
    expect(resolveState(useAgentsStore.getState().agents[id!]!.machine, Date.now())).toBe(
      'leaving',
    );
  });

  it('randomize never makes agents leave', () => {
    spawnFakes(12);
    let r = 0;
    const rng = () => (r = (r * 9301 + 49297) % 233280) / 233280;
    for (let i = 0; i < 50; i++) randomizeFakes(1, rng);
    for (const id of fakeIds()) {
      expect(resolveState(useAgentsStore.getState().agents[id]!.machine, Date.now())).not.toBe(
        'leaving',
      );
    }
  });

  it('frees the desk when an agent is removed', () => {
    const [a] = spawnFakes(1);
    const desk = useAgentsStore.getState().agents[a!]!.deskIndex;
    useAgentsStore.getState().remove(a!);
    const [b] = spawnFakes(1);
    expect(useAgentsStore.getState().agents[b!]!.deskIndex).toBe(desk);
  });
});

describe('fake subagents', () => {
  it('spawns a child next to the parent and finishes it', async () => {
    const { spawnFakes, spawnSubagent, finishSubagent } = await import('./fakeAgents');
    const { useAgentsStore } = await import('./agents');
    const { resolveState } = await import('@overseer/shared');
    const [parent] = spawnFakes(1);
    const child = spawnSubagent(parent!)!;
    const s = () => useAgentsStore.getState().agents;
    expect(s()[child]).toMatchObject({ parentAgentId: parent, fake: true });
    expect(s()[child]!.spawnUseId).toBeTruthy();
    expect(s()[parent!]!.machine.state).toBe('delegating');
    finishSubagent(child);
    expect(s()[child]!.machine.base).toBe('leaving');
    expect(s()[parent!]!.events.at(-1)).toMatchObject({
      kind: 'tool_end',
      tool: { name: 'Agent', useId: s()[child]!.spawnUseId, summary: 'Explore the codebase' },
    });
    expect(s()[parent!]!.machine.state).toBe('thinking');
    expect(resolveState(s()[child]!.machine, Date.now())).toBe('celebrating');
  });
});
