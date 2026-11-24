#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
IMAGE="${PG17_IMAGE:-postgres:17-alpine}"
CONTAINER="wos-v1-qa-fixture-pg17-$$"
LOG_DIR="${LOG_DIR:-/tmp/wos-v1-qa-fixture-pg17}"
mkdir -p "$LOG_DIR"

cleanup() {
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

docker info >/dev/null
docker run -d \
  --name "$CONTAINER" \
  -e POSTGRES_PASSWORD=fixture \
  -e POSTGRES_DB=fixture \
  -v "$ROOT:/work:ro" \
  "$IMAGE" >/dev/null

for _ in $(seq 1 60); do
  if docker exec "$CONTAINER" pg_isready -U postgres -d fixture >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
docker exec "$CONTAINER" pg_isready -U postgres -d fixture >/dev/null

PSQL=(docker exec -i "$CONTAINER" psql -U postgres -d fixture -v ON_ERROR_STOP=1)

"${PSQL[@]}" -f /work/tests/sql/wos-v1-qa-canonical-fixture-pg17-schema.sql \
  | tee "$LOG_DIR/schema.log"
"${PSQL[@]}" -f /work/docs/workshop-order-system/qa-fixture/WOS_V1_QA_CANONICAL_FIXTURE_WRITER_NOT_AUTHORIZED.sql \
  | tee "$LOG_DIR/forward.log"
"${PSQL[@]}" -f /work/tests/sql/wos-v1-qa-canonical-fixture-pg17-prepare.sql \
  | tee "$LOG_DIR/prepare.log"

(
  docker exec "$CONTAINER" psql -U postgres -d fixture -v ON_ERROR_STOP=1 \
    -At -f /work/tests/sql/wos-v1-qa-canonical-fixture-pg17-finalize.sql
) > "$LOG_DIR/finalize-a.log" 2>&1 &
PID_A=$!
(
  docker exec "$CONTAINER" psql -U postgres -d fixture -v ON_ERROR_STOP=1 \
    -At -f /work/tests/sql/wos-v1-qa-canonical-fixture-pg17-finalize.sql
) > "$LOG_DIR/finalize-b.log" 2>&1 &
PID_B=$!
wait "$PID_A"
wait "$PID_B"

CREATED_COUNT=$(cat "$LOG_DIR"/finalize-{a,b}.log | grep -c '^CREATED$' || true)
REPLAYED_COUNT=$(cat "$LOG_DIR"/finalize-{a,b}.log | grep -c '^REPLAYED$' || true)
if [[ "$CREATED_COUNT" -ne 1 || "$REPLAYED_COUNT" -ne 1 ]]; then
  echo "CONCURRENT_FINALIZE=FAIL created=$CREATED_COUNT replayed=$REPLAYED_COUNT"
  cat "$LOG_DIR"/finalize-{a,b}.log
  exit 1
fi
echo "CONCURRENT_FINALIZE=PASS created=1 replayed=1" | tee "$LOG_DIR/concurrency.log"

"${PSQL[@]}" -f /work/tests/sql/wos-v1-qa-canonical-fixture-pg17-post-finalize.sql \
  | tee "$LOG_DIR/post-finalize.log"
"${PSQL[@]}" -f /work/tests/sql/wos-v1-qa-canonical-fixture-pg17-rollback.sql \
  | tee "$LOG_DIR/rollback.log"
"${PSQL[@]}" -f /work/docs/workshop-order-system/qa-fixture/WOS_V1_QA_CANONICAL_FIXTURE_WRITER_INSTALL_ROLLBACK_NOT_AUTHORIZED.sql \
  | tee "$LOG_DIR/install-rollback.log"
"${PSQL[@]}" -f /work/tests/sql/wos-v1-qa-canonical-fixture-pg17-install-rollback.sql \
  | tee "$LOG_DIR/install-rollback-assertions.log"

cat <<'RESULT' | tee "$LOG_DIR/result.txt"
PG17_SERVER=17
PREPARE_POSITIVE=PASS
PREPARE_IDEMPOTENCY=PASS
NEGATIVE_INPUTS=PASS
NO_STORAGE_OBJECT_FINALIZE=PASS
FOUR_OBJECT_IDENTITY=PASS
READY_IMAGE_TRIGGER_COMPAT=PASS
CONCURRENT_FINALIZE=PASS
TRANSACTION_ROLLBACK=PASS
EXACT_FIXTURE_ROLLBACK=PASS
HISTORICAL_ROLLBACK_REFUSED=PASS
INSTALL_ROLLBACK=PASS
ACL_SERVICE_ROLE_ONLY=PASS
SECURITY_INVOKER=PASS
ZERO_PROOF_RECEIPT_SIGNOFF=PASS
CAN_START_FALSE=PASS
RESULT=PASS
RESULT
