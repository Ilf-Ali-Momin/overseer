'use client';

import { useViewStore } from '@/state/view';

/** Small overlay with view toggles. */
export function ViewControls() {
  const orbit = useViewStore((s) => s.orbit);
  const toggleOrbit = useViewStore((s) => s.toggleOrbit);
  return (
    <div style={{ position: 'fixed', right: 16, bottom: 16, display: 'flex', gap: 8 }}>
      <button
        type="button"
        onClick={toggleOrbit}
        aria-pressed={orbit}
        style={{
          font: 'inherit',
          fontSize: 13,
          padding: '6px 12px',
          borderRadius: 8,
          border: '1px solid #2a3040',
          background: orbit ? '#7c9cff' : '#151923',
          color: orbit ? '#0b0d12' : 'var(--fg)',
          cursor: 'pointer',
        }}
      >
        {orbit ? 'Orbit: on' : 'Orbit: off'}
      </button>
    </div>
  );
}
