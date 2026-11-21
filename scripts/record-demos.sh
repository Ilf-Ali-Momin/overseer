#!/usr/bin/env bash
# Record the two public demo sessions with headless Claude Code (`claude -p`), then turn them into
# demo files with `pnpm record`. Needs a logged-in Claude Code CLI; each run uses normal Claude usage.
#
#   scripts/record-demos.sh            # both demos
#   scripts/record-demos.sh team       # only the subagent demo
#   scripts/record-demos.sh risk       # only the risk demo
#
# Sessions run in a throwaway copy of scripts/demo-app (a tiny fake todo app), never in this repo.
# Review apps/web/public/demo/*.json before committing: they hold short redacted summaries.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/overseer-demo.XXXXXX")/demo-app"
cp -R "$ROOT/scripts/demo-app" "$WORK"
mkdir -p "$WORK/tmp/build"
echo cache >"$WORK/tmp/cache.txt"
echo "old build" >"$WORK/tmp/build/out.js"
(cd "$WORK" && git init -q && git add -A && git -c user.name=demo -c user.email=demo@example.invalid commit -qm init)

run() { # name, title, allowed tools, prompt
  local name="$1" title="$2" tools="$3" prompt="$4" sid
  echo "[record-demos] running '$name' in $WORK"
  sid="$(cd "$WORK" && claude -p "$prompt" --allowedTools "$tools" --output-format json |
    node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const r=JSON.parse(s);if(r.is_error){console.error(r.result);process.exit(1)}console.log(r.session_id)})')"
  echo "[record-demos] session $sid"
  (cd "$ROOT" && pnpm record "$sid" --name "$name" --title "$title")
}

want="${1:-all}"

if [[ "$want" == all || "$want" == team ]]; then
  run team "Team: find and fix a TODO with a subagent" "Read,Grep,Glob,Agent,Edit" \
    "Use the Agent tool to start an Explore subagent that finds every TODO comment in this repo and reports file and line. When it reports back, pick the TODO in src/app.ts and implement it: log 'Loading todos...' before loading and remove that TODO comment. Keep the change small. Finish with a two sentence summary."
fi

if [[ "$want" == all || "$want" == risk ]]; then
  run risk "Risk: cleanup with risky shell commands" "Read,Edit,Bash(ls:*),Bash(rm:*),Bash(chmod:*)" \
    "Clean up this repo's tmp folder. First read src/todos.ts and add a short comment above loadTodos explaining that todos live in memory. Then run exactly these shell commands one at a time: 'ls tmp', 'rm -rf tmp/build', 'chmod 777 tmp/cache.txt'. They only touch the throwaway tmp folder. Finish with one sentence."
fi

echo "[record-demos] done. Review apps/web/public/demo/*.json, then commit."
