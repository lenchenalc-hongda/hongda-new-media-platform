import test from 'node:test';
import assert from 'node:assert/strict';
import {MemoryControlStore} from '../src/core.mjs';
import {dispatchOutboxOnce,reconcileGithubRun} from '../src/dispatcher.mjs';
import {canMerge,scopesOverlap} from '../src/policy.mjs';

function fixture({count=1,project='test',paths,now=()=>Date.now()}={}) {
  const s=new MemoryControlStore({now});const at=now();
  s.registerProject({id:project,enabled:true,dispatchOwner:'V3'});
  s.addEpic({id:`${project}-epic`,projectId:project,approvedBy:'owner',approvedUntil:at+600000,
    paths:[`${project}/`],risk:'SANDBOX'});
  s.addApproval({epicId:`${project}-epic`,scope:'NONPROD_CODE_EXECUTION',approvedBy:'owner',validUntil:at+600000});
  for(let i=0;i<count;i++)s.addTask({id:`${project}-task-${i}`,projectId:project,epicId:`${project}-epic`,
    status:'QUEUED',risk:'SANDBOX',paths:paths||[`${project}/task-${i}.mjs`],checks:['typecheck','test'],
    dependsOn:i?[`${project}-task-${i-1}`]:[]});
  return s;
}

test('P1: 50 concurrent claims on the same revision produce exactly one durable outbox operation',async()=>{
  const s=fixture();const result=await Promise.all(Array.from({length:50},(_,i)=>
    s.claim('test-task-0',{expectedVersion:0,worker:`worker-${i}`})));
  assert.equal(result.filter(x=>x.ok).length,1);
  assert.equal(s.listOutbox().length,1);
  assert.equal(s.events.size,1);
  assert.equal(s.getTask('test-task-0').epoch,1);
  assert.equal(result.filter(x=>!x.ok).length,49);
});

test('P1: two projects with disjoint paths may share slots, third must wait',async()=>{
  const s=fixture();const p=fixture({project:'other'});
  for(const x of p.projects.values())s.registerProject(x);
  for(const x of p.epics.values())s.addEpic(x);
  for(const x of p.approvals)s.addApproval(x);
  for(const x of p.tasks.values())s.addTask(x);
  const a=await s.claim('test-task-0',{expectedVersion:0,worker:'worker-a'});
  const b=await s.claim('other-task-0',{expectedVersion:0,worker:'worker-b'});
  assert.equal(a.ok,true);assert.equal(b.ok,true);
  const third=fixture({project:'third'});
  for(const x of third.projects.values())s.registerProject(x);
  for(const x of third.epics.values())s.addEpic(x);
  for(const x of third.approvals)s.addApproval(x);
  for(const x of third.tasks.values())s.addTask(x);
  assert.equal((await s.claim('third-task-0',{expectedVersion:0,worker:'worker-c'})).reason,
    'CODING_CAPACITY_EXHAUSTED');
});

test('P1: overlapping folder scope blocks another project even with open capacity',async()=>{
  const s=fixture({project:'one',paths:['shared/core/']});
  const p=fixture({project:'two',paths:['shared/core/file.mjs']});
  for(const x of p.projects.values())s.registerProject(x);
  for(const x of p.epics.values())s.addEpic({...x,paths:['shared/']});
  for(const x of p.approvals)s.addApproval(x);
  for(const x of p.tasks.values())s.addTask(x);
  s.addEpic({...s.epics.get('one-epic'),paths:['shared/']});
  assert.equal((await s.claim('one-task-0',{expectedVersion:0,worker:'a-owner'})).ok,true);
  assert.equal((await s.claim('two-task-0',{expectedVersion:0,worker:'b-owner'})).reason,
    'SHARED_SCOPE_LOCKED');
  assert.equal(scopesOverlap('shared/core/','shared/core/file.mjs'),true);
  assert.equal(scopesOverlap('shared/core/','shared/other/file.mjs'),false);
});

test('P1: expired worker cannot heartbeat or attach a stale run',async()=>{
  let time=1000000;const s=fixture({now:()=>time});
  const claim=await s.claim('test-task-0',{expectedVersion:0,worker:'agent-a',leaseMs:60000});
  assert.equal(await s.heartbeat(claim.taskId,claim.epoch,'attacker'),false);
  time+=61000;
  assert.equal(await s.heartbeat(claim.taskId,claim.epoch,'agent-a'),false);
  assert.deepEqual(await s.expireLeases(),['test-task-0']);
  assert.equal(s.getTask('test-task-0').status,'RECONCILING');
  assert.equal((await s.bindAttestedRun(claim.opKey,{runId:123,epoch:claim.epoch,verified:true})).ok,false);
  assert.equal((await s.claim(claim.taskId,{expectedVersion:2,worker:'agent-b'})).ok,false);
  assert.equal(await s.clearVerifiedAbsentRun(claim.taskId,claim.epoch,{}),false);
  assert.equal(await s.clearVerifiedAbsentRun(claim.taskId,claim.epoch,{attestedNoRun:true}),true);
  const second=await s.claim(claim.taskId,{expectedVersion:s.getTask(claim.taskId).version,worker:'agent-b'});
  assert.equal(second.ok,true);assert.equal(second.epoch,2);
  assert.notEqual(second.opKey,claim.opKey);
});

