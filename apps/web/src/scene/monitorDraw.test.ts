import { type AgentEvent, initialMachine } from '@overseer/shared';
import { describe, expect, it } from 'vitest';
import type { OfficeAgent } from '@/state/agents';
import { codeLine, monitorContent, monitorKey } from './monitorDraw';

const agent = (state: OfficeAgent['machine']['state'], events: AgentEvent[] = []): OfficeAgent => ({
  id: 'a',
  project: 'demo',
  deskIndex: 0,
  machine: { ...initialMachine(Date.now()), state, base: state },
  events,
  fake: false,
});

const toolEv = (name: string, summary: string): AgentEvent => ({
  id: 'e',
  ts: Date.now(),
  sessionId: 'a',
  agentId: 'a',
  project: 'demo',
  kind: 'tool_start',
  tool: { name, useId: 'u', summary },
});

describe('monitorContent', () => {
  const now = Date.now();
  it('maps states to monitor content', () => {
    expect(monitorContent(undefined, '#fff', now).kind).toBe('off');
    expect(
      monitorContent(agent('reading', [toolEv('Read', 'src/a.ts')]), '#fff', now),
    ).toMatchObject({ kind: 'path', text: 'src/a.ts', animated: false });
    expect(
      monitorContent(agent('terminal', [toolEv('Bash', 'pnpm test')]), '#fff', now),
    ).toMatchObject({ kind: 'terminal', text: 'pnpm test', animated: true });
    expect(monitorContent(agent('waiting'), '#fff', now).text).toBe('Waiting for you');
    expect(monitorContent(agent('leaving'), '#fff', now).kind).toBe('off');
    const withUsage = agent('typing', [
      { ...toolEv('Edit', 'a'), usage: { inputTokens: 12_000, outputTokens: 300 } },
    ]);
    expect(monitorContent(withUsage, '#fff', now).tokens).toBe('12k tok');
    expect(monitorContent(agent('typing'), '#fff', now).tokens).toBe('');
  });

  it('only animated content changes key with the tick', () => {
    const still = monitorContent(agent('reading', [toolEv('Read', 'a')]), '#fff', now);
    const moving = monitorContent(agent('typing', [toolEv('Edit', 'a')]), '#fff', now);
    expect(monitorKey(still, 1)).toBe(monitorKey(still, 2));
    expect(monitorKey(moving, 1)).not.toBe(monitorKey(moving, 2));
  });
});

describe('codeLine', () => {
  it('is deterministic and stays inside the screen', () => {
    expect(codeLine('src/a.ts', 3)).toEqual(codeLine('src/a.ts', 3));
    for (let i = 0; i < 200; i++) {
      for (const [x, w] of codeLine('src/a.ts', i)) expect(x + w).toBeLessThanOrEqual(34 + 10);
    }
  });
});
