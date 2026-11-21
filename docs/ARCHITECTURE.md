# Architecture

```
 ~/.claude/projects/**/*.jsonl          (Claude Code transcripts, one file per session)
              │  chokidar watch + tail new lines
              ▼
 ┌──────────────────────── packages/bridge (Node) ────────────────────────┐
 │  TranscriptWatcher → LineParser → EventNormalizer → RiskEngine          │
 │                                        │                 │ (optional)   │
 │                                        ▼                 ▼              │
 │                                   SessionStore      LLM verdict cache   │
 │                                        │                                │
 │                              WebSocket server :4317                     │
 └────────────────────────────────────────┼────────────────────────────────┘
                                          │ AgentEvent stream (JSON)
                                          ▼
 ┌──────────────────────── apps/web (Next.js + R3F) ──────────────────────┐
 │  EventSource (live WS | demo replay file)                               │
 │        ▼                                                                │
 │  zustand store: agents, desks, timeline, selection, risk alerts         │
 │        ▼                                                                │
 │  <Office/> scene: Room, Desks, Monitors, Characters, Lighting, Camera   │
 │  UI overlay: HoverCard, AgentPanel, RiskFeed, Timeline scrubber, HUD    │
 └─────────────────────────────────────────────────────────────────────────┘
```

## Repo layout

```
overseer/
├── README.md  package.json  pnpm-workspace.yaml
├── docs/ARCHITECTURE.md
├── packages/
│   ├── shared/src/{events.ts, states.ts, index.ts}
│   └── bridge/
│       ├── src/{index.ts, watcher.ts, parser.ts, normalizer.ts,
│       │        risk/{rules.ts, redact.ts, llm.ts}, store.ts, server.ts}
│       ├── fixtures/*.jsonl          (sample transcripts for tests)
│       └── test/*.test.ts
└── apps/web/
    ├── app/{page.tsx, layout.tsx}
    ├── src/scene/{Office.tsx, Room.tsx, Desk.tsx, Monitor.tsx, Character.tsx,
    │              CameraRig.tsx, Lighting.tsx, Effects.tsx}
    ├── src/state/{store.ts, eventSource.ts, replay.ts}
    ├── src/ui/{HoverCard.tsx, AgentPanel.tsx, RiskFeed.tsx, Timeline.tsx, Hud.tsx}
    └── public/{models/*.glb, demo/*.json}
```

## 1. Ingestion: reading transcripts

- Claude Code writes one JSONL file per session in `~/.claude/projects/<encoded-project-path>/<session-id>.jsonl`.
  The folder can be changed with the env var `OVERSEER_CLAUDE_DIR`.
- `watcher.ts`: chokidar watches `**/*.jsonl`. Remember a byte offset for each file and read only the
  new bytes when the file changes. Handle half-written lines by buffering until a newline arrives.
- On startup, load sessions changed in the last 30 minutes so the office is not empty.
- `parser.ts`: `JSON.parse` each line inside try/catch. Unknown `type` values are skipped, never fatal.

### Real transcript format (inspected 2026-11-20, Claude Code 2.1.219 to 2.1.317, entrypoint `claude-desktop`)

**Files**

- Main session: `~/.claude/projects/<encoded-cwd>/<sessionId>.jsonl`. `<encoded-cwd>` is the cwd with
  `/` (and spaces) replaced by `-`, e.g. `-Users-me-Desktop-3d-agents`. Use the `cwd` field on
  lines for the readable project name (basename of `cwd`), not the folder name.
- Subagents: `~/.claude/projects/<encoded-cwd>/<sessionId>/subagents/agent-<agentId>.jsonl`, plus
  `agent-<agentId>.meta.json` = `{ agentType, description, toolUseId, spawnDepth, requestShape, ... }`.
  `toolUseId` is the `id` of the parent's `Agent` tool_use block. **This is the parent/child link.**
  Subagent lines carry `agentId`, `isSidechain: true` and the parent's `sessionId`. No sidechain
  lines were found inside main session files.
- Watch glob therefore must include `**/*.jsonl` at depth 1 and 3 (`*/*.jsonl`, `*/*/subagents/*.jsonl`).

**Line types** (field `type`). Many are UI/bookkeeping and must be ignored:

- Relevant: `user`, `assistant`, `system`, `custom-title` (`customTitle`), `agent-name` (`agentName`).
- Ignore: `attachment` (hook output, reminders, file snapshots), `queue-operation`, `last-prompt`,
  `atis-latch`, `mode`, `frame-link`, `artifact-*`, `file-history-snapshot`, `file-history-delta`,
  `cost-state`, `tools-used`, `api-request*`, and anything unknown.
- Lines without `uuid`/`timestamp` exist (e.g. `custom-title`, `mode`); handle missing fields.

**Common fields on `user` / `assistant` / `system`**: `uuid`, `parentUuid`, `sessionId`,
`timestamp` (ISO string, e.g. `2026-08-29T09:37:22.922Z`), `cwd`, `gitBranch`, `version`,
`entrypoint`, `isSidechain`, `userType`, `slug`; subagent lines add `agentId`.

