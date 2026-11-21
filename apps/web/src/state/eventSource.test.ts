import type { AgentEvent } from '@overseer/shared';
import { describe, expect, it } from 'vitest';
import {
  type ConnectionStatus,
  type SocketLike,
  backoffDelay,
  createEventSource,
} from './eventSource';

class FakeSocket implements SocketLike {
  static all: FakeSocket[] = [];
  onopen: ((ev: unknown) => void) | null = null;
  onclose: ((ev: unknown) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  closed = false;
  constructor(public url: string) {
    FakeSocket.all.push(this);
  }
  close() {
    this.closed = true;
  }
  open() {
    this.onopen?.({});
  }
  drop() {
    this.onclose?.({});
  }
  send(data: unknown) {
    this.onmessage?.({ data });
  }
}

/** Manual timers: run them with `flush()`. */
function fakeTimers() {
  const pending = new Map<number, { fn: () => void; ms: number }>();
  let next = 1;
  return {
    setTimer: (fn: () => void, ms: number) => {
      pending.set(next, { fn, ms });
      return next++;
    },
    clearTimer: (h: unknown) => {
      pending.delete(h as number);
    },
    delays: () => [...pending.values()].map((p) => p.ms),
    flush: () => {
      const all = [...pending.entries()];
      pending.clear();
      for (const [, p] of all) p.fn();
    },
  };
}

function setup() {
  FakeSocket.all = [];
  const timers = fakeTimers();
  const src = createEventSource({
    url: 'ws://test',
    WebSocketImpl: FakeSocket,
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer,
  });
  const statuses: ConnectionStatus[] = [];
  src.onStatus((s) => statuses.push(s));
  const last = () => FakeSocket.all.at(-1)!;
  return { src, timers, statuses, last };
}

const event: AgentEvent = {
  id: 'e1',
  ts: 1,
  sessionId: 's',
  agentId: 's',
  project: 'demo',
  kind: 'tool_start',
  tool: { name: 'Read', useId: 'u1', summary: 'Read a.ts' },
};

describe('backoffDelay', () => {
  it('doubles from 0.5 s up to 10 s', () => {
    expect([0, 1, 2, 3, 4, 5, 6].map((a) => backoffDelay(a))).toEqual([
      500, 1000, 2000, 4000, 8000, 10000, 10000,
    ]);
  });
});

describe('eventSource', () => {
  it('connects and reports status', () => {
    const { src, statuses, last } = setup();
    src.start();
    expect(last().url).toBe('ws://test');
    expect(src.status()).toBe('connecting');
    last().open();
    expect(src.status()).toBe('open');
    expect(statuses).toEqual(['connecting', 'open']);
  });

  it('delivers valid snapshot and event messages, drops invalid ones', () => {
    const { src, last } = setup();
    const events: AgentEvent[] = [];
    const snapshots: number[] = [];
    src.onEvent((e) => events.push(e));
    src.onSnapshot((a) => snapshots.push(a.length));
    src.start();
    last().open();
    last().send(JSON.stringify({ type: 'snapshot', payload: { agents: [] } }));
    last().send(JSON.stringify({ type: 'event', payload: event }));
    last().send('not json');
    last().send(JSON.stringify({ type: 'event', payload: { id: 'x' } }));
    last().send(JSON.stringify({ type: 'other' }));
    last().send(42);
    expect(snapshots).toEqual([0]);
    expect(events).toEqual([event]);
  });

  it('reconnects with backoff and resets the delay after a successful open', () => {
    const { src, timers, last } = setup();
    src.start();
    const seen: number[] = [];
    for (let i = 0; i < 4; i++) {
      last().drop();
      seen.push(...timers.delays());
      timers.flush();
    }
    expect(seen).toEqual([500, 1000, 2000, 4000]);
    expect(FakeSocket.all).toHaveLength(5);

    last().open();
    last().drop();
    expect(timers.delays()).toEqual([500]);
  });

  it('close() stops reconnecting', () => {
    const { src, timers, last, statuses } = setup();
    src.start();
    last().open();
    const ws = last();
    src.close();
    expect(ws.closed).toBe(true);
    expect(src.status()).toBe('closed');
    // A late close event from the old socket must not schedule a reconnect.
    ws.drop();
    expect(timers.delays()).toEqual([]);
    expect(statuses.at(-1)).toBe('closed');

    // Closing while waiting to reconnect cancels the timer.
    src.start();
    last().drop();
    expect(timers.delays()).toHaveLength(1);
    src.close();
    expect(timers.delays()).toEqual([]);
  });

  it('unsubscribe stops delivery', () => {
    const { src, last } = setup();
    const events: AgentEvent[] = [];
    const off = src.onEvent((e) => events.push(e));
    src.start();
    off();
    last().send(JSON.stringify({ type: 'event', payload: event }));
    expect(events).toEqual([]);
  });
});
