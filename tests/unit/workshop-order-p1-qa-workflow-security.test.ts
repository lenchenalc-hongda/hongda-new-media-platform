import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const wf = readFileSync('.github/workflows/wos-p1-pr238-protected-qa.yml', 'utf8');
const sha = '0722a53a49753e6d42c6ad36fda3ab61fca1e74b';
const checkout = 'ref: ' + '$' + '{{ needs.independent-gate.outputs.sha }}';

function check(ok: boolean, label: string) {
  if (!ok) throw new Error('WOS_P1_QA_WORKFLOW_AUDIT_' + label);
}
function slice(src: string, start: string, end?: string) {
  const i=src.indexOf(start);
  check(i>=0, 'MISSING_SECTION');
  const j=end ? src.indexOf(end,i+start.length) : -1;
  check(end===undefined || j>i, 'TRUNCATED_SECTION');
  return src.slice(i, j<0 ? src.length : j);
}
function audit(src: string) {
  check(/^on:\n  workflow_dispatch:\n/m.test(src), 'MANUAL_ONLY');
  check(!/^  (push|pull_request|pull_request_target|schedule|workflow_run):/m.test(src), 'NO_AUTO_TRIGGER');
  check(src.includes('APPROVED_SHA: '+sha), 'OWNER_PIN');
  check(src.includes('[ "$REQUESTED_SHA" = "$APPROVED_SHA" ]'), 'MATCHED_PIN');
  check(src.includes('refs/heads/master'), 'MASTER');
  const gate=slice(src,'  independent-gate:\n','  secretless-source-review:\n');
  const source=slice(src,'  secretless-source-review:\n','  protected-real-qa:\n');
  const protectedJob=slice(src,'  protected-real-qa:\n');
  check(gate.includes('pulls/238') && gate.includes('feature/wos-p1-qa-transaction-inbox-20261117'), 'PR_IDENTITY');
  check(gate.includes('master_ci" = "$reviewed_ci') && gate.includes('startswith(".github/workflows/")'), 'TRUSTED_CI_BLOB');
  check(gate.includes('max_by(.submitted_at)') && gate.includes('.state=="APPROVED" and .commit_id==$sha'), 'LIVE_APPROVAL');
  check(gate.includes('.user.login!=$author') && gate.includes('collaborators/$reviewer/permission'), 'INDEPENDENT_REVIEWER');
  check(gate.includes('.path==".github/workflows/ci.yml"') && gate.includes('actions/runs?head_sha=$REQUESTED_SHA&event=pull_request'), 'CI_PROVENANCE');
  check(gate.includes('lint-and-audit glh-stage1-postgres-synthetic'), 'CI_REQUIRED_JOBS');
  check(source.includes('pnpm exec tsc --noEmit') && source.includes('workshop-order-suite.test.ts'), 'SECRETLESS_SOURCE_CHECK');
  check(!gate.includes('secrets.REVIEW_DEV_') && !source.includes('secrets.REVIEW_DEV_'), 'NO_SECRETS_BEFORE_REVIEW');
  check(protectedJob.includes('environment: hongda-review-dev'), 'QA_ENVIRONMENT');
  check(protectedJob.includes("needs['secretless-source-review'].result == 'success'"), 'SECRET_JOB_DEPENDENCY');
  check(protectedJob.includes(checkout) && protectedJob.includes('persist-credentials: false'), 'PINNED_READONLY_CHECKOUT');
  check(protectedJob.includes('WOS_P1_PRE_SECRET_LIVE_REVIEW_RECHECK=PASS'), 'LAST_MINUTE_RECHECK');
  check(protectedJob.includes('NEXT_PUBLIC_SUPABASE_URL: https://xulmpqaknlwqqculbsek.supabase.co'), 'QA_DB_PIN');
  check(!protectedJob.includes('amqpvxrurenevniilhtl'), 'NO_PRODUCTION_DB');
  const secretHeading='      - name: Real two-account HTTP/PNG/Inbox/Storage E2E (credentials scoped to this step)';
  const pre=slice(protectedJob,'  protected-real-qa:\n',secretHeading);
  const withSecrets=slice(protectedJob,secretHeading);
  check(!/REVIEW_DEV_(ADMIN|OPERATOR|VIEWER|FOREIGN)_(EMAIL|PASSWORD):/.test(pre), 'NO_TEST_CREDENTIALS_IN_BUILD');
  for(const role of ['ADMIN','OPERATOR','VIEWER','FOREIGN'])
    check(withSecrets.includes('secrets.REVIEW_DEV_'+role+'_PASSWORD'), 'TEST_ROLE_'+role);
  check(withSecrets.includes("WOS_QA_SOAK_ROUNDS: '1'"), 'SINGLE_QA_ROUND');
  check(withSecrets.includes('node tests/e2e/wos-qa-real-browser.cjs') &&
        withSecrets.includes('node tests/e2e/wos-qa-resilience.cjs'), 'LIVE_BROWSER_AND_RECOVERY');
  const actions=[...src.matchAll(/^\s*- uses:\s*([^\s#]+)/gm)].map(x=>x[1]);
  check(actions.length>=5 && actions.every(x=>/@[a-f0-9]{40}$/.test(x)), 'PIN_ALL_ACTIONS');
  check(!/(upload-artifact|printenv|set -x|git push|vercel deploy --prod|supabase db push)/i.test(src), 'NO_LOGGING_OR_PUBLISHING');
}
audit(wf);
const cases: Array<[string,string]> = [
  ['SHA_CHANGED',wf.replace(sha,'f'.repeat(40))],
  ['AUTO_PR_TRIGGER',wf.replace('  workflow_dispatch:', '  pull_request:\n  workflow_dispatch:')],
  ['PRODUCTION_ENV',wf.replace('environment: hongda-review-dev','environment: production')],
  ['STALE_APPROVAL',wf.replace('max_by(.submitted_at)','last')],
  ['MISSING_LIVE_RECHECK',wf.replace('WOS_P1_PRE_SECRET_LIVE_REVIEW_RECHECK=PASS','BYPASS')],
  ['CHECKOUT_BRANCH',wf.replaceAll(checkout,'ref: master')],
  ['PRODUCTION_SUPABASE',wf.replace('https://xulmpqaknlwqqculbsek.supabase.co','https://amqpvxrurenevniilhtl.supabase.co')],
  ['SECRET_IN_BUILD',wf.replace('      - name: Build and start isolated QA Preview-mode app WITHOUT user passwords', '      - name: Build and start isolated QA Preview-mode app WITHOUT user passwords\n        env:\n          REVIEW_DEV_ADMIN_PASSWORD: leaked')],
  ['ARTIFACT_EXFIL',wf+'\n      - uses: actions/upload-artifact@v4'],
];
for(const [name,mutant] of cases) {
  let denied=false;
  try { audit(mutant); } catch { denied=true; }
  check(denied, 'NEGATIVE_CASE_'+name);
}
console.log('WOS_P1_PROTECTED_QA_STATIC_SECURITY_AUDIT=PASS');
console.log('WOS_P1_PROTECTED_QA_NEGATIVE_CASES='+cases.length);
console.log('WOS_P1_QA_ACCOUNT_CREDENTIALS_USED=NO');
