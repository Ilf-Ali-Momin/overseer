'use client';

import { Html } from '@react-three/drei';
import { useEffect, useState } from 'react';
import { useAgentsStore } from '@/state/agents';
import { formatDuration, formatTokens, hoverInfo } from './hoverModel';

const RISK_COLOR = { low: '#93c5fd', medium: '#fbbf24', high: '#f87171' } as const;

/** Card floating above a hovered character. Lives inside the agent's group so it follows it. */
export function HoverCard({ id, color }: { id: string; color: string }) {
  const agent = useAgentsStore((s) => s.agents[id]);
  useAgentsStore((s) => s.eventCount); // live text when events arrive
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!agent) return null;
  const info = hoverInfo(agent, now);

  return (
    <Html position={[0, 1.15, 0]} center zIndexRange={[20, 10]} style={{ pointerEvents: 'none' }}>
      <div
        style={{
          width: 240,
          padding: '10px 12px',
          borderRadius: 10,
          background: 'rgba(16, 19, 27, 0.94)',
          border: `1px solid ${color}`,
          boxShadow: '0 6px 24px rgba(0,0,0,0.45)',
          color: '#e6e9f0',
          fontSize: 12,
          lineHeight: 1.45,
          transform: 'translateY(-50%)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
          <strong
            style={{
              fontSize: 13,
              flex: 1,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {info.name}
          </strong>
          {info.risk ? (
            <span
              style={{
                padding: '1px 6px',
                borderRadius: 6,
                fontSize: 11,
                color: '#0b0d12',
                background: RISK_COLOR[info.risk as keyof typeof RISK_COLOR],
              }}
            >
              {info.risk} risk
            </span>
          ) : null}
        </div>
        <div style={{ color: '#8b93a7' }}>
          {info.project}
          {info.isSubagent ? ' · subagent' : ''}
        </div>
        <div style={{ marginTop: 6 }}>
          <span style={{ color }}>{info.state}</span>
          <span style={{ color: '#8b93a7' }}> for {formatDuration(info.stateSeconds)}</span>
        </div>
        {info.summary ? (
          <div
            style={{
              marginTop: 2,
              fontFamily: 'ui-monospace, Menlo, monospace',
              fontSize: 11,
              color: '#c9cfdd',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {info.tool ? `${info.tool}: ` : ''}
            {info.summary}
          </div>
        ) : null}
        <div style={{ marginTop: 6, color: '#8b93a7' }}>
          {info.toolCount} tool {info.toolCount === 1 ? 'call' : 'calls'} ·{' '}
          {formatTokens(info.tokens)} tokens
        </div>
      </div>
    </Html>
  );
}
