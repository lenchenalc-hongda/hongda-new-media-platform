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
: "${FIX_ROUND:=0}"
: "${MAX_FIX_ROUNDS:=3}"

emit_output() {
  local key="$1" value="$2"
  printf '%s=%s\n' "$key" "$value"
  if [ -n "${GITHUB_OUTPUT:-}" ]; then
    printf '%s=%s\n' "$key" "$value" >> "$GITHUB_OUTPUT"
  fi
}

redacted_tail() {
  /usr/bin/sed -E \
    -e 's/sk-[A-Za-z0-9_-]{12,}/[REDACTED_API_KEY]/g' \
    -e 's/(DEEPSEEK_API_KEY=)[^[:space:]]+/\1[REDACTED]/g' \
    "$1" | /usr/bin/tail -n 80
}

classify_codex_failure() {
  local file="$1"
  # A real API 401 is terminal even if stderr also mentions keychain context.
  if /usr/bin/grep -Eqi '(^|[^0-9])401([^0-9]|$)|unauthori[sz]ed|invalid (api )?key|authentication failed' "$file"; then
    printf 'PROVIDER_401'
  elif /usr/bin/grep -Eqi '/usr/bin/security|Failed to resolve external auth|keychain' "$file"; then
    printf 'KEYCHAIN_FAILURE'
  elif /usr/bin/grep -Eqi '429|Too Many Requests|Could not resolve host|connection reset|network is unreachable|timed? out|TLS|SSL' "$file"; then
    printf 'NETWORK_FAILURE'
  elif /usr/bin/grep -Eqi 'auth|credential|login' "$file"; then
    printf 'AUTH_FAILURE'
  else
    printf 'CODEX_CRASH'
  fi
}

# Single execution-path classifier, including stderr/exit-status conflicts.
# Real provider 401 wins over incidental keychain context and even an
# unexpected CLI zero-exit with a clear provider rejection diagnostic.
classify_codex_attempt() {
  local exit_status="$1" logfile="$2" detected
  detected="$(classify_codex_failure "$logfile")"
  if [ "$detected" = "PROVIDER_401" ] || [ "$detected" = "KEYCHAIN_FAILURE" ]; then
    printf '%s' "$detected"
  elif [ "$exit_status" -eq 0 ]; then
    printf 'NONE'
  else
    printf '%s' "$detected"
  fi
}

retry_delay() {
  case "$1" in
    1) printf '2' ;;
    2) printf '5' ;;
    *) printf '10' ;;
  esac
}

codex_binary="$HOME/.codex/plugins/.plugin-appserver/codex-cli/bin/codex"
if [ ! -x "$codex_binary" ]; then
  codex_binary="/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex"
fi
if [ ! -x "$codex_binary" ]; then
  codex_binary="/Applications/ChatGPT.app/Contents/Resources/codex"
fi
if [ ! -x "$codex_binary" ]; then
  emit_output failure_class AUTH_FAILURE
  emit_output run_result INFRA_FAILURE
  printf 'CODEX_BINARY=ABSENT\n'
  exit 1
fi
printf 'CODEX_BINARY=%s\n' "$codex_binary"
"$codex_binary" --version 2>/dev/null || true

default_model="${AGENT_CONTROL_DEFAULT_MODEL:-deepseek-v4-flash}"
strong_model="${AGENT_CONTROL_STRONG_MODEL:-deepseek-v4-pro}"
model_tier="L1"
model_name="$default_model"
reasoning_effort="high"

if [ "$STATUS" = "FIX_REQUIRED" ]; then
  if [ "$FIX_ROUND" -ge "$MAX_FIX_ROUNDS" ]; then
    emit_output failure_class CODE_ERROR
    emit_output run_result STOP_MAX_FIX_ROUNDS
    printf 'MODEL_POLICY_V1=STOP_MAX_FIX_ROUNDS\n'
    printf 'PM_DIAGNOSIS_REQUIRED=YES\n'
    exit 2
  elif [ "$FIX_ROUND" -ge 2 ]; then
    model_tier="L3"
    model_name="$strong_model"
    reasoning_effort="xhigh"
  else
    model_tier="L2"
    model_name="$default_model"
    reasoning_effort="xhigh"
  fi
