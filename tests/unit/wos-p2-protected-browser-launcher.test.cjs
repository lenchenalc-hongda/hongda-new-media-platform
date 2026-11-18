const assert=require('node:assert/strict');
const fs=require('node:fs');
const workflow=fs.readFileSync('.github/workflows/wos-p2-pr241-protected-qa.yml','utf8');
const browser=fs.readFileSync('tests/e2e/wos-p2-qa-browser.cjs','utf8');
for(const text of [
  "workflow_dispatch:", "refs/heads/master",
  "89bb408d13e45458c608db29c47e2803d49b3170",
  "44127583534","44128682235",
  "environment: hongda-review-dev",
  "path: app","path: trusted",
  "persist-credentials: false",
  "WOS_P2_QA_MUTATIONS_ENABLED: 'true'",
  "WOS_P2_QA_OFFICE_REVISION_ENABLED: 'true'",
  "NEXT_PUBLIC_SUPABASE_URL: https://xulmpqaknlwqqculbsek.supabase.co",
  "secrets.REVIEW_DEV_ADMIN_PASSWORD",
  "secrets.REVIEW_DEV_OPERATOR_PASSWORD",
  "secrets.REVIEW_DEV_VIEWER_PASSWORD",
  "secrets.REVIEW_DEV_FOREIGN_PASSWORD",
  "WOS_P2_LOCAL_PREVIEW_SHUTDOWN_REQUESTED",
]) assert(workflow.includes(text),'protected workflow missing '+text);
for(const absent of [
  'pull_request_target:',
  'on:\n  push:',
  'supabase db push',
  'supabase migration up',
  'vercel --prod',
  'https://amqpvxrurenevniilhtl.supabase.co',
  'SUPABASE_SERVICE_ROLE_KEY',
  'gh pr merge',
])assert(!workflow.includes(absent),'unsafe protected QA workflow '+absent);
assert(browser.includes("WOS_P2_PROTECTED_BROWSER_E2E_ACK"));
assert(browser.includes("WOS_QA_BROWSER_ACK_TEST_WRITES"));
assert(browser.includes("WOS_P2_REVIEWED_SHA"));
for(const text of [
  "REUSED_SUBMITTED_QA_ORDER_NO_NEW_P1_SUBMISSION",
  "OPERATOR_READ_EXISTING_P1_INBOX",
  "OPERATOR_AUTHENTICATED_ACCEPTED",
  "OPERATOR_RETURN_BLOCKER_TRANSACTION",
  "OFFICE_SIX_FIELD_VERSIONED_SAVE_AND_SNAPSHOT",
  "OFFICE_IDEMPOTENT_HTTP_REPLAY",
  "OFFICE_STALE_VERSION_REJECTED",
  "OFFICE_RESUBMIT_SAVED_REVISION_WITHOUT_DUPLICATING_P1_INBOX",
  "OPERATOR_REVIEW_CORRECTION_ONLY_RESOLVED_DOCUMENT_BLOCKER",
  "OLD_SIGNED_SAMPLE_BLOCKED_FOR_CURRENT_REVISION",
  "VIEWER_AND_FOREIGN_DENIED_WITHOUT_SIDE_EFFECTS",
  "ONE_IMMUTABLE_P1_INBOX_AND_CURRENT_QA_REVISION",
  "OWNER_CAS_VERIFIED_BEFORE_EXISTING_ORDER_ACTIONS",
  "WOS_P2_PROTECTED_BROWSER_REAL_TWO_ROLE_E2E=PASS",
])assert(browser.includes(text),'existing-order E2E coverage missing '+text);
assert(!browser.includes("上传图片并提交 QA 订单"),
  'reuse acceptance must never create another P1 Office order');
assert(!browser.includes("OFFICE_UI_SYNTHETIC_SUBMISSION_HTTP_AND_RECEIPT"),
  'must not duplicate previous successful P1 write');
assert(!browser.includes("setInputFiles("),
  'must not upload another P1 image');
assert(browser.includes("require('./wos-p2-qa-owner-cas-attest.cjs')"));
assert(browser.indexOf("stage='OWNER_CAS_REVERIFY_BEFORE_ANY_BROWSER_ACTION'")<
  browser.indexOf("const browser=await chromium.launch"),
  'read-only live proof must precede the browser and every mutation');

assert(!browser.includes('console.log(error)'));
assert(!browser.includes('console.error(error)'));
assert(!browser.includes("page.screenshot("));
assert(!browser.includes('trace.zip'));
console.log('WOS_P2_PROTECTED_BROWSER_LAUNCHER_STATIC_SECURITY=PASS');
console.log('WOS_P2_PROTECTED_BROWSER_E2E_SCRIPT_SYNTAX_READY=PASS');

const gateSql=fs.readFileSync(
  'docs/workshop-order-system/nonproduction-only/wos_p2_qa_gate_failclose_NOT_FOR_PRODUCTION.sql','utf8');
