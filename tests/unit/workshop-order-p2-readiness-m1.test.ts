import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  parseWosP2Action, canActOnWosP2, isWosP2QaMutationEnabled, isWosP2RpcResult,
} from '../../src/lib/workshop-orders/p2-action-contract';
import {
  WOS_P2_MATERIALS, evaluateWosP2Readiness,
  type WosP2ReadinessInput,
} from '../../src/lib/workshop-orders/p2-qa-readiness';
import {
  assessWosP2MaterialVersionLineage,
  type WosP2MaterialVersionInput,
} from '../../src/lib/workshop-orders/p2-material-version-evidence';
import {
  assessWosP2VisualEvidence,
  type WosP2VisualEvidenceInput,
} from '../../src/lib/workshop-orders/p2-visual-evidence';

const org = '11111111-1111-4111-8111-111111111111';
const order = '22222222-2222-4222-8222-222222222222';
const office = '33333333-3333-4333-8333-333333333333';
const operator = '44444444-4444-4444-8444-444444444444';
const event = '55555555-5555-4555-8555-555555555555';
const at='2026-11-20T02:00:00.000Z';
const later='2026-11-20T03:00:00.000Z';
const now='2026-11-20T04:00:00.000Z';
const hash='a'.repeat(64);

// Real evaluator: four distinct resource statuses, same production revision,
// arrivals/ETA/quantities as RLS data, no auto-start even with all statuses.
const goodMaterial: WosP2ReadinessInput={
  versionLabel:'QA-R6', currentBatchQuantity:200, readVerified:true,
  resources:WOS_P2_MATERIALS.map(m=>({
    resource_type:m.code,status:m.acceptedStatus,version_label:'QA-R6',
    quantity_expected:m.code==='INCOMING_MATERIAL'?200:null,
    quantity_arrived:m.code==='INCOMING_MATERIAL'?200:null,
    confirmed_by_profile_id:operator,confirmed_at:later,note:'QA confirmed actual batch',
    expected_at:at,arrived_at:at,
  })),
  blockers:[],
  baselines:[{version_label:'QA-R6',status:'CURRENT',office_confirmed_at:at,workshop_confirmed_at:later}],
};
const complete=evaluateWosP2Readiness(goodMaterial);
assert.equal(complete.materialsVerified,true);
assert.equal(complete.canStart,false);
assert.equal(complete.materials.length,4);
assert.equal(complete.visualBaseline.currentCount,1);
assert.equal(complete.visualBaseline.versionLabel,'QA-R6');
assert.equal(complete.visualBaseline.currentVersionMatched,true);
assert.equal(complete.visualBaseline.officeConfirmed,true);
assert.equal(complete.visualBaseline.workshopConfirmed,true);
const missingVisual=evaluateWosP2Readiness({...goodMaterial,baselines:[]});
assert.equal(missingVisual.visualBaseline.currentCount,0);
assert.equal(missingVisual.visualBaseline.officeConfirmed,false);
assert.equal(missingVisual.visualBaseline.workshopConfirmed,false);
assert.equal(missingVisual.canStart,false);
assert(complete.materials.every(x=>x.evidence?.expectedAt===at && x.evidence?.arrivedAt===at));
assert.equal(complete.materials.find(x=>x.code==='INCOMING_MATERIAL')?.evidence?.quantityShortfall,0);

