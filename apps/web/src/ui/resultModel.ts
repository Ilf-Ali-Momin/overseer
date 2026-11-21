import type { OfficeAgent } from '@/state/agents';

/** How long the parent shows the "result received" reaction. */
export const RESULT_MS = 2500;
const SUBAGENT_TOOLS = new Set(['Agent', 'Task']);

/**
 * When a subagent's result came back in the last RESULT_MS (the parent's Agent/Task tool_end),
 * return the subagent's task text; otherwise null.
 */
export function receivedResult(agent: Pick<OfficeAgent, 'events'>, now: number): string | null {
  const { events } = agent;
  for (let i = events.length - 1; i >= 0 && i >= events.length - 10; i--) {
    const ev = events[i]!;
    if (now - ev.ts > RESULT_MS) return null;
    if (ev.kind === 'tool_end' && ev.tool && SUBAGENT_TOOLS.has(ev.tool.name) && !ev.tool.isError) {
      return ev.tool.summary;
    }
  }
  return null;
}
