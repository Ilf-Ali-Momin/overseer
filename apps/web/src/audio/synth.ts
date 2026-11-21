/**
 * Tiny synthesized sound effects (Web Audio, no audio files). Every sound is short and quiet.
 * The AudioContext is created lazily, after a user click, because browsers block autoplay.
 */

let ctx: AudioContext | null = null;
let master: GainNode | null = null;

/** Create (or resume) the audio context. Call from a click handler. */
export function unlockAudio(): void {
  if (typeof window === 'undefined') return;
  if (!ctx) {
    const Ctor = window.AudioContext;
    if (!Ctor) return;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
  }
  void ctx.resume();
}

export function audioReady(): boolean {
  return ctx !== null && ctx.state === 'running';
}

function tone(
  freq: number,
  start: number,
  dur: number,
  vol: number,
  type: OscillatorType = 'sine',
  endFreq?: number,
): void {
  if (!ctx || !master) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, start);
  if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, start + dur);
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(vol, start + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  o.connect(g).connect(master);
  o.start(start);
  o.stop(start + dur + 0.02);
}

function noise(start: number, dur: number, vol: number, cutoff: number): void {
  if (!ctx || !master) return;
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = cutoff;
  const g = ctx.createGain();
  g.gain.value = vol;
  src.connect(filter).connect(g).connect(master);
  src.start(start);
}

/** One soft key click. */
export function keyClick(): void {
  if (!ctx) return;
  noise(ctx.currentTime, 0.025, 0.12, 2500 + Math.random() * 1500);
}

/** Door swinging: a low airy whoosh. */
export function doorWhoosh(): void {
  if (!ctx) return;
  const t = ctx.currentTime;
  noise(t, 0.45, 0.18, 600);
  tone(180, t, 0.3, 0.04, 'triangle', 120);
}

/** High risk: two-tone alert chime. */
export function riskAlert(): void {
  if (!ctx) return;
  const t = ctx.currentTime;
  tone(880, t, 0.18, 0.12, 'square');
  tone(660, t + 0.2, 0.25, 0.1, 'square');
}

/** Success: a quick rising blip. */
export function successBlip(): void {
  if (!ctx) return;
  const t = ctx.currentTime;
  tone(660, t, 0.12, 0.1, 'sine');
  tone(990, t + 0.1, 0.18, 0.1, 'sine');
}