const materialFailures:Array<[string,WosP2ReadinessInput]>=[
 ['all four missing',{...goodMaterial,resources:[]}],
 ['only film exists',{...goodMaterial,resources:goodMaterial.resources.slice(0,1)}],
 ['film arrived not version verified',{...goodMaterial,resources:goodMaterial.resources.map(r=>r.resource_type==='FILM'?{...r,status:'ARRIVED'}:r)}],
 ['film stale production label',{...goodMaterial,resources:goodMaterial.resources.map(r=>r.resource_type==='FILM'?{...r,version_label:'QA-R5'}:r)}],
 ['fixture arrived but not fitted',{...goodMaterial,resources:goodMaterial.resources.map(r=>r.resource_type==='FIXTURE'?{...r,status:'ARRIVED'}:r)}],
 ['incoming partially arrived',{...goodMaterial,resources:goodMaterial.resources.map(r=>r.resource_type==='INCOMING_MATERIAL'?{...r,quantity_arrived:180}:r)}],
 ['incoming expected short',{...goodMaterial,resources:goodMaterial.resources.map(r=>r.resource_type==='INCOMING_MATERIAL'?{...r,quantity_expected:150}:r)}],
 ['incoming status only arrived',{...goodMaterial,resources:goodMaterial.resources.map(r=>r.resource_type==='INCOMING_MATERIAL'?{...r,status:'ARRIVED'}:r)}],
 ['signed sample only uploaded',{...goodMaterial,resources:goodMaterial.resources.map(r=>r.resource_type==='SIGNED_SAMPLE'?{...r,status:'UPLOADED'}:r)}],
 ['signed sample physical not confirmed',{...goodMaterial,resources:goodMaterial.resources.map(r=>r.resource_type==='SIGNED_SAMPLE'?{...r,status:'PHYSICAL_SAMPLE_RECEIVED'}:r)}],
 ['same status wrong current production version',{...goodMaterial,versionLabel:'QA-R7'}],
 ['duplicate receipt',{...goodMaterial,resources:[...goodMaterial.resources,goodMaterial.resources[0]]}],
 ['unknown material',{...goodMaterial,resources:[...goodMaterial.resources,{...goodMaterial.resources[0],resource_type:'UNKNOWN'}]}],
 ['unresolved blocker',{...goodMaterial,blockers:[{blocker_code:'MISSING_FILM',status:'OPEN',description:'film missing'}]}],
 ['unreviewed waiver',{...goodMaterial,blockers:[{blocker_code:'MISSING_SAMPLE',status:'WAIVED',description:'unsigned sample'}]}],
 ['no current visual baseline',{...goodMaterial,baselines:[]}],
 ['stale visual baseline',{...goodMaterial,baselines:[{...goodMaterial.baselines[0],version_label:'QA-R5'}]}],
 ['office visual confirmation absent',{...goodMaterial,baselines:[{...goodMaterial.baselines[0],office_confirmed_at:null}]}],
 ['workshop visual confirmation absent',{...goodMaterial,baselines:[{...goodMaterial.baselines[0],workshop_confirmed_at:null}]}],
 ['RLS query unverified',{...goodMaterial,readVerified:false}],
];
for(const [label,data] of materialFailures){
 const r=evaluateWosP2Readiness(data);
 assert.equal(r.materialsVerified,false,label);
 assert.equal(r.canStart,false,label);
}
const under=evaluateWosP2Readiness({
 ...goodMaterial,resources:goodMaterial.resources.map(r=>r.resource_type==='INCOMING_MATERIAL'?{...r,quantity_arrived:100}:r),
});
assert.equal(under.materials.find(x=>x.code==='INCOMING_MATERIAL')?.evidence?.quantityShortfall,100);
assert.equal(under.materials.find(x=>x.code==='INCOMING_MATERIAL')?.ready,false);

// Numeric transaction version may advance for materials; production version
// does not automatically change. Existing P2 receipts lack immutable digest.
const oldWitness:WosP2MaterialVersionInput={
 orderId:order,organizationId:org,currentTransactionVersion:7,
 productionVersionLabel:'QA-R6',witnessedTransactionVersion:7,
 witnessedProductionVersionLabel:'QA-R6',historicalV7HandoffMatched:true,receipts:[],
};
const oldOnly=assessWosP2MaterialVersionLineage(oldWitness);
assert.equal(oldOnly.proofState,'V7_HISTORY_SCOPE_ONLY');
assert.equal(oldOnly.currentRevisionHandoffProven,false);
assert.equal(oldOnly.canStart,false);

const receipt={
 request_id:event,organization_id:org,order_id:order,action:'CONFIRM_MATERIAL',
 expected_version:7,payload_fingerprint:hash,
 response_json:{status:'APPLIED',orderId:order,requestId:event,version:8,workflowStatus:'WAITING_MATERIAL'},
};
const v8={...oldWitness,currentTransactionVersion:8,receipts:[receipt]};
const candidate=assessWosP2MaterialVersionLineage(v8);
assert.equal(candidate.candidateReceiptChainConsistent,true);
assert.equal(candidate.proofState,'CANDIDATE_REQUIRES_SIGNED_SNAPSHOT');
assert.equal(candidate.currentRevisionHandoffProven,false,
 'even perfect v8 material receipt does not renew six-step v7 handoff proof');
