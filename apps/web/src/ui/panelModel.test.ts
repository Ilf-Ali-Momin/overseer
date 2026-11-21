import type { AgentEvent } from '@overseer/shared';
import { describe, expect, it } from 'vitest';
import { clockTime, filesTouched, riskEvents, timeline } from './panelModel';

let n = 0;
const e = (kind: AgentEvent['kind'], extra: Partial<AgentEvent> = {}): AgentEvent => ({
  id: `e${++n}`,
  ts: n * 1000,
  sessionId: 's',
  agentId: 's',
  project: 'demo',
  kind,
  ...extra,
});
const tool = (name: string, summary: string, extra: Partial<AgentEvent> = {}) =>
  e('tool_start', { tool: { name, useId: `u${n}`, summary }, ...extra });

describe('panel model', () => {
  it('timeline is newest first and capped', () => {
    const evs = [e('session_start'), tool('Read', 'a.ts'), e('error', { text: 'boom' })];
    const rows = timeline(evs, 2);
    expect(rows.map((r) => r.label)).toEqual(['error', 'tool']);
    expect(rows[0]).toMatchObject({ summary: 'boom', error: true });
    expect(rows[1]).toMatchObject({ tool: 'Read', summary: 'a.ts', error: false });
  });

  it('lists files touched, most recent first', () => {
    const files = filesTouched([
      tool('Read', 'src/a.ts'),
      tool('Edit', 'src/b.ts'),
      tool('Bash', 'pnpm test'),
      tool('Edit', 'src/a.ts'),
      tool('Write', 'Write'),
      e('tool_end', { tool: { name: 'Edit', useId: 'x', summary: 'src/c.ts' } }),
    ]);
    expect(files.map((f) => [f.path, f.reads, f.edits])).toEqual([
      ['src/a.ts', 1, 1],
      ['src/b.ts', 0, 1],
    ]);
  });

  it('filters risk events', () => {
    const evs = [
      tool('Bash', 'curl x', { risk: { level: 'high', reasons: ['network'] } }),
      tool('Read', 'a.ts', { risk: { level: 'none', reasons: [] } }),
    ];
    expect(riskEvents(evs).map((r) => r.risk)).toEqual(['high']);
  });

  it('formats clock time', () => {
    expect(clockTime(new Date(2026, 0, 1, 9, 5, 7).getTime())).toBe('09:05:07');
  });
});

describe('short labels', () => {
  it('shortens paths and MCP tool names', async () => {
    const { shortPath, shortTool } = await import('./panelModel');
    expect(shortPath('/private/tmp/x/scratchpad/hover.png')).toBe('…/scratchpad/hover.png');
    expect(shortPath('src/a.ts')).toBe('src/a.ts');
    expect(shortTool('mcp__ccd_turn__update_plan')).toBe('update_plan');
    expect(shortTool('Bash')).toBe('Bash');
  });
});
