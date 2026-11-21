import { type AgentEvent, LEAVE_AFTER_MS, type AgentSnapshot } from '@overseer/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { MAX_AGENT_EVENTS, useAgentsStore } from './agents';
import { createFrameBatcher } from './frameBatch';

const NOW = 1_000_000_000;
let seq = 0;

function ev(
  agentId: string,
  kind: AgentEvent['kind'],
  extra: Partial<AgentEvent> = {},
): AgentEvent {
  seq += 1;
  return {
    id: `e${seq}`,
    ts: NOW + seq,
    sessionId: agentId.split(':')[0]!,
    agentId,
    project: 'demo',
    kind,
    ...extra,
  };
}

const read = (agentId: string) =>
  ev(agentId, 'tool_start', { tool: { name: 'Read', useId: `u${seq}`, summary: 'Read a.ts' } });

const store = () => useAgentsStore.getState();

beforeEach(() => {
  useAgentsStore.setState({ agents: {}, selectedId: null, eventCount: 0 });
});

describe('agents store', () => {
  it('adds an agent on its first event and records events', () => {
    store().apply(ev('s1', 'session_start'));
    store().apply(read('s1'));
    const a = store().agents.s1!;
    expect(a.events.map((e) => e.kind)).toEqual(['session_start', 'tool_start']);
    expect(a.machine.state).toBe('reading');
    expect(store().eventCount).toBe(2);
  });

  it('ignores duplicate event ids', () => {
    const e = read('s1');
    store().apply(e);
    store().apply(e);
    expect(store().agents.s1!.events).toHaveLength(1);
    expect(store().eventCount).toBe(1);
  });

  it('keeps only the latest events', () => {
    store().applyMany(Array.from({ length: MAX_AGENT_EVENTS + 20 }, () => read('s1')));
    const { events } = store().agents.s1!;
    expect(events).toHaveLength(MAX_AGENT_EVENTS);
    expect(events.at(-1)!.id).toBe(`e${seq}`);
    expect(store().eventCount).toBe(1);
  });

  it('does not add an agent for an end event', () => {
    store().apply(ev('s1', 'session_end'));
    expect(store().agents.s1).toBeUndefined();
  });

  it('frees the desk and selection on remove', () => {
    store().apply(read('s1'));
    const desk = store().agents.s1!.deskIndex;
    store().select('s1');
    store().remove('s1');
    expect(store().selectedId).toBeNull();
    store().apply(read('s2'));
    expect(store().agents.s2!.deskIndex).toBe(desk);
  });

  it('keeps subagent parent links', () => {
    store().apply(ev('s1:a1', 'subagent_spawn', { parentAgentId: 's1' }));
    expect(store().agents['s1:a1']!.parentAgentId).toBe('s1');
  });
});

describe('loadSnapshot', () => {
  const snap = (agentId: string, events: AgentEvent[], title?: string): AgentSnapshot => ({
    agentId,
    sessionId: agentId,
    project: 'demo',
    events,
    ...(title ? { title } : {}),
  });

  it('replays recent sessions and skips ended or stale ones', () => {
    const now = NOW + 1000;
    store().loadSnapshot(
      [
        snap('live', [ev('live', 'session_start'), read('live')], 'Fix bug'),
        snap('ended', [ev('ended', 'session_start'), ev('ended', 'session_end')]),
        snap('stale', [{ ...read('stale'), ts: now - LEAVE_AFTER_MS - 1 }]),
        snap('empty', []),
      ],
      now,
    );
    expect(Object.keys(store().agents)).toEqual(['live']);
    expect(store().agents.live!.machine.state).toBe('reading');
    expect(store().agents.live!.title).toBe('Fix bug');
  });

  it('a reconnect snapshot does not replay known events twice', () => {
    const events = [ev('s1', 'session_start'), read('s1')];
    store().loadSnapshot([snap('s1', events)], NOW);
    store().loadSnapshot([snap('s1', events)], NOW);
    expect(store().agents.s1!.events).toHaveLength(2);
  });

  it('sends live agents missing from the snapshot out, keeps fake ones', () => {
    store().apply(read('gone'));
    store().add('fake-1', 'demo', NOW, true);
    store().loadSnapshot([], NOW + 5000);
    expect(store().agents.gone!.machine.state).toBe('leaving');
    expect(store().agents['fake-1']!.machine.state).not.toBe('leaving');
  });
});

describe('createFrameBatcher', () => {
  it('delivers everything pushed in one frame together', () => {
    const frames: (() => void)[] = [];
    const got: number[][] = [];
    const b = createFrameBatcher<number>(
      (items) => got.push(items),
      (fn) => frames.push(fn),
      () => {},
    );
    b.push(1);
    b.push(2);
    b.push(3);
    expect(frames).toHaveLength(1);
    expect(got).toEqual([]);
    frames[0]!();
    expect(got).toEqual([[1, 2, 3]]);
    b.push(4);
    expect(frames).toHaveLength(2);
    b.dispose();
    frames[1]!();
    expect(got).toEqual([[1, 2, 3]]);
  });
});

describe('subagents', () => {
  it('a child sits at the free desk nearest its parent and links to the Agent call', async () => {
    const { childrenOf, pickDeskNear } = await import('./agents');
    const { deskSlots } = await import('@/scene/layout');
    // Fill a few desks so the parent is not next to the door.
    for (const id of ['x1', 'x2', 'x3']) store().apply(ev(id, 'session_start'));
    store().apply(ev('p', 'session_start'));
    const parentDesk = store().agents.p!.deskIndex;
    store().apply(
      ev('p:c1', 'subagent_spawn', {
        parentAgentId: 'p',
        text: 'Scan TODOs',
        tool: { name: 'Agent', useId: 'toolu_1', summary: 'Scan TODOs' },
      }),
    );
    const child = store().agents['p:c1']!;
    expect(child.parentAgentId).toBe('p');
    expect(child.spawnUseId).toBe('toolu_1');
    const taken = new Set(
      Object.values(store().agents)
        .filter((a) => a.id !== 'p:c1')
        .map((a) => a.deskIndex),
    );
    expect(child.deskIndex).toBe(pickDeskNear(taken, parentDesk));
    // Nearest free desk really is the closest one.
    const seat = (i: number) => deskSlots()[i]!.seat;
    const d = (i: number) =>
      Math.hypot(seat(i)[0] - seat(parentDesk)[0], seat(i)[2] - seat(parentDesk)[2]);
    for (const s of deskSlots())
      if (!taken.has(s.index)) expect(d(child.deskIndex)).toBeLessThanOrEqual(d(s.index));
    expect(childrenOf(store().agents, 'p').map((a) => a.id)).toEqual(['p:c1']);
  });
});
