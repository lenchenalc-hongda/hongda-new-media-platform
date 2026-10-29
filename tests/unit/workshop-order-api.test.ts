import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  WOS_INBOX_LIMIT_PER_TYPE,
  WOS_ACTIVE_PRODUCTION_STATUSES,
  WOS_ACTIVE_SAMPLING_STATUSES,
  buildWosLiveInbox,
  canSubmitWosOfficeRequest,
  isWosNonproductionApiEnabled,
  resolveWosApiActor,
  validateWosPostEnvelope,
} from '../../src/lib/workshop-orders/api-contract';

const user = '11111111-1111-4111-8111-111111111111';
const org = '22222222-2222-4222-8222-222222222222';
const foreignOrg = '33333333-3333-4333-8333-333333333333';
const profileId = '44444444-4444-4444-8444-444444444444';
const ownerId = '55555555-5555-4555-8555-555555555555';
const prodId = '66666666-6666-4666-8666-666666666666';
const sampleId = '77777777-7777-4777-8777-777777777777';
const activeProfile = { user_id: user, id: profileId, org_id: org, role: 'sales', is_active: true };

assert.deepEqual(resolveWosApiActor(null, activeProfile), {
  ok: false, code: 'UNAUTHENTICATED', status: 401,
});
assert.deepEqual(resolveWosApiActor(user, { ...activeProfile, is_active: false }), {
  ok: false, code: 'FORBIDDEN', status: 403,
});
assert.equal(resolveWosApiActor(user, { ...activeProfile, user_id: foreignOrg }).ok, false);
assert.equal(resolveWosApiActor(user, { ...activeProfile, org_id: 'wrong-org' }).ok, false);
assert.equal(resolveWosApiActor(user, { ...activeProfile, role: 'unknown' }).ok, false);

const result = resolveWosApiActor(user, activeProfile);
assert.equal(result.ok, true);
if (!result.ok) throw Error('Expected verified organization-scoped actor');
const actor = result.actor;
assert.equal(actor.orgId, org);
assert.equal(actor.id, profileId);
assert.equal(canSubmitWosOfficeRequest('sales'), true);
assert.equal(canSubmitWosOfficeRequest('workshop'), false);
assert.equal(canSubmitWosOfficeRequest('unknown'), false);

assert.equal(isWosNonproductionApiEnabled({ vercelEnv: 'production', enabled: 'true' }), false);
assert.equal(isWosNonproductionApiEnabled({ vercelEnv: 'preview', enabled: 'true' }), true);
assert.equal(isWosNonproductionApiEnabled({ vercelEnv: 'preview' }), false);
assert.equal(isWosNonproductionApiEnabled({ enabled: 'true' }), false);
assert.equal(isWosNonproductionApiEnabled({ nodeEnv: 'development', enabled: 'true' }), true);
assert.equal(isWosNonproductionApiEnabled({ vercelEnv: 'development', enabled: 'true' }), false);

const production = {
  id: prodId, organization_id: org, project_owner_profile_id: ownerId,
  customer_name_snapshot: 'Customer A', product_name: 'PP cup',
  order_number: 'HD-P-1', version: 1, version_label: 'V1',
  workflow_status: 'SUBMITTED', is_urgent: false, priority: 'HIGH',
  submitted_at: '2026-10-28T01:00:00Z',
};
const sampling = {
  id: sampleId, organization_id: org, product_owner_profile_id: ownerId,
  customer_name_snapshot: 'Customer B', product_name: 'ABS cap',
  version: 2, version_label: 'V2', workflow_status: 'TECHNICIAN_REVIEW',
  is_urgent: true, submitted_at: '2026-10-29T01:00:00Z',
};
assert(WOS_ACTIVE_PRODUCTION_STATUSES.includes('SUBMITTED'));
assert(WOS_ACTIVE_SAMPLING_STATUSES.includes('TECHNICIAN_REVIEW'));
assert(!WOS_ACTIVE_PRODUCTION_STATUSES.includes('DRAFT'));
assert(!WOS_ACTIVE_SAMPLING_STATUSES.includes('CLOSED'));

