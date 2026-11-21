import { DemoFileSchema } from '@overseer/shared';
import { describe, expect, it } from 'vitest';
import { buildDemo, readSession } from '../src/record';
import { FIXTURES, SUBAGENT_ID, WITH_SUBAGENT } from './helpers';

describe('record', () => {
  const inputs = readSession(FIXTURES, WITH_SUBAGENT);
  const demo = buildDemo(inputs, { sessionId: WITH_SUBAGENT, name: 'test', title: 'Demo' });

  it('reads the main transcript and subagents with meta', () => {
    expect(inputs).toHaveLength(2);
    expect(inputs[1]).toMatchObject({ subagentId: SUBAGENT_ID });
    expect(inputs[1]?.meta).toContain('toolUseId');
  });

  it('builds a valid demo file with relative, sorted times', () => {
    expect(DemoFileSchema.safeParse(demo).success).toBe(true);
    expect(demo.events[0]!.ts).toBe(0);
    for (let i = 1; i < demo.events.length; i++) {
      expect(demo.events[i]!.ts).toBeGreaterThanOrEqual(demo.events[i - 1]!.ts);
    }
    expect(demo.durationMs).toBe(demo.events.at(-1)!.ts);
  });

  it('replaces ids and project names', () => {
    const text = JSON.stringify(demo);
    expect(text).not.toContain(WITH_SUBAGENT);
    expect(text).not.toContain(SUBAGENT_ID);
    expect(text).not.toContain('toolu_');
    expect(new Set(demo.events.map((e) => e.project))).toEqual(new Set(['demo-app']));
    expect(new Set(demo.events.map((e) => e.agentId))).toEqual(
      new Set(['demo-session', 'demo-session:agent-1']),
    );
  });

  it('keeps the subagent link to the parent Agent call', () => {
    const spawn = demo.events.find((e) => e.kind === 'subagent_spawn')!;
    expect(spawn.parentAgentId).toBe('demo-session');
    const call = demo.events.find(
      (e) => e.kind === 'tool_start' && e.tool?.name === 'Agent' && e.agentId === 'demo-session',
    )!;
    expect(spawn.tool?.useId).toBe(call.tool?.useId);
  });

  it('fails clearly for an unknown session', () => {
    expect(() => readSession(FIXTURES, '99999999-9999-4999-8999-999999999999')).toThrow(
      /not found/,
    );
  });
});
