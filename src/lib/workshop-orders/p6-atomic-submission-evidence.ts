/**
 * WOS Phase 6: fail-closed validation for a future single-transaction
 * nonproduction office submission RPC. This function is NOT the RPC and
 * cannot submit an order; existing POST 409 guard remains unchanged.
 *
 * Evidence must be returned by a trusted server-side RPC after COMMIT,
 * never taken from JSON supplied by a browser or a mock.
 */
export type WosP6Entity = 'PRODUCTION_ORDER' | 'SAMPLING_REQUEST';

export interface WosP6Actor {
  readonly profileId: string;
  readonly organizationId: string;
  readonly role: 'admin' | 'manager' | 'sales' | 'workshop' | 'technician';
  readonly active: boolean;
}

export interface WosP6SourceSnapshot {
  readonly entityType: WosP6Entity;
  readonly sourceId: string;
  readonly organizationId: string;
  readonly ownerProfileId: string;
  readonly ownerOrganizationId: string;
  readonly ownerActive: boolean;
  readonly version: number;
  readonly versionLabel: string;
  readonly workflowStatus: 'DRAFT' | 'SUBMITTED';
}

export interface WosP6SubmissionRequest {
  readonly entityType: WosP6Entity;
  readonly sourceId: string;
  readonly expectedVersion: number;
  readonly expectedVersionLabel: string;
  readonly idempotencyKey: string;
  readonly requestFingerprint: string;
}

export interface WosP6AtomicDbEvidence {
  readonly source: 'TRUSTED_NONPRODUCTION_RPC';
  readonly result: 'COMMITTED' | 'REPLAYED';
  readonly organizationId: string;
  readonly actorProfileId: string;
  readonly ownerProfileId: string;
  readonly entityType: WosP6Entity;
  readonly sourceId: string;
  readonly submittedVersion: number;
  readonly versionLabel: string;
  readonly idempotencyKey: string;
  readonly requestFingerprint: string;
  readonly sourceWorkflowStatus: 'SUBMITTED';
  readonly receiptId: string;
  readonly inboxFactId: string;
  readonly auditEventId: string;
  /** Database-confirmed effects, never caller-computed counts. */
  readonly sourceRowsUpdated: number;
  readonly receiptRowsInserted: number;
  readonly inboxRowsInserted: number;
  readonly auditRowsInserted: number;
  readonly transactionCommitted: true;
}

export type WosP6AtomicDecision =
  | {readonly ok:true; readonly acknowledgement:'COMMITTED'|'REPLAYED';
     readonly receiptId:string; readonly persisted:true; readonly productionReleaseAllowed:false;}
  | {readonly ok:false; readonly code:
      'INVALID_IDENTITY'|'UNTRUSTED_SOURCE'|'INVALID_REQUEST'|
      'UNTRUSTED_RECEIPT'|'NONATOMIC_SUBMISSION'|'REPLAY_MISMATCH';
     readonly persisted:false; readonly productionReleaseAllowed:false;};

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_TOKEN = /^[A-Za-z0-9_-]{8,128}$/;
const FINGERPRINT = /^[a-f0-9]{64}$/;
const ENTITIES = new Set<string>(['PRODUCTION_ORDER','SAMPLING_REQUEST']);
const ROLES = new Set<string>(['admin','manager','sales']);
const no=(code:Extract<WosP6AtomicDecision,{ok:false}>['code']):WosP6AtomicDecision=>
  ({ok:false,code,persisted:false,productionReleaseAllowed:false});

