import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  canExposeP2QaReadonlyPreview,
  isVerifiedP2QaReadActor,
  isScopedP2QaOrder,
  WOS_P2_QA_V11_HISTORY_EVENT_COUNT,
  WOS_P2_QA_V11_ORDER_STATUS,
  WOS_P2_QA_V11_ORDER_VERSION,
  WOS_P2_QA_V11_VERSION_LABEL,
} from '../../src/lib/workshop-orders/p2-qa-readonly-preview';
import {
  evaluateWosP2HandoffTimeline,
  type WosP2HandoffHistory,
} from '../../src/lib/workshop-orders/p2-handoff-timeline';
import {
  evaluateWosP2Readiness,
  type WosP2BaselineRow,
  type WosP2BlockerRow,
  type WosP2ResourceRow,
} from '../../src/lib/workshop-orders/p2-qa-readiness';

const QA = 'https://xulmpqaknlwqqculbsek.supabase.co';
const valid = {
  vercelEnv: 'preview', authMode:'supabase', enableReadonly:'true', supabaseUrl:QA,
};
assert.equal(canExposeP2QaReadonlyPreview(valid),true);
const denied = [
  { ...valid, enableReadonly: undefined },
  { ...valid, enableReadonly:'false' },
  { ...valid, vercelEnv:'production' },
  { ...valid, vercelEnv:'development' },
  { ...valid, vercelEnv:undefined },
  { ...valid, authMode:'mock' },
  { ...valid, authMode:undefined },
  { ...valid, supabaseUrl:'https://not-the-qa-project.supabase.co' },
  { ...valid, supabaseUrl:'https://xulmpqaknlwqqculbsek.supabase.co.evil.net' },
  { ...valid, supabaseUrl:'http://xulmpqaknlwqqculbsek.supabase.co' },
  { ...valid, supabaseUrl:QA+'?project=other' },
  { ...valid, supabaseUrl:undefined },
];
for (const setting of denied) assert.equal(
  canExposeP2QaReadonlyPreview(setting),false,
  'QA-only read gate must reject any missing/mis-scoped configuration'
);

const userId='3a6506b5-787c-4569-9f6c-72a01148dd18';
const orgId='44e14ba6-ce8c-4fbd-a13c-29057cfd9873';
const foreignOrgId='75b40a31-47e1-4a04-9f72-a5693e5ecc58';
const profile={id:'953d2204-3e65-4b75-b10e-c6e97f1bbb56',
  user_id:userId,org_id:orgId,role:'operator',is_active:true};
assert(isVerifiedP2QaReadActor(userId,profile));
const crossOrgSales={...profile,org_id:foreignOrgId,role:'sales'};
assert(isVerifiedP2QaReadActor(userId,crossOrgSales),
  'an active Sales actor is a valid read role but remains organization-scoped');
const actors = [
  [userId,{...profile,role:'viewer'}],
  [userId,{...profile,role:'anonymous'}],
  [userId,{...profile,is_active:false}],
  [userId,{...profile,user_id:orgId}],
  [userId,{...profile,org_id:null}],
  [null,profile],
  [userId,null],
  [userId,{...profile,id:null}],
] as const;
for(const [uid,actor] of actors) assert.equal(
 isVerifiedP2QaReadActor(uid,actor),false,
 'Viewer/forged/inactive/foreign actor must not read QA order'
);

const orderId='953d2204-3e65-4b75-b10e-c6e97f1bbb56';
const order={
  id:orderId,
  organization_id:orgId,
  version:WOS_P2_QA_V11_ORDER_VERSION,
  version_label:WOS_P2_QA_V11_VERSION_LABEL,
  workflow_status:WOS_P2_QA_V11_ORDER_STATUS,
  current_batch_quantity:101,
};
assert.equal(WOS_P2_QA_V11_ORDER_VERSION,11);
assert.equal(WOS_P2_QA_V11_ORDER_STATUS,'READINESS_CHECK');
assert.equal(WOS_P2_QA_V11_VERSION_LABEL,'QA-R6');
assert.equal(WOS_P2_QA_V11_HISTORY_EVENT_COUNT,10);
assert(isScopedP2QaOrder(order,orderId,orgId));
assert.equal(isScopedP2QaOrder(order,orderId,crossOrgSales.org_id),false,
  'cross-organization Sales cannot satisfy the fixed order scope');