assert.equal(candidate.canStart,false);
const versionFailures:Array<[string,WosP2MaterialVersionInput]>=[
 ['v8 missing receipt',{...v8,receipts:[]}],
 ['v9 missing next CAS receipt',{...v8,currentTransactionVersion:9}],
 ['v8 wrong expectedVersion',{...v8,receipts:[{...receipt,expected_version:8}]}],
 ['v8 payload/response version conflict',{...v8,receipts:[{...receipt,response_json:{...receipt.response_json,version:9}}]}],
 ['same requestId with duplicate event',{...v8,currentTransactionVersion:9,receipts:[receipt,receipt]}],
 ['wrong organization in receipt',{...v8,receipts:[{...receipt,organization_id:office}]}],
 ['wrong order in receipt',{...v8,receipts:[{...receipt,order_id:office}]}],
 ['nonmaterial action in material lineage',{...v8,receipts:[{...receipt,action:'REVIEW_CORRECTION'}]}],
 ['corrupt receipt fingerprint',{...v8,receipts:[{...receipt,payload_fingerprint:'not-sha'}]}],
 ['corrupt reply request id',{...v8,receipts:[{...receipt,response_json:{...receipt.response_json,requestId:office}}]}],
 ['invalid production version transition',{...v8,productionVersionLabel:'QA-R7'}],
 ['false historic handoff source',{...v8,historicalV7HandoffMatched:false}],
 ['wrong baseline witness',{...v8,witnessedTransactionVersion:6}],
 ['fractional current revision',{...v8,currentTransactionVersion:8.5}],
 ['v6 rolled back numeric revision',{...oldWitness,currentTransactionVersion:6}],
];
for(const [label,data] of versionFailures){
 const r=assessWosP2MaterialVersionLineage(data);
 assert.equal(r.candidateReceiptChainConsistent,false,label);
 assert.equal(r.currentRevisionHandoffProven,false,label);
 assert.equal(r.canStart,false,label);
}

