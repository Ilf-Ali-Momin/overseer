'use client';

import { SPEEDS } from '@/state/replay';
import { demoControls, useDemoStore } from '@/state/demo';
import { DEMOS, useModeStore } from '@/state/mode';

const MUTED = '#8b93a7';

/** `1:05` */
export function clock(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const btn = (active = false) => ({
  font: 'inherit',
  fontSize: 12,
  padding: '4px 8px',
  borderRadius: 6,
  border: '1px solid #2a3040',
  background: active ? '#7c9cff' : '#151923',
  color: active ? '#0b0d12' : '#e6e9f0',
  cursor: 'pointer',
});

/** Play / pause, speed and a scrubber for the demo recording. Shown only in demo mode. */
export function Timeline() {
  const { replay, name, title, playing, speed, position, duration } = useDemoStore();
  const setDemo = useModeStore((s) => s.setDemo);
  const controlled = useModeStore((s) => s.mode === 'demo');
  if (!replay) return null;
  return (
    <div
      role="group"
      aria-label="Demo timeline"
      style={{
        position: 'fixed',
        left: '50%',
        bottom: 16,
        transform: 'translateX(-50%)',
        width: 'min(560px, calc(100vw - 32px))',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 12px',
        borderRadius: 12,
        background: 'rgba(16, 19, 27, 0.92)',
        border: '1px solid #2a3040',
        color: '#e6e9f0',
        fontSize: 12,
        zIndex: 26,
      }}
    >
      <button
        type="button"
        onClick={demoControls.toggle}
        aria-label={playing ? 'Pause' : 'Play'}
        style={{ ...btn(), width: 34 }}
      >
        {playing ? '❚❚' : '▶'}
      </button>
      <input
        type="range"
        aria-label="Demo position"
        min={0}
        max={Math.max(1, duration)}
        step={100}
        value={Math.min(position, duration)}
        onChange={(e) => demoControls.seek(Number(e.target.value))}
        style={{ flex: 1, accentColor: '#7c9cff' }}
      />
      <span
        style={{
          color: MUTED,
          fontFamily: 'ui-monospace, Menlo, monospace',
          minWidth: 76,
          textAlign: 'right',
        }}
      >
        {clock(position)} / {clock(duration)}
      </span>
      {SPEEDS.map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => demoControls.setSpeed(s)}
          aria-pressed={speed === s}
          style={btn(speed === s)}
        >
          {s}x
        </button>
      ))}
      {controlled && name && (DEMOS as readonly string[]).includes(name) ? (
        <select
          aria-label="Demo recording"
          title={title ?? name}
          value={name}
          onChange={(e) => setDemo(e.target.value)}
          style={{
            font: 'inherit',
            fontSize: 12,
            maxWidth: 110,
            padding: '3px 4px',
            borderRadius: 6,
            border: '1px solid #2a3040',
            background: '#151923',
            color: '#e6e9f0',
          }}
        >
          {DEMOS.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      ) : (
        <span
          title={title ?? name ?? ''}
          style={{
            color: MUTED,
            maxWidth: 120,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {title ?? name}
        </span>
      )}
    </div>
  );
}
