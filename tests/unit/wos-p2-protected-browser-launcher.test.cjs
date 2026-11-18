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
  "OFFICE_UI_SYNTHETIC_SUBMISSION_HTTP_AND_RECEIPT",
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
  "WOS_P2_PROTECTED_BROWSER_REAL_TWO_ROLE_E2E=PASS",
])assert(browser.includes(text),'E2E check missing '+text);
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

// Catch the actual failure from 2026-11-18 Run #44232596314:
// Chrome visited 127.0.0.1 but the business QA UI checks localhost only.
assert(browser.includes("const origin='http://localhost:3000'"),
  'browser must use explicitly allowed QA localhost host');
assert(browser.includes('--host-resolver-rules=MAP localhost 127.0.0.1'),
  'pin localhost to local loopback without exposing remote service');
assert(!browser.includes("const origin='http://127.0.0.1:3000'"));
for (const check of [
  "stage='OFFICE_QA_PAGE_VISIBLE'",
  "stage='OFFICE_FILL_SYNTHETIC_SAMPLE'",
  "stage='OFFICE_SELECT_QA_IMAGE'",
  "stage='OFFICE_QA_LOCAL_VALIDATION'",
  "stage='OFFICE_QA_SUBMIT_OR_ERROR'",
  "WOS_P2_QA_SUBMIT_UI_ERROR_CODE=",
  "WOS_P2_QA_SUBMIT_HTTP_OBSERVED=NO",
  "QA_OFFICE_UI_REJECTED_BEFORE_POST",
  "QA_OFFICE_SUBMIT_NO_HTTP_RESPONSE",
  "response.url()===origin+'/api/workshop-orders/production'",
]) assert(browser.includes(check),'QA failfast source contract missing '+check);
assert(!browser.includes('timeout:110000'),
  'a blocked QA UI must not waste 110 seconds before diagnostics');
console.log('WOS_P2_QA_LOCALHOST_HOST_GUARD_REGRESSION=PASS');
console.log('WOS_P2_QA_FAILURE_STAGE_AND_NO_SECRET_DIAGNOSTICS=PASS');

console.log('WOS_P2_PROTECTED_BROWSER_NOT_EXECUTED=YES');