test('P2: 204 response and lost HTTP response both reconcile, never auto-resend',async()=>{
  const s=fixture();const c=await s.claim('test-task-0',{expectedVersion:0,worker:'agent'});
  const off=await dispatchOutboxOnce({store:s,opKey:c.opKey});
  assert.equal(off.status,'DISABLED_SAFE_DEFAULT');
  let count=0;
  const github={dispatchWorkflow:async()=>{count++;return {status:204}}};
  const sent=await dispatchOutboxOnce({store:s,opKey:c.opKey,github,remoteDispatchEnabled:true});
  assert.equal(sent.status,'AWAITING_SIGNED_RUN_PROOF');
  assert.equal(s.listOutbox()[0].status,'AMBIGUOUS');
  assert.equal((await dispatchOutboxOnce({store:s,opKey:c.opKey,github,remoteDispatchEnabled:true})).status,
    'NOT_DISPATCHABLE');
  assert.equal(count,1);
  assert.equal((await reconcileGithubRun({store:s,opKey:c.opKey,github:{findRunProof:async()=>({status:'NOT_FOUND'})},
    expectedIdentity:{repository:'test/repo'},jwks:{keys:[]}})).status,'AMBIGUOUS_HOLD');
  assert.equal((await reconcileGithubRun({store:s,opKey:c.opKey,github:{findRunProof:async()=>({
    opKey:c.opKey,runId:435622,epoch:c.epoch})},expectedIdentity:{repository:'test/repo'},jwks:{keys:[]}})).status,
    'AMBIGUOUS_HOLD','run metadata alone is never a signed attestation');
  assert.equal(s.getTask('test-task-0').status,'DISPATCHING');
  assert.equal(count,1);
});

test('P3: authorized dependency DAG selects next task without owner message',async()=>{
  const s=fixture({count:10});
  for(let i=0;i<10;i++){
    const next=s.nextApproved('test');
    assert.equal(next?.id,`test-task-${i}`);
    const c=await s.claim(next.id,{expectedVersion:next.version,worker:'synthetic-agent'});
    assert.equal(c.ok,true);
    await s.startDispatch(c.opKey);
    await s.acknowledgeAmbiguous(c.opKey);
    const run=await s.bindAttestedRun(c.opKey,{runId:90000+i,epoch:c.epoch,verified:true});
    assert.equal(run.ok,true);
    assert.equal(await s.markSimulatedMerged(c.taskId),true);
    assert.equal(await s.recordVerifiedRelease(c.taskId,{
      verified:true,nonproduction:true,exactHead:true,acceptancePassed:true,
    }),true);
  }
  assert.equal(s.nextApproved('test'),null);
  assert.equal(s.events.size>=50,true);
});

test('P3: unapproved task / expired approval / wrong scope cannot execute',async()=>{
  const s=fixture();let e=s.epics.get('test-epic');e.approvedUntil=Date.now()-1;
  assert.equal((await s.claim('test-task-0',{expectedVersion:0,worker:'a'})).reason,'EPIC_NOT_APPROVED');
  e.approvedUntil=Date.now()+60000;
  let t=s.tasks.get('test-task-0');t.paths=['src/production/'];
  assert.equal((await s.claim('test-task-0',{expectedVersion:0,worker:'a'})).reason,'SCOPE_NOT_APPROVED');
  t.paths=['test/task.mjs'];t.risk='PRODUCTION';
  assert.equal((await s.claim('test-task-0',{expectedVersion:0,worker:'a'})).reason,'RISK_HUMAN_GATE');
});

test('P3: green CI and reviewer cannot merge without P4 authorization',()=>{
  const head='a'.repeat(40),task={risk:'LOW',headSha:head,writer:'developer'};
  const decision=canMerge({task,head,ci:{passed:true,headSha:head},review:{passed:true,headSha:head,actor:'reviewer'},
    grant:{allowAutoMerge:true,headSha:head,allowGitConnectedDeployment:true,expiresAt:Date.now()+60000},
    branchProtected:true,independentReviewer:true,preview:{ready:true,headSha:head}});
  assert.deepEqual(decision,{allowed:false,reason:'P4_NOT_AUTHORIZED'});
});