**`assistant` lines**

- `message` = Anthropic API message: `{ id, model, role, content[], stop_reason, usage, ... }`.
- **Exactly one content block per line.** One API message is split over several lines that share
  `message.id` (up to 6 seen). Each line has its own `uuid`. `usage` is repeated on each line of the
  same message, so count tokens once per `message.id`.
- Block types: `thinking` `{ thinking, signature }` (the `thinking` text is usually empty / redacted,
  ~97% empty), `text` `{ text }`, `tool_use` `{ id, name, input, caller }`.
- `stop_reason`: `tool_use` | `end_turn` | `stop_sequence`. `end_turn` = agent finished its turn and
  is now waiting for the user.
- `usage`: `input_tokens`, `output_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`, ...
- API failures: `isApiErrorMessage: true` / `error` field on assistant lines.

**`user` lines**

- `message.content` is either a string (a human prompt; strings starting with `<` are usually
  command/hook wrappers) or an array of blocks: `tool_result`, `text`, `image`.
- `tool_result` `{ tool_use_id, content, is_error? }`. `content` is usually a string, sometimes an array
  of `text` / `image` / `tool_reference` blocks. `is_error` is often absent (treat as false).
- `toolUseResult` holds the structured tool result (e.g. Bash: `{ stdout, stderr, interrupted, ... }`,
  Edit/Write: `{ filePath, structuredPatch, ... }`, sometimes just a string). Never forward it raw.
- `isMeta: true` marks injected (non-human) user lines; `isCompactSummary` marks compaction summaries.

**`system` lines**: `subtype` in `stop_hook_summary` (end of a turn), `api_error`, `compact_boundary`,
`local_command`, ...

**Tool names seen**: `Bash` (dominant), `Write`, `Edit`, `Read`, `Agent` (subagent; input
`{ description, prompt, subagent_type, run_in_background }`), `Skill`, `ToolSearch`, `AskUserQuestion`,
`WebFetch`, `Monitor`, `TaskStop`, `ExitPlanMode`, and MCP tools named `mcp__<server>__<tool>`.

**No explicit session end.** There is no session_end line. Treat sessions as ended by inactivity
(10 min, per section 3), and treat `stop_reason: end_turn` or an `AskUserQuestion` tool_use as
`waiting_for_user`.

- **Later alternative (Phase 10 stretch):** Claude Code hooks (`PreToolUse`, `PostToolUse`,
  `SubagentStop`, `Notification`, `Stop`) can POST events to the bridge right away. Put ingestion
  behind an `EventSourceAdapter` interface so hooks can be added without touching the rest.

## 2. Shared event schema (`packages/shared/src/events.ts`)

```ts
type AgentEventKind =
  | 'session_start'
  | 'session_end'
  | 'thinking'
  | 'message'
  | 'tool_start'
  | 'tool_end'
  | 'subagent_spawn'
  | 'subagent_end'
  | 'waiting_for_user'
  | 'error';

interface AgentEvent {
  id: string; // stable, from transcript uuid
  ts: number; // epoch ms
  sessionId: string;
  agentId: string; // sessionId for the main agent, derived id for subagents
  parentAgentId?: string;
  project: string; // readable project folder name
  kind: AgentEventKind;
  tool?: { name: string; useId: string; summary: string; isError?: boolean };
  text?: string; // short (≤140 chars) summary, never full content
  risk?: RiskAssessment;
  usage?: { inputTokens?: number; outputTokens?: number };
}

interface RiskAssessment {
  level: 'none' | 'low' | 'medium' | 'high';
  reasons: string[]; // e.g. ["reads .env", "curl to external host"]
  verdict?: string; // optional LLM one-liner
}
```

Validate with zod at the WebSocket boundary on both sides.

## 3. Agent state machine (`packages/shared/src/states.ts`)

The visual state comes from the latest events. It has to be pure and unit tested.

| Trigger                                                 | Visual state  | Animation                                      | Extra                                     |
| ------------------------------------------------------- | ------------- | ---------------------------------------------- | ----------------------------------------- |
| `tool_start` Read / Grep / Glob / LS                    | `reading`     | sit + read                                     | monitor shows file path                   |
| `tool_start` Edit / Write / MultiEdit / NotebookEdit    | `typing`      | sit + type fast                                | monitor scrolls code lines                |
| `tool_start` Bash                                       | `terminal`    | sit + type                                     | monitor shows the command, green on black |
| `tool_start` WebFetch / WebSearch                       | `browsing`    | lean back                                      | globe icon                                |
| `tool_start` Task / Agent                               | `delegating`  | stand + point                                  | spawns a subagent character at the door   |
| `thinking`                                              | `thinking`    | hand on chin                                   | thought bubble with a short summary       |
| `waiting_for_user`                                      | `waiting`     | raise hand                                     | pulsing marker above the head             |
| `tool_end` with isError, or test failure in Bash output | `frustrated`  | slump                                          | small screen shake                        |
| tests pass / session finished                           | `celebrating` | cheer                                          | confetti particles                        |
| no events for 45 s                                      | `idle`        | stand up and wander to coffee / plant / window |                                           |
| `session_end` or no events for 10 min                   | `leaving`     | walk to the door, fade out                     | desk freed                                |