function project(prod: unknown[] = [production], sample: unknown[] = [sampling], owners = [ownerId]) {
  return buildWosLiveInbox({ actor, productionRows: prod, samplingRows: sample, activeOwnerProfileIds: owners });
}
const valid = project();
assert.equal(valid.ok, true);
if (!valid.ok) throw Error('Expected read model');
assert.equal(valid.items.length, 2);
assert.deepEqual(valid.items.map(x => x.entityType), ['SAMPLING_REQUEST','PRODUCTION_ORDER']);
assert.equal(valid.items[0].projectOwnerProfileId, ownerId);
assert.equal(valid.items[0].orderNumber, null);
assert.equal(valid.items[1].orderNumber, 'HD-P-1');
assert.equal(valid.items[0].organizationId, org);
assert.equal(valid.items[0].versionLabel, 'V2');
assert.deepEqual(project([], []).ok, true);

assert.deepEqual(project([{ ...production, organization_id: foreignOrg }], []), { ok: false, code: 'UNTRUSTED_DB_ROW' });
assert.deepEqual(project([], [{ ...sampling, product_owner_profile_id: profileId }]), { ok: false, code: 'UNTRUSTED_DB_ROW' });
assert.deepEqual(project([production], [], []), { ok: false, code: 'UNTRUSTED_DB_ROW' });
assert.deepEqual(project([{ ...production, submitted_at: null }], []), { ok: false, code: 'UNTRUSTED_DB_ROW' });
assert.deepEqual(project([{ ...production, version: 0 }], []), { ok: false, code: 'UNTRUSTED_DB_ROW' });
assert.deepEqual(project([{ ...production, version_label: '' }], []), { ok: false, code: 'UNTRUSTED_DB_ROW' });
assert.deepEqual(project([{ ...production, workflow_status: 'DRAFT' }], []), { ok: false, code: 'UNTRUSTED_DB_ROW' });
assert.deepEqual(project([production, production], []), { ok: false, code: 'DUPLICATE_SOURCE' });
assert.deepEqual(project(Array.from({ length: WOS_INBOX_LIMIT_PER_TYPE + 1 }, () => production), []), {
  ok: false, code: 'LIMIT_EXCEEDED',
});

const goodIntent = {
  idempotencyKey: '88888888-8888-4888-8888-888888888888',
  expectedVersion: 1,
  payload: { productName: 'PP cup', requestedQuantity: 1000 },
};
assert.equal(validateWosPostEnvelope(goodIntent), true);
assert.equal(validateWosPostEnvelope({ ...goodIntent, expectedVersion: 0 }), false);
assert.equal(validateWosPostEnvelope({ ...goodIntent, idempotencyKey: 'not-a-uuid' }), false);
assert.equal(validateWosPostEnvelope({ ...goodIntent, organizationId: org }), false);
assert.equal(validateWosPostEnvelope({ ...goodIntent, payload: {} }), false);
assert.equal(validateWosPostEnvelope({ ...goodIntent, payload: { organizationId: foreignOrg } }), false);
assert.equal(validateWosPostEnvelope({ ...goodIntent, payload: { workflowStatus: 'SUBMITTED' } }), false);
assert.equal(validateWosPostEnvelope({ ...goodIntent, payload: { createdByProfileId: profileId } }), false);
assert.equal(validateWosPostEnvelope('malformed'), false);

// Static surface guards complement (but DO NOT replace) integration Auth/RLS tests.
const root = process.cwd();
const server = readFileSync(root + '/src/lib/workshop-orders/api-server.ts', 'utf8');
const inbox = readFileSync(root + '/src/app/api/workshop-orders/inbox/route.ts', 'utf8');
const productionRoute = readFileSync(root + '/src/app/api/workshop-orders/production/route.ts', 'utf8');
const samplingRoute = readFileSync(root + '/src/app/api/workshop-orders/sampling/route.ts', 'utf8');
assert(server.includes('resolveVerifiedSupabaseIdentity'));
assert(server.includes(".eq('organization_id', actor.orgId)"));
assert(server.includes('ATOMIC_SUBMISSION_RPC_REQUIRED'));
assert(server.includes('NONPRODUCTION_ONLY_DISABLED'));
assert(server.includes('createClient()'));
assert(!server.includes('service_role'));
assert(!server.includes('.insert('));
assert(!server.includes('.upsert('));
assert(!server.includes('.rpc('));
assert(inbox.includes('readWosWorkshopInbox'));
assert(productionRoute.includes("'PRODUCTION_ORDER'"));
assert(samplingRoute.includes("'SAMPLING_REQUEST'"));

console.log('workshop-order-api.test.ts: PASS');
