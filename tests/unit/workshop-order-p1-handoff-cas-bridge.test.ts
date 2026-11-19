import { spawnSync } from 'node:child_process';

// Exact-head CI bridge for real offline SQLite contention and synthetic
// cryptographic OIDC/Reviewer signatures. No API, secret or live database.
const checks: Array<[string,string[],string]> = [
  ['python3', ['tests/unit/workshop-order-p1-handoff-cas.test.py'], 'Ran 17 tests'],
  ['node', ['--test', 'tests/unit/workshop-order-p1-oidc-attestation.test.mjs'], '# pass 25'],
];
for (const [runtime,args,marker] of checks) {
  const result = spawnSync(runtime,args,{
    encoding:'utf8',timeout:60000,
    env:{...process.env,WOS_P1_CLEANUP_APP_TOKEN:''}
  });
  const output=(result.stdout??'')+'\n'+(result.stderr??'');
  if(result.error || result.status!==0 || !output.includes(marker)) {
    throw new Error('WOS_P1_HANDOFF_OFFLINE_FAILED '+runtime+' '+output.slice(-900));
  }
  console.log('WOS_P1_HANDOFF_OFFLINE_TEST=PASS '+marker);
}
console.log('WOS_P1_HANDOFF_OFFLINE_CAS_CRYPTO=PASS sqlite=17 signed=25');
