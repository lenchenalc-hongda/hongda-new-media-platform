/** Disposable PostgreSQL 17 real two-session CAS competition.
 * Runs ONLY inside GitHub-hosted CI when explicitly imported by the WOS
 * test suite. Never connects to Supabase, GitHub APIs or a production service.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, spawn } from 'node:child_process';

function command(args, timeout=120000) {
  const p=spawnSync('docker',args,{encoding:'utf8',timeout});
  assert.equal(p.status,0,'DOCKER_CAS_ERROR '+args.join(' ')+' '+(p.stderr??'').slice(-400));
  return (p.stdout??'').trim();
}
function postgres(container,sql,allowError=false) {
  const p=spawnSync('docker',['exec',container,'psql','-X','-v','ON_ERROR_STOP=1',
    '-U','postgres','-d','wos_ci','-Atc',sql],{encoding:'utf8',timeout:20000});
  if(!allowError)assert.equal(p.status,0,'POSTGRES_SQL_ERROR '+(p.stderr??'').slice(-400));
  return {status:p.status,stdout:(p.stdout??'').trim(),stderr:p.stderr??''};
}
function pgAsync(container,sql){
  return new Promise((resolve,reject)=>{
    const child=spawn('docker',['exec',container,'psql','-X','-v','ON_ERROR_STOP=1',
      '-U','postgres','-d','wos_ci','-Atc',sql],{stdio:['ignore','pipe','pipe']});
    let out='',err='';
    child.stdout.on('data',d=>out+=d.toString());
    child.stderr.on('data',d=>err+=d.toString());
    child.on('error',reject);
    child.on('close',code=>code===0?resolve(out.trim()):reject(new Error('PG_SECOND_SESSION '+code+' '+err.slice(-200))));
  });
}
const image='postgres:17',container='wos-p1-cas-'+process.pid;
test('real isolated PostgreSQL two competing UPDATE RETURNING transactions', {timeout:200000},async()=>{
  command(['run','--rm','-d','--name',container,'-e','POSTGRES_PASSWORD=wos-synthetic-only',
     '-e','POSTGRES_DB=wos_ci',image],140000);
  try {
    let ready=false;
    for(let i=0;i<60;i++){
      const p=spawnSync('docker',['exec',container,'pg_isready','-U','postgres','-d','wos_ci'],{encoding:'utf8'});
      if(p.status===0){ready=true;break}
      await new Promise(r=>setTimeout(r,500));
    }
    assert.ok(ready,'ISOLATED_POSTGRES_NOT_READY');
    postgres(container,`CREATE TABLE cas_guard(resource text PRIMARY KEY,epoch bigint NOT NULL,owner_pr int NOT NULL);
      CREATE TABLE cas_receipt(op_id text PRIMARY KEY,epoch bigint NOT NULL);
      CREATE TABLE cas_outbox(op_id text PRIMARY KEY REFERENCES cas_receipt(op_id));`);
    for(let round=0;round<12;round++){
      postgres(container,`TRUNCATE cas_outbox,cas_receipt,cas_guard;
        INSERT INTO cas_guard VALUES ('wos-p1-synthetic',7,202)`);
      function transfer(n){
        return `WITH moved AS (
          UPDATE cas_guard SET epoch=epoch+1,owner_pr=300
          WHERE resource='wos-p1-synthetic' AND epoch=7 AND owner_pr=202
          RETURNING epoch
        ), proof AS (
          INSERT INTO cas_receipt(op_id,epoch)
          SELECT 'round-${round}-writer-${n}',epoch FROM moved RETURNING op_id
        )
        INSERT INTO cas_outbox(op_id) SELECT op_id FROM proof RETURNING op_id`;
      }
      const [a,b]=await Promise.all([pgAsync(container,transfer(1)),pgAsync(container,transfer(2))]);
      const winners=[a,b].filter(v=>v.length>0);
      assert.equal(winners.length,1,'TWO_SESSIONS_NOT_SINGLE_WINNER');
      const count=postgres(container,
        "SELECT epoch::text||':'||owner_pr::text||':'||(SELECT count(*) FROM cas_receipt)::text||':'||(SELECT count(*) FROM cas_outbox)::text FROM cas_guard").stdout;
      assert.equal(count,'8:300:1:1','CAS_DB_CONSISTENCY');
      const stale=postgres(container,transfer(3)).stdout;
      assert.equal(stale,'','STALE_EPOCH_ACCEPTED');
    }
    console.log('WOS_P1_POSTGRES_REAL_TWO_WRITERS=PASS rounds=12');
    postgres(container,"TRUNCATE cas_outbox,cas_receipt,cas_guard; INSERT INTO cas_guard VALUES ('wos-p1-synthetic',7,202)");
    const rollback=postgres(container,`BEGIN; UPDATE cas_guard SET epoch=8,owner_pr=300
       WHERE resource='wos-p1-synthetic' AND epoch=7; SELECT 1/0; COMMIT;`,true);
    assert.notEqual(rollback.status,0,'CRASH_WAS_NOT_INJECTED');
    assert.equal(postgres(container,"SELECT epoch FROM cas_guard").stdout,'7','PG_CRASH_ROLLBACK_FAILED');
    assert.equal(postgres(container,"SELECT count(*) FROM cas_receipt").stdout,'0','PG_CRASH_CREATED_RECEIPT');
    console.log('WOS_P1_POSTGRES_FAILED_TRANSACTION_ROLLBACK=PASS');
  } finally {
    spawnSync('docker',['rm','-f',container],{encoding:'utf8',timeout:15000});
  }
});
