import { type AgentEvent, IDLE_AFTER_MS, VISUAL_STATES, type VisualState } from '@overseer/shared';
import { useAgentsStore } from './agents';

/**
 * Fake agents for development: spawned from the debug panel or `?agents=N`. States are forced by
 * feeding synthetic events through the real reducer, so the state machine is exercised too.
 */

const PROJECT = 'demo';
let counter = 0;
let eventSeq = 0;

function event(
  agentId: string,
  kind: AgentEvent['kind'],
  extra: Partial<AgentEvent> = {},
): AgentEvent {
  eventSeq += 1;
  return {
    id: `${agentId}:e${eventSeq}`,
    ts: Date.now(),
    sessionId: agentId,
    agentId,
    project: PROJECT,
    kind,
    ...extra,
  };
}

const tool = (name: string, summary: string, isError?: boolean): AgentEvent['tool'] => ({
  name,
  useId: `tu${eventSeq}`,
  summary,
  ...(isError === undefined ? {} : { isError }),
});

/** Synthetic event that drives an agent into `state`. */
export function eventForState(agentId: string, state: VisualState): AgentEvent {
  switch (state) {
    case 'reading':
      return event(agentId, 'tool_start', { tool: tool('Read', 'src/app.ts') });
    case 'typing':
      return event(agentId, 'tool_start', { tool: tool('Edit', 'src/app.ts') });
    case 'terminal':
      return event(agentId, 'tool_start', { tool: tool('Bash', 'pnpm test') });
    case 'browsing':
      return event(agentId, 'tool_start', { tool: tool('WebSearch', 'react three fiber docs') });
    case 'delegating':
      return event(agentId, 'tool_start', { tool: tool('Agent', 'explore the codebase') });
    case 'thinking':
      return event(agentId, 'thinking');
    case 'waiting':
      return event(agentId, 'waiting_for_user');
    case 'frustrated':
      return event(agentId, 'tool_end', { tool: tool('Bash', 'pnpm test', true) });
    case 'celebrating':
      return event(agentId, 'tool_end', { tool: tool('Bash', 'pnpm test'), text: 'tests passed' });
    case 'idle':
      // A plain tool_end only moves the clock; dating it 45 s back makes the agent idle right away.
      return {
        ...event(agentId, 'tool_end', { tool: tool('Read', 'src/app.ts') }),
        ts: Date.now() - IDLE_AFTER_MS - 1,
      };
    case 'leaving':
      return event(agentId, 'session_end');
  }
}

export function forceState(agentId: string, state: VisualState): void {
  useAgentsStore.getState().apply(eventForState(agentId, state));
}

/** Spawn up to `n` fake agents (limited by free desks). They walk in and start typing. */
export function spawnFakes(n = 1): string[] {
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    counter += 1;
    const id = `fake-${counter}-${Math.random().toString(36).slice(2, 6)}`;
    if (!useAgentsStore.getState().add(id, PROJECT, Date.now(), true)) break;
    forceState(id, 'typing');
    ids.push(id);
  }
  return ids;
}

export function fakeIds(): string[] {
  return Object.values(useAgentsStore.getState().agents)
    .filter((a) => a.fake)
    .map((a) => a.id);
}

/** All fake agents end their session and walk out. */
export function dismissFakes(): void {
  for (const id of fakeIds()) forceState(id, 'leaving');
}

/** States picked by "randomize": everything except leaving. */
export const RANDOM_STATES: readonly VisualState[] = VISUAL_STATES.filter((s) => s !== 'leaving');

/** Give each fake agent a random new state with probability `p`. */
export function randomizeFakes(p = 0.5, rng: () => number = Math.random): void {
  for (const id of fakeIds()) {
    if (rng() >= p) continue;
    forceState(id, RANDOM_STATES[Math.floor(rng() * RANDOM_STATES.length)]!);
  }
}

let subCounter = 0;

/** A fake agent delegates to a new subagent: parent points, child walks in next to it. */
export function spawnSubagent(parentId: string, task = 'Explore the codebase'): string | null {
  const store = useAgentsStore.getState();
  if (!store.agents[parentId]) return null;
  subCounter += 1;
  const useId = `tu-agent-${subCounter}`;
  const childId = `${parentId}:sub${subCounter}`;
  store.apply(event(parentId, 'tool_start', { tool: { name: 'Agent', useId, summary: task } }));
  if (!store.add(childId, PROJECT, Date.now(), true, parentId)) return null;
  store.apply({
    ...event(childId, 'subagent_spawn', {
      text: task,
      tool: { name: 'Agent', useId, summary: task },
    }),
    sessionId: parentId,
    parentAgentId: parentId,
  });
  forceState(childId, 'reading');
  return childId;
}

/** A fake subagent finishes: it celebrates and leaves, the parent gets the Agent result. */
export function finishSubagent(childId: string): void {
  const store = useAgentsStore.getState();
  const child = store.agents[childId];
  if (!child?.parentAgentId) return;
  store.apply({ ...event(childId, 'subagent_end'), parentAgentId: child.parentAgentId });
  if (child.spawnUseId) {
    store.apply(
      event(child.parentAgentId, 'tool_end', {
        tool: {
          name: 'Agent',
          useId: child.spawnUseId,
          summary: child.events.find((e) => e.kind === 'subagent_spawn')?.text ?? 'subagent',
        },
      }),
    );
  }
}
