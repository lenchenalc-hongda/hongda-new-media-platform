#!/bin/bash
set -euo pipefail

: "${GH_APP_TOKEN:?}"
: "${APP_SLUG:?}"
: "${PROJECT_SLUG:?}"
: "${TASK_ID:?}"
: "${STATUS:?}"
: "${BASE_MASTER_SHA:?}"
: "${EXPECTED_HEAD:?}"
: "${BRANCH_NAME:?}"
: "${CONTROL_ISSUE:?}"
: "${TASK_COMMENT_ID:?}"
: "${REPOSITORY:?}"

askpass_file="$(mktemp "$RUNNER_TEMP/project-lane-askpass.XXXXXX")"
curl_config="$(mktemp "$RUNNER_TEMP/project-lane-curl.XXXXXX")"
response_file="$(mktemp "$RUNNER_TEMP/project-lane-response.XXXXXX")"
changed_file="$(mktemp "$RUNNER_TEMP/project-lane-publish-changed.XXXXXX")"
trap 'rm -f "$askpass_file" "$curl_config" "$response_file" "$changed_file"' EXIT

cat > "$askpass_file" <<'EOF2'
#!/bin/sh
case "$1" in
  *Username*) printf '%s\n' 'x-access-token' ;;
  *Password*) printf '%s\n' "$GH_APP_TOKEN" ;;
  *) exit 1 ;;
esac
EOF2
chmod 700 "$askpass_file"

{
  printf 'header = "Authorization: Bearer %s"\n' "$GH_APP_TOKEN"
  printf 'header = "Accept: application/vnd.github+json"\n'
  printf 'header = "X-GitHub-Api-Version: 2022-11-28"\n'
} > "$curl_config"
chmod 600 "$curl_config"

remote_head() {
  GIT_ASKPASS="$askpass_file" GIT_TERMINAL_PROMPT=0 git -c http.version=HTTP/1.1 ls-remote --heads origin "$1" | awk '{print $1}'
}

[ "$(git rev-parse HEAD)" = "$EXPECTED_HEAD" ] || { printf 'PROJECT_LANE_PUBLISH_HEAD=STALE\n'; exit 1; }
[ -n "$(git status --porcelain)" ] || { printf 'PROJECT_LANE_PUBLISH=NO_CHANGES\n'; exit 1; }

{
  git -c core.quotepath=false diff --name-only --no-renames
  git -c core.quotepath=false ls-files --others --exclude-standard
} | sed '/^$/d' | LC_ALL=C sort -u > "$changed_file"

git diff --cached --exit-code > /dev/null
git add -A
git diff --cached --check

if [ "$STATUS" = "READY_FOR_CODEX" ]; then
  existing="$(remote_head "refs/heads/$BRANCH_NAME" || true)"
  [ -z "$existing" ] || { printf 'PROJECT_LANE_BRANCH_ALREADY_EXISTS=YES\n'; exit 1; }
  git -c core.hooksPath=/dev/null switch -c "$BRANCH_NAME"
elif [ "$STATUS" = "FIX_REQUIRED" ]; then
  existing="$(remote_head "refs/heads/$BRANCH_NAME" || true)"
  [ "$existing" = "$EXPECTED_HEAD" ] || { printf 'PROJECT_LANE_REMOTE_HEAD=STALE\n'; exit 1; }
  git -c core.hooksPath=/dev/null switch -c "$BRANCH_NAME"
else
  printf 'PROJECT_LANE_STATUS=UNSUPPORTED\n'; exit 1
fi

bot_name="${APP_SLUG:-hongda-agent-control}[bot]"
git config user.name "$bot_name"
git config user.email "${APP_SLUG:-hongda-agent-control}[bot]@users.noreply.github.com"
git -c core.hooksPath=/dev/null commit -m "feat(${PROJECT_SLUG}): ${TASK_ID}"
commit_sha="$(git rev-parse HEAD)"
GIT_ASKPASS="$askpass_file" GIT_TERMINAL_PROMPT=0 git -c http.version=HTTP/1.1 -c core.hooksPath=/dev/null push origin "HEAD:refs/heads/$BRANCH_NAME"

json_string() {
  /usr/bin/ruby -rjson -e 'print JSON.generate(STDIN.read)'
}

files_changed="$(paste -sd, "$changed_file")"

if [ "$STATUS" = "READY_FOR_CODEX" ]; then
  pr_body="PROJECT = $PROJECT_SLUG
TASK_ID = $TASK_ID
BASE_MASTER_SHA = $BASE_MASTER_SHA
TASK_COMMENT_ID = $TASK_COMMENT_ID
BRANCH = $BRANCH_NAME
HEAD_SHA = $commit_sha
AUTO_MERGE = false
AUTO_PRODUCTION = false
READY_FOR_PM_REVIEW = YES"
  body_json="$(printf '%s' "$pr_body" | json_string)"
  payload="{\"title\":\"$PROJECT_SLUG: $TASK_ID\",\"head\":\"$BRANCH_NAME\",\"base\":\"master\",\"body\":$body_json,\"draft\":true}"
  http_code="$(curl --silent --show-error --http1.1 --config "$curl_config" --output "$response_file" --write-out '%{http_code}' --request POST "https://api.github.com/repos/$REPOSITORY/pulls" --data "$payload")"
  [ "$http_code" = "201" ] || { printf 'PROJECT_LANE_PR_CREATE=FAIL_HTTP_%s\n' "$http_code"; exit 1; }
  pr_number="$(/usr/bin/ruby -rjson -e 'print JSON.parse(File.read(ARGV[0]))["number"]' "$response_file")"
else
  pr_number="${ACTIVE_PR:?}"
fi

completion="PROJECT = $PROJECT_SLUG
TASK_ID = $TASK_ID
TASK_STATUS = PASS
BASE_MASTER_SHA = $BASE_MASTER_SHA
BASE_HEAD_SHA = $EXPECTED_HEAD
HEAD_SHA = $commit_sha
PR_NUMBER = $pr_number
BRANCH = $BRANCH_NAME
FILES_CHANGED = $files_changed
DATABASE_EXECUTED = NO
PRODUCTION_CHANGED = NO
AUTO_MERGE = false
AUTO_PRODUCTION = false
READY_FOR_PM_REVIEW = YES"
completion_json="$(printf '%s' "$completion" | json_string)"
comment_payload="{\"body\":$completion_json}"
comment_code="$(curl --silent --show-error --http1.1 --config "$curl_config" --output "$response_file" --write-out '%{http_code}' --request POST "https://api.github.com/repos/$REPOSITORY/issues/$pr_number/comments" --data "$comment_payload")"
[ "$comment_code" = "201" ] || { printf 'PROJECT_LANE_COMMENT=FAIL_HTTP_%s\n' "$comment_code"; exit 1; }

printf 'PROJECT_LANE_PR=%s\n' "$pr_number"
printf 'PROJECT_LANE_HEAD=%s\n' "$commit_sha"
printf 'PROJECT_LANE_PUBLISH=PASS\n'
