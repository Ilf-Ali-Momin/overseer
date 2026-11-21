import { createHash } from 'node:crypto';
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import type { AgentEvent, RiskAssessment, RiskLevel } from '@overseer/shared';
import { redact } from './redact';

/**
 * Optional LLM verdict for medium and high risk tool calls (OVERSEER_LLM=1). Only the tool name,
 * the redacted one-line summary and the rule reasons are sent, never file contents. Results are
 * cached by a hash of that input; any failure or timeout keeps the rules result unchanged.
 */

export const DEFAULT_MODEL = 'claude-haiku-5-5';
export const LLM_TIMEOUT_MS = 3000;

const ORDER: readonly RiskLevel[] = ['none', 'low', 'medium', 'high'];

export const VerdictSchema = z.object({
  verdict: z.string(),
  level: z.enum(['low', 'medium', 'high']),
});
export type Verdict = z.infer<typeof VerdictSchema>;

export interface VerdictRequest {
  tool: string;
  summary: string;
  reasons: string[];
}

/** Sends one redacted request and returns the parsed verdict, or null. Injected in tests. */
export type VerdictCaller = (req: VerdictRequest) => Promise<Verdict | null>;

const SYSTEM =
  'You review one tool call made by an AI coding agent on a developer machine. ' +
  'Secrets and personal data in it are already masked. Give a one-line plain-English verdict ' +
  '(at most 120 characters) saying what the call does and whether it looks dangerous, and a risk ' +
  'level: low, medium or high.';

/** Default caller: Claude via the Anthropic SDK, structured JSON output, no retries. */
export function anthropicCaller(
  model = DEFAULT_MODEL,
  timeoutMs = LLM_TIMEOUT_MS,
  client: Anthropic = new Anthropic({ maxRetries: 0, timeout: timeoutMs }),
): VerdictCaller {
  return async (req) => {
    const response = await client.messages.parse(
      {
        model,
        max_tokens: 2000,
        output_config: { effort: 'low', format: zodOutputFormat(VerdictSchema) },
        system: SYSTEM,
        messages: [
          {
            role: 'user',
            content:
              `Tool: ${req.tool}\nCall: ${req.summary}\n` +
              `Rule findings: ${req.reasons.join('; ') || 'none'}`,
          },
        ],
      },
      { timeout: timeoutMs },
    );
    if (response.stop_reason === 'refusal') return null;
    return response.parsed_output ?? null;
  };
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(null), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      () => {
        clearTimeout(t);
        resolve(null);
      },
    );
  });
}

export interface RiskJudge {
  /** Return the event with `risk.verdict` added (and level raised one step at most). */
  judge: (ev: AgentEvent) => Promise<AgentEvent>;
  cacheSize: () => number;
}

export function createRiskJudge(
  call: VerdictCaller,
  opts: { timeoutMs?: number; home?: string; maxCache?: number } = {},
): RiskJudge {
  const timeoutMs = opts.timeoutMs ?? LLM_TIMEOUT_MS;
  const maxCache = opts.maxCache ?? 500;
  const cache = new Map<string, Verdict | null>();

  const judge = async (ev: AgentEvent): Promise<AgentEvent> => {
    const risk = ev.risk;
    if (!ev.tool || ev.kind !== 'tool_start' || !risk) return ev;
    if (risk.level !== 'medium' && risk.level !== 'high') return ev;
    // Summaries are already redacted by the normalizer; redact again so this module is safe alone.
    const req: VerdictRequest = {
      tool: ev.tool.name,
      summary: redact(ev.tool.summary, opts.home),
      reasons: risk.reasons,
    };
    const key = createHash('sha256').update(JSON.stringify(req)).digest('hex');
    let verdict = cache.get(key);
    if (verdict === undefined) {
      verdict = await withTimeout(call(req), timeoutMs);
      // Failures are not cached so a later call can succeed.
      if (verdict) {
        if (cache.size >= maxCache) cache.delete(cache.keys().next().value!);
        cache.set(key, verdict);
      }
    }
    if (!verdict) return ev;
    return { ...ev, risk: mergeVerdict(risk, verdict) };
  };

  return { judge, cacheSize: () => cache.size };
}

/** Rules stay authoritative: the LLM adds a verdict and may raise the level by one step, never lower it. */
export function mergeVerdict(rules: RiskAssessment, v: Verdict): RiskAssessment {
  const r = ORDER.indexOf(rules.level);
  const l = ORDER.indexOf(v.level);
  const level = ORDER[Math.min(Math.max(r, l), r + 1)]!;
  const verdict = v.verdict.replace(/\s+/g, ' ').trim().slice(0, 140);
  return { ...rules, level, ...(verdict ? { verdict } : {}) };
}

/** Judge a batch in parallel, keeping order. */
export async function judgeAll(
  judge: RiskJudge | null,
  events: AgentEvent[],
): Promise<AgentEvent[]> {
  if (!judge) return events;
  return Promise.all(events.map((ev) => judge.judge(ev)));
}

/** The judge when `OVERSEER_LLM=1` (model override: `OVERSEER_LLM_MODEL`), else null. */
export function riskJudgeFromEnv(
  onError: (err: unknown) => void,
  env: NodeJS.ProcessEnv = process.env,
): RiskJudge | null {
  if (env.OVERSEER_LLM !== '1') return null;
  try {
    const model = env.OVERSEER_LLM_MODEL || DEFAULT_MODEL;
    const judge = createRiskJudge(anthropicCaller(model));
    console.log(`[overseer-bridge] LLM risk verdicts on (${model}), redacted input only`);
    return judge;
  } catch (err) {
    onError(err);
    console.log('[overseer-bridge] LLM risk verdicts off: no Anthropic credentials');
    return null;
  }
}
