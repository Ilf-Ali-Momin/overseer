import type { AgentEvent } from '@overseer/shared';
import { describe, expect, it } from 'vitest';
import { agentTotals, eventCost, formatCost, officeTotals, priceFor } from './costModel';

const ev = (usage: AgentEvent['usage']): AgentEvent => ({
  id: 'e',
  ts: 0,
  sessionId: 's',
  agentId: 's',
  project: 'p',
  kind: 'message',
  ...(usage ? { usage } : {}),
});

describe('cost model', () => {
  it('prices by model family with a default', () => {
    expect(priceFor('claude-opus-5-5')).toEqual({ input: 4, output: 20 });
    expect(priceFor('claude-sonnet-5-5')).toEqual({ input: 2, output: 10 });
    expect(priceFor('claude-haiku-4-5')).toEqual({ input: 1, output: 5 });
    expect(priceFor(undefined)).toEqual({ input: 4, output: 20 });
  });

  it('charges cache reads and writes at their rates', () => {
    const t = eventCost(
      ev({
        inputTokens: 1_000_000,
        cacheReadTokens: 800_000,
        cacheWriteTokens: 100_000,
        outputTokens: 10_000,
        model: 'claude-opus-5-5',
      }),
    );
    // fresh 100k * $4 + write 100k * $5 + read 800k * $0.4 + output 10k * $20, per million
    expect(t.cost).toBeCloseTo(0.4 + 0.5 + 0.32 + 0.2, 6);
    expect(t.tokens).toBe(1_010_000);
  });

  it('sums per agent and office', () => {
    const a = { events: [ev({ inputTokens: 1000, outputTokens: 100 }), ev(undefined)] };
    expect(agentTotals(a).tokens).toBe(1100);
    expect(officeTotals({ a, b: a }).tokens).toBe(2200);
  });

  it('formats dollars', () => {
    expect([0.042, 1.2, 12.4].map(formatCost)).toEqual(['$0.04', '$1.20', '$12']);
  });
});
