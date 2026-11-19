import { readFileSync } from 'node:fs';

// REVIEW ONLY: YAML lives in docs, never under .github/workflows.
const source = readFileSync('docs/workshop-order-system/16_P1_QA_CLOUD_REAPER_READONLY_WORKFLOW_CANDIDATE.yml', 'utf8');
const observer = readFileSync('src/lib/workshop-orders/qa-cloud-reaper/observer.py', 'utf8');
function must(b: boolean, reason: string): void {
  if (!b) throw new Error('WOS_READONLY_CANDIDATE_' + reason);
}
function audit(yaml: string): void {
  must(yaml.startsWith('# REVIEW DATA ONLY.'), 'DATA_ONLY');
  must(yaml.includes("github.repository == 'lenchenalc-hongda/hongda-new-media-platform'"), 'REPO');
  must(yaml.includes("github.ref == 'refs/heads/master'"), 'MASTER');
  must(yaml.includes("vars.WOS_P1_CLOUD_REAPER_ENABLED == 'true'"), 'DEFAULT_OFF');
  must(yaml.includes('environment: wos-p1-qa-cloud-reaper'), 'ENV');
  must(yaml.includes('permissions:\n  contents: read\n'), 'TOP_PERMISSIONS');
  must(yaml.includes('permission-environments: read'), 'READ_TOKEN');
  must(!yaml.includes('permission-environments: write'), 'NO_WRITE_TOKEN');
  must(yaml.includes('ref: ${{ github.sha }}') && yaml.includes('persist-credentials: false'), 'CHECKOUT');
  must(yaml.includes('actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683'), 'CHECKOUT_SHA');
  must(yaml.includes('actions/create-github-app-token@bcd2ba49218906704ab6c1aa796996da409d3eb1'), 'TOKEN_SHA');
  must(yaml.includes('python3 src/lib/workshop-orders/qa-cloud-reaper/observer.py'), 'OBSERVER_PATH');
  must(!/(curl\s+-X|gh\s+secret\s+(?:set|delete)|supabase\s+db\s+push|vercel\s+--prod|actions\/upload-artifact)/i.test(yaml.replace(/^#.*$/gm, '')), 'MUTATION_COMMAND');
  must(observer.includes('if method != "GET"') && observer.includes('CLOUD_REAPER_DELETE_DISABLED_UNSERIALIZED_WRITERS'), 'OBSERVER_READONLY');
}
audit(source);
const negatives: Array<[string,string]> = [
  ['WRITE_TOKEN',source.replace('permission-environments: read','permission-environments: write')],
  ['OTHER_REPO',source.replace('lenchenalc-hongda/hongda-new-media-platform','someone/other')],
  ['OTHER_REF',source.replace("github.ref == 'refs/heads/master'","github.ref == 'refs/heads/dev'")],
  ['UNPINNED',source.replace('ref: ${{ github.sha }}','ref: master')],
  ['PERSIST_TOKEN',source.replace('persist-credentials: false','persist-credentials: true')],
  ['ALWAYS_ON',source.replace("vars.WOS_P1_CLOUD_REAPER_ENABLED == 'true'",'true')],
  ['SECRET_DELETE',source.replace('python3 src/lib/workshop-orders/qa-cloud-reaper/observer.py','curl -X DELETE api.github.com')],
  ['OLD_SCRIPT',source.replace('python3 src/lib/workshop-orders/qa-cloud-reaper/observer.py','python3 tools/wos/wos_p1_cloud_reaper.py')],
];
for(const [name, mutation] of negatives){
  let denied=false;try{audit(mutation);}catch{denied=true;}
  must(denied,'NEGATIVE_ACCEPTED_'+name);
}
console.log('WOS_P1_READONLY_WORKFLOW_CANDIDATE_AUDIT=PASS negative=8');
