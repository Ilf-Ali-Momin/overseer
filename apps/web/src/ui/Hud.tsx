'use client';

import { useEffect, useState } from 'react';
import { useAgentsStore } from '@/state/agents';
import { useConnectionStore } from '@/state/connection';
import { unlockAudio } from '@/audio/synth';
import { useModeStore } from '@/state/mode';
import { useSoundStore } from '@/state/sound';
import { formatCost, officeTotals } from './costModel';
import { activeCount, hudView } from './hudModel';
import { formatTokens } from './hoverModel';

/** Connection status and active agent count, under the page title. */
export function Hud() {
  const status = useConnectionStore((s) => s.status);
  const agents = useAgentsStore((s) => s.agents);
  const eventCount = useAgentsStore((s) => s.eventCount);
  // Agents also go idle and leave on timers, so recount every second.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  void eventCount; // re-render when events change states (e.g. session_end)
  const count = activeCount(agents, now);
  const totals = officeTotals(agents);
  const muted = useSoundStore((s) => s.muted);
  useEffect(() => useSoundStore.getState().hydrate(), []);
  const mode = useModeStore((s) => s.mode);
  const setChoice = useModeStore((s) => s.setChoice);
  const view = hudView(mode, status);
  // The fake-agents debug page (`?demo` alone) has no mode controller: keep the plain bridge view.
  const controlled = mode !== 'waiting' || status !== 'off';

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        top: 46,
        left: 20,
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        fontSize: 13,
        color: '#c9cfdd',
        pointerEvents: 'none',
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span
          aria-hidden
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: view.color,
            boxShadow: `0 0 6px ${view.color}`,
          }}
        />
        {view.label}
        {view.hint ? <span style={{ color: '#8b93a7' }}>: {view.hint}</span> : null}
      </span>
      <span style={{ color: '#8b93a7' }}>
        {count} active {count === 1 ? 'agent' : 'agents'}
      </span>
      {totals.tokens > 0 ? (
        <span
          style={{ color: '#8b93a7', pointerEvents: 'auto' }}
          title="Estimated from list prices per model (cache reads and writes included); not a bill."
        >
          {formatTokens(totals.tokens)} tokens · ~{formatCost(totals.cost)} est.
        </span>
      ) : null}
      <button
        type="button"
        onClick={() => {
          // The click also unlocks Web Audio (browsers block sound until the user interacts).
          unlockAudio();
          useSoundStore.getState().toggle();
        }}
        aria-pressed={!muted}
        aria-label={muted ? 'Turn sound on' : 'Turn sound off'}
        title={muted ? 'Sound off' : 'Sound on'}
        style={{
          pointerEvents: 'auto',
          alignSelf: 'flex-start',
          marginTop: 2,
          font: 'inherit',
          fontSize: 12,
          padding: '3px 9px',
          borderRadius: 6,
          border: '1px solid #2a3040',
          background: muted ? '#151923' : '#7c9cff',
          color: muted ? '#e6e9f0' : '#0b0d12',
          cursor: 'pointer',
        }}
      >
        {muted ? 'Sound: off' : 'Sound: on'}
      </button>
      {controlled && mode !== 'waiting' ? (
        <button
          type="button"
          onClick={() => setChoice(mode === 'demo' ? 'live' : 'demo')}
          style={{
            pointerEvents: 'auto',
            alignSelf: 'flex-start',
            marginTop: 2,
            font: 'inherit',
            fontSize: 12,
            padding: '3px 9px',
            borderRadius: 6,
            border: '1px solid #2a3040',
            background: '#151923',
            color: '#e6e9f0',
            cursor: 'pointer',
          }}
        >
          {mode === 'demo' ? 'Go live' : 'Watch demo'}
        </button>
      ) : null}
    </div>
  );
}
