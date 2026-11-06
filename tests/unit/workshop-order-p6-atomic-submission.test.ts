import assert from 'node:assert/strict';
import {
  validateWosP6AtomicSubmission,
  type WosP6AtomicDbEvidence,
  type WosP6SubmissionRequest,
  type WosP6SourceSnapshot,
  type WosP6Actor,
} from '../../src/lib/workshop-orders/p6-atomic-submission-evidence';

const org='22222222-2222-4222-8222-222222222222';
const otherOrg='33333333-3333-4333-8333-333333333333';
const actorId='44444444-4444-4444-8444-444444444444';
const ownerId='55555555-5555-4555-8555-555555555555';
const prodId='66666666-6666-4666-8666-666666666666';
const sampleId='77777777-7777-4777-8777-777777777777';
const receiptId='88888888-8888-4888-8888-888888888888';
const inboxId='99999999-9999-4999-8999-999999999999';
const auditId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const hash='a'.repeat(64);

const make = (type:'PRODUCTION_ORDER'|'SAMPLING_REQUEST'='PRODUCTION_ORDER')=>{
  const actor:WosP6Actor={profileId:actorId,organizationId:org,role:'sales',active:true};
  const source:WosP6SourceSnapshot={
    entityType:type,sourceId:type==='PRODUCTION_ORDER'?prodId:sampleId,
    organizationId:org,ownerProfileId:ownerId,
    ownerOrganizationId:org,ownerActive:true,
    version:3,versionLabel:'V3',workflowStatus:'DRAFT',
  };
  const request:WosP6SubmissionRequest={
    entityType:type,sourceId:source.sourceId,expectedVersion:3,
    expectedVersionLabel:'V3',idempotencyKey:'office-pilot-20261106',
    requestFingerprint:hash,
  };
  const dbEvidence:WosP6AtomicDbEvidence={
    source:'TRUSTED_NONPRODUCTION_RPC',result:'COMMITTED',
    organizationId:org,actorProfileId:actorId,ownerProfileId:ownerId,
    entityType:type,sourceId:source.sourceId,submittedVersion:3,
    versionLabel:'V3',idempotencyKey:request.idempotencyKey,
    requestFingerprint:hash,sourceWorkflowStatus:'SUBMITTED',
    receiptId,inboxFactId:inboxId,auditEventId:auditId,
    sourceRowsUpdated:1,receiptRowsInserted:1,
    inboxRowsInserted:1,auditRowsInserted:1,transactionCommitted:true,
  };
  return {actor,source,request,dbEvidence};
};

for(const entityType of ['PRODUCTION_ORDER','SAMPLING_REQUEST'] as const){
  const result=validateWosP6AtomicSubmission(make(entityType));
  assert.deepEqual(result,{
    ok:true,acknowledgement:'COMMITTED',receiptId,persisted:true,
    productionReleaseAllowed:false,
  });
}
const replay=make();
replay.source={...replay.source,workflowStatus:'SUBMITTED'};
replay.dbEvidence={...replay.dbEvidence,result:'REPLAYED',sourceRowsUpdated:0,
  receiptRowsInserted:0,inboxRowsInserted:0,auditRowsInserted:0};
const replayResult=validateWosP6AtomicSubmission(replay);
assert.deepEqual(replayResult,{
  ok:true,acknowledgement:'REPLAYED',receiptId,persisted:true,
  productionReleaseAllowed:false,
});

function refuse(
  mutate:(input:ReturnType<typeof make>)=>void,
  expected?:string,
){
  const payload=make();
  mutate(payload);
  const r=validateWosP6AtomicSubmission(payload);
  assert.equal(r.ok,false);
  if(r.ok) throw Error('fake database success must not be acknowledged');
  assert.equal(r.persisted,false);
  assert.equal(r.productionReleaseAllowed,false);
  if(expected)assert.equal(r.code,expected);
}

