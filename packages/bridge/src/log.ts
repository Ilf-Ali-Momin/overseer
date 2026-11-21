import type { AgentEvent } from '@overseer/shared';

const KIND_LABEL: Record<AgentEvent['kind'], string> = {
  session_start: 'START',
  session_end: 'END',
  thinking: 'think',
  message: 'say',
  tool_start: 'tool>',
  tool_end: 'tool<',
  subagent_spawn: 'SPAWN',
  subagent_end: 'DONE',
  waiting_for_user: 'WAIT',
  error: 'ERROR',
};

function shortId(agentId: string): string {
  const [session, sub] = agentId.split(':');
  return sub ? `${(session ?? '').slice(0, 8)}:${sub.slice(0, 6)}` : agentId.slice(0, 8);
}

function time(ts: number): string {
  // Local wall-clock time, HH:MM:SS.
  return new Date(ts).toTimeString().slice(0, 8);
}

/** One human readable line per event, for `--log` mode. */
export function formatEvent(ev: AgentEvent): string {
  const parts = [time(ev.ts), shortId(ev.agentId).padEnd(15), ev.project.padEnd(16).slice(0, 16)];
  parts.push(KIND_LABEL[ev.kind].padEnd(5));
  if (ev.tool) {
    let tool = `${ev.tool.name} ${ev.tool.summary}`;
    if (ev.tool.isError) tool += ' [error]';
    parts.push(tool);
  }
  if (ev.text) parts.push(ev.tool ? `(${ev.text})` : ev.text);
  if (ev.risk && (ev.risk.level === 'medium' || ev.risk.level === 'high')) {
    parts.push(`[${ev.risk.level.toUpperCase()}: ${ev.risk.reasons.join('; ')}]`);
  }
  if (ev.usage?.outputTokens) parts.push(`+${ev.usage.outputTokens} tok`);
  return parts.join('  ');
}
