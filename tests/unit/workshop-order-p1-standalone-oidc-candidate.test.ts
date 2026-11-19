import { readFileSync } from 'node:fs';

// This is REVIEW ONLY: the workflow candidate is intentionally under docs/.
// A source-only test cannot mint a GitHub-signed JWT or provide reviewer proof.
const filename='docs/workshop-order-system/21_P1_STANDALONE_OIDC_WORKFLOW_REVIEW.yml';
const actual=readFileSync(filename,'utf8');
function must(value:boolean,label:string){if(!value)throw Error('WOS_STANDALONE_OIDC_WORKFLOW_'+label)}
function verify(y:string){
  must(y.startsWith('# REVIEW-ONLY COPY FOR SEPARATE PRIVATE REPOSITORY.'),'NON_EXECUTABLE');
  must(y.includes('on:\n  workflow_dispatch:\n'),'MANUAL_ONLY');
  must(!y.includes('on:\n  push:')&&!y.includes('on:\n  pull_request:'),'UNWANTED_EVENTS');
  must(y.includes('permissions:\n  contents: read\n  id-token: write\n'),'MINIMUM_PERMISSIONS');
  must(!/contents:\s*write|issues:\s*write|pull-requests:\s*write|environments:\s*write|actions:\s*write|secrets\./i.test(y),'BROAD_AUTH');
  must(y.includes("github.repository == 'lenchenalc-hongda/hongda-wos-p1-handoff-attestation'"),'ISSUER_REPOSITORY');
  must(y.includes("github.ref == 'refs/heads/main'"),'PROTECTED_MAIN');
  must(y.includes('github.ref_protected == true'),'BRANCH_PROTECTION');
  must(y.includes('github.run_attempt == 1'),'FIRST_ATTEMPT');
  must(y.includes('runs-on: ubuntu-24.04'),'HOSTED');
  must(y.includes('environment: wos-p1-attestation'),'PROTECTED_ENVIRONMENT');
  must(y.includes('timeout-minutes: 5'),'SHORT_TIMEOUT');
  must(y.includes('uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683'),'PINNED_CHECKOUT');
  must(y.includes('ref: ${{ github.sha }}'),'EXACT_SHA');
  must(y.includes('persist-credentials: false'),'NO_PERSISTENT_TOKEN');
  must(y.includes('WOS_P1_TRUSTED_REPO_ID: ${{ vars.WOS_P1_TRUSTED_REPO_ID }}'),'PINNED_ID_SOURCE');
  must(y.includes('WOS_P1_TRUSTED_SUB: ${{ vars.WOS_P1_TRUSTED_SUB }}'),'PINNED_SUB_SOURCE');
  must(y.includes('node scripts/verify-oidc.mjs'),'PROOF_SCRIPT');
  must(!/curl\s+-X|gh\s+secret\s+(set|delete)|git\s+push|supabase\s+db\s+push/i.test(y),'NO_MUTATING_COMMAND');
}
verify(actual);
const negative:Array<[string,string]>=[
  ['WRONG_REPOSITORY',actual.replace('lenchenalc-hongda/hongda-wos-p1-handoff-attestation','lenchenalc-hongda/hongda-new-media-platform')],
  ['WRONG_REF',actual.replace("github.ref == 'refs/heads/main'","github.ref == 'refs/heads/dev'")],
  ['UNPROTECTED_BRANCH',actual.replace('github.ref_protected == true','github.ref_protected == false')],
  ['MULTIPLE_RUN_ATTEMPT',actual.replace('github.run_attempt == 1','github.run_attempt == 2')],
  ['WRONG_ENVIRONMENT',actual.replace('environment: wos-p1-attestation','environment: production')],
  ['WRONG_PERMISSION',actual.replace('contents: read','contents: write')],
  ['NO_ID_TOKEN',actual.replace('id-token: write','id-token: read')],
  ['UNPINNED_CHECKOUT',actual.replace('actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683','actions/checkout@v4')],
  ['UNPINNED_GIT_REF',actual.replace('ref: ${{ github.sha }}','ref: main')],
  ['TOKEN_PERSISTED',actual.replace('persist-credentials: false','persist-credentials: true')],
  ['WRONG_SCRIPT',actual.replace('node scripts/verify-oidc.mjs','node scripts/unsafe.mjs')],
  ['WRITE_SECRET',actual+'\n      - run: gh secret delete TEST\n'],
  ['UNWANTED_PUSH',actual.replace('on:\n  workflow_dispatch:\n','on:\n  push:\n')],
  ['NO_TRUSTED_ID',actual.replace('WOS_P1_TRUSTED_REPO_ID: ${{ vars.WOS_P1_TRUSTED_REPO_ID }}','WOS_P1_TRUSTED_REPO_ID: ${{ github.repository_id }}')],
  ['NO_TRUSTED_SUB',actual.replace('WOS_P1_TRUSTED_SUB: ${{ vars.WOS_P1_TRUSTED_SUB }}','WOS_P1_TRUSTED_SUB: ${{ github.actor }}')],
];
for(const [name,changed] of negative){
  let refused=false;
  try{verify(changed);}catch{refused=true}
  must(refused,'NEGATIVE_NOT_REJECTED_'+name);
}
console.log('WOS_STANDALONE_OIDC_CANDIDATE_SECURITY=PASS negative=15');