fi

printf 'MODEL_POLICY_V1_TIER=%s\n' "$model_tier"
printf 'MODEL_POLICY_V1_MODEL=%s\n' "$model_name"
printf 'MODEL_POLICY_V1_REASONING=%s\n' "$reasoning_effort"

deepseek_api_key="$(/bin/launchctl getenv DEEPSEEK_API_KEY 2>/dev/null || true)"
if [ -z "$deepseek_api_key" ]; then
  emit_output failure_class AUTH_FAILURE
  emit_output run_result INFRA_FAILURE
  printf 'DEEPSEEK_API_KEY_STATUS=MISSING\n'
  exit 1
fi
printf 'DEEPSEEK_API_KEY_STATUS=AVAILABLE\n'

[ "$(git rev-parse HEAD)" = "$EXPECTED_HEAD" ] || { emit_output failure_class STALE_MASTER; emit_output run_result INFRA_FAILURE; printf 'PROJECT_LANE_HEAD=STALE\n'; exit 1; }
[ -z "$(git status --porcelain)" ] || { emit_output failure_class UNKNOWN_INFRA_FAILURE; emit_output run_result INFRA_FAILURE; printf 'PROJECT_LANE_WORKTREE=DIRTY\n'; exit 1; }

objective_file="$(mktemp "$RUNNER_TEMP/project-lane-objective.XXXXXX")"
paths_json="$(mktemp "$RUNNER_TEMP/project-lane-paths-json.XXXXXX")"
paths_file="$(mktemp "$RUNNER_TEMP/project-lane-paths.XXXXXX")"
prompt_file="$(mktemp "$RUNNER_TEMP/project-lane-prompt.XXXXXX")"
result_file="$(mktemp "$RUNNER_TEMP/project-lane-result.XXXXXX")"
event_log="$(mktemp "$RUNNER_TEMP/project-lane-events.XXXXXX")"
error_log="$(mktemp "$RUNNER_TEMP/project-lane-error.XXXXXX")"
changed_file="$(mktemp "$RUNNER_TEMP/project-lane-changed.XXXXXX")"
help_file="$(mktemp "$RUNNER_TEMP/project-lane-help.XXXXXX")"
exec_help_file="$(mktemp "$RUNNER_TEMP/project-lane-exec-help.XXXXXX")"
agent_user_home="$(mktemp -d "$RUNNER_TEMP/agent-control-home.XXXXXX")"
agent_codex_home="$agent_user_home/.codex"

cleanup() {
  rm -f "$objective_file" "$paths_json" "$paths_file" "$prompt_file" "$result_file" "$event_log" "$error_log" "$changed_file" "$help_file" "$exec_help_file"
  rm -rf "$agent_user_home"
}
trap cleanup EXIT

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
MODEL_POLICY_V1_TIER = $model_tier
MODEL = $model_name
REASONING_EFFORT = $reasoning_effort

Read the complete objective from: $objective_file
You may modify only the exact newline-separated repository paths in: $paths_file
Do not modify any other path.
Do not stage, commit, push, create/switch branches, edit git metadata, call GitHub write APIs,
read unrelated user credentials/tokens/cookies, print secrets, execute Production SQL/RLS/env changes,
or perform external publishing.
MODEL_POLICY_V1 is enforced by the wrapper: new tasks use L1, first fix uses L2, second fix uses L3,
and max-fix exhaustion stops for PM diagnosis. Do not attempt to override the selected model/tier.
Human Gate remains mandatory for Production SQL/RLS/env/secrets, destructive Production data actions,
auth/security boundary weakening, finance/customer-ownership source-of-truth changes, or real external cutover.
Keep all edits unstaged. Run no network-write operation.
When finished, return a short plain-text completion summary. The wrapper, not you, validates paths/tests and publishes Git state.
EOF2

# Reliability V2: build an isolated, non-interactive Codex runtime.
# The agent runtime never points CODEX_HOME or HOME at the user's Desktop Codex state.
mkdir -p "$agent_codex_home"
source_config="$HOME/.codex/config.toml"
if [ ! -f "$source_config" ]; then
  emit_output failure_class AUTH_FAILURE
  emit_output run_result INFRA_FAILURE
  printf 'AGENT_CODEX_SOURCE_CONFIG=MISSING\n'
  exit 1
