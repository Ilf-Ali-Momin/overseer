// Headless Chrome screenshot over CDP (the Claude desktop browser pane does not render when hidden).
// Usage: node scripts/shot.mjs <url> <waitMs> <out.png> [js expression to print before the shot]
// Env SHOT_ACTIONS: ';'-separated steps after the eval: `move:x,y`, `click:x,y`, `key:Escape`,
// `wait:ms`, `eval:<js>` (printed as EVAL). Example: SHOT_ACTIONS='click:700,400;wait:1500'
// Needs Google Chrome installed; set CHROME to override the binary path.
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const [url, waitMs, out, evalJs] = process.argv.slice(2);
const port = 9333;
const chrome = spawn(
  process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    '--window-size=1400,900',
    '--use-angle=metal',
    `--user-data-dir=${mkdtempSync(join(tmpdir(), 'overseer-shot-'))}`,
    'about:blank',
  ],
  { stdio: 'ignore' },
);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let target;
for (let i = 0; i < 50 && !target; i++) {
  await sleep(200);
  try {
    target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find(
      (t) => t.type === 'page',
    );
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
await send('Page.enable');
await send('Page.navigate', { url });
await sleep(Number(waitMs));
if (evalJs) {
  const r = await send('Runtime.evaluate', {
    expression: evalJs,
    awaitPromise: true,
    returnByValue: true,
  });
  console.log('EVAL', JSON.stringify(r.result?.result?.value ?? r.result));
}
for (const step of (process.env.SHOT_ACTIONS ?? '').split(';').filter(Boolean)) {
  const i = step.indexOf(':');
  const [op, arg] = [step.slice(0, i), step.slice(i + 1)];
  if (op === 'wait') await sleep(Number(arg));
  else if (op === 'eval') {
    const r = await send('Runtime.evaluate', {
      expression: arg,
      awaitPromise: true,
      returnByValue: true,
    });
    console.log('EVAL', JSON.stringify(r.result?.result?.value ?? r.result));
  } else if (op === 'key') {
    for (const type of ['keyDown', 'keyUp'])
      await send('Input.dispatchKeyEvent', {
        type,
        key: arg,
        code: arg,
        windowsVirtualKeyCode: arg === 'Escape' ? 27 : 0,
      });
  } else {
    const [x, y] = arg.split(',').map(Number);
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    if (op === 'click') {
      await sleep(100);
      await send('Input.dispatchMouseEvent', {
        type: 'mousePressed',
        x,
        y,
        button: 'left',
        clickCount: 1,
      });
      await send('Input.dispatchMouseEvent', {
        type: 'mouseReleased',
        x,
        y,
        button: 'left',
        clickCount: 1,
      });
    }
  }
}
const shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(out, Buffer.from(shot.result.data, 'base64'));
console.log('saved', out);
ws.close();
chrome.kill();
process.exit(0);
