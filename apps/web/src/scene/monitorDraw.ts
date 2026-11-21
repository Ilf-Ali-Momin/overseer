import { type VisualState, resolveState } from '@overseer/shared';
import type { OfficeAgent } from '@/state/agents';
import { agentTotals } from '@/ui/costModel';
import { formatTokens } from '@/ui/hoverModel';

/**
 * What a desk monitor shows. The content model is pure (testable without a DOM); `drawMonitor`
 * paints it on a 2D canvas. Code is drawn as colored bars from a hash of the path, never real file
 * contents.
 */

export const MONITOR_W = 256;
export const MONITOR_H = 160;
/** Redraw rate cap for all monitors. */
export const MONITOR_HZ = 4;

export type MonitorKind =
  | 'off'
  | 'screensaver'
  | 'path'
  | 'code'
  | 'terminal'
  | 'browser'
  | 'thinking'
  | 'waiting'
  | 'error'
  | 'success';

export interface MonitorContent {
  kind: MonitorKind;
  /** Header line (path, command, host...). */
  text: string;
  /** Agent color, for accents. */
  accent: string;
  /** True when the content animates, so it must redraw on every tick. */
  animated: boolean;
  /** Token count for the footer (`12.3k tok`), empty when none. */
  tokens: string;
}

const KIND_FOR_STATE: Record<VisualState, MonitorKind> = {
  reading: 'path',
  typing: 'code',
  terminal: 'terminal',
  browsing: 'browser',
  delegating: 'thinking',
  thinking: 'thinking',
  waiting: 'waiting',
  frustrated: 'error',
  celebrating: 'success',
  idle: 'screensaver',
  leaving: 'off',
};

const ANIMATED = new Set<MonitorKind>(['code', 'thinking', 'screensaver', 'terminal']);

/** Latest tool summary or text of the agent. */
function latestText(agent: OfficeAgent): string {
  for (let i = agent.events.length - 1; i >= 0; i--) {
    const ev = agent.events[i]!;
    if (ev.tool?.summary) return ev.tool.summary;
    if (ev.text) return ev.text;
  }
  return '';
}

export function monitorContent(
  agent: OfficeAgent | undefined,
  accent: string,
  now: number,
): MonitorContent {
  if (!agent) return { kind: 'off', text: '', accent, animated: false, tokens: '' };
  const kind = KIND_FOR_STATE[resolveState(agent.machine, now)];
  let text = kind === 'off' || kind === 'screensaver' ? '' : latestText(agent);
  if (kind === 'waiting' && !text) text = 'Waiting for you';
  if (kind === 'success' && !text) text = 'Done';
  const t = agentTotals(agent).tokens;
  const tokens = kind === 'off' || t === 0 ? '' : `${formatTokens(t)} tok`;
  return { kind, text, accent, animated: ANIMATED.has(kind), tokens };
}

/** Cache key: the canvas is only redrawn when this changes. */
export function monitorKey(c: MonitorContent, tick: number): string {
  return `${c.kind}|${c.text}|${c.accent}|${c.tokens}|${c.animated ? tick : ''}`;
}

/** Small deterministic hash (FNV-1a) for fake code layout. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Bars for fake code line `i`: [indent, width, colorIndex][] in units of character cells. */
export function codeLine(seed: string, i: number): [number, number, number][] {
  let h = hash(`${seed}:${i}`);
  const next = () => {
    h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0;
    return h / 4294967296;
  };
  if (next() < 0.12) return [];
  let x = Math.floor(next() * 4) * 2;
  const bars: [number, number, number][] = [];
  const n = 1 + Math.floor(next() * 4);
  for (let k = 0; k < n && x < 34; k++) {
    const w = 2 + Math.floor(next() * 8);
    bars.push([x, w, Math.floor(next() * 4)]);
    x += w + 1;
  }
  return bars;
}

const BG = '#0d1017';
const DIM = '#5b6375';
const CODE_COLORS = ['#7c9cff', '#c792ea', '#9ece6a', '#d8dee9'];

function fitText(ctx: CanvasRenderingContext2D, text: string, max: number): string {
  if (ctx.measureText(text).width <= max) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(`…${s}`).width > max) s = s.slice(1);
  return `…${s}`;
}

function header(ctx: CanvasRenderingContext2D, c: MonitorContent, label: string): void {
  ctx.fillStyle = '#161b26';
  ctx.fillRect(0, 0, MONITOR_W, 22);
  ctx.fillStyle = c.accent;
  ctx.fillRect(0, 0, 4, 22);
  ctx.font = '600 12px ui-monospace, Menlo, monospace';
  ctx.fillStyle = DIM;
  ctx.fillText(label, 10, 15);
  const lw = ctx.measureText(label).width + 18;
  ctx.fillStyle = '#d8dee9';
  ctx.fillText(fitText(ctx, c.text, MONITOR_W - lw - 8), lw, 15);
}

function centered(
  ctx: CanvasRenderingContext2D,
  text: string,
  color: string,
  y: number,
  size = 16,
): void {
  ctx.font = `600 ${size}px ui-sans-serif, system-ui, sans-serif`;
  ctx.fillStyle = color;
  const t = fitText(ctx, text, MONITOR_W - 24);
  ctx.fillText(t, (MONITOR_W - ctx.measureText(t).width) / 2, y);
}