// Uploaded image -> verified private object -> one CURRENT baseline ->
// independent Office + Workshop acknowledgement, all separately assessed.
const baselineId='66666666-6666-4666-8666-666666666666';
const imageIds=[
 '77777777-7777-4777-8777-777777777777',
 '88888888-8888-4888-8888-888888888888',
 '99999999-9999-4999-8999-999999999999',
];
const cats=['PRODUCT','FILM_PATTERN','SIGNED_SAMPLE'] as const;
const visual:WosP2VisualEvidenceInput={
 orderId:order,organizationId:org,productionVersionLabel:'QA-R6',
 readVerified:true, nowIso:now, requiredCategories:[...cats],
 baselines:[{
  id:baselineId,organization_id:org,entity_id:order,entity_type:'PRODUCTION_ORDER',
  version_label:'QA-R6',status:'CURRENT',confirmed_by_office_profile_id:office,
  confirmed_by_workshop_profile_id:operator,office_confirmed_at:at,
  workshop_confirmed_at:later,created_at:'2026-11-20T01:00:00.000Z',superseded_at:null,
 }],
 items:imageIds.map(id=>({baseline_id:baselineId,reference_image_id:id,is_required:true})),
 images:imageIds.map((id,i)=>({
  id,organization_id:org,entity_id:order,entity_type:'PRODUCTION_ORDER',
  category:cats[i],version_label:'QA-R6',image_status:'READY',
  storage_bucket:'wos-private',storage_path:'private/QA/'+id,superseded_at:null,
 })),
 proofs:imageIds.map((id,i)=>({
  image_id:id,organization_id:org,order_id:order,storage_bucket:'wos-private',
  storage_path:'private/QA/'+id,storage_object_id:office,
  storage_object_version:'test-object-v1',verified_sha256:hash,
  verified_at:at,expires_at:'2026-11-20T20:00:00.000Z',
 })),
};
const baselineGood=assessWosP2VisualEvidence(visual);
assert.equal(baselineGood.candidateCurrentBaselineComplete,true);
assert.equal(baselineGood.officeAcknowledged,true);
assert.equal(baselineGood.workshopAcknowledged,true);
assert.equal(baselineGood.imagesVerified,true);
assert.equal(baselineGood.canStart,false);
const badVisual:Array<[string,WosP2VisualEvidenceInput]>=[
 ['not read under verified RLS',{...visual,readVerified:false}],
 ['no CURRENT baseline',{...visual,baselines:[]}],
 ['two CURRENT baselines',{...visual,baselines:[visual.baselines[0],visual.baselines[0]]}],
 ['baseline wrong organization',{...visual,baselines:[{...visual.baselines[0],organization_id:office}]}],
 ['baseline wrong order',{...visual,baselines:[{...visual.baselines[0],entity_id:office}]}],
 ['baseline stale production version',{...visual,productionVersionLabel:'QA-R7'}],
 ['superseded CURRENT baseline',{...visual,baselines:[{...visual.baselines[0],superseded_at:at}]}],
 ['office did not sign',{...visual,baselines:[{...visual.baselines[0],office_confirmed_at:null}]}],
 ['workshop did not sign',{...visual,baselines:[{...visual.baselines[0],workshop_confirmed_at:null}]}],
 ['same person claimed both signatures',{...visual,baselines:[{...visual.baselines[0],confirmed_by_workshop_profile_id:office}]}],
 ['office signed before baseline created',{...visual,baselines:[{...visual.baselines[0],office_confirmed_at:'2026-11-20T00:00:00.000Z'}]}],
 ['future workshop acknowledgment',{...visual,baselines:[{...visual.baselines[0],workshop_confirmed_at:'2026-11-21T00:00:00.000Z'}]}],
 ['missing required signed sample',{...visual,items:visual.items.slice(0,2)}],
 ['missing required product image',{...visual,requiredCategories:['PRODUCT','FILM_PATTERN','SIGNED_SAMPLE'],items:visual.items.slice(1)}],
 ['image only uploaded not READY',{...visual,images:visual.images.map((x,i)=>i===0?{...x,image_status:'UPLOADING'}:x)}],
 ['superseded image re-used',{...visual,images:visual.images.map((x,i)=>i===0?{...x,superseded_at:at}:x)}],
 ['image from another organization',{...visual,images:visual.images.map((x,i)=>i===0?{...x,organization_id:office}:x)}],
 ['image from old production revision',{...visual,images:visual.images.map((x,i)=>i===0?{...x,version_label:'QA-R5'}:x)}],
 ['missing verified private-image proof',{...visual,proofs:visual.proofs.slice(1)}],
 ['expired verification proof',{...visual,proofs:visual.proofs.map((p,i)=>i===0?{...p,expires_at:at}:p)}],
 ['corrupt SHA-256',{...visual,proofs:visual.proofs.map((p,i)=>i===0?{...p,verified_sha256:'not-sha'}:p)}],
 ['wrong private storage object',{...visual,proofs:visual.proofs.map((p,i)=>i===0?{...p,storage_path:'foreign/path'}:p)}],
 ['proof for another order',{...visual,proofs:visual.proofs.map((p,i)=>i===0?{...p,order_id:office}:p)}],
 ['duplicate referenced image',{...visual,items:[...visual.items,visual.items[0]]}],
 ['duplicate proof',{...visual,proofs:[...visual.proofs,visual.proofs[0]]}],
 ['missing required category definition',{...visual,requiredCategories:[]}],
 ['invalid required category',{...visual,requiredCategories:['UNKNOWN']}],
 ['material resource type FILM is not reference image category',{...visual,requiredCategories:['FILM']}],
];
for(const [label,data] of badVisual){
 const r=assessWosP2VisualEvidence(data);
 assert.equal(r.candidateCurrentBaselineComplete,false,label);
 assert.equal(r.canStart,false,label);
}

