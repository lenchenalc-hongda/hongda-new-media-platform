import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildWosP2ReturnReasons, type WosP2ReturnBlocker }
  from '../../src/lib/workshop-orders/p2-return-reasons';
import { isWosP2QaOfficeRevisionEnabled }
  from '../../src/lib/workshop-orders/p2-office-revision-contract';
const route=readFileSync('src/app/api/workshop-orders/p2/returns/route.ts','utf8');
const office=readFileSync('src/components/workshop-orders/LiveQaReturnedOrders.tsx','utf8');
const page=readFileSync('src/app/workshop-orders/production/new/page.tsx','utf8');

const organizationId='11111111-1111-4111-8111-111111111111';
const orderId='22222222-2222-4222-8222-222222222222';
const blocker=(overrides:Partial<WosP2ReturnBlocker>):WosP2ReturnBlocker=>({
  id:'33333333-3333-4333-8333-333333333333',
  organization_id:organizationId,
  entity_type:'PRODUCTION_ORDER',
  entity_id:orderId,
  blocker_code:'P2_DOCUMENTS_INCOMPLETE',
  blocker_category:'DOCUMENT',
  status:'OPEN',
  opened_at:'2026-11-22T00:00:00.000Z',
  opened_by_profile_id:'44444444-4444-4444-8444-444444444444',
  description:'Customer acceptance requirement must be corrected.',
  ...overrides,
});
const input=(blockers:WosP2ReturnBlocker[])=>({organizationId,orderIds:[orderId],blockers});

const unrelated=buildWosP2ReturnReasons(input([
  blocker({blocker_code:'MATERIAL_SHORTAGE',blocker_category:'MATERIAL'}),
]));
assert.deepEqual(unrelated,{ok:false,code:'RETURN_REASON_MISSING'},
  'unrelated OPEN blockers must not unlock Office correction');

const validBlocker=blocker({});
const valid=buildWosP2ReturnReasons(input([validBlocker]));
assert.equal(valid.ok,true,'valid P2 DOCUMENT blocker must be accepted');
if (valid.ok) {
  assert.deepEqual(valid.reasonsByOrder.get(orderId),[{
    reason:validBlocker.description,
    code:'P2_DOCUMENTS_INCOMPLETE',
    openedAt:validBlocker.opened_at,
    operatorProfileId:validBlocker.opened_by_profile_id,
  }]);
}

const mixed=buildWosP2ReturnReasons(input([
  blocker({id:'55555555-5555-4555-8555-555555555555',
    blocker_code:'IMAGE_MISMATCH',blocker_category:'IMAGE'}),
  validBlocker,
]));
assert.equal(mixed.ok,true,'valid and unrelated blockers may coexist');
if (mixed.ok) {
  assert.equal(mixed.reasonsByOrder.get(orderId)?.length,1,
    'only P2 DOCUMENT blockers may be shown as return reasons');
  assert.equal(mixed.reasonsByOrder.get(orderId)?.[0].code,
    'P2_DOCUMENTS_INCOMPLETE');
}

assert.deepEqual(buildWosP2ReturnReasons({
  ...input([validBlocker]),
  organizationId:'99999999-9999-4999-8999-999999999999',
}),{ok:false,code:'RETURN_BLOCKER_SCOPE_MISMATCH'},
'cross-organization blocker rows must fail closed');
assert.deepEqual(buildWosP2ReturnReasons(input([])),
  {ok:false,code:'RETURN_REASON_MISSING'},
  'a returned order without a legal P2 DOCUMENT blocker must fail closed');
assert.equal(isWosP2QaOfficeRevisionEnabled({
  vercelEnv:'preview',
  flag:'false',
  supabaseUrl:'https://xulmpqaknlwqqculbsek.supabase.co',
}),false,'Gate OFF must keep Office revision submission disabled');

for(const text of [
  'isWosQaInboxReadonlyEnabled',
  'WOS_QA_INBOX_READONLY_ENABLED',
  'resolveVerifiedSupabaseIdentity',
  "['admin','manager','sales']",
  ".eq('organization_id',actor.org_id)",
  ".eq('workflow_status','NEEDS_INFORMATION')",
  "query=query.eq('created_by_profile_id',actor.id)",
  "db.from('profiles')",
  'responsibleName',
  'responsibleRole',
  'responsibleActive',
  'revisionWriteEnabled',
  "db.from('wos_blockers')",
  ".eq('status','OPEN')",
  ".eq('blocker_code','P2_DOCUMENTS_INCOMPLETE')",
  ".eq('blocker_category','DOCUMENT')",
  'buildWosP2ReturnReasons',
  "'RETURNED_ORDER_SCOPE_MISMATCH'",
  "'QA_RETURNED_ORDERS_READ_ONLY'",
]) assert(route.includes(text),'missing Office return isolation '+text);
assert(!route.includes('WOS_P5C_NONPROD_API_ENABLED'));
assert(!route.includes('WOS_P7_NONPROD_SUBMIT_ENABLED'));
for(const invalid of ['.insert(','.update(','.delete(','.upsert(','.rpc(','service_role']) {
  assert(!route.includes(invalid),'Office return read path must never write '+invalid);
}
assert(office.includes("fetch('/api/workshop-orders/p2/returns'"));
assert(office.includes('setItems([])'),'stale returned data must be cleared on error');
for (const expected of [
  'writeEnabled',
  "fetch('/api/workshop-orders/p2/office-revisions'",
  "'SAVE_CORRECTION'",
  "'RESUBMIT_CORRECTION'",
  'crypto.randomUUID()',
  'onSaved()',
  'expectedVersion:item.version',
]) assert(office.includes(expected),'office correction UI missing '+expected);
assert(office.includes('disabled={!writeEnabled||pending}'),'write buttons must follow the server capability');
assert(!office.includes('NEXT_PUBLIC_WOS_P2_QA_OFFICE_REVISION_ENABLED'));
assert(!office.includes('localStorage'),'return reasons must come from real QA server');
assert(office.includes('当前责任人'),'returned task must show the responsible profile');
assert(page.includes(
  'returnedReadEnabled && !qaRuntime.readsEnabled && <LiveQaReturnedOrders />',
),
  'read-only returned tasks must not depend on P5C/P7 write gates');
console.log('workshop-order-p2-office-returns.test.ts: PASS');
console.log('WOS_P2_OFFICE_RETURN_READ_AND_SAFE_REVISION_UI=PASS');
