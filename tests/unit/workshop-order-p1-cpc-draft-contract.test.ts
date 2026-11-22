import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const route=readFileSync('src/app/api/workshop-orders/production/cpc-drafts/route.ts','utf8');
const component=readFileSync('src/components/workshop-orders/LiveQaCpcDraft.tsx','utf8');
const form=readFileSync('src/components/workshop-orders/ProductionOrderForm.tsx','utf8');

// No new privilege, live customer metadata, unscoped queries, or editable
// submitted orders. This is a code contract, NOT a live authenticated E2E.
for(const text of [
  'isApprovedWosSandboxUrl(process.env.NEXT_PUBLIC_SUPABASE_URL)',
  "process.env.WOS_P7_NONPROD_SUBMIT_ENABLED === 'true'",
  "resolveVerifiedSupabaseIdentity(client)",
  ".eq('user_id', identity.id)",
  "['admin', 'manager', 'sales'].includes(profile.data.role)",
  "client.from('cpc_customer_references')",
  "client.from('cpc_projects')",
  'project.data.customer_reference_id !== customer.data.id',
  "client.from('profiles')",
  "project_owner_profile_id: owner.data.id",
  'created_by_profile_id: actor.id',
  "workflow_status: 'DRAFT'",
  "client.from('wos_production_orders')",
  'QA_DRAFT_REPLAY_CONFLICT',
  'QA_DRAFT_WRITE_UNVERIFIED',
]) assert(route.includes(text), 'Missing QA CPC draft authorization gate: '+text);
assert(!route.includes('service_role'));
assert(!route.includes('SUPABASE_SERVICE_ROLE_KEY'));
assert(!route.includes(".update("));
assert(!route.includes(".delete("));
assert(!route.includes("workflow_status: 'SUBMITTED'"));
assert(component.includes('选择 CPC 客户'));
assert(component.includes('关联 CPC 项目'));
assert(component.includes("response.ok"));
assert(component.includes('QA_CPC_DRAFT_SAVED_TO_DATABASE'));
assert(route.includes('actorProfileId: auth.actor.id'), 'No authenticated-actor scoping for recovery');
assert(component.includes('window.localStorage.setItem(recoveryStorageKey.current, orderNumber.current)'), 'Idempotency number must persist before POST');
assert(component.includes('window.localStorage.getItem(key)'), 'Same QA order number must survive browser reload');
assert(component.includes('window.localStorage.removeItem(recoveryStorageKey.current)'), 'Fresh draft must be a deliberate new operation');
assert(component.includes('QA_CPC_DRAFT_RETRY_SAME_NUMBER_AFTER_RELOAD'), 'Lost-response recovery must be explicit');
assert(component.includes('QA_CPC_RECOVERY_STORAGE_UNAVAILABLE'), 'Fail closed on missing durable idempotency storage');
assert(!component.includes('localStorage.setItem(\'password'), 'Never cache account password');

assert(form.includes('<LiveQaCpcDraft draft={validation.normalized} valid={validation.ok} />'));
console.log('workshop-order-p1-cpc-draft-contract.test.ts: PASS');
