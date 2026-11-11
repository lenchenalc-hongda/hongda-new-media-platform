/**
 * CPC P2-B durable outbox state contract. Pure, offline, no IO or business writes.
 * The SQL worker must lock rows with SKIP LOCKED, then mirror these transitions.
 * An unknown outcome/expired lease is NEVER silently retried: WeCom may already
 * have accepted a message even if our connection lost the acknowledgement.
 */
export type WecomDeliveryState = 'pending' | 'leased' | 'retry' | 'sent'
  | 'unknown' | 'dead' | 'cancelled';

export interface WecomOutboxItem {
  id: string;
  occurrenceKey: string;
  sourceEffectiveAt: string;
  recipientProfileId: string;
  state: WecomDeliveryState;
  attempts: number;
  maxAttempts: number;
  availableAt: string;
  leaseToken: string | null;
  leaseUntil: string | null;
  lastErrorCode: string | null;
}

export type WecomTransportOutcome =
  | { kind: 'accepted' }
  | { kind: 'retryable_rejected'; code: string }
  | { kind: 'permanent_rejected'; code: string }
  | { kind: 'unknown'; code: string };

export const WECOM_OUTBOX_DEFAULT_MAX_ATTEMPTS = 3;

function epoch(iso: string | null): number {
  return iso ? Date.parse(iso) : Number.NaN;
}

export function canClaimWecomOutbox(item: WecomOutboxItem, now: Date): boolean {
  return (item.state === 'pending' || item.state === 'retry')
    && item.attempts >= 0 && item.attempts < item.maxAttempts
    && Number.isFinite(now.getTime())
    && Number.isFinite(epoch(item.availableAt))
    && epoch(item.availableAt) <= now.getTime()
    && item.leaseToken === null && item.leaseUntil === null;
}

/** Claim a row already atomically locked in the DB, using a fresh random UUID. */
export function claimWecomOutbox(input: {
  item: WecomOutboxItem; now: Date; leaseToken: string; leaseSeconds: number;
}): WecomOutboxItem | null {
  if (!canClaimWecomOutbox(input.item, input.now)) return null;
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(input.leaseToken)
    || !Number.isInteger(input.leaseSeconds)
    || input.leaseSeconds < 15 || input.leaseSeconds > 300) return null;
  return {
    ...input.item,
    state: 'leased', attempts: input.item.attempts + 1,
    leaseToken: input.leaseToken,
    leaseUntil: new Date(input.now.getTime() + input.leaseSeconds * 1000).toISOString(),
    lastErrorCode: null,
  };
}

/**
 * Only the owner of a non-expired lease can finalize the result.
 * HTTP/network timeout is unknown: no blind retry.
 */
export function finalizeWecomOutbox(input: {
  item: WecomOutboxItem; now: Date; leaseToken: string;
  outcome: WecomTransportOutcome;
}): WecomOutboxItem | null {
  const { item, now, leaseToken, outcome } = input;
  if (item.state !== 'leased' || item.leaseToken !== leaseToken
    || !Number.isFinite(epoch(item.leaseUntil)) || epoch(item.leaseUntil) <= now.getTime()
    || !Number.isFinite(now.getTime())) return null;

  const common = { ...item, leaseToken: null, leaseUntil: null };
  switch (outcome.kind) {
    case 'accepted':
      return { ...common, state: 'sent', lastErrorCode: null };
    case 'unknown':
      return { ...common, state: 'unknown', lastErrorCode: outcome.code };
    case 'permanent_rejected':
      return { ...common, state: 'dead', lastErrorCode: outcome.code };
    case 'retryable_rejected': {
      const terminal = item.attempts >= item.maxAttempts;
      const delaySecs = Math.min(3600, 60 * Math.pow(3, Math.max(0, item.attempts - 1)));
      return {
        ...common, state: terminal ? 'dead' : 'retry',
        availableAt: terminal ? common.availableAt
          : new Date(now.getTime() + delaySecs * 1000).toISOString(),
        lastErrorCode: outcome.code,
      };
    }
  }
}

/** Lease recovery is conservative: the lost worker may have sent the message. */
export function recoverExpiredWecomLease(
  item: WecomOutboxItem, now: Date,
): WecomOutboxItem | null {
  if (item.state !== 'leased' || !Number.isFinite(now.getTime())
    || !Number.isFinite(epoch(item.leaseUntil))
    || epoch(item.leaseUntil) > now.getTime()) return null;
  return {
    ...item, state: 'unknown', leaseToken: null, leaseUntil: null,
    lastErrorCode: 'LEASE_EXPIRED_UNKNOWN',
  };
}

/**
 * A changed/completed business fact invalidates queued intents.
 * Sent/unknown outcomes must retain audit history and are never deleted.
 */
export function cancelStaleWecomOutbox(
  item: WecomOutboxItem, isStillCurrent: boolean,
): WecomOutboxItem {
  if (isStillCurrent || item.state === 'sent' || item.state === 'unknown') return item;
  if (item.state === 'leased') return item; // owner must check before final send
  return { ...item, state: 'cancelled', leaseToken: null, leaseUntil: null };
}

/** Human-verified investigation of an unknown delivery; caller must recheck source. */
export function resolveUnknownWecomOutbox(input: {
  item: WecomOutboxItem;
  confirmed: 'accepted' | 'not_sent';
  currentBusinessFact: boolean;
  operatorAuthorized: boolean;
  now: Date;
}): WecomOutboxItem | null {
  const { item } = input;
  if (item.state !== 'unknown' || !input.operatorAuthorized
    || !Number.isFinite(input.now.getTime())) return null;
  if (input.confirmed === 'accepted')
    return { ...item, state: 'sent', lastErrorCode: 'MANUALLY_CONFIRMED' };
  if (!input.currentBusinessFact) return { ...item, state: 'cancelled', lastErrorCode: 'SOURCE_NO_LONGER_ACTIVE' };
  if (item.attempts >= item.maxAttempts) return { ...item, state: 'dead', lastErrorCode: 'MAX_ATTEMPTS' };
  return {
    ...item, state: 'retry', leaseToken: null, leaseUntil: null,
    availableAt: input.now.toISOString(), lastErrorCode: 'CONFIRMED_NOT_SENT',
  };
}