const orders = [
  {...order,organization_id:userId},
  {...order,id:userId},
  {...order,version:2},
  {...order,version:7},
  {...order,version:8},
  {...order,version:9},
  {...order,version:10},
  {...order,version:12},
  {...order,version:7.5},
  {...order,version:Number.MAX_SAFE_INTEGER+1},
  {...order,workflow_status:'WAITING_MATERIAL'},
  {...order,workflow_status:'SUBMITTED'},
  {...order,workflow_status:'COMPLETED'},
  {...order,version_label:'QA-R5'},
  {...order,version_label:'QA-R7'},
  {...order,version_label:''},
  {...order,current_batch_quantity:0},
  {...order,current_batch_quantity:null},
  null,
];
for(const record of orders) assert.equal(isScopedP2QaOrder(record,orderId,orgId),false);

function requestId(index: number): string {
  return `20000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
}
function event(input: {
  index: number;
  from: string;
  to: string;
  role: string;
  reason: string;
  metadata: Record<string, unknown> | null;
}): WosP2HandoffHistory {
  return {
    previous_status: input.from,
    next_status: input.to,
    actor_role: input.role,
    reason_code: input.reason,
    created_at: new Date(Date.UTC(2026, 10, 21, 10, input.index)).toISOString(),
    metadata: input.metadata,
  };
}
function versionMetadata(expectedVersion: number, index: number) {
  return {
    requestId: requestId(index),
    expectedVersion,
    newVersion: expectedVersion + 1,
  };
}

const v11History: WosP2HandoffHistory[] = [
  event({index:0,from:'DRAFT',to:'SUBMITTED',role:'admin',
    reason:'OFFICE_SUBMISSION_COMMITTED',
    metadata:{idempotencyKey:requestId(0),sourceRevision:1}}),
  event({index:1,from:'SUBMITTED',to:'WORKSHOP_REVIEW',role:'operator',
    reason:'QA_P2_ACCEPT',metadata:versionMetadata(2,1)}),
  event({index:2,from:'WORKSHOP_REVIEW',to:'NEEDS_INFORMATION',role:'operator',
    reason:'QA_P2_RETURN_FOR_INFORMATION',metadata:versionMetadata(3,2)}),
  event({index:3,from:'NEEDS_INFORMATION',to:'NEEDS_INFORMATION',role:'admin',
    reason:'QA_P2_OFFICE_SAVE_CORRECTION',metadata:versionMetadata(4,3)}),
  event({index:4,from:'NEEDS_INFORMATION',to:'WORKSHOP_REVIEW',role:'admin',
    reason:'QA_P2_OFFICE_RESUBMIT_CORRECTION',metadata:versionMetadata(5,4)}),
  event({index:5,from:'WORKSHOP_REVIEW',to:'WAITING_MATERIAL',role:'operator',
    reason:'QA_P2_REVIEW_CORRECTION',metadata:versionMetadata(6,5)}),
  event({index:6,from:'WAITING_MATERIAL',to:'WAITING_MATERIAL',role:'admin',
    reason:'QA_M2_BASELINE_SELECT',metadata:versionMetadata(7,6)}),
  event({index:7,from:'WAITING_MATERIAL',to:'WAITING_MATERIAL',role:'admin',
    reason:'QA_M2_BASELINE_OFFICE_CONFIRM',metadata:versionMetadata(8,7)}),
  event({index:8,from:'WAITING_MATERIAL',to:'WAITING_MATERIAL',role:'operator',
    reason:'QA_M2_BASELINE_WORKSHOP_CONFIRM',metadata:versionMetadata(9,8)}),
  event({index:9,from:'WAITING_MATERIAL',to:'READINESS_CHECK',role:'operator',
    reason:'QA_M2_FINAL_READINESS_CONFIRM',metadata:versionMetadata(10,9)}),
];
assert.equal(v11History.length,WOS_P2_QA_V11_HISTORY_EVENT_COUNT);
const v11Handoff = evaluateWosP2HandoffTimeline({
  history:[...v11History].reverse(),
  currentStatus:order.workflow_status,
  currentVersion:order.version,
  readVerified:true,
});
assert.equal(v11Handoff.historySequenceVerified,true,
  'the real ten-event v1..v11 chain must verify');
assert.equal(v11Handoff.steps.filter(step=>step.verifiedByHistory).length,6);
assert.equal(v11Handoff.canStart,false);

const tamperedHistory: Array<[string, WosP2HandoffHistory[]]> = [
  ['missing a required event',v11History.filter((_,index)=>index!==4)],
  ['version jump',v11History.map(row=>row.reason_code==='QA_M2_BASELINE_OFFICE_CONFIRM'
    ? {...row,metadata:{...row.metadata,expectedVersion:9,newVersion:11}} : row)],
  ['forged request id',v11History.map(row=>row.reason_code==='QA_P2_ACCEPT'
    ? {...row,metadata:{...row.metadata,requestId:'forged'}} : row)],
  ['unknown extra event',[...v11History,event({
    index:10,from:'READINESS_CHECK',to:'WAITING_MATERIAL',role:'operator',
    reason:'QA_UNKNOWN_TRANSITION',metadata:versionMetadata(11,10),
  })]],
];
for(const [label,history] of tamperedHistory) {
  const result=evaluateWosP2HandoffTimeline({
    history,currentStatus:order.workflow_status,
    currentVersion:order.version,readVerified:true,
  });
  assert.equal(result.historySequenceVerified,false,label);
  assert(result.steps.every(step=>!step.verifiedByHistory),label);
  assert.equal(result.canStart,false,label);
}
for(const conflict of [
  {currentVersion:12,currentStatus:'READINESS_CHECK'},
  {currentVersion:11,currentStatus:'WAITING_MATERIAL'},
]) {
  assert.equal(evaluateWosP2HandoffTimeline({
    history:v11History,...conflict,readVerified:true,
  }).historySequenceVerified,false,'current order/version conflict must reject');
}

const resources: WosP2ResourceRow[] = [
  {resource_type:'FILM',status:'VERSION_VERIFIED',version_label:'QA-R6',
    quantity_expected:null,quantity_arrived:null,confirmed_by_profile_id:'operator',
    confirmed_at:'2026-11-21T10:09:33Z',note:'verified'},
  {resource_type:'FIXTURE',status:'FIT_VERIFIED',version_label:'QA-R6',
    quantity_expected:null,quantity_arrived:null,confirmed_by_profile_id:'operator',
    confirmed_at:'2026-11-21T10:09:33Z',note:'verified'},
  {resource_type:'INCOMING_MATERIAL',status:'QUANTITY_VERIFIED',version_label:'QA-R6',
    quantity_expected:101,quantity_arrived:101,confirmed_by_profile_id:'operator',
    confirmed_at:'2026-11-21T10:09:33Z',note:'verified'},
  {resource_type:'SIGNED_SAMPLE',status:'VERIFIED',version_label:'QA-R6',
    quantity_expected:null,quantity_arrived:null,confirmed_by_profile_id:'operator',
    confirmed_at:'2026-11-21T10:09:33Z',note:'verified'},
];
const blockers: WosP2BlockerRow[] = [
  {blocker_code:'QA_OLD_BLOCKER',status:'RESOLVED',description:'resolved'},
];
const baselines: WosP2BaselineRow[] = [
  {version_label:'QA-R6',status:'CURRENT',
    office_confirmed_at:'2026-11-21T10:05:04Z',
    workshop_confirmed_at:'2026-11-21T10:08:57Z'},
];
const v11Readiness=evaluateWosP2Readiness({
  versionLabel:order.version_label,
  currentBatchQuantity:order.current_batch_quantity,
  resources,blockers,baselines,readVerified:true,
});
assert.equal(v11Readiness.materials.length,4);
assert(v11Readiness.materials.every(row=>row.ready));
assert.equal(v11Readiness.materialsVerified,true);
assert.equal(v11Readiness.visualBaseline.currentCount,1);
assert.equal(v11Readiness.visualBaseline.versionLabel,'QA-R6');
assert.equal(v11Readiness.visualBaseline.officeConfirmed,true);
assert.equal(v11Readiness.visualBaseline.workshopConfirmed,true);
assert.equal(v11Readiness.canStart,false);

const guardSource=readFileSync('src/lib/workshop-orders/p2-qa-readonly-preview.ts','utf8');
const timelineSource=readFileSync('src/lib/workshop-orders/p2-handoff-timeline.ts','utf8');
const page=readFileSync('src/app/workshop-orders/qa-handoff-readonly/page.tsx','utf8');
const client=readFileSync('src/components/workshop-orders/LiveQaHandoffReadOnly.tsx','utf8');
assert(guardSource.includes('row.version === WOS_P2_QA_V11_ORDER_VERSION'));
assert(guardSource.includes('row.workflow_status === WOS_P2_QA_V11_ORDER_STATUS'));
assert(!guardSource.includes('Number(row.version) >= 11'));
assert(!timelineSource.includes('input.currentVersion >= 7'));
assert(timelineSource.includes('expectedVersion !== input.currentVersion'));
assert(timelineSource.includes('requestIdentity(item.row.metadata)'));
assert(timelineSource.includes("'QA_M2_FINAL_READINESS_CONFIRM'"));
assert(client.includes('created_at,metadata'));
assert(client.includes('WOS_P2_QA_V11_HISTORY_EVENT_COUNT'));
assert(client.includes('history.data?.length !== WOS_P2_QA_V11_HISTORY_EVENT_COUNT'));
assert(client.includes('metadata:row.metadata') || client.includes('history.data as WosP2HandoffHistory[]'));
assert(client.includes('readiness.materials'));
assert(client.includes('readiness.visualBaseline.currentCount'));
assert(client.includes('readiness.visualBaseline.officeConfirmed'));
assert(client.includes('readiness.visualBaseline.workshopConfirmed'));
assert(client.includes('本页面不能开工'));
assert(page.includes('WOS_P2_QA_HANDOFF_READONLY_ENABLED'));
assert(page.includes("process.env.AUTH_MODE"));
assert(page.includes("process.env.VERCEL_ENV"));
assert(page.includes('canExposeP2QaReadonlyPreview('));
assert(!page.includes('process.env.WOS_P7_NONPROD_SUBMIT_ENABLED'),
  'Read-only Preview must never require P7 submission to be enabled');
assert(client.includes('client.auth.getUser()'));
assert(client.includes("from('profiles')"));
assert(client.includes('isVerifiedP2QaReadActor('));
assert(client.includes('isScopedP2QaOrder('));
assert(client.includes("eq('organization_id', organizationId)"));
assert(client.includes("eq('entity_type','PRODUCTION_ORDER')"));
assert(client.includes("from('wos_status_history')"));
assert(client.includes('evaluateWosP2HandoffTimeline('));
assert(client.includes('evaluateWosP2Readiness('));
assert(!/\.insert\s*\(|\.upsert\s*\(|\.update\s*\(|\.delete\s*\(|\.rpc\s*\(/.test(client),
  'Read-only browser component MUST NEVER call write methods or RPC');
assert(!client.includes('LiveQaWorkshopActions'));
assert(!client.includes('WOS_P7_NONPROD_SUBMIT_ENABLED'));
assert(!client.includes('SUPABASE_SERVICE_ROLE_KEY'));

console.log('workshop-order-p2-qa-readonly-preview.test.ts: PASS');
console.log('WOS_P2_QA_V11_READONLY_POSITIVE=PASS');
console.log('WOS_P2_QA_V11_HISTORY_EVENTS='+v11History.length);
console.log('WOS_P2_QA_V11_HISTORY_TAMPER_CASES='+(tamperedHistory.length+2));
console.log('WOS_P2_QA_V11_READONLY_NEGATIVE_CASES='+(denied.length+actors.length+orders.length));
console.log('WOS_P2_QA_V11_CAN_START=false');
