import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  canClaimWecomOutbox,
  cancelStaleWecomOutbox,
  claimWecomOutbox,
  finalizeWecomOutbox,
  recoverExpiredWecomLease,
  resolveUnknownWecomOutbox,
  WECOM_OUTBOX_DEFAULT_MAX_ATTEMPTS,
  type WecomOutboxItem,
} from '../../src/lib/customer-projects/wecom-outbox-state';

console.log('\n=== CPC P2-B Durable Outbox / At-Most-Once Uncertain Recovery ===');

const now = new Date('2026-11-11T01:00:00Z');
const leaseId = '11111111-1111-4111-8111-111111111111';
const item: WecomOutboxItem = {
  id: '22222222-2222-4222-8222-222222222222',
  occurrenceKey: 'org:owner:task:2026-11-11',
  sourceEffectiveAt: '2026-11-10T01:00:00Z',
  recipientProfileId: '33333333-3333-4333-8333-333333333333',
  state: 'pending', attempts: 0, maxAttempts: WECOM_OUTBOX_DEFAULT_MAX_ATTEMPTS,
  availableAt: '2026-11-11T00:00:00Z',
  leaseToken: null, leaseUntil: null, lastErrorCode: null,
};

assert.ok(canClaimWecomOutbox(item, now), 'initial due row can be claimed');
assert.ok(!canClaimWecomOutbox({ ...item, availableAt: '2026-11-11T01:30:00Z' }, now),
  'future work cannot be claimed');
assert.ok(!canClaimWecomOutbox({ ...item, attempts: 3 }, now),
  'attempt limit fails closed');
assert.ok(!canClaimWecomOutbox({ ...item, state: 'cancelled' }, now),
  'cancelled row is terminal');
assert.ok(!canClaimWecomOutbox({ ...item, state: 'sent' }, now),
  'already accepted row cannot be resent');
const claimed = claimWecomOutbox({ item, now, leaseToken: leaseId, leaseSeconds: 60 });
assert.ok(claimed, 'worker obtains finite lease');
if (!claimed) throw Error('lease contract failed');
assert.equal(claimed.state, 'leased');
assert.equal(claimed.attempts, 1);
assert.ok(!canClaimWecomOutbox(claimed, now), 'second worker cannot claim a leased row');
assert.equal(claimWecomOutbox({ item: claimed, now, leaseToken: leaseId, leaseSeconds: 60 }), null);
assert.equal(claimWecomOutbox({ item, now, leaseToken: 'garbage', leaseSeconds: 60 }), null);
assert.equal(claimWecomOutbox({ item, now, leaseToken: leaseId, leaseSeconds: 0 }), null);
assert.equal(finalizeWecomOutbox({
  item: claimed, now, leaseToken: 'bad',
  outcome: { kind: 'accepted' },
}), null, 'wrong lease owner cannot finalize');

const accepted = finalizeWecomOutbox({
  item: claimed, now, leaseToken: leaseId,
  outcome: { kind: 'accepted' },
});
assert.equal(accepted?.state, 'sent', 'WeCom errcode=0 marks provider acceptance, not proven device read');
assert.ok(!accepted || !canClaimWecomOutbox(accepted, now));
assert.equal(finalizeWecomOutbox({
  item: claimed, now: new Date('2026-11-11T01:01:00Z'), leaseToken: leaseId,
  outcome: { kind: 'accepted' },
}), null, 'expired lease cannot finalize, requires reconciliation');

const lostAck = finalizeWecomOutbox({
  item: claimed, now, leaseToken: leaseId, outcome: { kind: 'unknown', code: 'TIMEOUT' },
});
assert.equal(lostAck?.state, 'unknown', 'network timeout is NOT blindly retried');
assert.ok(!lostAck || !canClaimWecomOutbox(lostAck, new Date('2026-11-13T01:00:00Z')));
assert.equal(resolveUnknownWecomOutbox({
  item: lostAck!, confirmed: 'not_sent', currentBusinessFact: true,
  operatorAuthorized: false, now,
}), null, 'manual investigation needs authorized operator');
const manuallyResolved = resolveUnknownWecomOutbox({
  item: lostAck!, confirmed: 'not_sent', currentBusinessFact: true,
  operatorAuthorized: true, now,
});
assert.equal(manuallyResolved?.state, 'retry');
assert.equal(resolveUnknownWecomOutbox({
  item: lostAck!, confirmed: 'accepted', currentBusinessFact: false,
  operatorAuthorized: true, now,
})?.state, 'sent', 'provider confirmation remains terminal for audit');
assert.equal(resolveUnknownWecomOutbox({
  item: lostAck!, confirmed: 'not_sent', currentBusinessFact: false,
  operatorAuthorized: true, now,
})?.state, 'cancelled', 'completed task cannot be resent after manual reconciliation');

const expired = recoverExpiredWecomLease(claimed, new Date('2026-11-11T01:02:00Z'));
assert.equal(expired?.state, 'unknown', 'expired lease is uncertain, not retry');
assert.equal(recoverExpiredWecomLease(claimed, now), null, 'active lease not auto-recovered');
assert.equal(recoverExpiredWecomLease(item, now), null, 'no fabricated lease expiry');

const retried = finalizeWecomOutbox({
  item: claimed, now, leaseToken: leaseId,
  outcome: { kind: 'retryable_rejected', code: '45009' },
});
assert.equal(retried?.state, 'retry');
assert.equal(retried?.availableAt, '2026-11-11T01:01:00.000Z');
assert.ok(!retried || !canClaimWecomOutbox(retried, now), 'bounded backoff before new attempt');
const atMax = finalizeWecomOutbox({
  item: { ...claimed, attempts: 3 }, now, leaseToken: leaseId,
  outcome: { kind: 'retryable_rejected', code: '45009' },
});
assert.equal(atMax?.state, 'dead', 'no infinite rate-limit retries');
assert.equal(finalizeWecomOutbox({
  item: claimed, now, leaseToken: leaseId,
  outcome: { kind: 'permanent_rejected', code: 'INVALID_MEMBER' },
})?.state, 'dead', 'bad recipient does not enter retry loop');
assert.equal(cancelStaleWecomOutbox(item, false).state, 'cancelled',
  'completed or rescheduled source cancels pending notification');
assert.equal(cancelStaleWecomOutbox(retried!, false).state, 'cancelled',
  'new due time cancels previous retry');
assert.equal(cancelStaleWecomOutbox(lostAck!, false).state, 'unknown',
  'uncertain result is retained for audit');
assert.equal(cancelStaleWecomOutbox(claimed, false).state, 'leased',
  'in-flight messages require worker-side recheck, not detached cancellation');

const source = fs.readFileSync('src/lib/customer-projects/wecom-outbox-state.ts', 'utf8');
for (const forbidden of ['fetch(', 'process.env', '.insert(', '.update(', 'message/send?', 'service_role']) {
  assert.ok(!source.includes(forbidden), 'offline state machine must not contain ' + forbidden);
}
console.log('PASS: leases, attempt bounds, provider acceptance, stale facts, unknown delivery and audit safety');
