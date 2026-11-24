#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PG_IMAGE="${PG17_IMAGE:-postgres:17-alpine}"
POSTGREST_IMAGE="${POSTGREST_IMAGE:-postgrest/postgrest:v12.2.12}"
NETWORK="wos-fixture-postgrest-net-$$"
PG_CONTAINER="wos-fixture-postgrest-db-$$"
POSTGREST_CONTAINER="wos-fixture-postgrest-$$"
JWT_SECRET="$(openssl rand -hex 32)"
WRONG_JWT_SECRET="$(openssl rand -hex 32)"

cleanup() {
  docker kill "$POSTGREST_CONTAINER" "$PG_CONTAINER" >/dev/null 2>&1 || true
  docker rm "$POSTGREST_CONTAINER" "$PG_CONTAINER" >/dev/null 2>&1 || true
  docker network rm "$NETWORK" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

docker info >/dev/null
docker network create "$NETWORK" >/dev/null
docker run -d \
  --name "$PG_CONTAINER" \
  --network "$NETWORK" \
  -e POSTGRES_PASSWORD=fixture \
  -e POSTGRES_DB=fixture \
  -v "$ROOT:/work:ro" \
  "$PG_IMAGE" >/dev/null

for _ in $(seq 1 60); do
  if docker exec "$PG_CONTAINER" pg_isready -U postgres -d fixture \
    >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
docker exec "$PG_CONTAINER" pg_isready -U postgres -d fixture >/dev/null

PSQL=(docker exec -i "$PG_CONTAINER" psql -U postgres -d fixture -v ON_ERROR_STOP=1)
"${PSQL[@]}" \
  -f /work/tests/sql/wos-v1-qa-canonical-fixture-pg17-schema.sql >/dev/null
"${PSQL[@]}" \
  -f /work/docs/workshop-order-system/qa-fixture/WOS_V1_QA_CANONICAL_FIXTURE_WRITER_NOT_AUTHORIZED.sql \
  >/dev/null
"${PSQL[@]}" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
CREATE ROLE authenticator LOGIN NOINHERIT PASSWORD 'fixture';
GRANT anon, authenticated, service_role TO authenticator;
SQL

docker run -d \
  --name "$POSTGREST_CONTAINER" \
  --network "$NETWORK" \
  -p 127.0.0.1::3000 \
  -e "PGRST_DB_URI=postgres://authenticator:fixture@$PG_CONTAINER:5432/fixture" \
  -e PGRST_DB_SCHEMAS=public \
  -e PGRST_DB_ANON_ROLE=anon \
  -e "PGRST_JWT_SECRET=$JWT_SECRET" \
  -e PGRST_SERVER_PORT=3000 \
  "$POSTGREST_IMAGE" >/dev/null

PORT="$(docker port "$POSTGREST_CONTAINER" 3000/tcp | head -n 1 | sed 's/.*://')"
BASE_URL="http://127.0.0.1:$PORT"

READY=NO
for _ in $(seq 1 60); do
  STATUS="$(curl --silent --output /dev/null --write-out '%{http_code}' \
    "$BASE_URL/" || true)"
  if [[ "$STATUS" == "200" ]]; then
    READY=YES
    break
  fi
  sleep 1
done
if [[ "$READY" != "YES" ]]; then
  docker logs "$POSTGREST_CONTAINER" >&2
  exit 1
fi

make_jwt() {
  local role="$1"
  local secret="$2"
  local extra_json='{}'
  if [[ "$#" -ge 3 ]]; then
    extra_json="$3"
  fi
  node - "$role" "$secret" "$extra_json" <<'NODE'
const crypto = require('crypto');
const [role, secret, extraJson] = process.argv.slice(2);
const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const header = encode({alg: 'HS256', typ: 'JWT'});
const payload = encode({
  role,
  iss: 'wos-fixture-postgrest-test',
  iat: now,
  exp: now + 300,
  ...JSON.parse(extraJson),
});
const signature = crypto
  .createHmac('sha256', secret)
  .update(`${header}.${payload}`)
  .digest('base64url');
process.stdout.write(`${header}.${payload}.${signature}`);
NODE
}

invoke_rpc() {
  local endpoint="$1"
  local authorization="$2"
  local apikey="$3"
  local payload="$4"
  local raw status
  local args=(
    --silent
    --show-error
    --max-time 20
    --request POST
    "$BASE_URL/rpc/$endpoint"
    --header "Content-Type: application/json"
    --data-binary "$payload"
    --write-out $'\nHTTP_STATUS=%{http_code}'
  )
  if [[ -n "$authorization" ]]; then
    args+=(--header "Authorization: Bearer $authorization")
  fi
  if [[ -n "$apikey" ]]; then
    args+=(--header "apikey: $apikey")
  fi
  raw="$(curl "${args[@]}")"
  status="${raw##*HTTP_STATUS=}"
  RESPONSE_BODY="${raw%$'\n'HTTP_STATUS=*}"
  RESPONSE_STATUS="$status"
}

assert_service_invalid_input() {
  local endpoint="$1"
  local token="$2"
  local payload="$3"
  local expected_message="$4"
  invoke_rpc "$endpoint" "$token" "$token" "$payload"
  if [[ "$RESPONSE_STATUS" != "400" ]] \
    || [[ "$(jq -r '.code // empty' <<<"$RESPONSE_BODY")" != "22023" ]] \
    || [[ "$(jq -r '.message // empty' <<<"$RESPONSE_BODY")" != "$expected_message" ]]; then
    printf 'unexpected service-role response for %s: HTTP %s %s\n' \
      "$endpoint" "$RESPONSE_STATUS" "$RESPONSE_BODY" >&2
    docker logs "$POSTGREST_CONTAINER" >&2
    exit 1
  fi
}

assert_denied() {
  local label="$1"
  local endpoint="$2"
  local authorization="$3"
  local apikey="$4"
  local payload="$5"
  invoke_rpc "$endpoint" "$authorization" "$apikey" "$payload"
  if [[ "$RESPONSE_STATUS" != "401" && "$RESPONSE_STATUS" != "403" ]]; then
    printf '%s unexpectedly returned HTTP %s %s\n' \
      "$label" "$RESPONSE_STATUS" "$RESPONSE_BODY" >&2
    exit 1
  fi
  if [[ "$(jq -r '.message // empty' <<<"$RESPONSE_BODY")" \
    == "INVALID_FIXTURE_INPUT" ]]; then
    printf '%s reached the function body\n' "$label" >&2
    exit 1
  fi
}

SERVICE_JWT="$(make_jwt service_role "$JWT_SECRET")"
AUTHENTICATED_JWT="$(make_jwt authenticated "$JWT_SECRET" \
  '{"sub":"aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa"}')"
ANON_JWT="$(make_jwt anon "$JWT_SECRET")"
FAKE_CLAIM_JWT="$(make_jwt authenticated "$JWT_SECRET" \
  '{"request.jwt.claim.role":"service_role","app_metadata":{"role":"service_role"}}')"
FORGED_SERVICE_JWT="$(make_jwt service_role "$WRONG_JWT_SECRET")"

assert_service_invalid_input \
  wos_qa_create_canonical_v1_fixture \
  "$SERVICE_JWT" \
  '{"p_input":null}' \
  INVALID_FIXTURE_INPUT
assert_service_invalid_input \
  wos_qa_rollback_canonical_v1_fixture \
  "$SERVICE_JWT" \
  '{"p_request_id":null,"p_order_id":null}' \
  INVALID_ROLLBACK_INPUT

assert_denied \
  AUTHENTICATED \
  wos_qa_create_canonical_v1_fixture \
  "$AUTHENTICATED_JWT" \
  "$AUTHENTICATED_JWT" \
  '{"p_input":null}'
assert_denied \
  ANON \
  wos_qa_create_canonical_v1_fixture \
  "$ANON_JWT" \
  "$ANON_JWT" \
  '{"p_input":null}'
assert_denied \
  NO_AUTHORIZATION \
  wos_qa_create_canonical_v1_fixture \
  "" \
  "$SERVICE_JWT" \
  '{"p_input":null}'
assert_denied \
  FAKE_CLAIM \
  wos_qa_create_canonical_v1_fixture \
  "$FAKE_CLAIM_JWT" \
  "$FAKE_CLAIM_JWT" \
  '{"p_input":null}'
assert_denied \
  FORGED_SERVICE_SIGNATURE \
  wos_qa_create_canonical_v1_fixture \
  "$FORGED_SERVICE_JWT" \
  "$FORGED_SERVICE_JWT" \
  '{"p_input":null}'
assert_denied \
  SERVICE_APIKEY_WITH_USER_JWT \
  wos_qa_create_canonical_v1_fixture \
  "$AUTHENTICATED_JWT" \
  "$SERVICE_JWT" \
  '{"p_input":null}'

STATE="$("${PSQL[@]}" -At -c "
  SELECT
    (SELECT count(*) FROM public.wos_qa_canonical_fixture_manifests)
    || '|'
    || (SELECT count(*) FROM public.wos_production_orders)
    || '|'
    || (SELECT count(*) FROM public.wos_reference_images)
    || '|'
    || (SELECT count(*) FROM public.wos_qa_verified_image_proofs)
    || '|'
    || (
      (SELECT count(*) FROM public.wos_qa_p2_execution_gate WHERE enabled)
      + (SELECT count(*) FROM public.wos_qa_p2_office_execution_gate
        WHERE enabled)
      + (SELECT count(*) FROM public.wos_qa_p2_m2_gate WHERE enabled)
    );
")"
if [[ "$STATE" != "0|0|0|0|0" ]]; then
  printf 'unexpected post-test state: %s\n' "$STATE" >&2
  exit 1
fi

cat <<'RESULT'
POSTGREST_SERVICE_ROLE_GUARD=PASS
POSTGREST_AUTHENTICATED_DENIED=PASS
POSTGREST_ANON_DENIED=PASS
POSTGREST_NO_AUTH_DENIED=PASS
POSTGREST_FAKE_CLAIM_DENIED=PASS
POSTGREST_FORGED_SERVICE_SIGNATURE_DENIED=PASS
POSTGREST_SERVICE_APIKEY_WITH_USER_JWT_DENIED=PASS
POSTGREST_WRITES=0
POSTGREST_ROLE_CONTEXT=PASS
RESULT
