import { describe, expect, it } from 'vitest';
import { AgentEventSchema } from '@overseer/shared';
import { SessionNormalizer, agentIdFor } from '../src/normalizer';
import { parseLine } from '../src/parser';
import { ERRORS, NORMAL, SUBAGENT_ID, WITH_SUBAGENT, normalizeFixture } from './helpers';

const kinds = (events: { kind: string }[]) => events.map((e) => e.kind);

describe('SessionNormalizer: normal session', () => {
  const { events, normalizer } = normalizeFixture(`${NORMAL}.jsonl`, { sessionId: NORMAL });

  it('produces schema-valid events with unique ids', () => {
    for (const e of events) expect(AgentEventSchema.safeParse(e).success).toBe(true);
    expect(new Set(events.map((e) => e.id)).size).toBe(events.length);
  });

  it('emits the expected sequence', () => {
    expect(kinds(events)).toEqual([
      'session_start',
      'thinking',
      'message',
      'tool_start',
      'tool_end',
      'tool_start',
      'tool_end',
      'tool_start',
      'tool_end',
      'tool_start',
      'tool_end',
      'message',
      'waiting_for_user',
    ]);
  });

  it('reads project name from cwd and title from custom-title', () => {
    expect(normalizer.project).toBe('demo-app');
    expect(normalizer.title).toBe('Add dark mode toggle');
    expect(events.every((e) => e.project === 'demo-app')).toBe(true);
  });

  it('summarizes tools with relative paths and commands', () => {
    const starts = events.filter((e) => e.kind === 'tool_start').map((e) => e.tool);
    expect(starts.map((t) => [t?.name, t?.summary])).toEqual([
      ['Read', 'src/settings.tsx'],
      ['Grep', '"theme" in src'],
      ['Edit', 'src/settings.tsx'],
      ['Bash', 'pnpm test'],
    ]);
  });

  it('links tool_end to the tool name and detects passing tests', () => {
    const bashEnd = events.find((e) => e.kind === 'tool_end' && e.tool?.name === 'Bash');
    expect(bashEnd?.tool?.useId).toBe('toolu_n_bash');
    expect(bashEnd?.tool?.isError).toBeUndefined();
    expect(bashEnd?.text).toBe('tests passed');
  });

  it('counts usage once per API message id', () => {
    const withUsage = events.filter((e) => e.usage);
    // msg_n1 (3 lines) + msg_n2..msg_n5 = 5 messages
    expect(withUsage).toHaveLength(5);
    expect(withUsage[0]?.usage).toEqual({
      inputTokens: 21203,
      outputTokens: 40,
      cacheReadTokens: 20000,
      cacheWriteTokens: 1200,
      model: 'claude-opus-5-5',
    });
  });

  it('uses transcript timestamps', () => {
    expect(events[0]?.ts).toBe(Date.parse('2026-11-20T10:00:02.000Z'));
    const sorted = [...events].sort((a, b) => a.ts - b.ts);
    expect(sorted.map((e) => e.id)).toEqual(events.map((e) => e.id));
  });
});

describe('SessionNormalizer: subagent', () => {
  const parent = normalizeFixture(`${WITH_SUBAGENT}.jsonl`, { sessionId: WITH_SUBAGENT });
  const child = normalizeFixture(`${WITH_SUBAGENT}/subagents/agent-${SUBAGENT_ID}.jsonl`, {
    sessionId: WITH_SUBAGENT,
    subagentId: SUBAGENT_ID,
  });

  it('parent shows an Agent tool call', () => {
    const start = parent.events.find((e) => e.kind === 'tool_start');
    expect(start?.tool).toMatchObject({
      name: 'Agent',
      summary: 'Scan TODOs',
      useId: 'toolu_p_agent',
    });
  });

  it('child gets a derived agent id, a parent id and spawn/end events', () => {
    const id = agentIdFor(WITH_SUBAGENT, SUBAGENT_ID);
    expect(child.events.every((e) => e.agentId === id)).toBe(true);
    expect(child.events.every((e) => e.parentAgentId === WITH_SUBAGENT)).toBe(true);
    expect(child.events[0]?.kind).toBe('subagent_spawn');
    expect(child.events.at(-1)?.kind).toBe('subagent_end');
    expect(kinds(child.events)).not.toContain('waiting_for_user');
  });
});

describe('SessionNormalizer: errors session', () => {
  const { events } = normalizeFixture(`${ERRORS}.jsonl`, { sessionId: ERRORS });

  it('marks failed tools and detects failing tests', () => {
    const ends = events.filter((e) => e.kind === 'tool_end');
    expect(ends.map((e) => e.tool?.isError)).toEqual([true, true]);
    expect(ends[0]?.text).toBe('tests failed');
  });

  it('turns api errors into error events', () => {
    const errors = events.filter((e) => e.kind === 'error');
    expect(errors).toHaveLength(2);
  });

  it('emits waiting_for_user for AskUserQuestion', () => {
    const tail = kinds(events).slice(-2);
    expect(tail).toEqual(['tool_start', 'waiting_for_user']);
  });

  it('ignores unknown line types and noise', () => {
    expect(events.every((e) => AgentEventSchema.safeParse(e).success)).toBe(true);
  });
});

