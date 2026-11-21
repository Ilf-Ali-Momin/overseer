import { type AgentEvent, type RiskLevel, initialMachine } from '@overseer/shared';
import { describe, expect, it } from 'vitest';
import type { OfficeAgent } from '@/state/agents';
import { riskFeed } from './riskFeedModel';

const ev = (id: string, ts: number, level?: RiskLevel): AgentEvent => ({
  id,
  ts,
  sessionId: 's',
  agentId: 's',
  project: 'p',
  kind: 'tool_start',
  tool: { name: 'Bash', useId: id, summary: `cmd ${id}` },
  ...(level ? { risk: { level, reasons: [`reason ${id}`] } } : {}),
});

const agent = (id: string, events: AgentEvent[]): OfficeAgent => ({
  id,
  project: 'p',
  deskIndex: 0,
  machine: initialMachine(0),
  events,
  fake: false,
});

describe('riskFeed', () => {
  const agents = {
    a: agent('aaaaaaaaaaaa', [ev('1', 10, 'high'), ev('2', 30, 'low'), ev('3', 50, 'medium')]),
    b: agent('bbbbbbbbbbbb', [ev('4', 40, 'high'), ev('5', 60), ev('6', 20, 'none')]),
  };

  it('merges medium and high events newest first', () => {
    const rows = riskFeed(agents);
    expect(rows.map((r) => r.id)).toEqual(['3', '4', '1']);
    expect(rows[1]).toMatchObject({
      agentId: 'bbbbbbbbbbbb',
      agentName: 'bbbbbbbb',
      level: 'high',
      reasons: ['reason 4'],
      tool: 'Bash',
      summary: 'cmd 4',
    });
  });

  it('carries the LLM verdict', () => {
    const withVerdict = agent('cccccccccccc', [
      {
        ...ev('7', 70, 'high'),
        risk: { level: 'high', reasons: ['r'], verdict: 'Reads secrets.' },
      },
    ]);
    expect(riskFeed({ c: withVerdict })[0]?.verdict).toBe('Reads secrets.');
  });

  it('caps the list', () => {
    expect(riskFeed(agents, 2).map((r) => r.id)).toEqual(['3', '4']);
  });
});
