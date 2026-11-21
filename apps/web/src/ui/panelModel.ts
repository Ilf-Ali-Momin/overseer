import type { AgentEvent, AgentEventKind, RiskLevel } from '@overseer/shared';

/** Pure helpers for the AgentPanel. */

export const TIMELINE_LIMIT = 50;

export interface TimelineRow {
  id: string;
  ts: number;
  label: string;
  tool?: string;
  summary?: string;
  error: boolean;
  risk?: RiskLevel;
}

const KIND_LABEL: Record<AgentEventKind, string> = {
  session_start: 'started',
  session_end: 'ended',
  thinking: 'thinking',
  message: 'message',
  tool_start: 'tool',
  tool_end: 'done',
  subagent_spawn: 'subagent',
  subagent_end: 'subagent done',
  waiting_for_user: 'waiting',
  error: 'error',
};

/** Latest events, newest first. */
export function timeline(events: readonly AgentEvent[], limit = TIMELINE_LIMIT): TimelineRow[] {
  return events
    .slice(-limit)
    .reverse()
    .map((ev) => {
      const row: TimelineRow = {
        id: ev.id,
        ts: ev.ts,
        label: KIND_LABEL[ev.kind],
        error: ev.kind === 'error' || ev.tool?.isError === true,
      };
      if (ev.tool) row.tool = ev.tool.name;
      const summary = ev.tool?.summary ?? ev.text;
      if (summary) row.summary = summary;
      if (ev.risk && ev.risk.level !== 'none') row.risk = ev.risk.level;
      return row;
    });
}

const READ_TOOLS = new Set(['Read']);
const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);

export interface FileTouch {
  path: string;
  reads: number;
  edits: number;
  lastTs: number;
}

/** Files read or edited (from tool summaries, which hold the path), most recent first. */
export function filesTouched(events: readonly AgentEvent[]): FileTouch[] {
  const files = new Map<string, FileTouch>();
  for (const ev of events) {
    if (ev.kind !== 'tool_start' || !ev.tool) continue;
    const { name, summary } = ev.tool;
    const read = READ_TOOLS.has(name);
    if ((!read && !EDIT_TOOLS.has(name)) || !summary || summary === name) continue;
    const f = files.get(summary) ?? { path: summary, reads: 0, edits: 0, lastTs: 0 };
    if (read) f.reads++;
    else f.edits++;
    f.lastTs = Math.max(f.lastTs, ev.ts);
    files.set(summary, f);
  }
  return [...files.values()].sort((a, b) => b.lastTs - a.lastTs);
}

/** Events with a risk level above none, newest first. */
export function riskEvents(events: readonly AgentEvent[]): TimelineRow[] {
  return timeline(events, events.length).filter((r) => r.risk);
}

/** `14:03:27` in local time. */
export function clockTime(ts: number): string {
  const d = new Date(ts);
  return [d.getHours(), d.getMinutes(), d.getSeconds()]
    .map((n) => String(n).padStart(2, '0'))
    .join(':');
}

/** Keep the end of a path: `…/dir/file.ts` when it has more than `keep` segments. */
export function shortPath(path: string, keep = 2): string {
  const parts = path.split('/').filter(Boolean);
  if (parts.length <= keep) return path;
  return `…/${parts.slice(-keep).join('/')}`;
}

/** `mcp__server__tool` -> `tool`; other names unchanged. */
export function shortTool(name: string): string {
  const mcp = /^mcp__.+?__(.+)$/.exec(name);
  return mcp ? mcp[1]! : name;
}

/** Summary to display: file tool summaries are paths, so keep their end. */
export function displaySummary(row: Pick<TimelineRow, 'tool' | 'summary'>): string {
  if (!row.summary) return '';
  return row.tool && (READ_TOOLS.has(row.tool) || EDIT_TOOLS.has(row.tool))
    ? shortPath(row.summary)
    : row.summary;
}
