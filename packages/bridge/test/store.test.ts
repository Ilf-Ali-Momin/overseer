import { describe, expect, it } from 'vitest';
import type { AgentEvent } from '@overseer/shared';
import { SessionStore } from '../src/store';

let n = 0;
function ev(
  agentId: string,
  kind: AgentEvent['kind'] = 'message',
  extra: Partial<AgentEvent> = {},
): AgentEvent {
  return {
    id: `e${++n}`,
    ts: n,
    sessionId: agentId.split(':')[0] ?? agentId,
    agentId,
    project: 'p',
    kind,
    ...extra,
  };
}

describe('SessionStore', () => {
  it('keeps agents with their last N events and emits each event', () => {
    const store = new SessionStore({ maxEvents: 3 });
    const seen: string[] = [];
    store.on('event', (e) => seen.push(e.id));
    const events = [ev('a'), ev('a'), ev('a'), ev('a'), ev('b')];
    store.add(events, { title: 'Hello' });
    expect(seen).toEqual(events.map((e) => e.id));
    expect(store.size).toBe(2);
    expect(store.get('a')?.events.map((e) => e.id)).toEqual(events.slice(1, 4).map((e) => e.id));
    expect(store.get('a')?.title).toBe('Hello');
  });

  it('builds a schema-shaped snapshot with parent ids', () => {
    const store = new SessionStore();
    store.add([ev('s'), ev('s:x', 'subagent_spawn', { parentAgentId: 's' })]);
    const snap = store.snapshot();
    expect(snap.map((a) => a.agentId)).toEqual(['s', 's:x']);
    expect(snap[1]?.parentAgentId).toBe('s');
  });

  it('removes subagents when they end', () => {
    const store = new SessionStore();
    store.add([ev('s:x', 'subagent_spawn', { parentAgentId: 's' })]);
    store.add([ev('s:x', 'subagent_end', { parentAgentId: 's' })]);
    expect(store.size).toBe(0);
  });

  it('ends inactive sessions on sweep', () => {
    let now = 1_000;
    const store = new SessionStore({ endAfterMs: 100, now: () => now });
    store.add([ev('s'), ev('s:x', 'subagent_spawn', { parentAgentId: 's' })]);
    now = 1_050;
    expect(store.sweep()).toEqual([]);
    store.add([ev('s')]);
    now = 1_120;
    const ended = store.sweep();
    expect(ended.map((e) => [e.agentId, e.kind])).toEqual([['s:x', 'subagent_end']]);
    now = 1_200;
    expect(store.sweep().map((e) => e.kind)).toEqual(['session_end']);
    expect(store.size).toBe(0);
  });
});
