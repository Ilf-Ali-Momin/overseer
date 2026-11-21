'use client';

import { useState } from 'react';
import { agentColor } from '@/scene/agentColor';
import { useAgentsStore } from '@/state/agents';
import { clockTime, shortTool } from './panelModel';
import { riskFeed } from './riskFeedModel';

const MUTED = '#8b93a7';
const LEVEL_COLOR = { medium: '#fbbf24', high: '#f87171' } as const;

/** Latest medium and high risk events across all agents. Click a row to follow that agent. */
export function RiskFeed() {
  const agents = useAgentsStore((s) => s.agents);
  useAgentsStore((s) => s.eventCount); // live updates
  const [open, setOpen] = useState(true);
  const rows = riskFeed(agents);
  const highs = rows.filter((r) => r.level === 'high').length;

  return (
    <section
      aria-label="Risk feed"
      style={{
        position: 'fixed',
        left: 16,
        bottom: 72,
        width: 330,
        maxWidth: 'calc(100vw - 32px)',
        borderRadius: 12,
        background: 'rgba(16, 19, 27, 0.92)',
        border: `1px solid ${highs > 0 ? '#7f2a2a' : '#2a3040'}`,
        color: '#e6e9f0',
        fontSize: 12,
        lineHeight: 1.4,
        zIndex: 25,
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={{
          display: 'flex',
          width: '100%',
          alignItems: 'center',
          gap: 8,
          padding: '8px 12px',
          font: 'inherit',
          fontSize: 12,
          color: 'inherit',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <strong style={{ letterSpacing: '0.06em' }}>RISK RADAR</strong>
        <span style={{ color: rows.length ? LEVEL_COLOR[highs ? 'high' : 'medium'] : MUTED }}>
          {rows.length === 0
            ? 'all clear'
            : `${rows.length} flagged${highs ? `, ${highs} high` : ''}`}
        </span>
        <span style={{ marginLeft: 'auto', color: MUTED }}>{open ? '▾' : '▸'}</span>
      </button>
      {open && rows.length > 0 ? (
        <ol
          style={{
            listStyle: 'none',
            margin: 0,
            padding: '0 8px 8px',
            maxHeight: 'min(260px, 40vh)',
            overflowY: 'auto',
          }}
        >
          {rows.map((r) => (
            <li key={`${r.agentId}|${r.id}`}>
              <button
                type="button"
                onClick={() => useAgentsStore.getState().select(r.agentId)}
                title={`${r.reasons.join('; ')}${r.summary ? `\n${r.summary}` : ''}`}
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '5px 6px',
                  font: 'inherit',
                  fontSize: 12,
                  color: 'inherit',
                  textAlign: 'left',
                  background: 'none',
                  border: 'none',
                  borderTop: '1px solid #1f2533',
                  cursor: 'pointer',
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span
                    style={{
                      padding: '0 5px',
                      borderRadius: 4,
                      fontSize: 10,
                      fontWeight: 700,
                      color: '#0b0d12',
                      background: LEVEL_COLOR[r.level],
                    }}
                  >
                    {r.level.toUpperCase()}
                  </span>
                  <span
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: '50%',
                      background: agentColor(r.agentId),
                    }}
                  />
                  <span
                    style={{
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      flex: 1,
                    }}
                  >
                    {r.agentName}
                  </span>
                  <span
                    style={{
                      color: MUTED,
                      fontFamily: 'ui-monospace, Menlo, monospace',
                      fontSize: 11,
                    }}
                  >
                    {clockTime(r.ts)}
                  </span>
                </span>
                {r.verdict ? (
                  <span style={{ display: 'block', color: '#e6e9f0', marginTop: 2 }}>
                    {r.verdict}
                  </span>
                ) : null}
                <span
                  style={{ display: 'block', color: r.verdict ? MUTED : '#c9cfdd', marginTop: 2 }}
                >
                  {r.reasons.join('; ')}
                </span>
                {r.summary ? (
                  <span
                    style={{
                      display: 'block',
                      color: MUTED,
                      fontFamily: 'ui-monospace, Menlo, monospace',
                      fontSize: 11,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {r.tool ? `${shortTool(r.tool)}: ` : ''}
                    {r.summary}
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}
