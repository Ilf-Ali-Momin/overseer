import type { AgentEvent } from '@overseer/shared';
import type { OfficeAgent } from '@/state/agents';

/**
 * Token totals and an estimated cost. Prices are list prices per million tokens by model family
 * (cache reads ~0.1x input, cache writes ~1.25x input); always shown as an estimate.
 */

interface Price {
  input: number;
  output: number;
}

/** First matching prefix wins. */
const PRICES: readonly [string, Price][] = [
  ['claude-fable-5-2', { input: 8, output: 40 }],
  ['claude-fable', { input: 10, output: 50 }],
  ['claude-mythos-5-2', { input: 8, output: 40 }],
  ['claude-mythos', { input: 10, output: 50 }],
  ['claude-opus-5-5', { input: 4, output: 20 }],
  ['claude-opus', { input: 5, output: 25 }],
  ['claude-sonnet-5', { input: 2, output: 10 }],
  ['claude-sonnet', { input: 3, output: 15 }],
  ['claude-haiku-5-5', { input: 0.1, output: 0.5 }],
  ['claude-haiku', { input: 1, output: 5 }],
];
/** Used when the model is unknown. */
const DEFAULT_PRICE: Price = { input: 4, output: 20 };

export function priceFor(model: string | undefined): Price {
  if (!model) return DEFAULT_PRICE;
  return PRICES.find(([prefix]) => model.startsWith(prefix))?.[1] ?? DEFAULT_PRICE;
}

export interface Totals {
  tokens: number;
  /** Estimated US dollars. */
  cost: number;
}

export function eventCost(ev: AgentEvent): Totals {
  const u = ev.usage;
  if (!u) return { tokens: 0, cost: 0 };
  const input = u.inputTokens ?? 0;
  const output = u.outputTokens ?? 0;
  const read = u.cacheReadTokens ?? 0;
  const write = u.cacheWriteTokens ?? 0;
  const fresh = Math.max(0, input - read - write);
  const p = priceFor(u.model);
  const cost =
    (fresh * p.input + write * p.input * 1.25 + read * p.input * 0.1 + output * p.output) / 1e6;
  return { tokens: input + output, cost };
}

export function agentTotals(agent: Pick<OfficeAgent, 'events'>): Totals {
  let tokens = 0;
  let cost = 0;
  for (const ev of agent.events) {
    const t = eventCost(ev);
    tokens += t.tokens;
    cost += t.cost;
  }
  return { tokens, cost };
}

export function officeTotals(
  agents: Readonly<Record<string, Pick<OfficeAgent, 'events'>>>,
): Totals {
  let tokens = 0;
  let cost = 0;
  for (const a of Object.values(agents)) {
    const t = agentTotals(a);
    tokens += t.tokens;
    cost += t.cost;
  }
  return { tokens, cost };
}

/** `$0.04`, `$1.20`, `$12`. */
export function formatCost(usd: number): string {
  if (usd < 10) return `$${usd.toFixed(2)}`;
  return `$${Math.round(usd)}`;
}
