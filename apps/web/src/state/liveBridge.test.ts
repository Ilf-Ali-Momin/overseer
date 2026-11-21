import type { AgentEvent, AgentSnapshot } from '@overseer/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { useAgentsStore } from './agents';
import { useConnectionStore } from './connection';
import type { BridgeEventSource, ConnectionStatus } from './eventSource';
import { createFrameBatcher } from './frameBatch';
import { connectBridge } from './liveBridge';

function fakeSource() {
  let status: ConnectionStatus = 'closed';
  const fns = {
    status: new Set<(s: ConnectionStatus) => void>(),
    snapshot: new Set<(a: AgentSnapshot[]) => void>(),
    event: new Set<(e: AgentEvent) => void>(),
  };
  const sub =
    <T>(set: Set<T>) =>
    (fn: T) => {
      set.add(fn);
      return () => void set.delete(fn);
    };
  const src: BridgeEventSource & { started: boolean; closed: boolean } = {
    started: false,
    closed: false,
    start: () => {
      src.started = true;
    },
    close: () => {
      src.closed = true;
    },
    status: () => status,
    onStatus: sub(fns.status),
    onSnapshot: sub(fns.snapshot),
    onEvent: sub(fns.event),
  };
  return {
    src,
    setStatus: (s: ConnectionStatus) => {
      status = s;
      fns.status.forEach((f) => f(s));
    },
    snapshot: (a: AgentSnapshot[]) => fns.snapshot.forEach((f) => f(a)),
    event: (e: AgentEvent) => fns.event.forEach((f) => f(e)),
  };
}

const ev = (
  id: string,
  agentId: string,
  kind: AgentEvent['kind'],
  ts = Date.now(),
): AgentEvent => ({
  id,
  ts,
  sessionId: agentId,
  agentId,
  project: 'demo',
  kind,
});

beforeEach(() => {
  useAgentsStore.setState({ agents: {}, selectedId: null, eventCount: 0 });
  useConnectionStore.setState({ status: 'off' });
});

describe('connectBridge', () => {
  it('routes status, snapshots and batched events into the stores', () => {
    const f = fakeSource();
    const frames: (() => void)[] = [];
    const batcher = createFrameBatcher<AgentEvent>(
      (evs) => useAgentsStore.getState().applyMany(evs),
      (fn) => frames.push(fn),
      () => {},
    );
    const stop = connectBridge(f.src, batcher);
    expect(f.src.started).toBe(true);
    expect(useConnectionStore.getState().status).toBe('closed');

    f.setStatus('open');
    expect(useConnectionStore.getState().status).toBe('open');

    f.snapshot([
      { agentId: 'a', sessionId: 'a', project: 'demo', events: [ev('1', 'a', 'session_start')] },
    ]);
    expect(useAgentsStore.getState().agents.a).toBeDefined();

    f.event(ev('2', 'b', 'session_start'));
    f.event(ev('3', 'b', 'thinking'));
    expect(useAgentsStore.getState().agents.b).toBeUndefined();
    frames.forEach((fn) => fn());
    expect(useAgentsStore.getState().agents.b!.events).toHaveLength(2);
    expect(useAgentsStore.getState().eventCount).toBe(2);

    stop();
    expect(f.src.closed).toBe(true);
    expect(useConnectionStore.getState().status).toBe('off');
  });

  it('session_end sends the agent out; its desk is reused after it leaves', () => {
    const f = fakeSource();
    const stop = connectBridge(
      f.src,
      createFrameBatcher(
        (evs) => useAgentsStore.getState().applyMany(evs),
        (fn) => {
          fn();
        },
      ),
    );
    f.event(ev('1', 'a', 'session_start'));
    const desk = useAgentsStore.getState().agents.a!.deskIndex;
    f.event(ev('2', 'a', 'session_end'));
    expect(useAgentsStore.getState().agents.a!.machine.state).toBe('leaving');
    // The actor calls remove() once it has walked out of the door.
    useAgentsStore.getState().remove('a');
    f.event(ev('3', 'c', 'session_start'));
    expect(useAgentsStore.getState().agents.c!.deskIndex).toBe(desk);
    stop();
  });
});
