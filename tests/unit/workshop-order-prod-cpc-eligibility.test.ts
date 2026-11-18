import assert from 'node:assert/strict';
import {
  buildWosCpcOptions, isWosCpcReadCandidateEnabled,
  parseWosCpcPairRequest, resolveWosCpcActor, verifyWosCpcPair,
} from '../../src/lib/workshop-orders/prod-cpc-eligibility';

const user = '21111111-0000-4000-8000-000000000001';
const actorId = '11111111-0000-4000-8000-000000000001';
const org = 'aaaaaaaa-0000-4000-8000-000000000001';
const customerId = '31111111-0000-4000-8000-000000000001';
const projectId = '41111111-0000-4000-8000-000000000001';
const foreignOrg = 'bbbbbbbb-0000-4000-8000-000000000002';
const ownerId = '11111111-0000-4000-8000-000000000004';
const profile = { id: actorId, user_id: user, org_id: org, role: 'sales', is_active: true };
const actorResult = resolveWosCpcActor(user, profile);
assert.equal(actorResult.ok, true);
if (!actorResult.ok) throw Error('Expected a verified actor');
const actor = actorResult.actor;
assert.equal(resolveWosCpcActor(user, { ...profile, role: 'operator' }).ok, false);
assert.equal(resolveWosCpcActor(user, { ...profile, role: 'viewer' }).ok, false);
assert.equal(resolveWosCpcActor(user, { ...profile, is_active: false }).ok, false);
assert.equal(resolveWosCpcActor(user, { ...profile, user_id: actorId }).ok, false);
assert.equal(resolveWosCpcActor('not-a-uuid', profile).ok, false);
const gate = {
  enabled: 'true', nodeEnv: 'production', vercelEnv: 'preview',
  supabaseUrl: 'https://xulmpqaknlwqqculbsek.supabase.co',
};
assert.equal(isWosCpcReadCandidateEnabled(gate), true);
assert.equal(isWosCpcReadCandidateEnabled({ ...gate, vercelEnv: 'production' }), false);
assert.equal(isWosCpcReadCandidateEnabled({ ...gate, vercelEnv: 'development' }), false);
assert.equal(isWosCpcReadCandidateEnabled({ ...gate, enabled: 'false' }), false);
assert.equal(isWosCpcReadCandidateEnabled({ ...gate, supabaseUrl: 'https://amqpvxrurenevniilhtl.supabase.co' }), false);
assert.equal(isWosCpcReadCandidateEnabled({ ...gate, supabaseUrl: 'https://xulmpqaknlwqqculbsek.supabase.co.evil.test' }), false);
const customer = { id: customerId, org_id: org, display_name_snapshot: 'Synthetic Customer', status: 'active' };
const project = {
  id: projectId, org_id: org, customer_reference_id: customerId,
  title: 'Synthetic Project', owner_profile_id: ownerId, status: 'active',
  archived_at: null,
};
const valid = { actor, customer, project, canReadCustomer: true, canReadProject: true };
assert.equal(verifyWosCpcPair(valid).ok, true);
assert.equal(verifyWosCpcPair({ ...valid, canReadProject: false }).ok, false);
assert.equal(verifyWosCpcPair({ ...valid, canReadCustomer: false }).ok, false);
assert.equal(verifyWosCpcPair({ ...valid, customer: { ...customer, status: 'pending_review' } }).ok, false);
assert.equal(verifyWosCpcPair({ ...valid, customer: { ...customer, status: 'mapped' } }).ok, false);
assert.equal(verifyWosCpcPair({ ...valid, project: { ...project, status: 'paused' } }).ok, false);
assert.equal(verifyWosCpcPair({ ...valid, project: { ...project, status: 'won' } }).ok, false);
assert.equal(verifyWosCpcPair({ ...valid, project: { ...project, archived_at: '2026-01-01T00:00:00Z' } }).ok, false);
assert.equal(verifyWosCpcPair({ ...valid, project: { ...project, customer_reference_id: ownerId } }).ok, false);
assert.equal(verifyWosCpcPair({ ...valid, project: { ...project, org_id: foreignOrg } }).ok, false);
const list = buildWosCpcOptions({
  actor,
  customers: [customer, { ...customer, id: ownerId, status: 'pending_review' }],
  projects: [project, { ...project, id: ownerId, customer_reference_id: ownerId }],
});
assert.equal(list.ok, true);
if (!list.ok) throw Error('Expected sanitized list');
assert.equal(list.customers.length, 1);
assert.equal(list.projects.length, 1);
assert.deepEqual(list.projects[0], { id: projectId, customerId, name: project.title, ownerProfileId: ownerId });
assert.equal(buildWosCpcOptions({ actor, customers: [{ ...customer, org_id: foreignOrg }], projects: [] }).ok, false);
assert.equal(buildWosCpcOptions({ actor, customers: Array(201).fill(customer), projects: [] }).ok, false);
assert.deepEqual(parseWosCpcPairRequest({ customerId, projectId }), { customerId, projectId });
assert.equal(parseWosCpcPairRequest({ customerId, projectId, orgId: org }), null);
assert.equal(parseWosCpcPairRequest({ customerId, projectId: 'fake' }), null);
console.log('WOS_P0_02_01_CPC_READ_AUTHZ_AND_PAIR_CONTRACT=PASS');
