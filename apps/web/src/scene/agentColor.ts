/**
 * Stable per-agent colors. The same agentId always gets the same color; subagents
 * (`<sessionId>:<agentId>`) get a lighter shade of their parent's hue so a family reads as a group.
 */

/** Hues (degrees) chosen to stay distinct from each other and from the brown floor. */
export const PALETTE_HUES = [215, 355, 135, 50, 280, 175, 25, 330, 95, 245, 195, 305] as const;

const SATURATION = 0.58;
const LIGHTNESS = 0.56;
const SUB_LIGHTNESS = 0.72;

/** 32-bit FNV-1a hash. */
export function fnv1a(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function hslToHex(h: number, s: number, l: number): string {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  const hex = (x: number) =>
    Math.round(x * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${hex(f(0))}${hex(f(8))}${hex(f(4))}`;
}

export interface AgentHue {
  hue: number;
  lightness: number;
}

export function agentHue(agentId: string): AgentHue {
  const sep = agentId.indexOf(':');
  const parent = sep >= 0 ? agentId.slice(0, sep) : agentId;
  const hue = PALETTE_HUES[fnv1a(parent) % PALETTE_HUES.length]!;
  if (sep < 0) return { hue, lightness: LIGHTNESS };
  // Small per-subagent hue shift so siblings differ slightly too.
  const shift = (fnv1a(agentId) % 17) - 8;
  return { hue: (hue + shift + 360) % 360, lightness: SUB_LIGHTNESS };
}

export function agentColor(agentId: string): string {
  const { hue, lightness } = agentHue(agentId);
  return hslToHex(hue, SATURATION, lightness);
}