fi

source_provider_id="$(/usr/bin/awk -F= '
  /^[[:space:]]*model_provider[[:space:]]*=/ {
    value=$2
    gsub(/^[[:space:]]*"/, "", value)
    gsub(/"[[:space:]]*$/, "", value)
    gsub(/[[:space:]]/, "", value)
    print value
    exit
  }
' "$source_config")"
if [ -z "$source_provider_id" ]; then
  emit_output failure_class AUTH_FAILURE
  emit_output run_result INFRA_FAILURE
  printf 'AGENT_CODEX_PROVIDER_ID=MISSING\n'
  exit 1
fi
printf 'AGENT_CODEX_SOURCE_PROVIDER_ID=%s\n' "$source_provider_id"

provider_block_for() {
  local provider="$1"
  /usr/bin/awk -v provider="$provider" '
    {
      normalized=$0
      sub(/^[[:space:]]+/, "", normalized)
    }
    normalized == "[model_providers." provider "]" {capture=1; print normalized; next}
    normalized ~ /^\[/ && capture {exit}
    capture && normalized ~ /^(name|base_url|env_key|wire_api|requires_openai_auth|request_max_retries|stream_max_retries|stream_idle_timeout_ms)[[:space:]]*=/ {print normalized}
  ' "$source_config"
}

provider_is_safe_deepseek() {
  local block="$1"
  [ -n "$block" ] || return 1
  printf '%s\n' "$block" | /usr/bin/grep -Eqi '/usr/bin/security|external_auth|auth_command|experimental_bearer_token' && return 1
  printf '%s\n' "$block" | /usr/bin/grep -Eq '^env_key[[:space:]]*=.*DEEPSEEK_API_KEY' || return 1
  printf '%s\n' "$block" | /usr/bin/grep -Eq '^requires_openai_auth[[:space:]]*=[[:space:]]*false([[:space:]]|$)' || return 1
  return 0
}

provider_targets_deepseek() {
  local block="$1"
  [ -n "$block" ] || return 1
  printf '%s\n' "$block" | /usr/bin/grep -Eqi '^base_url[[:space:]]*=.*deepseek\.com'
}

normalize_deepseek_provider_block() {
  local block="$1"
  printf '%s\n' "$block" | /usr/bin/awk '
    /^env_key[[:space:]]*=/ {next}
    /^requires_openai_auth[[:space:]]*=/ {next}
    {print}
    END {
      print "env_key = \"DEEPSEEK_API_KEY\""
      print "requires_openai_auth = false"
    }
  '
}

provider_block="$(provider_block_for "$source_provider_id")"
selected_provider_id="$source_provider_id"

# cc-switch and older Desktop configs can leave root model_provider pointing at an
# alias while the actual DeepSeek env-key provider is stored under a different
# [model_providers.*] section. Discover that section from the live config rather
# than guessing a provider id or copying any credential value.
if ! provider_is_safe_deepseek "$provider_block"; then
  safe_provider_id="$(/usr/bin/awk '
    function finish() {
      if (found == "" && provider != "" && !unsafe && (has_env || deepseek_url)) {
        found=provider
      }
    }
    {
      normalized=$0
      sub(/^[[:space:]]+/, "", normalized)
    }
    normalized ~ /^\[model_providers\.[^]]+\]$/ {
      finish()
      provider=normalized
      sub(/^\[model_providers\./, "", provider)
      sub(/\]$/, "", provider)
      has_env=0
      auth_false=0
      deepseek_url=0
      unsafe=0
      next
    }
    normalized ~ /^\[/ {
      finish()
      provider=""
      next
    }
    provider != "" && normalized ~ /^env_key[[:space:]]*=.*DEEPSEEK_API_KEY/ {has_env=1}
    provider != "" && normalized ~ /^requires_openai_auth[[:space:]]*=[[:space:]]*false([[:space:]]|$)/ {auth_false=1}
    provider != "" && normalized ~ /^base_url[[:space:]]*=.*deepseek\.com/ {deepseek_url=1}
    provider != "" && normalized ~ /(\/usr\/bin\/security|external_auth|auth_command|experimental_bearer_token)/ {unsafe=1}
    END {
      finish()
      if (found != "") print found
    }
  ' "$source_config")"
  if [ -n "$safe_provider_id" ]; then
    selected_provider_id="$safe_provider_id"
    provider_block="$(provider_block_for "$selected_provider_id")"
    printf 'AGENT_CODEX_PROVIDER_SELECTION=DISCOVERED_SAFE_ENV_PROVIDER\n'
  fi
fi

if [ -z "$provider_block" ]; then
  emit_output failure_class AUTH_FAILURE
  emit_output run_result INFRA_FAILURE
  printf 'AGENT_CODEX_PROVIDER_CONFIG=MISSING_FOR_%s\n' "$selected_provider_id"
  exit 1
fi

# Some Desktop/cc-switch configurations point model_provider at a generic alias
# whose base_url is DeepSeek but whose env_key still names a legacy variable.
# The isolated Agent runtime already injects DEEPSEEK_API_KEY explicitly, so
# normalize only the allow-listed provider metadata for that DeepSeek endpoint.
# No credential value is copied and Production configuration is not modified.
if ! provider_is_safe_deepseek "$provider_block" && provider_targets_deepseek "$provider_block"; then
  provider_block="$(normalize_deepseek_provider_block "$provider_block")"
  printf 'AGENT_CODEX_PROVIDER_SELECTION=NORMALIZED_DEEPSEEK_ALIAS\n'
fi
if printf '%s\n' "$provider_block" | /usr/bin/grep -Eqi '/usr/bin/security|external_auth|auth_command|experimental_bearer_token'; then
  emit_output failure_class KEYCHAIN_FAILURE
  emit_output run_result INFRA_FAILURE
  printf 'AGENT_CODEX_PROVIDER_CONFIG=UNSAFE_EXTERNAL_AUTH\n'
  exit 1
fi
if ! printf '%s\n' "$provider_block" | /usr/bin/grep -Eq '^env_key[[:space:]]*=[[:space:]]*"DEEPSEEK_API_KEY"'; then
  emit_output failure_class AUTH_FAILURE
  emit_output run_result INFRA_FAILURE
  printf 'AGENT_CODEX_PROVIDER_CONFIG=WRONG_ENV_KEY\n'
  exit 1
fi
if ! printf '%s\n' "$provider_block" | /usr/bin/grep -Eq '^requires_openai_auth[[:space:]]*=[[:space:]]*false'; then
  emit_output failure_class AUTH_FAILURE
  emit_output run_result INFRA_FAILURE
  printf 'AGENT_CODEX_PROVIDER_CONFIG=REQUIRES_EXTERNAL_AUTH\n'
  exit 1
fi
printf 'AGENT_CODEX_SELECTED_PROVIDER_ID=%s\n' "$selected_provider_id"

model_catalog_line=""
if [ -f "$HOME/.codex/models.json" ] && /usr/bin/grep -Eq '^model_catalog_json[[:space:]]*=' "$source_config"; then
  cp "$HOME/.codex/models.json" "$agent_codex_home/models.json"
  chmod 600 "$agent_codex_home/models.json"
  model_catalog_line="model_catalog_json = \"$agent_codex_home/models.json\""
fi

{
  printf 'model = "%s"\n' "$model_name"
  printf 'model_provider = "%s"\n' "$selected_provider_id"
  printf 'model_reasoning_effort = "%s"\n' "$reasoning_effort"
  if [ -n "$model_catalog_line" ]; then printf '%s\n' "$model_catalog_line"; fi
  /usr/bin/grep -E '^(preferred_auth_method|forced_login_method)[[:space:]]*=' "$source_config" || true
  printf '\n%s\n' "$provider_block"
} > "$agent_codex_home/config.toml"
chmod 600 "$agent_codex_home/config.toml"

# Discover the actual installed CLI surface before executing; fail closed if required flags are absent.
env -i HOME="$agent_user_home" CODEX_HOME="$agent_codex_home" PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin" TMPDIR="$RUNNER_TEMP" \
  "$codex_binary" --help > "$help_file" 2>&1 || true
env -i HOME="$agent_user_home" CODEX_HOME="$agent_codex_home" PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin" TMPDIR="$RUNNER_TEMP" \
  "$codex_binary" exec --help > "$exec_help_file" 2>&1 || true

for required in exec; do
  /usr/bin/grep -q -- "$required" "$help_file" || { emit_output failure_class AUTH_FAILURE; emit_output run_result INFRA_FAILURE; printf 'CODEX_HELP_REQUIRED_CAPABILITY_MISSING=%s\n' "$required"; exit 1; }
done
for required in '--output-last-message' '--ephemeral' '--ignore-rules'; do
  /usr/bin/grep -q -- "$required" "$exec_help_file" || { emit_output failure_class AUTH_FAILURE; emit_output run_result INFRA_FAILURE; printf 'CODEX_EXEC_REQUIRED_FLAG_MISSING=%s\n' "$required"; exit 1; }
done
if ! /usr/bin/grep -q -- '--no-daemon' "$help_file"; then
  emit_output failure_class AUTH_FAILURE
  emit_output run_result INFRA_FAILURE
  printf 'CODEX_REQUIRED_FLAG_MISSING=--no-daemon\n'
  exit 1
fi
printf 'AGENT_CODEX_RUNTIME=ISOLATED\n'
printf 'AGENT_CODEX_KEYCHAIN_DEPENDENCY=NONE_CONFIGURED\n'

codex_status=1
failure_class="CODEX_CRASH"
local_attempts=0
for attempt in 1 2 3; do
  local_attempts="$attempt"
  : > "$event_log"
  : > "$error_log"
  set +e
  env -i \
    HOME="$agent_user_home" \
    CODEX_HOME="$agent_codex_home" \
    PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin" \
    DEEPSEEK_API_KEY="$deepseek_api_key" \
    TMPDIR="$RUNNER_TEMP" \
    "$codex_binary" --no-daemon exec \
    -m "$model_name" \
    -c "model_reasoning_effort=\"$reasoning_effort\"" \
    -C "$GITHUB_WORKSPACE" \
    -s workspace-write \
    -c 'approval_policy="never"' \
    --ephemeral \
    --ignore-rules \
    --output-last-message "$result_file" \
    - < "$prompt_file" > "$event_log" 2> "$error_log"
  codex_status=$?
  set -e

  # Exercise the same single classifier in tests and live Codex execution.
  failure_class="$(classify_codex_attempt "$codex_status" "$error_log")"
  if [ "$failure_class" = "NONE" ]; then
    break
  fi
  if [ "$failure_class" = "KEYCHAIN_FAILURE" ]; then codex_status=72; fi
  if [ "$codex_status" -eq 0 ]; then codex_status=73; fi

  printf 'CODEX_LOCAL_ATTEMPT=%s/3 FAILURE_CLASS=%s\n' "$attempt" "$failure_class"
  printf 'CODEX_STDERR_BEGIN\n'
  redacted_tail "$error_log"
  printf 'CODEX_STDERR_END\n'
  # Static auth failures cannot self-heal by calling the provider with the
  # same credential. Escalate after one failed request instead of 3x locally
  # plus 3x external workflow attempts.
  if [ "$failure_class" = "PROVIDER_401" ] || [ "$failure_class" = "KEYCHAIN_FAILURE" ]; then
    printf 'CODEX_LOCAL_RETRY=SKIPPED_NON_RETRYABLE_AUTH\n'
    break
  fi
  if [ "$attempt" -lt 3 ]; then
    sleep "$(retry_delay "$attempt")"
  fi
done

emit_output infra_local_attempts "$local_attempts"
printf 'CODEX_EXIT_STATUS=%s\n' "$codex_status"
if [ "$codex_status" -ne 0 ]; then
  emit_output failure_class "$failure_class"
  emit_output run_result INFRA_FAILURE
  emit_output checks_passed false
  printf 'PROJECT_LANE_CODEX=FAIL\n'
  exit 1
fi

[ "$(git rev-parse HEAD)" = "$EXPECTED_HEAD" ] || { emit_output failure_class STALE_MASTER; emit_output run_result INFRA_FAILURE; printf 'PROJECT_LANE_GIT_HEAD=CHANGED\n'; exit 1; }
git diff --cached --exit-code > /dev/null || { emit_output failure_class UNKNOWN_INFRA_FAILURE; emit_output run_result INFRA_FAILURE; printf 'PROJECT_LANE_INDEX=DIRTY\n'; exit 1; }

{
  git -c core.quotepath=false diff --name-only --no-renames
  git -c core.quotepath=false ls-files --others --exclude-standard
} | sed '/^$/d' | LC_ALL=C sort -u > "$changed_file"
changed_count="$(wc -l < "$changed_file" | tr -d ' ')"
if [ "$changed_count" -lt 1 ] || [ "$changed_count" -gt 30 ]; then
  emit_output failure_class CODE_ERROR
  emit_output run_result CODE_FAILURE
  emit_output checks_passed false
  printf 'PROJECT_LANE_CHANGED_COUNT=INVALID\n'
  exit 1
fi

while IFS= read -r path; do
  grep -Fxq "$path" "$paths_file" || { emit_output failure_class CODE_ERROR; emit_output run_result CODE_FAILURE; emit_output checks_passed false; printf 'PROJECT_LANE_PATH_OUT_OF_SCOPE=%s\n' "$path"; exit 1; }
  if [ -L "$path" ]; then emit_output failure_class CODE_ERROR; emit_output run_result CODE_FAILURE; emit_output checks_passed false; printf 'PROJECT_LANE_SYMLINK=UNSAFE\n'; exit 1; fi
  if [ -f "$path" ] && [ -x "$path" ]; then emit_output failure_class CODE_ERROR; emit_output run_result CODE_FAILURE; emit_output checks_passed false; printf 'PROJECT_LANE_EXECUTABLE=UNSAFE\n'; exit 1; fi
done < "$changed_file"

if git diff --summary | grep -Eq 'mode change|120000|160000|create mode 100755'; then
  emit_output failure_class CODE_ERROR
  emit_output run_result CODE_FAILURE
  emit_output checks_passed false
  printf 'PROJECT_LANE_MODE=UNSAFE\n'
  exit 1
fi

git diff --check

check_failure=""
IFS=',' read -r -a requested_checks <<< "$CHECKS"
for check_name in "${requested_checks[@]}"; do
  printf 'PROJECT_LANE_CHECK_START=%s\n' "$check_name"
  set +e
  case "$check_name" in
    typecheck) pnpm exec tsc --noEmit ;;
    build) pnpm build ;;
    secret-audit) bash scripts/audit-bundle-secrets.sh ;;
    smoke)
      pnpm next start -p 3000 > "$RUNNER_TEMP/project-lane-smoke.log" 2>&1 &
      smoke_pid=$!
      smoke_status=1
      for attempt in {1..25}; do
        if curl -fsS http://localhost:3000 > /dev/null; then smoke_status=0; break; fi
        sleep 2
      done
      if [ "$smoke_status" -eq 0 ]; then curl -fsS http://localhost:3000 > /dev/null; smoke_status=$?; fi
      kill "$smoke_pid" 2>/dev/null || true
      wait "$smoke_pid" 2>/dev/null || true
      (exit "$smoke_status")
      ;;
    *) printf 'PROJECT_LANE_CHECK=UNKNOWN_%s\n' "$check_name"; false ;;
  esac
  check_status=$?
  set -e
  if [ "$check_status" -ne 0 ]; then
    check_failure="$check_name"
    printf 'PROJECT_LANE_CHECK_FAIL=%s\n' "$check_name"
    break
  fi
  printf 'PROJECT_LANE_CHECK_PASS=%s\n' "$check_name"
done

emit_output changed_count "$changed_count"
printf 'PROJECT_LANE_CODEX=PASS\n'
if [ -n "$check_failure" ]; then
  emit_output failure_class TEST_FAILURE
  emit_output run_result CODE_FAILURE
  emit_output checks_passed false
  emit_output failed_check "$check_failure"
  # Preserve the bounded edits so the publisher can create/update the same PR.
  exit 0
fi

emit_output failure_class NONE
emit_output run_result PASS
emit_output checks_passed true
emit_output failed_check NONE
