'use client';

import { Html } from '@react-three/drei';
import { useAgentsStore } from '@/state/agents';
import { bubbleText } from './bubbleModel';

/** Small thought bubble above a thinking agent's head (or a result notice after delegating). */
export function ThoughtBubble({ id, result }: { id: string; result?: string | null }) {
  const thought = useAgentsStore((s) => {
    const agent = s.agents[id];
    void s.eventCount;
    return agent ? bubbleText(agent) : '…';
  });
  // A subagent result just came back: show a check mark and the task instead.
  const text = result ? `✓ ${result}` : thought;
  return (
    <Html position={[0, 1.1, 0]} center zIndexRange={[15, 5]} style={{ pointerEvents: 'none' }}>
      <div style={{ position: 'relative', transform: 'translateY(-50%)' }}>
        <div
          style={{
            maxWidth: 180,
            width: 'max-content',
            padding: '5px 9px',
            borderRadius: 12,
            background: 'rgba(245, 247, 252, 0.95)',
            color: '#1b2030',
            fontSize: 11,
            lineHeight: 1.35,
            boxShadow: '0 3px 10px rgba(0,0,0,0.3)',
            fontStyle: text === '…' ? 'normal' : 'italic',
          }}
        >
          {text}
        </div>
        {/* Trailing thought dots. */}
        <span
          style={{
            position: 'absolute',
            left: '50%',
            bottom: -7,
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: 'rgba(245, 247, 252, 0.95)',
          }}
        />
        <span
          style={{
            position: 'absolute',
            left: 'calc(50% - 5px)',
            bottom: -13,
            width: 4,
            height: 4,
            borderRadius: '50%',
            background: 'rgba(245, 247, 252, 0.95)',
          }}
        />
      </div>
    </Html>
  );
}
