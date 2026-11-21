import type { AgentEvent } from '@overseer/shared';
import { describe, expect, it } from 'vitest';
import { BUBBLE_MAX, bubbleText, showsBubble } from './bubbleModel';

const e = (kind: AgentEvent['kind'], extra: Partial<AgentEvent> = {}): AgentEvent => ({
  id: 'x',
  ts: 1,
  sessionId: 's',
  agentId: 's',
  project: 'demo',
  kind,
  ...extra,
});

describe('bubble model', () => {
  it('shows for thinking and delegating only', () => {
    expect(showsBubble('thinking')).toBe(true);
    expect(showsBubble('delegating')).toBe(true);
    expect(showsBubble('typing')).toBe(false);
  });

  it('uses the latest text, capped', () => {
    expect(
      bubbleText({ events: [e('message', { text: 'Let me check the tests' }), e('thinking')] }),
    ).toBe('Let me check the tests');
    const long = bubbleText({ events: [e('message', { text: 'x'.repeat(100) })] });
    expect(long.length).toBe(BUBBLE_MAX);
  });

  it('falls back to an ellipsis, stops at the previous tool', () => {
    expect(bubbleText({ events: [] })).toBe('…');
    expect(
      bubbleText({
        events: [
          e('message', { text: 'old' }),
          e('tool_start', { tool: { name: 'Read', useId: 'u', summary: 'a.ts' } }),
          e('thinking'),
        ],
      }),
    ).toBe('…');
  });

  it('shows the subagent task while delegating', () => {
    expect(
      bubbleText({
        events: [e('tool_start', { tool: { name: 'Agent', useId: 'u', summary: 'Find the bug' } })],
      }),
    ).toBe('Find the bug');
  });
});
