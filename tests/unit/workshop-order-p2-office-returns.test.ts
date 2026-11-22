import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const route=readFileSync('src/app/api/workshop-orders/p2/returns/route.ts','utf8');
const office=readFileSync('src/components/workshop-orders/LiveQaReturnedOrders.tsx','utf8');
const page=readFileSync('src/app/workshop-orders/production/new/page.tsx','utf8');

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
  "'RETURN_REASON_MISSING'",
  "'RETURN_BLOCKER_SCOPE_MISMATCH'",
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
assert(page.includes('returnedReadEnabled && <LiveQaReturnedOrders />'),
  'read-only returned tasks must not depend on P5C/P7 write gates');
console.log('workshop-order-p2-office-returns.test.ts: PASS');
console.log('WOS_P2_OFFICE_RETURN_READ_AND_SAFE_REVISION_UI=PASS');
