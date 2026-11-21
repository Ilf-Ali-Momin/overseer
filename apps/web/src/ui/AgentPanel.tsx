'use client';

import { useEffect, useState } from 'react';
import { agentColor } from '@/scene/agentColor';
import { useAgentsStore } from '@/state/agents';
import { formatDuration, formatTokens, hoverInfo } from './hoverModel';
import {
  clockTime,
  displaySummary,
  filesTouched,
  riskEvents,
  shortPath,
  shortTool,
  timeline,
} from './panelModel';

const MUTED = '#8b93a7';
const RISK_COLOR = { low: '#93c5fd', medium: '#fbbf24', high: '#f87171', none: MUTED } as const;

const sectionTitle = {
  margin: '14px 0 6px',
  fontSize: 11,
  letterSpacing: '0.08em',
  textTransform: 'uppercase' as const,
  color: MUTED,
};

const mono = { fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 11 };

/** Side panel for the selected agent: recent events, files touched, risk events. Esc closes it. */
export function AgentPanel() {
  const id = useAgentsStore((s) => s.selectedId);
  const agent = useAgentsStore((s) => (s.selectedId ? s.agents[s.selectedId] : undefined));
  useAgentsStore((s) => s.eventCount); // live updates
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') useAgentsStore.getState().select(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!id) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [id]);

  if (!id || !agent) return null;
  const color = agentColor(id);
  const info = hoverInfo(agent, now);
  const rows = timeline(agent.events);
  const files = filesTouched(agent.events);
  const risks = riskEvents(agent.events);

  return (
    <aside
      aria-label={`Agent ${info.name}`}
      style={{
        position: 'fixed',
        top: 64,
        right: 16,
        bottom: 64,
        width: 340,
        maxWidth: 'calc(100vw - 32px)',
        display: 'flex',
        flexDirection: 'column',
        padding: '12px 14px',
        borderRadius: 12,
        background: 'rgba(16, 19, 27, 0.95)',
        border: '1px solid #2a3040',
        borderTop: `3px solid ${color}`,
        color: '#e6e9f0',
        fontSize: 12,
        lineHeight: 1.45,
        zIndex: 30,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {info.name}
          </div>
          <div style={{ color: MUTED }}>
            {info.project}
            {info.isSubagent ? ' · subagent' : ''}
          </div>
        </div>
        <button
          type="button"
          onClick={() => useAgentsStore.getState().select(null)}
          aria-label="Close (Esc)"
          title="Close (Esc)"
          style={{
            font: 'inherit',
            fontSize: 12,
            padding: '2px 8px',
            borderRadius: 6,
            border: '1px solid #2a3040',
            background: '#151923',
            color: MUTED,
            cursor: 'pointer',
          }}
        >
          Esc
        </button>
      </div>

      <div style={{ marginTop: 8 }}>
        <span style={{ color }}>{info.state}</span>
        <span style={{ color: MUTED }}>
          {' '}
          for {formatDuration(info.stateSeconds)} · {info.toolCount} tool calls ·{' '}
          {formatTokens(info.tokens)} tokens
        </span>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', marginTop: 4, paddingRight: 4 }}>
        {risks.length > 0 ? (
          <>
            <h3 style={sectionTitle}>Risk events</h3>
            {risks.slice(0, 10).map((r) => (
              <div key={r.id} style={{ display: 'flex', gap: 6 }}>
                <span style={{ color: RISK_COLOR[r.risk ?? 'none'] }}>{r.risk}</span>
                <span
                  style={{
                    ...mono,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {r.tool ? `${shortTool(r.tool)}: ` : ''}
                  {r.summary}
                </span>
              </div>
            ))}
          </>
        ) : null}

        <h3 style={sectionTitle}>Files touched ({files.length})</h3>
        {files.length === 0 ? <div style={{ color: MUTED }}>None yet</div> : null}
        {files.slice(0, 30).map((f) => (
          <div key={f.path} style={{ display: 'flex', gap: 8 }}>
            <span
              style={{
                ...mono,
                flex: 1,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
              title={f.path}
            >
              {shortPath(f.path)}
            </span>
            <span style={{ color: MUTED, whiteSpace: 'nowrap' }}>
              {f.edits > 0
                ? `${f.edits} edit${f.edits > 1 ? 's' : ''}`
                : `${f.reads} read${f.reads > 1 ? 's' : ''}`}
            </span>
          </div>
        ))}

        <h3 style={sectionTitle}>Recent events</h3>
        <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {rows.map((r) => (
            <li key={r.id} style={{ display: 'flex', gap: 8, padding: '2px 0' }}>
              <span style={{ ...mono, color: MUTED }}>{clockTime(r.ts)}</span>
              <span
                style={{
                  color: r.error ? '#f87171' : r.risk ? RISK_COLOR[r.risk] : '#c9cfdd',
                  minWidth: 52,
                }}
              >
                {r.tool ? shortTool(r.tool) : r.label}
              </span>
              <span
                style={{
                  ...mono,
                  flex: 1,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  color: '#c9cfdd',
                }}
              >
                {displaySummary(r)}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </aside>
  );
}
