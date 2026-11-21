import { describe, expect, it } from 'vitest';
import {
  AgentEventSchema,
  SUMMARY_MAX,
  parseServerMessage,
  truncate,
  type AgentEvent,
} from '../src/events';

const event: AgentEvent = {
  id: 'u1',
  ts: 1_700_000_000_000,
  sessionId: 's1',
  agentId: 's1',
  project: 'demo-app',
  kind: 'tool_start',
  tool: { name: 'Bash', useId: 'toolu_1', summary: 'pnpm test' },
  risk: { level: 'low', reasons: ['shell command'] },
  usage: { inputTokens: 10, outputTokens: 5 },
};

describe('AgentEventSchema', () => {
  it('accepts a valid event', () => {
    expect(AgentEventSchema.parse(event)).toEqual(event);
  });

  it('rejects an unknown kind', () => {
    expect(AgentEventSchema.safeParse({ ...event, kind: 'dancing' }).success).toBe(false);
  });

  it('rejects text longer than the summary limit', () => {
    const long = 'x'.repeat(SUMMARY_MAX + 1);
    expect(AgentEventSchema.safeParse({ ...event, text: long }).success).toBe(false);
  });

  it('rejects missing ids', () => {
    expect(AgentEventSchema.safeParse({ ...event, id: '' }).success).toBe(false);
  });
});

describe('parseServerMessage', () => {
  it('parses event and snapshot messages', () => {
    expect(parseServerMessage({ type: 'event', payload: event })?.type).toBe('event');
    const snap = parseServerMessage({
      type: 'snapshot',
      payload: {
        agents: [{ agentId: 's1', sessionId: 's1', project: 'demo-app', events: [event] }],
      },
    });
    expect(snap?.type).toBe('snapshot');
  });

  it('returns null for garbage', () => {
    expect(parseServerMessage({ type: 'nope' })).toBeNull();
    expect(parseServerMessage('hello')).toBeNull();
    expect(parseServerMessage({ type: 'event', payload: { id: 'x' } })).toBeNull();
  });
});

describe('truncate', () => {
  it('keeps short strings and collapses whitespace', () => {
    expect(truncate('  a\n  b  ')).toBe('a b');
  });

  it('cuts long strings to max with an ellipsis', () => {
    const out = truncate('y'.repeat(500));
    expect(out).toHaveLength(SUMMARY_MAX);
    expect(out.endsWith('…')).toBe(true);
  });
});
