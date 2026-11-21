// Record an animated GIF of a page with headless Chrome (no ffmpeg needed).
// Usage: node scripts/gif.mjs <url> <out.gif> [frames=40] [intervalMs=250] [warmupMs=6000] [width=960]
// Frames are captured over CDP, then quantized and encoded inside the page with gifenc.
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [url, out, frames = '40', interval = '250', warmup = '6000', width = '960'] =
  process.argv.slice(2);
if (!url || !out) {
  console.error(
    'usage: node scripts/gif.mjs <url> <out.gif> [frames] [intervalMs] [warmupMs] [width]',
  );
  process.exit(1);
}
const W = Number(width);
const H = Math.round((W * 9) / 16);
const require = createRequire(import.meta.url);
const gifencSrc = readFileSync(require.resolve('gifenc/dist/gifenc.js'), 'utf8');

const port = 9334;
const chrome = spawn(
  process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    `--window-size=${W},${H}`,
    '--use-angle=metal',
    `--user-data-dir=${mkdtempSync(join(tmpdir(), 'overseer-gif-'))}`,
    'about:blank',
  ],
  { stdio: 'ignore' },
);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let target;
for (let i = 0; i < 50 && !target; i++) {
  await sleep(200);
  try {
    const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
    target = list.find((t) => t.type === 'page');
  } catch {
    // Chrome not listening yet.
  }
}
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pending = new Map();
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pending.has(d.id)) {
    pending.get(d.id)(d);
    pending.delete(d.id);
  }
};
const send = (method, params = {}) =>
  new Promise((r) => {
    const i = ++id;
    pending.set(i, r);
    ws.send(JSON.stringify({ id: i, method, params }));
  });
const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails));
  return r.result?.result?.value;
};

await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', {
  width: W,
  height: H,
  deviceScaleFactor: 1,
  mobile: false,
});
await send('Page.navigate', { url });
await sleep(Number(warmup));

const shots = [];
for (let i = 0; i < Number(frames); i++) {
  const t = Date.now();
  const s = await send('Page.captureScreenshot', { format: 'png' });
  shots.push(s.result.data);
  await sleep(Math.max(0, Number(interval) - (Date.now() - t)));
}
console.log(`captured ${shots.length} frames at ${W}x${H}`);

// Encode inside a blank page: decode PNGs with <img>, read pixels, quantize with gifenc.
await send('Page.navigate', { url: 'about:blank' });
await sleep(500);
await evaluate(
  `window.gifenc = {}; (function (exports) { ${gifencSrc} })(window.gifenc); window.__frames = []; 0`,
);
for (const s of shots) await evaluate(`window.__frames.push(${JSON.stringify(s)}); 0`);
const b64 = await evaluate(`(async () => {
  const { GIFEncoder, quantize, applyPalette } = window.gifenc;
  const c = document.createElement('canvas');
  c.width = ${W}; c.height = ${H};
  const g = c.getContext('2d', { willReadFrequently: true });
  const enc = GIFEncoder();
  for (const f of window.__frames) {
    const img = new Image();
    img.src = 'data:image/png;base64,' + f;
    await img.decode();
    g.drawImage(img, 0, 0);
    const { data } = g.getImageData(0, 0, ${W}, ${H});
    const palette = quantize(data, 256);
    enc.writeFrame(applyPalette(data, palette), ${W}, ${H}, { palette, delay: ${Number(interval)} });
  }
  enc.finish();
  const bytes = enc.bytes();
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
})()`);
writeFileSync(out, Buffer.from(b64, 'base64'));
console.log('saved', out, `${(Buffer.byteLength(b64, 'base64') / 1e6).toFixed(1)} MB`);
ws.close();
chrome.kill();
process.exit(0);