// Source contracts: read panels never mutate; existing action code remains
// runtime/DB-gated, no unsigned baseline promotion or direct start.
for(const path of [
 'src/components/workshop-orders/LiveQaWorkshopReadiness.tsx',
 'src/components/workshop-orders/LiveQaHandoffReadOnly.tsx',
]) {
 const source=readFileSync(path,'utf8');
 assert(source.includes('expected_at,arrived_at'),path);
 assert(source.includes('quantityShortfall'),path);
 assert(source.includes('confirmedAt'),path);
 assert(!/\.insert\s*\(|\.upsert\s*\(|\.update\s*\(|\.delete\s*\(|\.rpc\s*\(/.test(source),path);
}
const readinessUi=readFileSync('src/components/workshop-orders/LiveQaWorkshopReadiness.tsx','utf8');
const handoffUi=readFileSync('src/components/workshop-orders/LiveQaHandoffReadOnly.tsx','utf8');
assert(readinessUi.includes('result.visualBaseline.currentCount'));
assert(readinessUi.includes('result.visualBaseline.officeConfirmed'));
assert(readinessUi.includes('result.visualBaseline.workshopConfirmed'));
assert(handoffUi.includes('readiness.visualBaseline.currentCount'));
assert(handoffUi.includes('readiness.visualBaseline.workshopConfirmed'));
assert(readinessUi.includes('readState.result.materialsVerified && readState.handoff.historySequenceVerified'),
  'a newer unproved transaction revision must not look ready for human review');

const actionUi=readFileSync('src/components/workshop-orders/LiveQaWorkshopActions.tsx','utf8');
assert(actionUi.includes("NEXT_PUBLIC_WOS_P2_QA_MUTATIONS_ENABLED === 'true'"));
assert(actionUi.includes('choices.guidance'));
// Exercise the REAL existing Zod P2 operator action contract, not only source
// string assertions. These tests do NOT call the database or simulate a
// privileged SQL transaction and cannot establish actual replay acceptance.
const materialAction={
  orderId:order,expectedVersion:7,requestId:event,
  action:'CONFIRM_MATERIAL' as const,resourceType:'INCOMING_MATERIAL' as const,
  resourceStatus:'QUANTITY_VERIFIED' as const,quantityExpected:200,quantityArrived:200,
  note:'真实 QA 素材核对：已记录当前批次来料状态',
};
const parsed=parseWosP2Action(materialAction);
assert(parsed);
const validResponse={status:'APPLIED',orderId:order,requestId:event,version:8,workflowStatus:'WAITING_MATERIAL'};
assert(isWosP2RpcResult(validResponse,parsed));
assert(isWosP2RpcResult({...validResponse,status:'REPLAYED'},parsed),
  'same-request replay may only be accepted after SQL checks its immutable fingerprint');
assert(!isWosP2RpcResult({...validResponse,requestId:office},parsed));
assert(!isWosP2RpcResult({...validResponse,version:9},parsed),
  'server response cannot advance beyond requested version+1');
assert(!isWosP2RpcResult({...validResponse,workflowStatus:'IN_PRODUCTION'},parsed));
for(const malformed of [
  {...materialAction,quantityArrived:190},
  {...materialAction,quantityExpected:0},
  {...materialAction,resourceStatus:'FIT_VERIFIED'},
  {...materialAction,expectedVersion:0},
  {...materialAction,expectedVersion:7.5},
  {...materialAction,quantityArrived:-1},
  {...materialAction,note:'short'},
]) {
 assert.equal(parseWosP2Action(malformed),null,
   'P2 action parser must deny invalid quantity/status/revision/note');
}
assert.equal(canActOnWosP2('viewer'),false);
assert.equal(canActOnWosP2('sales'),false);
assert.equal(canActOnWosP2('operator'),true);
assert.equal(canActOnWosP2('manager'),true);
const qaURL='https://xulmpqaknlwqqculbsek.supabase.co';
assert.equal(isWosP2QaMutationEnabled({
  vercelEnv:'preview',flag:'false',supabaseUrl:qaURL,
}),false);
assert.equal(isWosP2QaMutationEnabled({
  vercelEnv:'production',flag:'true',supabaseUrl:qaURL,
}),false);
assert.equal(isWosP2QaMutationEnabled({
  vercelEnv:'preview',flag:'true',supabaseUrl:'https://other.supabase.co',
}),false);
const conflictingSecond={...receipt,request_id:event,expected_version:8,
  payload_fingerprint:'b'.repeat(64),
  response_json:{...receipt.response_json,version:9}};
const conflict=assessWosP2MaterialVersionLineage({
  ...v8,currentTransactionVersion:9,receipts:[receipt,conflictingSecond],
});
assert.equal(conflict.candidateReceiptChainConsistent,false,
  'same requestId and different payload cannot certify two different material transactions');
assert.equal(conflict.canStart,false);

const versionSource=readFileSync('src/lib/workshop-orders/p2-material-version-evidence.ts','utf8');
assert(versionSource.includes('currentRevisionHandoffProven: false'));
console.log('workshop-order-p2-readiness-m1.test.ts: PASS');
console.log('WOS_P2_M1_MATERIAL_NEGATIVE_CASES='+materialFailures.length);
console.log('WOS_P2_M1_VERSION_NEGATIVE_CASES='+versionFailures.length);
console.log('WOS_P2_M1_VISUAL_NEGATIVE_CASES='+badVisual.length);
console.log('WOS_P2_M1_NO_START_OR_WRITE=PASS');
