import { describe, expect, it } from 'vitest';
import { formatEvent } from '../src/log';

const base = {
  id: 'x',
  ts: Date.parse('2026-11-20T10:00:05.000Z'),
  sessionId: '11111111-aaaa',
  agentId: '11111111-aaaa',
  project: 'demo-app',
};

describe('formatEvent', () => {
  it('formats a tool call', () => {
    const line = formatEvent({
      ...base,
      kind: 'tool_end',
      tool: { name: 'Bash', useId: 't', summary: 'pnpm test', isError: true },
      text: 'tests failed',
    });
    expect(line).toContain(new Date(base.ts).toTimeString().slice(0, 8));
    expect(line).toContain('11111111');
    expect(line).toContain('tool<');
    expect(line).toContain('Bash pnpm test [error]  (tests failed)');
  });

  it('shortens subagent ids and shows text and tokens', () => {
    const line = formatEvent({
      ...base,
      agentId: '11111111-aaaa:a0c0ffee0000',
      kind: 'message',
      text: 'hello',
      usage: { outputTokens: 12 },
    });
    expect(line).toContain('11111111:a0c0ff');
    expect(line).toContain('say');
    expect(line).toContain('hello  +12 tok');
  });
});

describe('formatEvent risk', () => {
  it('shows medium and high risk', () => {
    const line = formatEvent({
      id: 'e',
      ts: 0,
      sessionId: 's',
      agentId: 's',
      project: 'p',
      kind: 'tool_start',
      tool: { name: 'Bash', useId: 'u', summary: 'cat .env' },
      risk: { level: 'high', reasons: ['touches a secret file (.env)'] },
    });
    expect(line).toContain('[HIGH: touches a secret file (.env)]');
  });
});
