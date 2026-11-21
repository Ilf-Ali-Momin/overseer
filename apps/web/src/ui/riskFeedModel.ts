import type { RiskLevel } from '@overseer/shared';
import type { OfficeAgent } from '@/state/agents';
import { agentName } from './hoverModel';

export const FEED_LIMIT = 30;

export interface FeedRow {
  id: string;
  agentId: string;
  agentName: string;
  ts: number;
  level: Extract<RiskLevel, 'medium' | 'high'>;
  reasons: string[];
  /** One-line LLM verdict, when OVERSEER_LLM is on in the bridge. */
  verdict?: string;
  tool?: string;
  summary?: string;
}

/** Medium and high risk events across all agents, newest first. */
export function riskFeed(
  agents: Readonly<Record<string, OfficeAgent>>,
  limit = FEED_LIMIT,
): FeedRow[] {
  const rows: FeedRow[] = [];
  for (const agent of Object.values(agents)) {
    const name = agentName(agent);
    for (const ev of agent.events) {
      const level = ev.risk?.level;
      if (level !== 'medium' && level !== 'high') continue;
      const row: FeedRow = {
        id: ev.id,
        agentId: agent.id,
        agentName: name,
        ts: ev.ts,
        level,
        reasons: ev.risk!.reasons,
      };
      if (ev.risk!.verdict) row.verdict = ev.risk!.verdict;
      if (ev.tool) {
        row.tool = ev.tool.name;
        row.summary = ev.tool.summary;
      }
      rows.push(row);
    }
  }
  return rows.sort((a, b) => b.ts - a.ts).slice(0, limit);
}
