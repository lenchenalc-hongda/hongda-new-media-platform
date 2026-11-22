import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Contract regression: the nonproduction workshop must be backed by the
// same committed receipt and task as the office's SUBMITTED order.
const api = readFileSync('src/lib/workshop-orders/api-server.ts', 'utf8');
const legacyInbox = readFileSync('src/components/workshop-orders/LiveQaWorkshopInbox.tsx', 'utf8');
const persistedInbox = readFileSync('src/components/workshop-orders/PersistedWorkshopInbox.tsx', 'utf8');
const page = readFileSync('src/app/workshop-orders/inbox/page.tsx', 'utf8');
const submit = readFileSync('src/lib/workshop-orders/p7-nonprod-submit.ts', 'utf8');

for (const predicate of [
  "client.from('wos_workshop_inbox')",
  "client.from('wos_submission_receipts')",
  'task.submission_id',
  "task.source_revision + 1 > order.version",
  "order.workflow_status === 'SUBMITTED'",
  "task.source_revision + 1 !== order.version",
  "task.workflow_status !== 'SUBMITTED'",
  "for (const order of persistedRows)",
  "WORKSHOP_TRANSACTION_MISMATCH",
  "task.source_version_label !== order.version_label",
]) {
  assert(api.includes(predicate), 'missing atomic inbox contract: ' + predicate);
}
assert(page.includes('PersistedWorkshopInbox'));
assert(!page.includes('LiveQaWorkshopInbox'));
assert(!page.includes('WOS_P5C_NONPROD_API_ENABLED'));
assert(!page.includes('WOS_P7_NONPROD_SUBMIT_ENABLED'));
assert(page.includes('WOS_QA_INBOX_READONLY_ENABLED'));
assert(!persistedInbox.includes('LiveQaWorkshopActions'));
assert(!persistedInbox.includes('LiveQaM2WorkshopConfirm'));
assert(!persistedInbox.includes('LiveQaFinalReadiness'));
assert(!persistedInbox.includes('.rpc('));
assert(!persistedInbox.includes('.insert('));
assert(!persistedInbox.includes('.update('));
assert(persistedInbox.includes("method: 'GET'"));
assert(!/method:\s*'(POST|PUT|PATCH|DELETE)'/.test(persistedInbox));
assert(legacyInbox.includes("client.from('wos_production_orders')"));
assert(legacyInbox.includes("client.from('wos_workshop_inbox')"));
assert(legacyInbox.includes("client.from('wos_reference_images')"));
assert(legacyInbox.includes("client.storage.from('wos-private').download"));
assert(legacyInbox.includes('QA_ORDER_TRANSACTION_DETAILS_UNVERIFIED'));
assert(submit.includes("client.rpc('wos_submit_production_order'"));
assert(submit.includes("client.from('wos_submission_receipts')"));
assert(submit.includes("client.from('wos_workshop_inbox')"));
console.log('workshop-order-p1-inbox-integrity.test.ts: PASS');
