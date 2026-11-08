// Standalone, zero-credential security reviewer for the master-sourced WOS P7
// manual QA launcher. Does not call GitHub APIs or read environment secrets.
import { readFileSync } from 'node:fs';

const workflowPath='.github/workflows/wos-p7-protected-manual-acceptance.yml';
const reviewedSha='29f908a0b32b530d551886e3ce4b6a0762f86cdc';
const text=readFileSync(workflowPath,'utf8');
function must(ok,code) { if(!ok) throw Error('WOS_P7_WORKFLOW_SECURITY_'+code); }
function between(s,left,right) {
  const i=s.indexOf(left);
  must(i>=0,'MISSING_'+left.replace(/[^a-zA-Z0-9]/g,'_'));
  const j=right ? s.indexOf(right,i+left.length) : -1;
  return s.slice(i,j<0?s.length:j);
}
function review(src) {
  must(/^on:\n  workflow_dispatch:\n/m.test(src),'MANUAL_ONLY');
  must(!/^  (push|pull_request|pull_request_target|schedule|workflow_run|repository_dispatch):/m.test(src),'NO_AUTO_TRIGGER');
  must(src.includes("APPROVED_QA_SHA: "+reviewedSha),'IMMUTABLE_SHA');
  must(src.includes('[ "$REQUESTED_SHA" = "$APPROVED_QA_SHA" ]'),'SHA_PIN_MANDATORY');
  must(src.includes('[ "$GITHUB_REF" = \'refs/heads/master\' ]'),'MASTER_ONLY');
  must(src.includes("LIVE_REPO"),'SAME_REPO');
  must(src.includes("LIVE_DRAFT"),'DRAFT_CHECK');
  must(src.includes("LIVE_STATE"),'OPEN_CHECK');
  must(src.includes('[ "$LIVE_HEAD" = "$REQUESTED_SHA" ]'),'LIVE_PR_HEAD_MATCH');
  must(src.includes('WOS_P7_MASTER_PROTECTED_QA_SHA_GATE=PASS'),'PIN_AUDIT_MARKER');
  const preflight=between(src,'  preflight:\n','  real-browser-qa:\n');
  const browser=between(src,'  real-browser-qa:\n',null);
  must(preflight.includes('checks: read')&&preflight.includes('pull-requests: read'),'PREFLIGHT_PERMISSIONS');
  must(!preflight.includes('secrets.REVIEW_DEV_'),'NO_QA_SECRETS_IN_PREFLIGHT');
  for(const job of ['lint-and-audit','glh-stage1-postgres-synthetic','wos-p7-static-security']) {
    must(preflight.includes(job),'EXACT_HEAD_CHECK_'+job);
  }
  must(preflight.includes('check-runs?per_page=100'),'CHECKS_FROM_EXACT_COMMIT');
  must(preflight.includes('.app.slug=="github-actions"') && preflight.includes('.conclusion=="success"'),'TRUSTED_CI_SOURCE');
  must(browser.includes('environment: hongda-review-dev'),'PROTECTED_ENVIRONMENT');
  must(browser.includes("github.ref == 'refs/heads/master'"),'MASTER_ONLY_SECRET_JOB');
  must(browser.includes('ref: ${{ needs.preflight.outputs.reviewed_sha }}'),'PINNED_CHECKOUT');
  must(browser.includes('persist-credentials: false'),'NO_PERSISTED_TOKEN');
  must(browser.includes('WOS_QA_SOAK_ROUNDS: \'10\''),'TEN_ROUNDS');
  const actions=[...src.matchAll(/^\s*- uses:\s*([^\s#]+)/gm)].map(x=>x[1]);
  must(actions.length>=3 && actions.every(x=>/@[a-f0-9]{40}$/.test(x)),'PIN_ACTIONS');
  const secretStep=between(browser,'      - name: Run real browser with isolated QA logins and assert same-origin HTTP',null);
  const startStep=between(browser,'      - name: Start QA Next server without any test-account credentials','      - name: Run real browser with isolated QA logins and assert same-origin HTTP');
  const buildStep=between(browser,'      - name: Build pinned isolated QA Preview-mode app','      - name: Assert checkout is exactly the immutable approved QA commit');
  must(!/secrets\.REVIEW_DEV_(ADMIN|OPERATOR|VIEWER|FOREIGN)_(EMAIL|PASSWORD)/.test(startStep+buildStep),'NO_PASSWORDS_DURING_BUILD_OR_SERVER');
  must(!/REVIEW_DEV_(ADMIN|OPERATOR|VIEWER|FOREIGN)_(EMAIL|PASSWORD):/.test(startStep),'NO_PASSWORDS_ON_SERVER');
  must(secretStep.includes('node tests/e2e/wos-qa-real-browser.cjs') && secretStep.includes('node tests/e2e/wos-qa-resilience.cjs'),'TESTS_PINNED');
  for(const role of ['ADMIN','OPERATOR','VIEWER','FOREIGN']){
    must(secretStep.includes('secrets.REVIEW_DEV_'+role+'_PASSWORD'),'MISSING_QA_ROLE_'+role);
  }
  must(!/upload-artifact|printenv|set -x|env >|curl .*REVIEW_DEV|git push/i.test(browser),'NO_EGRESS_OR_LOG_UPLOAD');
  must(browser.includes("NEXT_PUBLIC_SUPABASE_URL: https://xulmpqaknlwqqculbsek.supabase.co"),'QA_PROJECT_PIN');
  must(browser.includes('WOS_P7_QA_CHECKOUT_PIN_VERIFIED=PASS'),'CHECKOUT_ATTESTED');
  return true;
}
review(text);
const negativeCases=[
  ['HEAD_MOVES',text.replace(reviewedSha,'f'.repeat(40))],
  ['MISSING_PIN',text.replace('[ "$REQUESTED_SHA" = "$APPROVED_QA_SHA" ]','# bypassed')],
  ['AUTO_PUSH',text.replace('  workflow_dispatch:', '  push:\n    branches: [master]\n  workflow_dispatch:')],
  ['UNPROTECTED_ENV',text.replace('environment: hongda-review-dev','environment: production')],
  ['QA_BRANCH_DISPATCH',text.replace('[ "$GITHUB_REF" = \'refs/heads/master\' ]','true')],
  ['CHECKOUT_WRITABLE_REF',text.replace('ref: ${{ needs.preflight.outputs.reviewed_sha }}','ref: qa/wos-nonprod-atomic-storage-20261107')],
  ['PASSWORDS_ON_SERVER',text.replace('      - name: Start QA Next server without any test-account credentials','      - name: Start QA Next server without any test-account credentials\n        env:\n          REVIEW_DEV_ADMIN_PASSWORD: ${{ secrets.REVIEW_DEV_ADMIN_PASSWORD }}')],
];
for(const [caseName,mutant] of negativeCases){
  let rejected=false;
  try{review(mutant)}catch{rejected=true}
  must(rejected,'NEGATIVE_CASE_'+caseName);
}
console.log('WOS_P7_PROTECTED_MASTER_QA_STATIC_SECURITY_AUDIT=PASS');
console.log('WOS_P7_PROTECTED_MASTER_QA_NEGATIVE_CASES='+negativeCases.length);
console.log('WOS_P7_QA_SECRET_BOUNDARY=CODE_REVIEWED_SHA_ONLY');
console.log('WOS_P7_REAL_BROWSER_AND_PRODUCTION_RELEASE=NOT_PERFORMED');