refuse(x=>{x.actor={...x.actor,active:false};},'INVALID_IDENTITY');
refuse(x=>{x.actor={...x.actor,role:'workshop'};},'INVALID_IDENTITY');
refuse(x=>{x.actor={...x.actor,role:'technician'};},'INVALID_IDENTITY');
refuse(x=>{x.actor={...x.actor,organizationId:otherOrg};},'UNTRUSTED_SOURCE');
refuse(x=>{x.source={...x.source,organizationId:otherOrg};},'UNTRUSTED_SOURCE');
refuse(x=>{x.source={...x.source,ownerOrganizationId:otherOrg};},'UNTRUSTED_SOURCE');
refuse(x=>{x.source={...x.source,ownerActive:false};},'UNTRUSTED_SOURCE');
refuse(x=>{x.source={...x.source,version:0};},'UNTRUSTED_SOURCE');
refuse(x=>{x.request={...x.request,expectedVersion:2};},'INVALID_REQUEST');
refuse(x=>{x.request={...x.request,expectedVersionLabel:'V2'};},'INVALID_REQUEST');
refuse(x=>{x.request={...x.request,sourceId:sampleId};},'INVALID_REQUEST');
refuse(x=>{x.request={...x.request,idempotencyKey:'?'};},'INVALID_REQUEST');
refuse(x=>{x.request={...x.request,requestFingerprint:'client-json-not-hash'};},'INVALID_REQUEST');
refuse(x=>{x.dbEvidence={...x.dbEvidence,source:'CLIENT_SUPPLIED' as 'TRUSTED_NONPRODUCTION_RPC'};},'UNTRUSTED_RECEIPT');
refuse(x=>{x.dbEvidence={...x.dbEvidence,transactionCommitted:false as true};},'UNTRUSTED_RECEIPT');
refuse(x=>{x.dbEvidence={...x.dbEvidence,organizationId:otherOrg};},'UNTRUSTED_RECEIPT');
refuse(x=>{x.dbEvidence={...x.dbEvidence,actorProfileId:ownerId};},'UNTRUSTED_RECEIPT');
refuse(x=>{x.dbEvidence={...x.dbEvidence,ownerProfileId:actorId};},'UNTRUSTED_RECEIPT');
refuse(x=>{x.dbEvidence={...x.dbEvidence,sourceId:sampleId};},'UNTRUSTED_RECEIPT');
refuse(x=>{x.dbEvidence={...x.dbEvidence,submittedVersion:2};},'UNTRUSTED_RECEIPT');
refuse(x=>{x.dbEvidence={...x.dbEvidence,sourceWorkflowStatus:'DRAFT' as 'SUBMITTED'};},'UNTRUSTED_RECEIPT');
refuse(x=>{x.dbEvidence={...x.dbEvidence,idempotencyKey:'other-request-key'};},'UNTRUSTED_RECEIPT');
refuse(x=>{x.dbEvidence={...x.dbEvidence,requestFingerprint:'b'.repeat(64)};},'UNTRUSTED_RECEIPT');
refuse(x=>{x.dbEvidence={...x.dbEvidence,inboxFactId:''};},'UNTRUSTED_RECEIPT');
refuse(x=>{x.dbEvidence={...x.dbEvidence,auditEventId:receiptId};},'UNTRUSTED_RECEIPT');
refuse(x=>{x.dbEvidence={...x.dbEvidence,sourceRowsUpdated:0};},'NONATOMIC_SUBMISSION');
refuse(x=>{x.dbEvidence={...x.dbEvidence,receiptRowsInserted:0};},'NONATOMIC_SUBMISSION');
refuse(x=>{x.dbEvidence={...x.dbEvidence,inboxRowsInserted:0};},'NONATOMIC_SUBMISSION');
refuse(x=>{x.dbEvidence={...x.dbEvidence,auditRowsInserted:0};},'NONATOMIC_SUBMISSION');
refuse(x=>{x.dbEvidence={...x.dbEvidence,receiptRowsInserted:2};},'NONATOMIC_SUBMISSION');
refuse(x=>{x.source={...x.source,workflowStatus:'SUBMITTED'};},'NONATOMIC_SUBMISSION');
refuse(x=>{x.dbEvidence={...x.dbEvidence,result:'REPLAYED',sourceRowsUpdated:0,
  receiptRowsInserted:0,inboxRowsInserted:0,auditRowsInserted:0};},'REPLAY_MISMATCH');

const forgedReplay=make();
forgedReplay.source={...forgedReplay.source,workflowStatus:'SUBMITTED'};
forgedReplay.dbEvidence={...forgedReplay.dbEvidence,result:'REPLAYED',
  sourceRowsUpdated:0,receiptRowsInserted:1,inboxRowsInserted:0,auditRowsInserted:0};
const noDuplicate=validateWosP6AtomicSubmission(forgedReplay);
assert.equal(noDuplicate.ok,false);

console.log('WOS_P6_ATOMIC_SUBMISSION_CONTRACT_PASS: two entry types, zero false commits, replay and 4-effect receipts');
