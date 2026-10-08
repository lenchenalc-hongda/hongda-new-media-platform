#!/bin/bash
set -euo pipefail

: "${PROJECT_SLUG:?}"
: "${TASK_ID:?}"
: "${STATUS:?}"
: "${BASE_MASTER_SHA:?}"
: "${EXPECTED_HEAD:?}"
: "${BRANCH_NAME:?}"
: "${OBJECTIVE_B64:?}"
: "${ALLOWED_PATHS_B64:?}"
: "${CHECKS:?}"

codex_binary="/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex"
if [ ! -x "$codex_binary" ]; then
  codex_binary="/Applications/ChatGPT.app/Contents/Resources/codex"
fi
[ -x "$codex_binary" ] || { printf 'CODEX_BINARY=ABSENT\n'; exit 1; }

deepseek_api_key="$(/bin/launchctl getenv DEEPSEEK_API_KEY 2>/dev/null || true)"
[ -n "$deepseek_api_key" ] || { printf 'DEEPSEEK_API_KEY_STATUS=MISSING\n'; exit 1; }
printf 'DEEPSEEK_API_KEY_STATUS=AVAILABLE\n'

[ "$(git rev-parse HEAD)" = "$EXPECTED_HEAD" ] || { printf 'PROJECT_LANE_HEAD=STALE\n'; exit 1; }
[ -z "$(git status --porcelain)" ] || { printf 'PROJECT_LANE_WORKTREE=DIRTY\n'; exit 1; }

objective_file="$(mktemp "$RUNNER_TEMP/project-lane-objective.XXXXXX")"
paths_json="$(mktemp "$RUNNER_TEMP/project-lane-paths-json.XXXXXX")"
paths_file="$(mktemp "$RUNNER_TEMP/project-lane-paths.XXXXXX")"
prompt_file="$(mktemp "$RUNNER_TEMP/project-lane-prompt.XXXXXX")"
result_file="$(mktemp "$RUNNER_TEMP/project-lane-result.XXXXXX")"
event_log="$(mktemp "$RUNNER_TEMP/project-lane-events.XXXXXX")"
error_log="$(mktemp "$RUNNER_TEMP/project-lane-error.XXXXXX")"
changed_file="$(mktemp "$RUNNER_TEMP/project-lane-changed.XXXXXX")"
trap 'rm -f "$objective_file" "$paths_json" "$paths_file" "$prompt_file" "$result_file" "$event_log" "$error_log" "$changed_file"' EXIT

printf '%s' "$OBJECTIVE_B64" | /usr/bin/base64 -D > "$objective_file"
printf '%s' "$ALLOWED_PATHS_B64" | /usr/bin/base64 -D > "$paths_json"
/usr/bin/ruby -rjson -e '
  value = JSON.parse(File.read(ARGV[0]));
  abort "paths" unless value.is_a?(Array) && value.length.between?(1, 30) && value.all? { |p| p.is_a?(String) };
  value.each { |p| puts p }
' "$paths_json" > "$paths_file"

cat > "$prompt_file" <<EOF2
You are executing one bounded Hongda Agent Control project-lane task.

PROJECT = $PROJECT_SLUG
TASK_ID = $TASK_ID
BASE_MASTER_SHA = $BASE_MASTER_SHA
EXPECTED_HEAD = $EXPECTED_HEAD
STATUS = $STATUS

Read the complete objective from: $objective_file
You may modify only the exact newline-separated repository paths in: $paths_file
Do not modify any other path.
Do not stage, commit, push, create/switch branches, edit git metadata, call GitHub write APIs,
read unrelated user credentials/tokens/cookies, print secrets, execute Production SQL/RLS/env changes,
or perform external publishing.
Keep all edits unstaged. Run no network-write operation.
When finished, return a short plain-text completion summary. The wrapper, not you, validates paths/tests and publishes Git state.
EOF2

set +e
env -i \
  HOME="$HOME" \
  PATH="/usr/bin:/bin:/usr/sbin:/sbin" \
  DEEPSEEK_API_KEY="$deepseek_api_key" \
  TMPDIR="$RUNNER_TEMP" \
  "$codex_binary" exec \
  -C "$GITHUB_WORKSPACE" \
  -s workspace-write \
  -c 'approval_policy="never"' \
  --ephemeral \
  --ignore-rules \
  --output-last-message "$result_file" \
  - < "$prompt_file" > "$event_log" 2> "$error_log"
codex_status=$?
set -e
printf 'CODEX_EXIT_STATUS=%s\n' "$codex_status"
[ "$codex_status" -eq 0 ] || { printf 'PROJECT_LANE_CODEX=FAIL\n'; exit 1; }

[ "$(git rev-parse HEAD)" = "$EXPECTED_HEAD" ] || { printf 'PROJECT_LANE_GIT_HEAD=CHANGED\n'; exit 1; }
git diff --cached --exit-code > /dev/null || { printf 'PROJECT_LANE_INDEX=DIRTY\n'; exit 1; }

{
  git diff --name-only --no-renames
  git ls-files --others --exclude-standard
} | sed '/^$/d' | LC_ALL=C sort -u > "$changed_file"
changed_count="$(wc -l < "$changed_file" | tr -d ' ')"
[ "$changed_count" -ge 1 ] && [ "$changed_count" -le 30 ] || { printf 'PROJECT_LANE_CHANGED_COUNT=INVALID\n'; exit 1; }

while IFS= read -r path; do
  grep -Fxq "$path" "$paths_file" || { printf 'PROJECT_LANE_PATH_OUT_OF_SCOPE=%s\n' "$path"; exit 1; }
  if [ -L "$path" ]; then printf 'PROJECT_LANE_SYMLINK=UNSAFE\n'; exit 1; fi
  if [ -f "$path" ] && [ -x "$path" ]; then printf 'PROJECT_LANE_EXECUTABLE=UNSAFE\n'; exit 1; fi
done < "$changed_file"

if git diff --summary | grep -Eq 'mode change|120000|160000|create mode 100755'; then
  printf 'PROJECT_LANE_MODE=UNSAFE\n'
  exit 1
fi

git diff --check

IFS=',' read -r -a requested_checks <<< "$CHECKS"
for check_name in "${requested_checks[@]}"; do
  case "$check_name" in
    typecheck) pnpm exec tsc --noEmit ;;
    build) pnpm build ;;
    secret-audit) bash scripts/audit-bundle-secrets.sh ;;
    smoke)
      pnpm next start -p 3000 > "$RUNNER_TEMP/project-lane-smoke.log" 2>&1 &
      smoke_pid=$!
      trap 'kill "$smoke_pid" 2>/dev/null || true' EXIT
      for attempt in {1..25}; do curl -fsS http://localhost:3000 > /dev/null && break; sleep 2; done
      curl -fsS http://localhost:3000 > /dev/null
      kill "$smoke_pid" 2>/dev/null || true
      trap - EXIT
      ;;
    *) printf 'PROJECT_LANE_CHECK=UNKNOWN_%s\n' "$check_name"; exit 1 ;;
  esac
done

printf 'PROJECT_LANE_CHANGED_COUNT=%s\n' "$changed_count"
printf 'PROJECT_LANE_CODEX=PASS\n'
if [ -n "${GITHUB_OUTPUT:-}" ]; then
  printf 'changed_count=%s\n' "$changed_count" >> "$GITHUB_OUTPUT"
fi
