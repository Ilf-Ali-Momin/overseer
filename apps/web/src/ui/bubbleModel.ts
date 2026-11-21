import { type VisualState, truncate } from '@overseer/shared';
import type { OfficeAgent } from '@/state/agents';

export const BUBBLE_MAX = 60;

/** States that show a thought bubble. */
export function showsBubble(state: VisualState): boolean {
  return state === 'thinking' || state === 'delegating';
}

/** Short bubble text: the latest message/thinking/subagent text, else an ellipsis. */
export function bubbleText(agent: Pick<OfficeAgent, 'events'>): string {
  for (let i = agent.events.length - 1; i >= 0; i--) {
    const ev = agent.events[i]!;
    if (ev.kind === 'tool_start' || ev.kind === 'tool_end') {
      // Delegating: the Agent tool summary is the subagent's task description.
      if (ev.tool && (ev.tool.name === 'Agent' || ev.tool.name === 'Task')) {
        return truncate(ev.tool.summary, BUBBLE_MAX);
      }
      break;
    }
    if (ev.text) return truncate(ev.text, BUBBLE_MAX);
  }
  return '…';
}
