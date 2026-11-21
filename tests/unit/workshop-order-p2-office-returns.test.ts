import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const route=readFileSync('src/app/api/workshop-orders/p2/returns/route.ts','utf8');
const office=readFileSync('src/components/workshop-orders/LiveQaReturnedOrders.tsx','utf8');
const page=readFileSync('src/app/workshop-orders/production/new/page.tsx','utf8');

for(const text of [
  'isApprovedWosSandboxUrl',
  "process.env.VERCEL_ENV!=='preview'",
  'resolveVerifiedSupabaseIdentity',
  "['admin','manager','sales']",
  ".eq('organization_id',actor.org_id)",
  ".eq('workflow_status','NEEDS_INFORMATION')",
  "query=query.eq('created_by_profile_id',actor.id)",
  "db.from('wos_blockers')",
  ".eq('status','OPEN')",
  "'RETURN_REASON_MISSING'",
  "'RETURN_BLOCKER_SCOPE_MISMATCH'",
  "'RETURNED_ORDER_SCOPE_MISMATCH'",
  "'QA_RETURNED_ORDERS_READ_ONLY'",
]) assert(route.includes(text),'missing Office return isolation '+text);
for(const invalid of ['.insert(','.update(','.delete(','.upsert(','.rpc(','service_role']) {
  assert(!route.includes(invalid),'Office return read path must never write '+invalid);
}
assert(office.includes("fetch('/api/workshop-orders/p2/returns'"));
assert(office.includes('setItems([])'),'stale returned data must be cleared on error');
for (const expected of [
  'NEXT_PUBLIC_WOS_P2_QA_OFFICE_REVISION_ENABLED',
  "fetch('/api/workshop-orders/p2/office-revisions'",
  "'SAVE_CORRECTION'",
  "'RESUBMIT_CORRECTION'",
  'crypto.randomUUID()',
  'onSaved()',
  'expectedVersion:item.version',
]) assert(office.includes(expected),'office correction UI missing '+expected);
assert(office.includes('disabled={!flag||pending}'),'QA must keep write buttons disabled by default');
assert(!office.includes('localStorage'),'return reasons must come from real QA server');
assert(page.includes('{qaLive && <LiveQaReturnedOrders />}'),'must be isolated to QA Preview');
console.log('workshop-order-p2-office-returns.test.ts: PASS');
console.log('WOS_P2_OFFICE_RETURN_READ_AND_SAFE_REVISION_UI=PASS');
