#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PG_IMAGE="${PG17_IMAGE:-postgres:17-alpine}"
POSTGREST_IMAGE="${POSTGREST_IMAGE:-postgrest/postgrest:v12.2.12}"
NETWORK="wos-proof-guard-net-$$"
PG_CONTAINER="wos-proof-guard-db-$$"
POSTGREST_CONTAINER="wos-proof-guard-postgrest-$$"
JWT_SECRET="$(openssl rand -hex 32)"
WRONG_JWT_SECRET="$(openssl rand -hex 32)"
FINALIZE_INPUT="$(jq -c '.p_input' \
  "$ROOT/tests/sql/wos-proof-service-guard-pg17-finalize-input.json")"

RECORD_SIGNATURE="public.wos_p7_record_trusted_image_proof(uuid,uuid,uuid,text,uuid,text,timestamptz,text)"
RENEW_SIGNATURE="public.wos_v1_renew_expired_image_proof(uuid,uuid,uuid,text,uuid,text,timestamptz,text)"
SNAPSHOT_SIGNATURE="public.wos_p7_service_storage_snapshot(text)"

OLD_RECORD="2c1c1d46469159bc71a1ce17ab40a86eed854816cc2b6a69496f43148faab1e2"
OLD_RENEW="49c4d314a5880f62401bcd288a459df941e2ddaf0d0d09bc341642a3dc7e6322"
OLD_SNAPSHOT="6dbba8c36a81286f48e021fef84a40730f01e83d6c17d3e76210c099c3722721"
NEW_RECORD="1433bdd5244077b1a34a2e7e58b37e5b665c7b5b59a1605544bb5e6854d87772"
NEW_RENEW="72023ae1e84ba8f7e2b7a909675f87fdff573f7ab0e648cb11a0921c8c8b70f2"
NEW_SNAPSHOT="a7715cb94dd7550803f742ed55c27f4c6e12c34e1eb4f2f69a45dd587ce7aaaa"

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

function_hash() {
  local signature="$1"
  "${PSQL[@]}" -At -c "
    SELECT encode(
      sha256(convert_to(pg_get_functiondef(
        '$signature'::regprocedure
      ), 'UTF8')),
      'hex'
    );
  "
}

assert_hashes() {
  local record_expected="$1"
  local renew_expected="$2"
  local snapshot_expected="$3"
  [[ "$(function_hash "$RECORD_SIGNATURE")" == "$record_expected" ]]
  [[ "$(function_hash "$RENEW_SIGNATURE")" == "$renew_expected" ]]
  [[ "$(function_hash "$SNAPSHOT_SIGNATURE")" == "$snapshot_expected" ]]
  "${PSQL[@]}" -At -c "
    SELECT count(*)
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.oid IN (
        '$RECORD_SIGNATURE'::regprocedure,
        '$RENEW_SIGNATURE'::regprocedure,
        '$SNAPSHOT_SIGNATURE'::regprocedure
      )
      AND pg_get_userbyid(p.proowner) = 'postgres'
      AND p.prosecdef
      AND p.proconfig = ARRAY['search_path=\"\"']::text[]
      AND p.proacl::text =
        '{postgres=X/postgres,service_role=X/postgres}';
  " | grep -qx '3'
}

"${PSQL[@]}" \
  -f /work/tests/sql/wos-v1-qa-canonical-fixture-pg17-schema.sql >/dev/null
"${PSQL[@]}" \
  -f /work/docs/workshop-order-system/qa-fixture/WOS_V1_QA_CANONICAL_FIXTURE_WRITER_NOT_AUTHORIZED.sql \
  >/dev/null
"${PSQL[@]}" \
  -v finalize_input="$FINALIZE_INPUT" \
  -f /work/tests/sql/wos-proof-service-guard-pg17-setup.sql \
  | tee /tmp/wos-proof-guard-setup.log
"${PSQL[@]}" \
  -f /work/tests/sql/wos-proof-service-guard-pg17-old-definitions.sql \
  >/dev/null