describe('SessionNormalizer: edge cases', () => {
  it('handles tool_end for an unknown tool_use id', () => {
    const n = new SessionNormalizer({ sessionId: 's' });
    const line = parseLine(
      JSON.stringify({
        type: 'user',
        uuid: 'u9',
        timestamp: '2026-11-20T10:00:00.000Z',
        message: { content: [{ type: 'tool_result', tool_use_id: 'missing', content: 'x' }] },
      }),
    );
    const evs = line ? n.push(line) : [];
    expect(evs.map((e) => e.kind)).toEqual(['session_start', 'tool_end']);
    expect(evs[1]?.tool?.name).toBe('unknown');
  });

  it('skips lines without uuid', () => {
    const n = new SessionNormalizer({ sessionId: 's' });
    const line = parseLine(
      '{"type":"assistant","message":{"content":[{"type":"text","text":"x"}]}}',
    );
    expect(line ? n.push(line) : null).toEqual([]);
  });

  it('truncates long text to the summary limit', () => {
    const n = new SessionNormalizer({ sessionId: 's' });
    const line = parseLine(
      JSON.stringify({
        type: 'assistant',
        uuid: 'u1',
        message: { content: [{ type: 'text', text: 'z'.repeat(1000) }] },
      }),
    );
    const evs = line ? n.push(line) : [];
    expect(evs[1]?.text?.length).toBe(140);
  });
});

describe('SessionNormalizer: risk and redaction', () => {
  const toolLine = (command: string, id = 'tu1') =>
    parseLine(
      JSON.stringify({
        type: 'assistant',
        uuid: `u-${id}`,
        cwd: '/Users/dev/demo-app',
        message: { content: [{ type: 'tool_use', id, name: 'Bash', input: { command } }] },
      }),
    );

  it('attaches risk to tool_start events', () => {
    const n = new SessionNormalizer({ sessionId: 's' });
    const evs = n.push(toolLine('cat .env')!);
    const start = evs.find((e) => e.kind === 'tool_start');
    expect(start?.risk).toEqual({ level: 'high', reasons: ['touches a secret file (.env)'] });
    expect(AgentEventSchema.safeParse(start).success).toBe(true);
  });

  it('redacts tool summaries and leaves safe calls without risk', () => {
    const n = new SessionNormalizer({ sessionId: 's' });
    const evs = n.push(toolLine('API_KEY=sk-ant-abcdef0123456789xyz pnpm dev', 'tu2')!);
    const start = evs.find((e) => e.kind === 'tool_start');
    expect(start?.tool?.summary).toBe('API_KEY=[REDACTED] pnpm dev');
    expect(start?.tool?.summary).not.toContain('sk-ant');
  });

  it('redacts message text', () => {
    const n = new SessionNormalizer({ sessionId: 's' });
    const line = parseLine(
      JSON.stringify({
        type: 'assistant',
        uuid: 'u9',
        message: { content: [{ type: 'text', text: 'Mail alice@example.com about it' }] },
      }),
    );
    const evs = line ? n.push(line) : [];
    expect(evs.find((e) => e.kind === 'message')?.text).toBe('Mail [EMAIL] about it');
  });
});

describe('subagent meta', () => {
  it('parses .meta.json defensively', async () => {
    const { parseSubagentMeta } = await import('../src/normalizer');
    expect(
      parseSubagentMeta('{"agentType":"Explore","description":"Scan","toolUseId":"toolu_1"}'),
    ).toEqual({ toolUseId: 'toolu_1', description: 'Scan', agentType: 'Explore' });
    expect(parseSubagentMeta('{"description":"x"}')).toBeNull();
    expect(parseSubagentMeta('not json')).toBeNull();
  });

  it('subagent_spawn without meta has no tool link', () => {
    const { events } = normalizeFixture(`${WITH_SUBAGENT}/subagents/agent-${SUBAGENT_ID}.jsonl`, {
      sessionId: WITH_SUBAGENT,
      subagentId: SUBAGENT_ID,
    });
    expect(events[0]?.kind).toBe('subagent_spawn');
    expect(events[0]?.tool).toBeUndefined();
  });
});

describe('usage details', () => {
  it('keeps the cache split and the model id', () => {
    const n = new SessionNormalizer({ sessionId: 's' });
    const line = parseLine(
      JSON.stringify({
        type: 'assistant',
        uuid: 'u-usage',
        message: {
          id: 'msg_1',
          model: 'claude-opus-5-5',
          content: [{ type: 'text', text: 'hi' }],
          usage: {
            input_tokens: 10,
            cache_read_input_tokens: 900,
            cache_creation_input_tokens: 90,
            output_tokens: 50,
          },
        },
      }),
    );
    const usage = (line ? n.push(line) : []).find((e) => e.usage)?.usage;
    expect(usage).toEqual({
      inputTokens: 1000,
      outputTokens: 50,
      cacheReadTokens: 900,
      cacheWriteTokens: 90,
      model: 'claude-opus-5-5',
    });
  });
});
