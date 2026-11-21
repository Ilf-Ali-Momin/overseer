import type { AddressInfo } from 'node:net';
import { WebSocket, WebSocketServer } from 'ws';
import {
  OVERSEER_WS_HOST,
  OVERSEER_WS_PORT,
  ServerMessageSchema,
  type AgentEvent,
  type ServerMessage,
} from '@overseer/shared';
import type { SessionStore } from './store';

export interface ServerOptions {
  store: SessionStore;
  port?: number;
  /** Always loopback unless explicitly changed. Transcripts are private. */
  host?: string;
  onError?: (err: unknown) => void;
}

export interface BridgeServer {
  port: number;
  clients: () => number;
  close: () => Promise<void>;
}

function encode(msg: ServerMessage, onError?: (err: unknown) => void): string | null {
  const checked = ServerMessageSchema.safeParse(msg);
  if (!checked.success) {
    onError?.(checked.error);
    return null;
  }
  return JSON.stringify(checked.data);
}

export async function startServer(opts: ServerOptions): Promise<BridgeServer> {
  const { store, onError } = opts;
  const wss = new WebSocketServer({
    host: opts.host ?? OVERSEER_WS_HOST,
    port: opts.port ?? OVERSEER_WS_PORT,
  });
  await new Promise<void>((resolve, reject) => {
    wss.once('listening', () => resolve());
    wss.once('error', reject);
  });
  wss.on('error', (err) => onError?.(err));

  wss.on('connection', (socket) => {
    const data = encode({ type: 'snapshot', payload: { agents: store.snapshot() } }, onError);
    if (data) socket.send(data);
    socket.on('error', (err) => onError?.(err));
  });

  const onEvent = (event: AgentEvent): void => {
    const data = encode({ type: 'event', payload: event }, onError);
    if (!data) return;
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) client.send(data);
    }
  };
  store.on('event', onEvent);

  return {
    port: (wss.address() as AddressInfo).port,
    clients: () => wss.clients.size,
    close: () =>
      new Promise<void>((resolve) => {
        store.off('event', onEvent);
        for (const client of wss.clients) client.terminate();
        wss.close(() => resolve());
      }),
  };
}
