import { describe, expect, it } from 'vitest';
import type { AgentEvent, AgentEventKind } from '../src/events';
import {
  IDLE_AFTER_MS,
  LEAVE_AFTER_MS,
  REACTION_MS,
  STATE_ANIMATION,
  TOOL_STATE,
  VISUAL_STATES,
  initialMachine,
  reduceEvent,
  resolveState,
  toolState,
  type VisualMachine,
  type VisualState,
} from '../src/states';

const T0 = 1_700_000_000_000;
let n = 0;

function ev(kind: AgentEventKind, extra: Partial<AgentEvent> = {}, ts = T0 + 1000): AgentEvent {
  n += 1;
  return { id: `e${n}`, ts, sessionId: 's', agentId: 's', project: 'p', kind, ...extra };
}

function tool(name: string, isError?: boolean): AgentEvent['tool'] {
  return { name, useId: `t${n}`, summary: name, ...(isError === undefined ? {} : { isError }) };
}

function run(events: AgentEvent[], start: VisualMachine = initialMachine(T0)): VisualMachine {
  return events.reduce(reduceEvent, start);
}

describe('toolState', () => {
  it.each([
    ['Read', 'reading'],
    ['Grep', 'reading'],
    ['Glob', 'reading'],
    ['LS', 'reading'],
    ['Edit', 'typing'],
    ['Write', 'typing'],
    ['MultiEdit', 'typing'],
    ['NotebookEdit', 'typing'],
    ['Bash', 'terminal'],
    ['WebFetch', 'browsing'],
    ['WebSearch', 'browsing'],
    ['Task', 'delegating'],
    ['Agent', 'delegating'],
    ['AskUserQuestion', 'waiting'],
  ] as const)('%s -> %s', (name, state) => {
    expect(toolState(name)).toBe(state);
  });

  it('maps unknown tools to typing, including prototype keys', () => {
    expect(toolState('mcp__github__create_issue')).toBe('typing');
    expect(toolState('toString')).toBe('typing');
    expect(toolState('')).toBe('typing');
  });

  it('only maps to real visual states', () => {
    for (const s of Object.values(TOOL_STATE)) expect(VISUAL_STATES).toContain(s);
  });
});

describe('reduceEvent', () => {
  const now = T0 + 1000;

  it('starts thinking', () => {
    expect(initialMachine(T0).state).toBe('thinking');
  });

  it.each<[AgentEvent, VisualState]>([
    [ev('session_start'), 'thinking'],
    [ev('subagent_spawn'), 'thinking'],
    [ev('thinking'), 'thinking'],
    [ev('message', { text: 'hello' }), 'thinking'],
    [ev('tool_start', { tool: tool('Read') }), 'reading'],
    [ev('tool_start', { tool: tool('Edit') }), 'typing'],
    [ev('tool_start', { tool: tool('Bash') }), 'terminal'],
    [ev('tool_start', { tool: tool('WebSearch') }), 'browsing'],
    [ev('tool_start', { tool: tool('Agent') }), 'delegating'],
    [ev('tool_start', { tool: tool('SomethingNew') }), 'typing'],
    [ev('tool_start'), 'typing'],
    [ev('waiting_for_user'), 'waiting'],
    [ev('error', { text: 'overloaded' }), 'frustrated'],
    [ev('tool_end', { tool: tool('Bash', true) }), 'frustrated'],
    [ev('tool_end', { tool: tool('Bash'), text: 'tests failed' }), 'frustrated'],
    [ev('tool_end', { tool: tool('Bash'), text: 'tests passed' }), 'celebrating'],
    [ev('tool_end', { tool: tool('Agent') }), 'thinking'],
    [ev('subagent_end'), 'celebrating'],
    [ev('session_end'), 'leaving'],
  ])('%# %o', (event, state) => {
    expect(resolveState(reduceEvent(initialMachine(T0), event), now)).toBe(state);
  });

  it('keeps the current pose on a normal tool_end but moves the clock', () => {
    const m = run([
      ev('tool_start', { tool: tool('Read') }, T0 + 100),
      ev('tool_end', { tool: tool('Read') }, T0 + 200),
    ]);
    expect(m.state).toBe('reading');
    expect(m.lastEventTs).toBe(T0 + 200);
    expect(m.since).toBe(T0 + 100);
  });

  it('keeps `since` when the same state repeats', () => {
    const m = run([ev('thinking', {}, T0 + 100), ev('thinking', {}, T0 + 900)]);
    expect(m.since).toBe(T0);
  });

  it('leaving is final', () => {
    const m = run([
      ev('session_end', {}, T0 + 100),
      ev('tool_start', { tool: tool('Read') }, T0 + 200),
    ]);
    expect(m.state).toBe('leaving');
  });
});

describe('resolveState timers', () => {
  it('reactions return to the base state after REACTION_MS', () => {
    const m = run([
      ev('tool_start', { tool: tool('Bash') }, T0 + 100),
      ev('tool_end', { tool: tool('Bash', true) }, T0 + 200),
    ]);
    expect(resolveState(m, T0 + 200 + REACTION_MS - 1)).toBe('frustrated');
    expect(resolveState(m, T0 + 200 + REACTION_MS)).toBe('terminal');
  });

  it('a finished subagent celebrates, then leaves', () => {
    const m = run([ev('subagent_end', {}, T0 + 100)]);
    expect(resolveState(m, T0 + 100)).toBe('celebrating');
    expect(resolveState(m, T0 + 100 + REACTION_MS)).toBe('leaving');
  });

  it('goes idle after 45 s without events', () => {
    const m = run([ev('tool_start', { tool: tool('Edit') }, T0 + 100)]);
    expect(resolveState(m, T0 + 100 + IDLE_AFTER_MS - 1)).toBe('typing');
    expect(resolveState(m, T0 + 100 + IDLE_AFTER_MS)).toBe('idle');
  });

  it('waiting does not decay to idle', () => {
    const m = run([ev('waiting_for_user', {}, T0 + 100)]);
    expect(resolveState(m, T0 + 100 + IDLE_AFTER_MS * 3)).toBe('waiting');
  });

  it('leaves after 10 min without events, even while waiting', () => {
    const m = run([ev('waiting_for_user', {}, T0 + 100)]);
    expect(resolveState(m, T0 + 100 + LEAVE_AFTER_MS)).toBe('leaving');
  });

  it('a new event wakes an idle agent', () => {
    const m = run([
      ev('tool_start', { tool: tool('Edit') }, T0),
      ev('tool_start', { tool: tool('Grep') }, T0 + IDLE_AFTER_MS + 5000),
    ]);
    expect(resolveState(m, T0 + IDLE_AFTER_MS + 5001)).toBe('reading');
  });
});

describe('STATE_ANIMATION', () => {
  it('covers every visual state', () => {
    expect(Object.keys(STATE_ANIMATION).sort()).toEqual([...VISUAL_STATES].sort());
  });

  it('sits for desk work and stands for idle, leaving and celebrating', () => {
    for (const s of ['reading', 'typing', 'terminal', 'browsing', 'thinking', 'waiting'] as const) {
      expect(STATE_ANIMATION[s].seated).toBe(true);
    }
    for (const s of ['idle', 'leaving', 'celebrating', 'delegating'] as const) {
      expect(STATE_ANIMATION[s].seated).toBe(false);
    }
    expect(STATE_ANIMATION.leaving.clip).toBe('Walk');
  });
});