Unknown tools map to `typing`. Keep the map in one table so it is easy to extend.

## 4. Risk Radar (`packages/bridge/src/risk/`)

1. **Rules (always on, offline, fast)** in `rules.ts`, a pure function `(toolName, input) => RiskAssessment`:
   - high: `rm -rf`, `sudo`, `chmod 777`, `curl|wget ... | sh`, `git push --force`, writing to
     `~/.ssh`, `/etc`, shell profiles; reading `.env`, `id_rsa`, `*.pem`, credentials files
   - medium: any network call from Bash (`curl`, `wget`, `nc`, `ssh`, `scp`), package installs,
     `git push`, WebFetch to unknown domains, deleting files
   - low: other Bash commands, writing files outside the project folder
   - Unit test every rule with positive and negative cases.
2. **LLM verdict (optional, opt-in with `OVERSEER_LLM=1` + `ANTHROPIC_API_KEY`)** in `llm.ts`:
   - Only for medium and high. Send the **redacted** command and tool name. Never send file contents.
   - `redact.ts` masks things that look like keys and tokens (long base64/hex strings, `sk-...`,
     `ghp_...`, `AKIA...`), emails, and home folder paths.
   - Use a small fast model, ask for JSON `{ "verdict": "<one line>", "level": "..." }`,
     cache by a hash of the redacted input, timeout 3 s, and fall back to the rules alone on failure.
3. **Visuals:** desk light turns amber (medium) or red (high) with bloom; the RiskFeed panel lists
   events; for high, a short red pulse sweeps across the room's ceiling light.

## 5. Bridge to web protocol

- WebSocket `ws://localhost:4317`. On connect the server sends a `snapshot` (all active agents with their
  last 200 events), then streams `event` messages. Message shape: `{ type: 'snapshot' | 'event', payload }`.
- The client reconnects with backoff. The HUD shows connection status.
- Bind to `127.0.0.1` only. Transcripts are private.

## 6. 3D scene (`apps/web/src/scene/`)

- **Canvas:** R3F `<Canvas shadows dpr={[1, 2]}>`, isometric style `OrthographicCamera` by default, with
  an orbit mode toggle.
- **Room:** floor, two walls, windows, plants, coffee machine, whiteboard, door. Build it from the Kenney
  Furniture Kit (CC0) or one Blender GLB. Merge static meshes; use `<Instances>` for repeated desks and chairs.
- **Desks:** 12 slots on a grid. An agent takes the nearest free desk; subagents take the desk next to
  their parent if it is free.
- **Characters:** Quaternius animated character packs (CC0, rigged, with animations already included,
  so Mixamo retargeting is not needed). Load with `useGLTF`, use `SkeletonUtils.clone` for each instance,
  `useAnimations` for clips, and crossfade 0.25 s between states. Each agent gets a stable color or outfit
  from a hash of its agentId.
- **Movement:** simple waypoint paths on a walkable grid (A* on a small grid is plenty). Ease the
  speed and turn smoothly toward the direction of travel.
- **Monitors:** each desk monitor shows a `CanvasTexture` that is redrawn at most 4 times per second with
  the current file path, command or scrolling fake code lines.
- **Bubbles and labels:** drei `<Html>` for the thought bubbles and HoverCard, with `occlude` and a distance factor.
- **Lighting:** a warm key light with shadows, ambient light, emissive desk lamps for the risk glow. Lighting
  slowly shifts toward evening the longer the oldest session has been running (day/night cycle).
- **Effects:** `@react-three/postprocessing` Bloom (only emissive parts), SMAA, light Vignette. Turn them off
  on low end devices (check with drei `PerformanceMonitor`).
- **Camera rig:** click a character to smoothly follow it (damped lerp); Esc goes back to the overview.
  The camera eases toward a new subagent when it walks in.

## 7. UI overlay (`apps/web/src/ui/`)

- **HoverCard:** name, project, current state, current tool and summary, elapsed time, tool count, token count, risk badge.
- **AgentPanel (on click):** the last 50 events as a timeline, a files touched list, risk events.
- **RiskFeed:** a collapsible list of medium and high events across all agents.
- **Timeline:** a scrubber for replaying a finished session (uses the replay engine).
- **HUD:** connection status, number of active agents, total tokens and estimated cost, live/demo toggle.

## 8. Demo mode and replay

- `replay.ts` plays a recorded `AgentEvent[]` JSON with real timing (speed 1x, 2x, 4x).
- `pnpm record` in the bridge saves a live session to `apps/web/public/demo/<name>.json` (already redacted).
- When no bridge is reachable, the web app falls back to demo mode, so it works when deployed on Vercel.

## 9. Performance budget

- 60 fps with 12 agents. Fewer than 150 draw calls. Textures 1k or smaller. Total GLB size under 15 MB.
- Monitor textures update at most 4 Hz. Store updates are batched per animation frame.
