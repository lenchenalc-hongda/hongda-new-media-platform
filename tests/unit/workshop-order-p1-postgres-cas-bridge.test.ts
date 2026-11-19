import { spawnSync } from 'node:child_process';

// The host GitHub runner has Docker; this runs actual PostgreSQL 17 sessions
// inside an ephemeral container, independent of EVERY Supabase project.
const result=spawnSync('node',['--test','tests/unit/workshop-order-p1-postgres-cas.test.mjs'],{
  encoding:'utf8',timeout:210000,
  env:{...process.env,WOS_P1_CLEANUP_APP_TOKEN:''}
});
const log=(result.stdout??'')+'\n'+(result.stderr??'');
if(result.error||result.status!==0||
   !log.includes('WOS_P1_POSTGRES_REAL_TWO_WRITERS=PASS rounds=12')||
   !log.includes('WOS_P1_POSTGRES_FAILED_TRANSACTION_ROLLBACK=PASS')||
   !log.includes('# pass 1')){
  throw new Error('WOS_P1_EPHEMERAL_POSTGRES_TEST_FAILED '+String(result.error??result.status)+' '+log.slice(-1200));
}
console.log('WOS_P1_EPHEMERAL_POSTGRES_CAS=PASS rounds=12 rollback=PASS');
