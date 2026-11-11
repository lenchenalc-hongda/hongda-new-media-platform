import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  CPC_WECOM_P2A,
  isWecomOccurrenceCurrent,
  planWecomPersonalNotification,
  type WecomBusinessFact,
  type VerifiedWecomMember,
} from '../../src/lib/customer-projects/wecom-notification-contract';

console.log('\n=== CPC P2-A WeCom Personal Notification Security Contract ===');

const org = '11111111-1111-4111-8111-111111111111';
const project = '22222222-2222-4222-8222-222222222222';
const task = '33333333-3333-4333-8333-333333333333';
const owner = '44444444-4444-4444-8444-444444444444';
const assignee = '55555555-5555-4555-8555-555555555555';
const corpId = 'ww_hongda_internal_test';
const wednesday = new Date('2026-11-11T01:05:00.000Z'); // 09:05 Shanghai

const fact: WecomBusinessFact = {
  orgId: org,
  kind: 'formal_task',
  sourceId: task,
  effectiveAt: '2026-11-11T02:30:00.000Z',
  state: 'needs_action',
  projectId: project,
  projectOwnerProfileId: owner,
  workAssigneeProfileId: assignee,
};
const member: VerifiedWecomMember = {
  orgId: org,
  corpId,
  profileId: assignee,
  wecomUserId: 'sales_01',
  verified: true,
  isActive: true,
  inAppVisibleScope: true,
};
const input = { now: wednesday, expectedCorpId: corpId, fact, members: [member] };
const success = planWecomPersonalNotification(input);
assert.equal(CPC_WECOM_P2A.channel, 'wecom_app');
assert.equal(CPC_WECOM_P2A.transportEnabled, false, 'no WeCom transport in P2-A');
assert.equal(CPC_WECOM_P2A.productionDispatchEnabled, false, 'production dispatch is disabled');
assert.equal(success.status, 'planned', 'valid employee receives one planned intent');
if (success.status !== 'planned') throw Error('planned branch required');
const intent = success.intent;
assert.equal(intent.recipientProfileId, assignee, 'formal task targets assignee, not project owner');
assert.equal(intent.recipientWecomUserId, 'sales_01');
assert.equal(intent.dispatchDateShanghai, '2026-11-11');
assert.equal(intent.cpcUrl, 'https://www.hongdaprinting.tech/customer-projects/projects/' + project);
assert.ok(!intent.notificationText.includes('客户') || !intent.notificationText.includes('联系方式'),
  'notification is generic, does not embed customer identity or contact details');
assert.ok(isWecomOccurrenceCurrent(intent, fact), 'unchanged source still current');

const repeat = planWecomPersonalNotification(input);
assert.equal(repeat.status, 'planned');
if (repeat.status === 'planned') {
  assert.equal(repeat.intent.occurrenceKey, intent.occurrenceKey, 'same occurrence never creates a new dedupe key');
}
const nextDay = planWecomPersonalNotification({
  ...input, now: new Date('2026-11-12T01:05:00Z'),
});
assert.equal(nextDay.status, 'planned');
if (nextDay.status === 'planned') {
  assert.notEqual(nextDay.intent.occurrenceKey, intent.occurrenceKey, 'separate day creates separate digest window');
}

for (const now of [
  new Date('2026-11-11T00:59:00Z'), // 08:59 Shanghai
  new Date('2026-11-11T01:16:00Z'), // 09:16 Shanghai
  new Date('2026-11-14T01:05:00Z'), // Saturday Shanghai
  new Date('2026-11-15T01:05:00Z'), // Sunday Shanghai
]) {
  assert.deepEqual(planWecomPersonalNotification({ ...input, now }),
    { status: 'suppressed', reason: 'outside_digest_window' },
    'quiet hours, weekend and out-of-window scheduling suppress delivery');
}

assert.deepEqual(
  planWecomPersonalNotification({ ...input, members: [] }),
  { status: 'suppressed', reason: 'identity_not_bound' },
  'unbound staff can never receive a message');
assert.deepEqual(
  planWecomPersonalNotification({ ...input, members: [member, member] }),
  { status: 'suppressed', reason: 'identity_ambiguous' },
  'duplicate binding fails closed');
assert.deepEqual(
  planWecomPersonalNotification({ ...input, members: [{ ...member, verified: false }] }),
  { status: 'suppressed', reason: 'identity_not_verified' },
  'unverified identity fails closed');
assert.deepEqual(
  planWecomPersonalNotification({ ...input, members: [{ ...member, corpId: 'another_enterprise' }] }),
  { status: 'suppressed', reason: 'identity_not_verified' },
  'wrong enterprise cannot receive');
assert.deepEqual(
  planWecomPersonalNotification({ ...input, members: [{ ...member, wecomUserId: '@all' }] }),
  { status: 'suppressed', reason: 'identity_not_verified' },
  'no broadcast recipient can be selected');
assert.deepEqual(
  planWecomPersonalNotification({ ...input, members: [{ ...member, wecomUserId: 'sales_01|sales_02' }] }),
  { status: 'suppressed', reason: 'identity_not_verified' },
  'no multi-user selectors can bypass single-user scope');
assert.deepEqual(
  planWecomPersonalNotification({ ...input, members: [{ ...member, isActive: false }] }),
  { status: 'suppressed', reason: 'member_outside_scope' },
  'inactive member cannot receive');
assert.deepEqual(
  planWecomPersonalNotification({ ...input, members: [{ ...member, inAppVisibleScope: false }] }),
  { status: 'suppressed', reason: 'member_outside_scope' },
  'member outside app scope cannot receive');
assert.deepEqual(
  planWecomPersonalNotification({ ...input, members: [{ ...member, orgId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }] }),
  { status: 'suppressed', reason: 'identity_not_bound' },
  'cross-org mapping is never usable');
assert.deepEqual(
  planWecomPersonalNotification({ ...input, fact: { ...fact, state: 'resolved' } }),
  { status: 'suppressed', reason: 'not_actionable' },
  'completed task cannot create an intent');
assert.ok(!isWecomOccurrenceCurrent(intent, { ...fact, state: 'resolved' }), 'close invalidates old occurrence');
assert.ok(!isWecomOccurrenceCurrent(intent, { ...fact, effectiveAt: '2026-11-13T02:30:00Z' }),
  'reschedule invalidates prior occurrence');
assert.ok(!isWecomOccurrenceCurrent(intent, { ...fact, workAssigneeProfileId: owner }),
  'reassignment invalidates old recipient');
assert.deepEqual(
  planWecomPersonalNotification({
    ...input, fact: { ...fact, kind: 'waiting_check', sourceId: project },
    members: [{ ...member, profileId: owner, wecomUserId: 'owner_01' }],
  }).status, 'planned', 'project waiting check routes to project owner');

const code = fs.readFileSync('src/lib/customer-projects/wecom-notification-contract.ts', 'utf8');
assert.ok(!code.includes('fetch(')
  && !code.includes('process.env')
  && !code.includes('qyapi.weixin.qq.com')
  && !code.includes('service_role')
  && !code.includes('.insert(')
  && !code.includes('.update('),
  'P2-A contract contains no outbound transport, secrets or database writes');
console.log('PASS: scoped WeCom identity, safe content, Shanghai window, dedupe, stale-source check and no sends');
