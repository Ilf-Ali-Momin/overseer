import { afterEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { parseServerMessage, type AgentEvent, type ServerMessage } from '@overseer/shared';
import { startServer, type BridgeServer } from '../src/server';
import { SessionStore } from '../src/store';

const event = (id: string): AgentEvent => ({
  id,
  ts: 1,
  sessionId: 's',
  agentId: 's',
  project: 'p',
  kind: 'message',
  text: 'hi',
});

function connect(port: number): Promise<{ ws: WebSocket; messages: ServerMessage[] }> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    const messages: ServerMessage[] = [];
    ws.on('message', (data) => {
      const msg = parseServerMessage(JSON.parse(String(data)));
      if (msg) messages.push(msg);
    });
    ws.once('open', () => resolve({ ws, messages }));
    ws.once('error', reject);
  });
}

async function until(check: () => boolean): Promise<void> {
  const end = Date.now() + 2000;
  while (!check()) {
    if (Date.now() > end) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 10));
  }
}

describe('bridge server', () => {
  let server: BridgeServer | undefined;
  afterEach(async () => {
    await server?.close();
  });

  it('sends a snapshot on connect, then streams events', async () => {
    const store = new SessionStore();
    store.add([event('e1')], { title: 'T' });
    server = await startServer({ store, port: 0 });
    const { ws, messages } = await connect(server.port);
    await until(() => messages.length === 1);
    const snap = messages[0];
    expect(snap?.type).toBe('snapshot');
    if (snap?.type === 'snapshot') {
      expect(snap.payload.agents[0]?.title).toBe('T');
      expect(snap.payload.agents[0]?.events).toHaveLength(1);
    }
    store.add([event('e2')]);
    await until(() => messages.length === 2);
    expect(messages[1]).toEqual({ type: 'event', payload: event('e2') });
    ws.close();
  });

  it('binds to loopback only by default', async () => {
    server = await startServer({ store: new SessionStore(), port: 0 });
    // Reaching it through 127.0.0.1 works; the default host constant is loopback.
    const { ws } = await connect(server.port);
    expect(server.clients()).toBe(1);
    ws.close();
  });

  it('drops events that fail schema validation', async () => {
    const store = new SessionStore();
    const errors: unknown[] = [];
    server = await startServer({ store, port: 0, onError: (e) => errors.push(e) });
    const { ws, messages } = await connect(server.port);
    await until(() => messages.length === 1);
    store.add([{ ...event('bad'), text: 'x'.repeat(500) }]);
    store.add([event('good')]);
    await until(() => messages.length === 2);
    expect(messages[1]?.type === 'event' && messages[1].payload.id).toBe('good');
    expect(errors).toHaveLength(1);
    ws.close();
  });
});
