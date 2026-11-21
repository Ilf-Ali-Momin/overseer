import type { AgentEvent } from '@overseer/shared';
import { describe, expect, it } from 'vitest';
import { RESULT_MS, receivedResult } from './resultModel';

const e = (ts: number, kind: AgentEvent['kind'], name?: string, isError?: boolean): AgentEvent => ({
  id: `e${ts}${kind}`,
  ts,
  sessionId: 's',
  agentId: 's',
  project: 'p',
  kind,
  ...(name
    ? { tool: { name, useId: 'u', summary: 'Scan TODOs', ...(isError ? { isError } : {}) } }
    : {}),
});

describe('receivedResult', () => {
  const now = 100_000;
  it('returns the task right after the Agent call ends', () => {
    expect(receivedResult({ events: [e(now - 500, 'tool_end', 'Agent')] }, now)).toBe('Scan TODOs');
    expect(
      receivedResult({ events: [e(now - 500, 'tool_end', 'Task'), e(now - 100, 'thinking')] }, now),
    ).toBe('Scan TODOs');
  });

  it('is null when too old, for other tools, or on error', () => {
    expect(
      receivedResult({ events: [e(now - RESULT_MS - 1, 'tool_end', 'Agent')] }, now),
    ).toBeNull();
    expect(receivedResult({ events: [e(now - 100, 'tool_end', 'Read')] }, now)).toBeNull();
    expect(receivedResult({ events: [e(now - 100, 'tool_start', 'Agent')] }, now)).toBeNull();
    expect(receivedResult({ events: [e(now - 100, 'tool_end', 'Agent', true)] }, now)).toBeNull();
  });
});
