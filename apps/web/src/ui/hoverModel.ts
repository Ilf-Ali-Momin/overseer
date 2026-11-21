import { type AgentEvent, type RiskLevel, type VisualState, resolveState } from '@overseer/shared';
import type { OfficeAgent } from '@/state/agents';

/** Everything the HoverCard shows for one agent. Pure so it can be unit tested. */
export interface HoverInfo {
  name: string;
  project: string;
  state: VisualState;
  /** Current or latest tool name, if any. */
  tool?: string;
  /** Short summary of the latest activity. */
  summary?: string;
  /** Seconds in the current state. */
  stateSeconds: number;
  toolCount: number;
  tokens: number;
  /** Highest risk level among recent events, when not none. */
  risk?: RiskLevel;
  isSubagent: boolean;
}

const RISK_ORDER: readonly RiskLevel[] = ['none', 'low', 'medium', 'high'];
/** Recent events considered for the risk badge. */
const RISK_WINDOW = 20;

/** Readable agent name: session title, else a short id (`a1b2c3d4` or `a1b2c3d4 › sub`). */
export function agentName(agent: Pick<OfficeAgent, 'id' | 'title'>): string {
  if (agent.title) return agent.title;
  const [session, sub] = agent.id.split(':');
  // Only random ids (UUIDs, hex) are shortened; readable ids like `demo-session` stay whole.
  const cut = (part: string, n: number) =>
    /^[0-9a-f-]{12,}$/i.test(part) ? part.slice(0, n) : part;
  const short = cut(session ?? agent.id, 8);
  return sub ? `${short} › ${cut(sub, 6)}` : short;
}

function latestActivity(events: readonly AgentEvent[]): Pick<HoverInfo, 'tool' | 'summary'> {
  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i]!;
    if (ev.tool) return { tool: ev.tool.name, summary: ev.tool.summary };
    if (ev.text) return { summary: ev.text };
  }
  return {};
}

export function hoverInfo(agent: OfficeAgent, now: number): HoverInfo {
  const { events } = agent;
  let toolCount = 0;
  let tokens = 0;
  for (const ev of events) {
    if (ev.kind === 'tool_start') toolCount++;
    tokens += (ev.usage?.inputTokens ?? 0) + (ev.usage?.outputTokens ?? 0);
  }
  let risk = 0;
  for (const ev of events.slice(-RISK_WINDOW)) {
    if (ev.risk) risk = Math.max(risk, RISK_ORDER.indexOf(ev.risk.level));
  }
  const info: HoverInfo = {
    name: agentName(agent),
    project: agent.project,
    state: resolveState(agent.machine, now),
    ...latestActivity(events),
    stateSeconds: Math.max(0, Math.floor((now - agent.machine.since) / 1000)),
    toolCount,
    tokens,
    isSubagent: agent.id.includes(':'),
  };
  if (risk > 0) info.risk = RISK_ORDER[risk];
  return info;
}

/** `42s`, `3m 05s`, `1h 02m`. */
export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m ${String(seconds % 60).padStart(2, '0')}s`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}

/** `950`, `12.3k`, `1.2M`. */
export function formatTokens(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}
