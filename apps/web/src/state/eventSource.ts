import {
  type AgentEvent,
  type AgentSnapshot,
  OVERSEER_WS_HOST,
  OVERSEER_WS_PORT,
  parseServerMessage,
} from '@overseer/shared';

/**
 * Browser WebSocket client for the bridge. Framework free: the socket constructor and timers are
 * injectable so it can be unit tested in node with a fake socket.
 */

export type ConnectionStatus = 'connecting' | 'open' | 'closed';

/** The subset of the browser WebSocket this client uses. */
export interface SocketLike {
  onopen: ((ev: unknown) => void) | null;
  onclose: ((ev: unknown) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  close: () => void;
}

export type SocketCtor = new (url: string) => SocketLike;

export interface EventSourceOptions {
  url?: string;
  WebSocketImpl?: SocketCtor;
  /** First reconnect delay in ms. */
  minDelay?: number;
  /** Longest reconnect delay in ms. */
  maxDelay?: number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

export interface BridgeEventSource {
  /** Open the connection (no-op when already started). */
  start: () => void;
  /** Close the connection and stop reconnecting. */
  close: () => void;
  status: () => ConnectionStatus;
  onStatus: (fn: (status: ConnectionStatus) => void) => () => void;
  onSnapshot: (fn: (agents: AgentSnapshot[]) => void) => () => void;
  onEvent: (fn: (ev: AgentEvent) => void) => () => void;
}

export const DEFAULT_WS_URL = `ws://${OVERSEER_WS_HOST}:${OVERSEER_WS_PORT}`;
export const MIN_DELAY = 500;
export const MAX_DELAY = 10_000;

/** Reconnect delay after `attempt` failed tries in a row (0 based). */
export function backoffDelay(attempt: number, min = MIN_DELAY, max = MAX_DELAY): number {
  return Math.min(max, min * 2 ** attempt);
}

function decode(data: unknown): unknown {
  if (typeof data !== 'string') return null;
  try {
    return JSON.parse(data) as unknown;
  } catch {
    return null;
  }
}

export function createEventSource(opts: EventSourceOptions = {}): BridgeEventSource {
  const url = opts.url ?? DEFAULT_WS_URL;
  const Impl = opts.WebSocketImpl ?? (globalThis.WebSocket as unknown as SocketCtor | undefined);
  const minDelay = opts.minDelay ?? MIN_DELAY;
  const maxDelay = opts.maxDelay ?? MAX_DELAY;
  const setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = opts.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));

  const statusFns = new Set<(s: ConnectionStatus) => void>();
  const snapshotFns = new Set<(a: AgentSnapshot[]) => void>();
  const eventFns = new Set<(e: AgentEvent) => void>();

  let status: ConnectionStatus = 'closed';
  let socket: SocketLike | null = null;
  let timer: unknown = null;
  let attempt = 0;
  let running = false;

  const setStatus = (next: ConnectionStatus) => {
    if (next === status) return;
    status = next;
    for (const fn of statusFns) fn(next);
  };

  const scheduleReconnect = () => {
    if (!running || timer !== null) return;
    const delay = backoffDelay(attempt, minDelay, maxDelay);
    attempt++;
    timer = setTimer(() => {
      timer = null;
      connect();
    }, delay);
  };

  const connect = () => {
    if (!running || !Impl) return;
    setStatus('connecting');
    let ws: SocketLike;
    try {
      ws = new Impl(url);
    } catch {
      setStatus('closed');
      scheduleReconnect();
      return;
    }
    socket = ws;
    ws.onopen = () => {
      if (socket !== ws) return;
      attempt = 0;
      setStatus('open');
    };
    ws.onmessage = (ev) => {
      if (socket !== ws) return;
      const msg = parseServerMessage(decode(ev.data));
      if (!msg) return;
      if (msg.type === 'snapshot') for (const fn of snapshotFns) fn(msg.payload.agents);
      else for (const fn of eventFns) fn(msg.payload);
    };
    ws.onerror = () => {
      // The browser always follows an error with a close; reconnect is handled there.
    };
    ws.onclose = () => {
      if (socket !== ws) return;
      socket = null;
      setStatus('closed');
      scheduleReconnect();
    };
  };

  const subscribe =
    <T>(set: Set<T>) =>
    (fn: T) => {
      set.add(fn);
      return () => {
        set.delete(fn);
      };
    };

  return {
    start: () => {
      if (running) return;
      running = true;
      attempt = 0;
      connect();
    },
    close: () => {
      running = false;
      if (timer !== null) clearTimer(timer);
      timer = null;
      const ws = socket;
      socket = null;
      ws?.close();
      setStatus('closed');
    },
    status: () => status,
    onStatus: subscribe(statusFns),
    onSnapshot: subscribe(snapshotFns),
    onEvent: subscribe(eventFns),
  };
}