export function drawMonitor(ctx: CanvasRenderingContext2D, c: MonitorContent, tick: number): void {
  drawBody(ctx, c, tick);
  if (c.tokens) {
    // Token footer, bottom right, on top of every screen kind.
    ctx.font = '600 10px ui-monospace, Menlo, monospace';
    const w = ctx.measureText(c.tokens).width + 8;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.fillRect(MONITOR_W - w - 4, MONITOR_H - 16, w, 13);
    ctx.fillStyle = '#c9cfdd';
    ctx.fillText(c.tokens, MONITOR_W - w, MONITOR_H - 6);
  }
}

function drawBody(ctx: CanvasRenderingContext2D, c: MonitorContent, tick: number): void {
  ctx.fillStyle = c.kind === 'off' ? '#05060a' : BG;
  ctx.fillRect(0, 0, MONITOR_W, MONITOR_H);
  ctx.textBaseline = 'alphabetic';

  switch (c.kind) {
    case 'off':
      return;
    case 'screensaver': {
      // A dot drifting around the screen in the agent's color.
      const t = tick * 0.35;
      const x = MONITOR_W / 2 + Math.sin(t) * 90;
      const y = MONITOR_H / 2 + Math.sin(t * 1.3) * 45;
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = c.accent;
      ctx.beginPath();
      ctx.arc(x, y, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      return;
    }
    case 'path': {
      header(ctx, c, 'READ');
      // Dim static code view of the file.
      for (let i = 0; i < 11; i++) drawCodeLine(ctx, c.text, i, 32 + i * 11, 0.45);
      return;
    }
    case 'code': {
      header(ctx, c, 'EDIT');
      const offset = tick % 400;
      for (let i = 0; i < 11; i++) drawCodeLine(ctx, c.text, i + offset, 32 + i * 11, 1);
      // Cursor on the last line.
      if (tick % 2 === 0) {
        ctx.fillStyle = c.accent;
        ctx.fillRect(10, 32 + 10 * 11 - 7, 6, 9);
      }
      return;
    }
    case 'terminal': {
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, MONITOR_W, MONITOR_H);
      ctx.font = '12px ui-monospace, Menlo, monospace';
      ctx.fillStyle = '#4ade80';
      // Wrap the command over up to 6 lines.
      const words = `$ ${c.text}`;
      const perLine = 33;
      for (let i = 0; i < 6 && i * perLine < words.length; i++) {
        ctx.fillText(words.slice(i * perLine, (i + 1) * perLine), 8, 20 + i * 16);
      }
      if (tick % 2 === 0) ctx.fillRect(8, 128, 7, 12);
      return;
    }
    case 'browser': {
      ctx.fillStyle = '#e5e7eb';
      ctx.fillRect(0, 0, MONITOR_W, MONITOR_H);
      ctx.fillStyle = '#cbd5e1';
      ctx.fillRect(8, 6, MONITOR_W - 16, 18);
      ctx.font = '12px ui-sans-serif, system-ui, sans-serif';
      ctx.fillStyle = '#334155';
      ctx.fillText(fitText(ctx, c.text, MONITOR_W - 32), 14, 19);
      ctx.fillStyle = '#94a3b8';
      for (let i = 0; i < 6; i++) ctx.fillRect(16, 40 + i * 16, 60 + ((i * 53) % 150), 7);
      return;
    }
    case 'thinking': {
      const dots = '.'.repeat((tick % 3) + 1);
      centered(ctx, `thinking${dots}`, c.accent, 78);
      if (c.text) {
        ctx.font = '11px ui-sans-serif, system-ui, sans-serif';
        ctx.fillStyle = DIM;
        const t = fitText(ctx, c.text, MONITOR_W - 24);
        ctx.fillText(t, (MONITOR_W - ctx.measureText(t).width) / 2, 102);
      }
      return;
    }
    case 'waiting':
      centered(ctx, '?', '#fbbf24', 72, 36);
      centered(ctx, c.text, '#fbbf24', 110, 13);
      return;
    case 'error':
      ctx.fillStyle = '#2a0f12';
      ctx.fillRect(0, 0, MONITOR_W, MONITOR_H);
      centered(ctx, '✕ error', '#f87171', 70, 20);
      centered(ctx, c.text, '#fca5a5', 104, 12);
      return;
    case 'success':
      ctx.fillStyle = '#0d2416';
      ctx.fillRect(0, 0, MONITOR_W, MONITOR_H);
      centered(ctx, '✓', '#4ade80', 76, 40);
      centered(ctx, c.text, '#86efac', 112, 13);
      return;
  }
}

function drawCodeLine(
  ctx: CanvasRenderingContext2D,
  seed: string,
  i: number,
  y: number,
  alpha: number,
): void {
  const cell = 6.5;
  ctx.globalAlpha = alpha;
  ctx.fillStyle = DIM;
  ctx.font = '9px ui-monospace, Menlo, monospace';
  ctx.fillText(String((i % 999) + 1).padStart(3, ' '), 4, y + 6);
  for (const [x, w, color] of codeLine(seed, i)) {
    ctx.fillStyle = CODE_COLORS[color]!;
    ctx.fillRect(28 + x * cell, y, w * cell, 6);
  }
  ctx.globalAlpha = 1;
}