"${PSQL[@]}" >/dev/null <<'SQL'
REVOKE ALL ON FUNCTION
  public.wos_p7_record_trusted_image_proof(uuid,uuid,uuid,text,uuid,text,timestamptz,text)
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION
  public.wos_v1_renew_expired_image_proof(uuid,uuid,uuid,text,uuid,text,timestamptz,text)
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION
  public.wos_p7_service_storage_snapshot(text)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION
  public.wos_p7_record_trusted_image_proof(uuid,uuid,uuid,text,uuid,text,timestamptz,text)
TO service_role;
GRANT EXECUTE ON FUNCTION
  public.wos_v1_renew_expired_image_proof(uuid,uuid,uuid,text,uuid,text,timestamptz,text)
TO service_role;
GRANT EXECUTE ON FUNCTION
  public.wos_p7_service_storage_snapshot(text)
TO service_role;
SQL
assert_hashes "$OLD_RECORD" "$OLD_RENEW" "$OLD_SNAPSHOT"

"${PSQL[@]}" \
  -f /work/docs/workshop-order-system/qa-fixture/WOS_V1_QA_PROOF_SERVICE_GUARD_REPLACEMENT_NOT_AUTHORIZED.sql
assert_hashes "$NEW_RECORD" "$NEW_RENEW" "$NEW_SNAPSHOT"
echo "PROOF_GUARD_REPLACEMENT=PASS"

"${PSQL[@]}" \
  -f /work/tests/sql/wos-proof-service-guard-pg17-direct-context.sql

"${PSQL[@]}" \
  -f /work/docs/workshop-order-system/qa-fixture/WOS_V1_QA_PROOF_SERVICE_GUARD_RECOVERY_NOT_AUTHORIZED.sql
assert_hashes "$OLD_RECORD" "$OLD_RENEW" "$OLD_SNAPSHOT"
echo "PROOF_GUARD_RECOVERY=PASS"

"${PSQL[@]}" \
  -f /work/docs/workshop-order-system/qa-fixture/WOS_V1_QA_PROOF_SERVICE_GUARD_REPLACEMENT_NOT_AUTHORIZED.sql
assert_hashes "$NEW_RECORD" "$NEW_RENEW" "$NEW_SNAPSHOT"
echo "PROOF_GUARD_REPLACEMENT_RESTORED=PASS"

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
  HTTP_CODE="$(curl --silent --output /dev/null --write-out '%{http_code}' \
    "$BASE_URL/" || true)"
  if [[ "$HTTP_CODE" == "200" ]]; then
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
  if [[ "$#" -ge 3 ]]; then extra_json="$3"; fi
  node - "$role" "$secret" "$extra_json" <<'NODE'
