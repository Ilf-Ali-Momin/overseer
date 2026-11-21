# overseer-bridge

Streams your Claude Code sessions to [Overseer](https://overseer-liard-seven.vercel.app), a 3D office
where each agent is an animated character.

```bash
npx overseer-bridge
```

Then open the Overseer page and click **Go live** (Chrome may ask to allow access to devices on your
local network: allow it, the page only talks to `127.0.0.1`), or run the web app locally from the
Overseer repo. Each Claude Code session you use shows up as a character.

## What it does

- Watches `~/.claude/projects/**/*.jsonl` (Claude Code transcripts) and reads only new lines.
- Turns them into small events (tool calls, thinking, waiting, subagents) with an offline risk level.
- Serves them on `ws://127.0.0.1:4317`, reachable from this machine only.

## Privacy

Transcripts never leave your machine. Only short summaries go to the local page, and every summary
is redacted first (keys, tokens, `NAME=value` secrets, emails, long random strings, your home path).
Optional LLM risk verdicts (`OVERSEER_LLM=1`, needs `ANTHROPIC_API_KEY`) send only that redacted
one-line summary to the Anthropic API; they are off by default.

## Options

| Flag / env                             | Default              |                                               |
| -------------------------------------- | -------------------- | --------------------------------------------- |
| `--log`                                | off                  | Print every event                             |
| `--port <n>` / `OVERSEER_WS_PORT`      | 4317                 | WebSocket port                                |
| `--dir <path>` / `OVERSEER_CLAUDE_DIR` | `~/.claude/projects` | Transcripts folder                            |
| `OVERSEER_LLM=1`                       | off                  | One-line LLM risk verdicts (Claude Haiku 5.5) |
| `OVERSEER_LLM_MODEL`                   | `claude-haiku-5-5`   | Model for verdicts                            |

## License

MIT
