# Transcript fixtures

Synthetic transcripts that copy the **real** Claude Code JSONL structure (see
`docs/ARCHITECTURE.md` section 1). Every value is fake: no real prompts, paths, commands or output.

Layout mirrors `~/.claude/projects/`, so tests can point `OVERSEER_CLAUDE_DIR` at `fixtures/projects`.

| Session          | Covers                                                                                                                                                          |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `1111…` normal   | noise lines, custom-title, prompt, thinking, text, Read/Grep/Edit/Bash, split `message.id`, `end_turn`, `stop_hook_summary`                                     |
| `2222…` subagent | `Agent` tool_use in the main file; child in `2222…/subagents/agent-a0c0ffee00000000b.jsonl` + `.meta.json` (`toolUseId` links to parent)                        |
| `3333…` errors   | failing Bash (`is_error: true`), missing file, `api_error` system line, `isApiErrorMessage`, `AskUserQuestion`, unknown line type, truncated non-JSON last line |

Regenerate with `python3 packages/bridge/scripts/make-fixtures.py packages/bridge/fixtures`.