const crypto = require('crypto');
const [role, secret, extraJson] = process.argv.slice(2);
const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const header = encode({alg: 'HS256', typ: 'JWT'});
const payload = encode({
  role,
  iss: 'wos-proof-guard-test',
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
  local raw
  local args=(
    --silent
    --show-error
    --max-time 20
    --request POST
    "$BASE_URL/rpc/$endpoint"
    --header 'Content-Type: application/json'
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
  RESPONSE_STATUS="${raw##*HTTP_STATUS=}"
  RESPONSE_BODY="${raw%$'\n'HTTP_STATUS=*}"
}

assert_invalid_input() {
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
}

SERVICE_JWT="$(make_jwt service_role "$JWT_SECRET")"
AUTHENTICATED_JWT="$(make_jwt authenticated "$JWT_SECRET" \
  '{"sub":"3c0d8866-498a-4e61-a602-28b7a83f75f5"}')"
ANON_JWT="$(make_jwt anon "$JWT_SECRET")"
FAKE_CLAIM_JWT="$(make_jwt authenticated "$JWT_SECRET" \
  '{"request.jwt.claims":{"role":"service_role"},"app_metadata":{"role":"service_role"}}')"
FORGED_SERVICE_JWT="$(make_jwt service_role "$WRONG_JWT_SECRET")"

RECORD_NULLS='{"p_image_id":null,"p_order_id":null,"p_actor_user_id":null,"p_storage_path":null,"p_storage_object_id":null,"p_storage_object_version":null,"p_storage_object_updated_at":null,"p_sha256":null}'
RENEW_NULLS="$RECORD_NULLS"

assert_invalid_input \
  wos_p7_record_trusted_image_proof \
  "$SERVICE_JWT" "$RECORD_NULLS" INVALID_PROOF_INPUT
assert_invalid_input \
  wos_p7_record_trusted_image_proof \
  "$SERVICE_JWT" "$RECORD_NULLS" INVALID_PROOF_INPUT
assert_invalid_input \
  wos_v1_renew_expired_image_proof \
  "$SERVICE_JWT" "$RENEW_NULLS" INVALID_RENEWAL_INPUT
assert_invalid_input \
  wos_p7_service_storage_snapshot \
  "$SERVICE_JWT" '{"p_path":null}' INVALID_STORAGE_PATH

assert_denied AUTHENTICATED wos_p7_record_trusted_image_proof \
  "$AUTHENTICATED_JWT" "$AUTHENTICATED_JWT" "$RECORD_NULLS"
assert_denied ANON wos_p7_record_trusted_image_proof \
  "$ANON_JWT" "$ANON_JWT" "$RECORD_NULLS"
assert_denied NO_AUTH wos_p7_record_trusted_image_proof \
  "" "$SERVICE_JWT" "$RECORD_NULLS"
assert_denied FAKE_CLAIM wos_p7_record_trusted_image_proof \
  "$FAKE_CLAIM_JWT" "$FAKE_CLAIM_JWT" "$RECORD_NULLS"
assert_denied FORGED_SIGNATURE wos_p7_record_trusted_image_proof \
  "$FORGED_SERVICE_JWT" "$FORGED_SERVICE_JWT" "$RECORD_NULLS"
assert_denied SERVICE_APIKEY_WITH_USER_JWT \
  wos_p7_record_trusted_image_proof \
  "$AUTHENTICATED_JWT" "$SERVICE_JWT" "$RECORD_NULLS"

assert_hashes "$NEW_RECORD" "$NEW_RENEW" "$NEW_SNAPSHOT"

"${PSQL[@]}" -At -c "
  SELECT
    (SELECT count(*) FROM public.wos_qa_verified_image_proofs
      WHERE order_id = 'ba38e41b-8cac-469c-aabd-00b6ada033e2')
    || '|'
    || (SELECT count(*) FROM public.wos_qa_trusted_proof_receipts
      WHERE order_id = 'ba38e41b-8cac-469c-aabd-00b6ada033e2')
    || '|'
    || (SELECT count(*) FROM public.wos_production_orders)
    || '|'
    || (SELECT count(*) FROM public.wos_reference_images)
    || '|'
    || (SELECT count(*) FROM public.wos_visual_baselines)
    || '|'
    || (SELECT count(*) FROM public.wos_visual_baseline_items)
    || '|'
    || (
      (SELECT count(*) FROM public.wos_qa_p2_execution_gate WHERE enabled)
      + (SELECT count(*) FROM public.wos_qa_p2_office_execution_gate
        WHERE enabled)
      + (SELECT count(*) FROM public.wos_qa_p2_m2_gate WHERE enabled)
    );
" | grep -qx '0|0|1|4|1|4|0'

cat <<'RESULT'
PROOF_GUARD_REPLACEMENT=PASS
PROOF_GUARD_RECOVERY=PASS
PROOF_GUARD_DIRECT_CONTEXT=PASS
POSTGREST_SERVICE_ROLE_GUARD=PASS
POSTGREST_AUTHENTICATED_DENIED=PASS
POSTGREST_ANON_DENIED=PASS
POSTGREST_NO_AUTH_DENIED=PASS
POSTGREST_FAKE_CLAIM_DENIED=PASS
POSTGREST_FORGED_SIGNATURE_DENIED=PASS
POSTGREST_SERVICE_APIKEY_WITH_USER_JWT_DENIED=PASS
PROOF_WRITES=0
RECEIPT_WRITES=0
RESULT
