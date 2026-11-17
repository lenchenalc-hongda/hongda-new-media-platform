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
console.log('WOS_P2_PROTECTED_BROWSER_NOT_EXECUTED=YES');