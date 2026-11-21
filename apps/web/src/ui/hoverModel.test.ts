import { type AgentEvent, initialMachine } from '@overseer/shared';
import { describe, expect, it } from 'vitest';
import type { OfficeAgent } from '@/state/agents';
import { agentName, formatDuration, formatTokens, hoverInfo } from './hoverModel';

const base = (events: AgentEvent[], extra: Partial<OfficeAgent> = {}): OfficeAgent => ({
  id: 'abcdef123456',
  project: 'demo',
  deskIndex: 0,
  machine: { ...initialMachine(1000), state: 'terminal', base: 'terminal', since: 1000 },
  events,
  fake: false,
  ...extra,
});

const e = (kind: AgentEvent['kind'], extra: Partial<AgentEvent> = {}): AgentEvent => ({
  id: Math.random().toString(36),
  ts: 1000,
  sessionId: 's',
  agentId: 's',
  project: 'demo',
  kind,
  ...extra,
});

describe('hoverInfo', () => {
  it('summarises the agent', () => {
    const info = hoverInfo(
      base([
        e('message', {
          text: 'Looking at the tests',
          usage: { inputTokens: 100, outputTokens: 20 },
        }),
        e('tool_start', { tool: { name: 'Read', useId: 'u1', summary: 'Read a.ts' } }),
        e('tool_start', {
          tool: { name: 'Bash', useId: 'u2', summary: 'pnpm test' },
          risk: { level: 'medium', reasons: ['shell'] },
          usage: { outputTokens: 5 },
        }),
      ]),
      6500,
    );
    expect(info).toMatchObject({
      name: 'abcdef12',
      project: 'demo',
      state: 'terminal',
      tool: 'Bash',
      summary: 'pnpm test',
      stateSeconds: 5,
      toolCount: 2,
      tokens: 125,
      risk: 'medium',
      isSubagent: false,
    });
  });

  it('falls back to text and omits risk when none', () => {
    const info = hoverInfo(base([e('thinking', { text: 'Planning' })]), 1000);
    expect(info.tool).toBeUndefined();
    expect(info.summary).toBe('Planning');
    expect(info.risk).toBeUndefined();
  });
});

describe('formatting', () => {
  it('names agents', () => {
    expect(agentName({ id: 'abcdef123456', title: 'Fix login' })).toBe('Fix login');
    expect(agentName({ id: 'abcdef123456:a0c0ffee00000000b' })).toBe('abcdef12 › a0c0ff');
    expect(agentName({ id: 'demo-session:agent-1' })).toBe('demo-session › agent-1');
  });
  it('formats durations and tokens', () => {
    expect([42, 185, 3720].map(formatDuration)).toEqual(['42s', '3m 05s', '1h 02m']);
    expect([950, 12_345, 1_234, 1_200_000].map(formatTokens)).toEqual([
      '950',
      '12k',
      '1.2k',
      '1.2M',
    ]);
  });
});
