import { appendFileSync, cpSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { AgentEvent } from '@overseer/shared';
import { TranscriptWatcher, classifyTranscript } from '../src/watcher';
import { FIXTURES, NORMAL, SUBAGENT_ID, WITH_SUBAGENT, fixtureText } from './helpers';

describe('classifyTranscript', () => {
  it('recognises main and subagent files', () => {
    expect(classifyTranscript(`proj/${NORMAL}.jsonl`)).toEqual({
      projectFolder: 'proj',
      sessionId: NORMAL,
    });
    expect(classifyTranscript(`proj/${NORMAL}/subagents/agent-abc123.jsonl`)).toEqual({
      projectFolder: 'proj',
      sessionId: NORMAL,
      subagentId: 'abc123',
    });
  });

  it('rejects everything else', () => {
    expect(classifyTranscript('proj/notes.txt')).toBeNull();
    expect(classifyTranscript('proj/hello.jsonl')).toBeNull();
    expect(classifyTranscript(`proj/${NORMAL}/subagents/agent-x.meta.json`)).toBeNull();
    expect(classifyTranscript(`proj/${NORMAL}/tool-results/x.jsonl`)).toBeNull();
    expect(classifyTranscript(`${NORMAL}.jsonl`)).toBeNull();
  });
});

async function until(check: () => boolean, ms = 4000): Promise<void> {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 25));
  }
}

describe('TranscriptWatcher', () => {
  let dir: string | undefined;
  let watcher: TranscriptWatcher | undefined;

  afterEach(async () => {
    await watcher?.stop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  function setup(): { root: string; events: AgentEvent[] } {
    dir = mkdtempSync(join(tmpdir(), 'overseer-'));
    const events: AgentEvent[] = [];
    return { root: dir, events };
  }

  it('loads recent sessions (and subagents) at startup, skips old history', async () => {
    const { root, events } = setup();
    cpSync(FIXTURES, root, { recursive: true });
    const old = join(root, '-Users-dev-demo-app', `${NORMAL}.jsonl`);
    const longAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    utimesSync(old, longAgo, longAgo);

    watcher = new TranscriptWatcher({ root, polling: true });
    watcher.on('events', (evs) => events.push(...evs));
    await watcher.start();
    await watcher.idle();

    const sessions = new Set(events.map((e) => e.agentId));
    expect(sessions.has(NORMAL)).toBe(false);
    expect(sessions.has(WITH_SUBAGENT)).toBe(true);
    expect(sessions.has(`${WITH_SUBAGENT}:${SUBAGENT_ID}`)).toBe(true);
    // The subagent spawn links to the parent's Agent tool call via .meta.json.
    const spawn = events.find((e) => e.kind === 'subagent_spawn');
    expect(spawn).toMatchObject({
      parentAgentId: WITH_SUBAGENT,
      text: 'Scan TODOs',
      tool: { name: 'Agent', useId: 'toolu_p_agent', summary: 'Scan TODOs' },
    });
  });

  it('tails appended lines, buffering half-written lines', async () => {
    const { root, events } = setup();
    const projectDir = join(root, '-Users-dev-demo-app');
    cpSync(FIXTURES, root, { recursive: true, filter: (src) => !src.endsWith('.jsonl') });
    const file = join(projectDir, `${NORMAL}.jsonl`);
    writeFileSync(file, '');

    watcher = new TranscriptWatcher({ root, polling: true });
    watcher.on('events', (evs) => events.push(...evs));
    await watcher.start();

    const text = fixtureText(`${NORMAL}.jsonl`);
    const lines = text.split('\n');
    const firstAssistant = lines.findIndex((l) => JSON.parse(l || '{}').type === 'assistant');
    // Cut in the middle of the first assistant line.
    const cut = lines.slice(0, firstAssistant).join('\n').length + 1 + 20;
    appendFileSync(file, text.slice(0, cut));
    await until(() => events.some((e) => e.kind === 'session_start'));
    await watcher.idle();
    expect(events.some((e) => e.kind === 'thinking')).toBe(false);

    appendFileSync(file, text.slice(cut));
    await until(() => events.some((e) => e.kind === 'waiting_for_user'));
    expect(events.map((e) => e.kind)).toContain('thinking');
    expect(new Set(events.map((e) => e.id)).size).toBe(events.length);
  });
});