const closer=fs.readFileSync('tests/e2e/wos-p2-qa-gate-failclose.cjs','utf8');
for(const v of [
  'name: Always atomically close BOTH QA DB gates',
  'if: always()','wos-p2-qa-gate-failclose.cjs',
  "WOS_P2_QA_CLOSURE_ENABLED: 'true'",
  'WOS_P2_GATE_CLOSE_REASON:',
  "job.status == 'cancelled'",
  'WOS_P2_QA_BOTH_GATES_CLOSED_BY_PROTECTED_WORKFLOW',
])assert(workflow.includes(v),'protected cleanup missing '+v);
for(const v of [
  'wos_qa_safety.p2_gate_close_receipts',
  'wos_qa_safety.reap_expired_p2_gates',
  'SECURITY DEFINER SET search_path',
  "role = 'admin'",
  "approval_reference='NOT_AUTHORIZED'",
  "v_is_replay := true",
  'REVOKE ALL ON FUNCTION public.wos_qa_p2_failclose',
])assert(gateSql.includes(v),'gate close SQL missing '+v);
assert(!/SET\s+enabled\s*=\s*true/i.test(gateSql),'close-only SQL cannot enable Gate');
assert(!gateSql.includes('DROP TABLE'),'QA controller cannot drop tables');
assert(closer.includes("'/rest/v1/rpc/wos_qa_p2_failclose'"));
assert(closer.includes("'/auth/v1/token?grant_type=password'"));
assert(closer.includes('WOS_P2_QA_GATE_CLOSE_ONLY_RPC=PASS'));
assert(!closer.includes('SERVICE_ROLE_KEY'));
assert(!closer.includes('console.log(error)'));
assert(!closer.includes('console.error(error)'));
console.log('WOS_P2_QA_FAILCLOSE_STATIC_GUARDS=PASS');

// Historic failure guards are retained, but this new acceptance skips P1.
assert(browser.includes("const origin='http://localhost:3000'"),
 'QA loopback origin must pass the existing business hostname guard');
assert(browser.includes('--host-resolver-rules=MAP localhost 127.0.0.1'));
assert(!browser.includes("const origin='http://127.0.0.1:3000'"));
const handoff=workflow.indexOf('Await live read-only Owner CAS proof for existing order');
const build=workflow.indexOf('Build and launch local Preview using only QA publishable key');
const browserStep=workflow.indexOf('Real 2-role Office/Operator test + Viewer/foreign denials');
const closeStepPos=workflow.indexOf('Always atomically close BOTH QA DB gates with QA-admin-only RPC');
assert(build>=0 && handoff>build && browserStep>handoff && closeStepPos>browserStep,
 'identity/build -> DB attestation -> browser -> always-close must be ordered');
assert(workflow.includes("WOS_P2_QA_LIVE_OWNER_CAS_VERIFIED_BEFORE_BROWSER=PASS"));
assert(workflow.includes("WOS_P2_REUSE_EXISTING_ORDER_ONLY: 'true'"));
assert(workflow.includes("WOS_P2_OWNER_CAS_READONLY_ACK: 'true'"));
assert(workflow.includes("node tests/e2e/wos-p2-qa-owner-cas-attest.cjs"));
assert(workflow.includes('test "$GITHUB_RUN_ATTEMPT" = "1"'));
assert(!workflow.includes('sleep 90'),'blind sleep cannot authorize business writes');
assert(!workflow.includes('OWNER_CAS_HANDOFF_ELAPSED_NO_AUTO_GATE_ENABLE'));
assert(!workflow.includes('SUPABASE_SERVICE_ROLE_KEY'));
const sqlProof=fs.readFileSync(
 'docs/workshop-order-system/nonproduction-only/wos_p2_owner_cas_attest_PROPOSED_QA_ONLY.sql','utf8');
assert(sqlProof.includes("wos_qa_p2_owner_cas_attest"));
assert(sqlProof.includes("v_operator.enabled IS DISTINCT FROM TRUE"));
assert(sqlProof.includes("v_office.enabled IS DISTINCT FROM TRUE"));
assert(sqlProof.includes("v_expected_ref := 'OWNER_RUN_' || p_github_run_id"));
assert(sqlProof.includes("wos_qa_safety.p2_gate_close_receipts"));
assert(sqlProof.includes("status','WAITING'"));
assert(sqlProof.includes("status','READY'"));
assert(!/UPDATE\s+public\.wos_qa_p2_(?:office_)?execution_gate\s+SET/i.test(sqlProof));
console.log('WOS_P2_QA_EXISTING_ORDER_NO_DUPLICATE_P1=PASS');
console.log('WOS_P2_OWNER_CAS_RUN_BOUND_LIVE_PROOF_ORDERING=PASS');
assert(sqlProof.includes('CREATE TRIGGER wos_qa_p2_single_order_gate_guard'));
assert(sqlProof.includes('QA_OWNER_ATTEST_SINGLE_ORDER_GUARD_MISSING'));
assert(sqlProof.includes('QA_P2_GATE_SINGLE_ORDER_SCOPE_REJECTED'));
assert(sqlProof.includes('BEFORE INSERT OR UPDATE OR DELETE ON public.wos_production_orders'));
console.log('WOS_P2_QA_SCOPE_ONLY_EXISTING_SYNTHETIC_ORDER=PASS');
console.log('WOS_P2_PROTECTED_BROWSER_NOT_EXECUTED=YES');
