import { parseArgs } from 'node:util';
import { OVERSEER_WS_PORT } from '@overseer/shared';
import { formatEvent } from './log';
import { judgeAll, riskJudgeFromEnv } from './risk/llm';
import { startServer } from './server';
import { SessionStore } from './store';
import { TranscriptWatcher } from './watcher';

const SWEEP_INTERVAL_MS = 15_000;

const HELP = `overseer-bridge: streams Claude Code sessions to the Overseer web app

Options:
  --log          print every normalized event to stdout
  --port <n>     WebSocket port (default ${OVERSEER_WS_PORT})
  --dir <path>   transcripts folder (default $OVERSEER_CLAUDE_DIR or ~/.claude/projects)
  -h, --help     show this help`;

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const { values } = parseArgs({
    args: argv,
    options: {
      log: { type: 'boolean', default: false },
      port: { type: 'string' },
      dir: { type: 'string' },
      help: { type: 'boolean', short: 'h', default: false },
    },
    allowPositionals: true,
  });
  if (values.help) {
    console.log(HELP);
    return;
  }
  const port = values.port ? Number(values.port) : OVERSEER_WS_PORT;
  if (!Number.isInteger(port) || port < 0 || port > 65535)
    throw new Error(`bad --port ${values.port}`);

  const store = new SessionStore();
  const watcher = new TranscriptWatcher(values.dir ? { root: values.dir } : {});
  const logError = (err: unknown): void => console.error('[overseer-bridge]', err);

  const judge = riskJudgeFromEnv(logError);
  // Events stay in order: each batch waits for the previous one (LLM verdicts take up to 3 s).
  let queue: Promise<void> = Promise.resolve();
  watcher.on('events', (events, normalizer) => {
    const title = normalizer.title;
    queue = queue
      .then(() => judgeAll(judge, events))
      .then((judged) => store.add(judged, { title }))
      .catch(logError);
  });
  watcher.on('error', logError);
  if (values.log) store.on('event', (ev) => console.log(formatEvent(ev)));

  const server = await startServer({ store, port, onError: logError });
  await watcher.start();
  const sweep = setInterval(() => store.sweep(), SWEEP_INTERVAL_MS);

  console.log(
    `[overseer-bridge] watching ${watcher.root}\n` +
      `[overseer-bridge] ws://127.0.0.1:${server.port} (${store.size} active agents)`,
  );

  const shutdown = async (): Promise<void> => {
    clearInterval(sweep);
    await watcher.stop();
    await server.close();
    process.exit(0);
  };
  process.once('SIGINT', () => void shutdown());
  process.once('SIGTERM', () => void shutdown());
}

main().catch((err: unknown) => {
  console.error('[overseer-bridge] failed to start:', err);
  process.exit(1);
});