function uuid(value:unknown):value is string {
  return typeof value==='string' && ID.test(value);
}
function entity(value:unknown):value is WosP6Entity {
  return typeof value==='string' && ENTITIES.has(value);
}
function revision(value:unknown):value is number {
  return typeof value==='number' && Number.isSafeInteger(value) && value>0;
}
function versionLabel(value:unknown):value is string {
  return typeof value==='string' && value.trim().length>0 && value.length<=128;
}
function requestIsValid(value:unknown):value is WosP6SubmissionRequest {
  if(!value || typeof value!=='object') return false;
  const r=value as Partial<WosP6SubmissionRequest>;
  return entity(r.entityType) && uuid(r.sourceId) && revision(r.expectedVersion)
    && versionLabel(r.expectedVersionLabel)
    && typeof r.idempotencyKey==='string' && SAFE_TOKEN.test(r.idempotencyKey)
    && typeof r.requestFingerprint==='string' && FINGERPRINT.test(r.requestFingerprint);
}

/**
 * Never accepts a browser-generated "success". Only trust the result after a
 * verified same-org DB RPC committed all four changes under one transaction.
 * The SQL RPC/unique constraints/real Auth+RLS E2E are still required.
 */
export function validateWosP6AtomicSubmission(input:{
  readonly actor:WosP6Actor;
  readonly source:WosP6SourceSnapshot;
  readonly request:WosP6SubmissionRequest;
  readonly dbEvidence:WosP6AtomicDbEvidence;
}):WosP6AtomicDecision {
  const {actor,source,request,dbEvidence:e}=input;
  if(!actor || !uuid(actor.profileId) || !uuid(actor.organizationId)
    || actor.active!==true || !ROLES.has(actor.role))
    return no('INVALID_IDENTITY');
  if(!source || !entity(source.entityType)
    || !uuid(source.sourceId) || !uuid(source.organizationId)
    || !uuid(source.ownerProfileId) || !uuid(source.ownerOrganizationId)
    || source.ownerOrganizationId!==actor.organizationId
    || source.ownerActive!==true || source.organizationId!==actor.organizationId
    || !revision(source.version) || !versionLabel(source.versionLabel)
    || !['DRAFT','SUBMITTED'].includes(source.workflowStatus))
    return no('UNTRUSTED_SOURCE');
  if(!requestIsValid(request)
    || request.entityType!==source.entityType
    || request.sourceId!==source.sourceId
    || request.expectedVersion!==source.version
    || request.expectedVersionLabel!==source.versionLabel)
    return no('INVALID_REQUEST');
  if(!e || e.source!=='TRUSTED_NONPRODUCTION_RPC'
    || !['COMMITTED','REPLAYED'].includes(e.result)
    || e.organizationId!==actor.organizationId
    || e.actorProfileId!==actor.profileId
    || e.ownerProfileId!==source.ownerProfileId
    || e.entityType!==request.entityType
    || e.sourceId!==request.sourceId
    || e.submittedVersion!==request.expectedVersion
    || e.versionLabel!==request.expectedVersionLabel
    || e.idempotencyKey!==request.idempotencyKey
    || e.requestFingerprint!==request.requestFingerprint
    || e.sourceWorkflowStatus!=='SUBMITTED'
    || !uuid(e.receiptId) || !uuid(e.inboxFactId) || !uuid(e.auditEventId)
    || new Set([e.receiptId,e.inboxFactId,e.auditEventId]).size!==3
    || e.transactionCommitted!==true)
    return no('UNTRUSTED_RECEIPT');
  if(e.result==='COMMITTED'){
    if(source.workflowStatus!=='DRAFT'
      || e.sourceRowsUpdated!==1 || e.receiptRowsInserted!==1
      || e.inboxRowsInserted!==1 || e.auditRowsInserted!==1)
      return no('NONATOMIC_SUBMISSION');
  } else if (source.workflowStatus!=='SUBMITTED'
    || e.sourceRowsUpdated!==0 || e.receiptRowsInserted!==0
    || e.inboxRowsInserted!==0 || e.auditRowsInserted!==0){
    return no('REPLAY_MISMATCH');
  }
  return {ok:true,acknowledgement:e.result,receiptId:e.receiptId,
    persisted:true,productionReleaseAllowed:false};
}
