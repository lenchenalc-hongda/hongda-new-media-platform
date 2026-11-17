import { readFileSync } from 'node:fs';

const workflow = readFileSync('.github/workflows/wos-p1-pr238-protected-qa.yml', 'utf8');
const authorizedBusinessHead = '6a72b446ccc517a5ff14e531b8a6663b4a70a77e';
const checkout = 'ref: ' + '$' + '{{ needs.independent-gate.outputs.sha }}';

function guard(value: boolean, message: string): void {
  if (!value) throw new Error('WOS_P1_QA_AUDIT_' + message);
}

function between(text: string, start: string, stop?: string): string {
  const i=text.indexOf(start);
  guard(i>=0, 'SECTION_NOT_FOUND');
  const j=stop ? text.indexOf(stop, i+start.length) : -1;
  guard(!stop || j>i, 'SECTION_INCOMPLETE');
  return text.slice(i,j<0?text.length:j);
}

function audit(source: string): void {
  guard(/^on:\n  workflow_dispatch:\n/m.test(source), 'OWNER_MANUAL_DISPATCH_ONLY');
  guard(!/^  (push|pull_request|pull_request_target|schedule|workflow_run|repository_dispatch):/m.test(source),
    'NO_UNREVIEWED_EVENT_TRIGGER');
  guard(source.includes('  issue_comment:\n    types: [created]'), 'ONE_OWNER_ISSUE_COMMENT_TRIGGER');
  guard(source.includes('github.event.issue.number == 104') &&
        source.includes('github.event.sender.login == \'lenchenalc-hongda\'') &&
        source.includes('github.event.comment.user.login == \'lenchenalc-hongda\'') &&
        source.includes('github.event.issue.pull_request == null') &&
        source.includes('WOS_P1_SINGLE_QA_ACCEPTANCE_RETRY1_20261117_SHA=6a72b446ccc517a5ff14e531b8a6663b4a70a77e'), 'ONE_EXACT_OWNER_AND_ISSUE_COMMENT');

  guard(source.includes('APPROVED_SHA: '+authorizedBusinessHead), 'BUSINESS_EXACT_HEAD_PIN');
  guard(source.includes('[ "$REQUESTED_SHA" = "$APPROVED_SHA" ]'), 'BUSINESS_HEAD_MATCH');
  guard(source.includes("github.ref == 'refs/heads/master'"), 'PROTECTED_MASTER_ONLY');
  guard(source.includes('WOS_P1_OWNER_AUTHORIZED_GITHUB_HOSTED_AUDIT=PASS'), 'EXPLICIT_AUDIT_SUBSTITUTE');
  guard(!source.includes('WOS_P1_OWNER_PIN_INDEPENDENT_REVIEW_AND_CI=PASS'), 'NO_FAKE_HUMAN_APPROVAL');
  const gate=between(source,'  independent-gate:\n','  secretless-source-review:\n');
  const safe=between(source,'  secretless-source-review:\n','  protected-real-qa:\n');
  const qa=between(source,'  protected-real-qa:\n');

  guard(gate.includes('pulls/238') && gate.includes('pulls/239') &&
        gate.includes('pulls/240'), 'ALL_THREE_PR_IDENTITIES');
  guard(gate.includes('qa/wos-pr238-playwright-ubuntu24-20261117') &&
        gate.includes('pr240=$(api "$base/pulls/240")') &&
        gate.includes('5d794a5f5be0821c37df0bbf99005137a1f8197e') &&
        gate.includes('848c32e02c829f2e1cafaf4a609420803ddc9762'),
        'AUDITED_MERGE_AND_PRECISE_FIX_BRANCH');
  guard(gate.includes('if [ "$GITHUB_EVENT_NAME" = issue_comment ]; then') &&
        gate.includes('"$GITHUB_EVENT_PATH"') &&
        gate.includes('.comment.body==$body') &&
        gate.includes('.sender.login=="lenchenalc-hongda"'),
    'SECOND_ISSUE_COMMENT_JSON_VALIDATION');

  guard(gate.includes('feature/wos-p1-qa-transaction-inbox-20261117'), 'EXPECTED_BUSINESS_BRANCH');
  guard(gate.includes('qa/wos-pr238-protected-e2e-20261117'), 'EXPECTED_WORKFLOW_BRANCH');
  guard(gate.includes('.merged') && gate.includes('= true ]') && gate.includes('.merge_commit_sha'),
    'MERGED_WORKFLOW_PR_REQUIRED');
  guard(gate.includes('(.parents | length)==2 and') &&
        gate.includes('.parents[0].sha=="5d794a5f5be0821c37df0bbf99005137a1f8197e"') &&
        gate.includes('.parents[1].sha==$sha'), 'BOTH_MERGE_PARENTS_PINNED');
  guard(gate.includes('base/branches/master') || gate.includes('$base/branches/master'),
    'NO_MOVING_MASTER');
  guard(gate.includes('master_ci" = "$reviewed_ci') &&
        gate.includes('master_ci" = "$(api "$base/contents/.github/workflows/ci.yml?ref=$workflow_head"'),
    'BOTH_CI_FILES_IDENTICAL_TO_TRUSTED_MASTER');
  guard(gate.includes('changed_files" -lt 100 ]') && gate.includes('length == $count'),
    'COMPLETE_BUSINESS_PR_FILE_LIST');
  guard(gate.includes('startswith(".github/workflows/")'), 'NO_BUSINESS_CI_TAMPERING');
  guard(gate.includes('.changed_files') && gate.includes('= 3 ]') &&
        gate.includes('tests/unit/workshop-order-p1-qa-workflow-security.test.ts'),
    'WORKFLOW_ONLY_SCOPE');
  guard(gate.includes('pr202=$(api "$base/pulls/202")') &&
        gate.includes('b3f382976049eacabefc7965cbb90312fd6903cc') &&
        gate.includes('scripts/agent-control/reliability-core.mjs') &&
        gate.includes('scripts/agent-control/reliability-watchdog.mjs') &&
        gate.includes('tests/unit/agent-control-reliability-v2.test.ts'),
    'PRESERVED_PR202_ONE_PATH_LOCK_EXCEPTION');
  guard(gate.includes('"$audited_workflow"') && gate.includes('"$fix_workflow"') &&
        gate.includes('"$installed_workflow" = "$fix_workflow"'),
    'LIVE_REVIEWED_FIX_WORKFLOW_BLOB_MATCH');
  guard(gate.includes('[ "$(jq -r \'.changed_files\' <<<"$pr240")" = 2 ]') &&
        gate.includes('"tests/unit/workshop-order-p1-qa-workflow-security.test.ts"') &&
        gate.includes('length==2 and'), 'PR240_EXACT_TWO_FILES');
  guard(gate.includes('actions/runs?head_sha=$target&event=pull_request&per_page=100'),
    'GENUINE_CI_PROVENANCE');
  guard(gate.includes('.path==".github/workflows/ci.yml"') &&
        gate.includes('lint-and-audit glh-stage1-postgres-synthetic'),
    'TRUSTED_CI_JOBS');
  guard(gate.includes('Workshop Order System full contract suite') &&
        gate.includes('Audit bundle for secret leakage') &&
        gate.includes('length==4 and all(.[]; .conclusion=="success")'),
    'SUCCESSFUL_REQUIRED_CI_STEPS');
  guard(gate.includes('WOS_P1_PROTECTED_QA_STATIC_SECURITY_AUDIT=PASS') &&
        gate.includes('WOS_P1_QA_ACCOUNT_CREDENTIALS_USED=NO') &&
        gate.includes("count\" -ge 12"), 'INDEPENDENT_GITHUB_HOSTED_AUDIT_LOG_PROOF');
  guard(gate.includes('workflow_head=$workflow_head') &&
        gate.includes('fix_head=$fix_head') &&
        gate.includes('verify_ci "$REQUESTED_SHA" no') &&
        gate.includes('verify_ci "$workflow_head" yes') &&
        gate.includes('verify_ci "$fix_head" fix'),
    'THREE_EXACT_CI_RUN_BINDINGS');
  guard(!/secrets\.REVIEW_DEV_/.test(gate) && !/secrets\.REVIEW_DEV_/.test(safe),
    'AUDIT_AND_SOURCE_CHECK_HAVE_ZERO_QA_PASSWORDS');
  guard(safe.includes(checkout) && safe.includes('persist-credentials: false') &&
        safe.includes('pnpm exec tsc --noEmit') && safe.includes('workshop-order-suite.test.ts'),
    'SECRETLESS_INDEPENDENT_SOURCE_RUN');
  guard(qa.includes('environment: hongda-review-dev') &&
        qa.includes("needs['secretless-source-review'].result == 'success'") &&
        qa.includes('contents: read') && qa.includes('actions: read'),
    'PROTECTED_ENV_AND_READ_ONLY_CREDENTIALS');
  guard(qa.includes('WOS_P1_BEFORE_QA_CREDENTIALS_AUDIT_RECHECK=PASS') &&
        qa.includes('actions/runs/$BUSINESS_RUN') &&
        qa.includes('actions/runs/$AUDIT_RUN') && qa.includes('actions/runs/$FIX_RUN') &&
        qa.includes('pulls/240') && qa.includes('FIX_HEAD') &&
        qa.includes('.merge_commit_sha') && qa.includes('branches/master'),
    'THIRD_EXACT_AUDIT_GATE_BEFORE_SECRETS');
  guard(qa.includes('  protected-real-qa:\n    # Playwright 1.56.1 does not support Ubuntu 26.04 runner') &&
        qa.includes('runs-on: ubuntu-24.04'),
    'PIN_UBUNTU24_FOR_PLAYWRIGHT');
  guard(qa.includes(checkout) && qa.includes('persist-credentials: false'), 'IMMUTABLE_QA_CHECKOUT');
  guard(qa.includes('NEXT_PUBLIC_SUPABASE_URL: https://xulmpqaknlwqqculbsek.supabase.co') &&
        !qa.includes('amqpvxrurenevniilhtl'), 'QA_PROJECT_PIN_NOT_PRODUCTION');
  const secretStep='      - name: Real two-account HTTP/PNG/Inbox/Storage E2E (credentials scoped to this step)';
  const noSecrets=between(qa,'  protected-real-qa:\n',secretStep);
  const actualBrowser=between(qa,secretStep);
  guard(!/REVIEW_DEV_(ADMIN|OPERATOR|VIEWER|FOREIGN)_(EMAIL|PASSWORD):/.test(noSecrets),
    'NO_QA_PASSWORDS_IN_BUILD');
  for(const role of ['ADMIN','OPERATOR','VIEWER','FOREIGN']) {
    guard(actualBrowser.includes('secrets.REVIEW_DEV_'+role+'_PASSWORD'), 'QA_ROLE_SECRET_'+role);
  }
  guard(actualBrowser.includes("WOS_QA_SOAK_ROUNDS: '1'") &&
        actualBrowser.includes('node tests/e2e/wos-qa-real-browser.cjs') &&
        actualBrowser.includes('node tests/e2e/wos-qa-resilience.cjs'),
    'ONE_REAL_BROWSER_AND_RECOVERY');
  const actions=[...source.matchAll(/^\s*- uses:\s*([^\s#]+)/gm)].map(m=>m[1]);
  guard(actions.length>=5 && actions.every(a=>/@[a-f0-9]{40}$/.test(a)),
    'PINNED_EXTERNAL_ACTIONS');
  guard(!/(upload-artifact|printenv|set -x|git push|vercel --prod|supabase db push)/i.test(source),
    'NO_SECRET_EXPORT_OR_PRODUCTION_PUBLISH');
}

audit(workflow);
const negative: Array<[string,string]> = [
  ['BUSINESS_SHA',workflow.replaceAll(authorizedBusinessHead,'f'.repeat(40))],
  ['AUTO_PR_EVENT',workflow.replace('  workflow_dispatch:', '  pull_request:\n  workflow_dispatch:')],
  ['WRONG_ISSUE',workflow.replace('github.event.issue.number == 104','github.event.issue.number == 10')],
  ['WRONG_COMMENT_ACTOR',workflow.replace('github.event.sender.login == \'lenchenalc-hongda\'',
    'github.event.sender.login == \'anyone\'')],
  ['WRONG_COMMENT_MARKER',workflow.replaceAll('WOS_P1_SINGLE_QA_ACCEPTANCE_RETRY1_20261117_SHA=6a72b446ccc517a5ff14e531b8a6663b4a70a77e','WOS_UNVERIFIED_COMMENT_TRIGGER')],
  ['NO_EVENT_JSON_RECHECK',workflow.replace('.comment.body==$body','.comment.body!=null')],
  ['BYPASS_ON_PR_COMMENTS',workflow.replace('github.event.issue.pull_request == null','true')],

  ['FORGED_HUMAN_APPROVAL',workflow.replace('WOS_P1_OWNER_AUTHORIZED_GITHUB_HOSTED_AUDIT=PASS',
    'WOS_P1_OWNER_PIN_INDEPENDENT_REVIEW_AND_CI=PASS')],
  ['OMITTED_MERGE_PARENT',workflow.replace('.parents[1].sha==$sha','true')],
  ['OMITTED_TRUSTED_CI',workflow.replace('master_ci" = "$reviewed_ci','master_ci" = "$compromised_ci')],
  ['INCOMPLETE_BUSINESS_FILES',workflow.replace('changed_files" -lt 100 ]','changed_files" -lt 1000 ]')],
  ['WORKFLOW_SCOPE',workflow.replaceAll('tests/unit/workshop-order-p1-qa-workflow-security.test.ts',
    'tests/unit/silent-bypass.test.ts')],
  ['PR202_LOCK_HEAD_CHANGED',workflow.replace('b3f382976049eacabefc7965cbb90312fd6903cc','0'.repeat(40))],
  ['MISSING_AUDIT_LOG_PROOF',workflow.replace('WOS_P1_PROTECTED_QA_STATIC_SECURITY_AUDIT=PASS','SKIPPED')],
  ['MISSING_PASSWORD_SAFETY',workflow.replace('WOS_P1_QA_ACCOUNT_CREDENTIALS_USED=NO','UNVERIFIED')],
  ['MISSING_SECOND_CI',workflow.replace('verify_ci "$workflow_head" yes','verify_ci "$workflow_head" no')],
  ['BRANCH_CHECKOUT',workflow.replaceAll(checkout,'ref: master')],
  ['CRED_IN_BUILD',workflow.replace('      - name: Build and start isolated QA Preview-mode app WITHOUT user passwords',
    '      - name: Build and start isolated QA Preview-mode app WITHOUT user passwords\n        env:\n          REVIEW_DEV_ADMIN_PASSWORD: unexpected')],
  ['WRONG_QA_PROJECT',workflow.replaceAll('https://xulmpqaknlwqqculbsek.supabase.co',
    'https://amqpvxrurenevniilhtl.supabase.co')],
  ['SKIP_PRE_SECRET_GATE',workflow.replace('WOS_P1_BEFORE_QA_CREDENTIALS_AUDIT_RECHECK=PASS','BYPASS')],
  ['WRONG_PROTECTED_ENV',workflow.replace('environment: hongda-review-dev','environment: production')],
  ['MULTI_QA_SOAK',workflow.replace("WOS_QA_SOAK_ROUNDS: '1'","WOS_QA_SOAK_ROUNDS: '10'")],
  ['UNPINNED_ACTIONS',workflow.replace('actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683','actions/checkout@v4')],
  ['EXFIL_ARTIFACT',workflow+'\n    - uses: actions/upload-artifact@v4'],
  ['UNSUPPORTED_UBUNTU26',workflow.replace('runs-on: ubuntu-24.04','runs-on: ubuntu-latest')],
  ['MISSING_FIX_PR',workflow.replace('pr240=$(api "$base/pulls/240")','pr240=$(api "$base/pulls/239")')],
  ['UNPINNED_FIRST_PARENT',workflow.replace('.parents[0].sha=="5d794a5f5be0821c37df0bbf99005137a1f8197e"', '.parents[0].sha!=null')],
  ['MISSING_FIX_CI',workflow.replace('verify_ci "$fix_head" fix','verify_ci "$fix_head" no')],
  ['MISSING_FINAL_FIX_RUN',workflow.replace('ci3=$(api "$base/actions/runs/$FIX_RUN")','ci3=$(api "$base/actions/runs/$AUDIT_RUN")')],
  ['REPLAY_OLD_OWNER_MARKER',workflow.replaceAll('WOS_P1_SINGLE_QA_ACCEPTANCE_RETRY1_20261117_SHA=', 'WOS_P1_SINGLE_QA_ACCEPTANCE_20261117_SHA=')],
];
for(const [name,mutated] of negative){
  let failed=false;
  try{audit(mutated);}catch{failed=true;}
  guard(failed,'NEGATIVE_CASE_'+name);
}
console.log('WOS_P1_PROTECTED_QA_STATIC_SECURITY_AUDIT=PASS');
console.log('WOS_P1_PROTECTED_QA_NEGATIVE_CASES='+negative.length);
console.log('WOS_P1_QA_ACCOUNT_CREDENTIALS_USED=NO');
console.log('WOS_P1_GITHUB_HOSTED_AUDIT_SUBSTITUTION_CONTRACT=PASS');
