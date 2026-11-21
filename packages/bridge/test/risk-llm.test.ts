import type { AgentEvent } from '@overseer/shared';
import { describe, expect, it } from 'vitest';
import {
  type VerdictCaller,
  type VerdictRequest,
  createRiskJudge,
  judgeAll,
  mergeVerdict,
} from '../src/risk/llm';

const ev = (summary: string, level: 'low' | 'medium' | 'high' | null, id = 'e1'): AgentEvent => ({
  id,
  ts: 1,
  sessionId: 's',
  agentId: 's',
  project: 'p',
  kind: 'tool_start',
  tool: { name: 'Bash', useId: id, summary },
  ...(level ? { risk: { level, reasons: ['rule reason'] } } : {}),
});

function fakeCaller(result: Awaited<ReturnType<VerdictCaller>> | Error, delayMs = 0) {
  const calls: VerdictRequest[] = [];
  const call: VerdictCaller = async (req) => {
    calls.push(req);
    await new Promise((r) => setTimeout(r, delayMs));
    if (result instanceof Error) throw result;
    return result;
  };
  return { call, calls };
}

describe('risk judge', () => {
  it('adds a verdict to medium and high events and sends only redacted input', async () => {
    const f = fakeCaller({ verdict: 'Reads the project env file with secrets.', level: 'high' });
    const judge = createRiskJudge(f.call, { home: '/Users/alice' });
    const out = await judge.judge(ev('cat /Users/alice/app/.env API_KEY=abc123', 'high'));
    expect(out.risk).toEqual({
      level: 'high',
      reasons: ['rule reason'],
      verdict: 'Reads the project env file with secrets.',
    });
    expect(f.calls[0]).toEqual({
      tool: 'Bash',
      summary: 'cat ~/app/.env API_KEY=[REDACTED]',
      reasons: ['rule reason'],
    });
  });

  it('skips low risk and events without risk', async () => {
    const f = fakeCaller({ verdict: 'x', level: 'high' });
    const judge = createRiskJudge(f.call);
    const low = ev('ls', 'low');
    expect(await judge.judge(low)).toBe(low);
    expect(await judge.judge(ev('ls', null))).toMatchObject({ id: 'e1' });
    expect(f.calls).toHaveLength(0);
  });

  it('caches by input', async () => {
    const f = fakeCaller({ verdict: 'Network call.', level: 'medium' });
    const judge = createRiskJudge(f.call);
    await judge.judge(ev('curl x', 'medium', 'a'));
    await judge.judge(ev('curl x', 'medium', 'b'));
    expect(f.calls).toHaveLength(1);
    expect(judge.cacheSize()).toBe(1);
  });

  it('falls back to the rules on error, null or timeout', async () => {
    for (const f of [
      fakeCaller(new Error('boom')),
      fakeCaller(null),
      fakeCaller({ verdict: 'late', level: 'high' }, 200),
    ]) {
      const judge = createRiskJudge(f.call, { timeoutMs: 50 });
      const input = ev('curl x', 'medium');
      const out = await judge.judge(input);
      expect(out).toBe(input);
      expect(judge.cacheSize()).toBe(0);
    }
  });

  it('judges a batch in parallel and keeps order', async () => {
    const f = fakeCaller({ verdict: 'v', level: 'medium' }, 20);
    const judge = createRiskJudge(f.call);
    const out = await judgeAll(judge, [
      ev('a', 'medium', '1'),
      ev('b', null, '2'),
      ev('c', 'high', '3'),
    ]);
    expect(out.map((e) => e.id)).toEqual(['1', '2', '3']);
    expect(out[0]!.risk?.verdict).toBe('v');
    expect(await judgeAll(null, [ev('a', 'medium')])).toHaveLength(1);
  });
});

describe('mergeVerdict', () => {
  const rules = { level: 'medium' as const, reasons: ['r'] };
  it('never lowers the rules level and raises by one step at most', () => {
    expect(mergeVerdict(rules, { verdict: 'fine', level: 'low' }).level).toBe('medium');
    expect(mergeVerdict(rules, { verdict: 'bad', level: 'high' }).level).toBe('high');
    expect(
      mergeVerdict({ level: 'low', reasons: [] }, { verdict: 'bad', level: 'high' }).level,
    ).toBe('medium');
  });
  it('keeps the verdict to one short line', () => {
    expect(mergeVerdict(rules, { verdict: ' a\n b ', level: 'medium' }).verdict).toBe('a b');
  });
});

describe('riskJudgeFromEnv', () => {
  it('is off unless OVERSEER_LLM=1', async () => {
    const { riskJudgeFromEnv } = await import('../src/risk/llm');
    expect(riskJudgeFromEnv(() => {}, {})).toBeNull();
    expect(riskJudgeFromEnv(() => {}, { OVERSEER_LLM: '0' })).toBeNull();
  });
});
