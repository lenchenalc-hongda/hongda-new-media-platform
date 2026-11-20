import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  canExposeP2QaReadonlyPreview, isVerifiedP2QaReadActor, isScopedP2QaOrder,
} from '../../src/lib/workshop-orders/p2-qa-readonly-preview';

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
const profile={id:'953d2204-3e65-4b75-b10e-c6e97f1bbb56',
  user_id:userId,org_id:orgId,role:'operator',is_active:true};
assert(isVerifiedP2QaReadActor(userId,profile));
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
const order={id:orderId,organization_id:orgId,version:7,
  version_label:'QA-R6',workflow_status:'WAITING_MATERIAL',
  current_batch_quantity:500};
assert(isScopedP2QaOrder(order,orderId,orgId));
const orders = [
  {...order,organization_id:userId},
  {...order,id:userId},
  {...order,version:2},
  {...order,version:8}, // old six v7 steps cannot certify current v8
  {...order,version:9}, // no future version inherited from v7
  {...order,version:8,version_label:'QA-R6'}, // same label does not prove revision
  {...order,version:9,version_label:'QA-R9'}, // new label alone not evidence
  {...order,version:7.5},
  {...order,version:Number.MAX_SAFE_INTEGER+1},
  {...order,workflow_status:'SUBMITTED'},
  {...order,workflow_status:'COMPLETED'},
  {...order,version_label:''},
  {...order,current_batch_quantity:0},
  {...order,current_batch_quantity:null},
  null,
];
for(const record of orders) assert.equal(isScopedP2QaOrder(record,orderId,orgId),false);

// A fixed-order read gate must reject even an otherwise-identical v8/v9
// record before fetching/displaying stale six-step history. No new version
// can silently ride on a previous v7 history or current workflow_status.
for (const unsupported of [8,9,10,99]) {
  assert.equal(isScopedP2QaOrder({...order,version:unsupported},orderId,orgId),false,
    'old v7 history must not be reused by a future version '+unsupported);
}
const guardSource=readFileSync('src/lib/workshop-orders/p2-qa-readonly-preview.ts','utf8');
const timelineSource=readFileSync('src/lib/workshop-orders/p2-handoff-timeline.ts','utf8');
assert(guardSource.includes('row.version === WOS_P2_QA_PROVEN_HANDOFF_VERSION'));
assert(timelineSource.includes('input.currentVersion !== WOS_P2_QA_PROVEN_HANDOFF_VERSION'));
assert(!guardSource.includes('Number(row.version) >= 7'));
assert(!timelineSource.includes('input.currentVersion >= 7'));

const page=readFileSync('src/app/workshop-orders/qa-handoff-readonly/page.tsx','utf8');
const client=readFileSync('src/components/workshop-orders/LiveQaHandoffReadOnly.tsx','utf8');
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
assert(!client.includes('NEXT_PUBLIC_WOS_QA_P2_OPERATOR_WRITE_ENABLED'));
console.log('workshop-order-p2-qa-readonly-preview.test.ts: PASS');
console.log('WOS_P2_QA_READONLY_GATE_NEGATIVE_CASES='+denied.length);
console.log('WOS_P2_QA_READONLY_ROLE_AND_ORDER_NEGATIVE_CASES='+(actors.length+orders.length));
console.log('WOS_P2_QA_PREVIEW_DECOUPLED_FROM_P7_WRITE=PASS');
