/**
 * Synthetic WOS P7 Preview-only crash recovery.
 *
 * Stores only non-sensitive QA identifiers in sessionStorage (same tab).
 * Never stores credentials, JWT, client files, customer data, or image bytes.
 * Every resumed operation MUST revalidate the current Supabase identity and
 * query canonical DB state before it can write.
 */
export type QaRecoveryStage =
  'NEW' | 'DRAFT' | 'UPLOADED' | 'REGISTERED' | 'READY' | 'SUBMITTED';
export interface QaRecovery {
  schema: 1;
  createdAt: number;
  userId: string;
  orgId: string;
  orderNumber: string;
  versionLabel: string;
  orderId: string | null;
  imageId: string | null;
  objectPath: string | null;
  idempotencyKey: string;
  stage: QaRecoveryStage;
  fileSha256: string | null;
}
// Persistent across a closed/reopened browser, but scoped to an authenticated
// synthetic QA actor + organization. Contains identifiers only, never tokens.
export const WOS_QA_RECOVERY_KEY = 'hongda:wos-qa:synthetic-recovery:v2:';
const LEGACY_SESSION_KEY = 'hongda:wos-qa:synthetic-recovery:v1';
const scopedKey = (userId: string, orgId: string) => WOS_QA_RECOVERY_KEY + userId + ':' + orgId;
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const ORDER = /^QA-NONPROD-[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const VERSION = /^V[1-9][0-9]{0,20}$/;
const HASH = /^[a-f0-9]{64}$/;
const allowedStages: QaRecoveryStage[] =
  ['NEW', 'DRAFT', 'UPLOADED', 'REGISTERED', 'READY', 'SUBMITTED'];
const qaBucketPath = (x: QaRecovery) =>
  x.objectPath === null || (
    typeof x.objectPath === 'string' &&
    x.objectPath.startsWith(
      'organizations/' + x.orgId + '/wos/production-order/' + x.orderId + '/images/product/versions/' +
      x.versionLabel + '/' + x.imageId + '/'
    ) &&
    /^qa-preview-proof\.(png|jpg|webp)$/.test(x.objectPath.split('/').at(-1) ?? '')
  );

export function isValidQaRecovery(input: unknown, userId: string, orgId: string, now: number): input is QaRecovery {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return false;
  const q = input as Record<string, unknown>;
  return q.schema === 1 && UUID.test(userId) && UUID.test(orgId)
    && q.userId === userId && q.orgId === orgId
    && typeof q.createdAt === 'number'
    && Number.isFinite(q.createdAt) && now >= q.createdAt
    && now - q.createdAt <= MAX_AGE_MS
    && typeof q.orderNumber === 'string' && ORDER.test(q.orderNumber)
    && typeof q.versionLabel === 'string' && VERSION.test(q.versionLabel)
    && typeof q.idempotencyKey === 'string' && UUID.test(q.idempotencyKey)
    && (q.orderId === null || (typeof q.orderId === 'string' && UUID.test(q.orderId)))
    && (q.imageId === null || (typeof q.imageId === 'string' && UUID.test(q.imageId)))
    && (q.fileSha256 === null || (typeof q.fileSha256 === 'string' && HASH.test(q.fileSha256)))
    && typeof q.stage === 'string'
    && allowedStages.includes(q.stage as QaRecoveryStage)
    && (q.objectPath === null || (q.orderId !== null && q.imageId !== null))
    && qaBucketPath(q as unknown as QaRecovery);
}

export function readQaRecovery(userId: string, orgId: string): QaRecovery | null {
  try {
    const key = scopedKey(userId, orgId);
    const raw = window.localStorage.getItem(key);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (!isValidQaRecovery(parsed, userId, orgId, Date.now())) return null;
      return parsed;
    }
    // Only migrate a legacy same-tab QA recovery after matching current
    // actor and org. Other actors' local data is never returned or copied.
    const legacy = window.sessionStorage.getItem(LEGACY_SESSION_KEY);
    if (!legacy) return null;
    const parsed: unknown = JSON.parse(legacy);
    if (!isValidQaRecovery(parsed, userId, orgId, Date.now())) return null;
    window.localStorage.setItem(key, legacy);
    window.sessionStorage.removeItem(LEGACY_SESSION_KEY);
    return parsed;
  } catch { return null; }
}

export function saveQaRecovery(recovery: QaRecovery): void {
  if (!isValidQaRecovery(recovery, recovery.userId, recovery.orgId, Date.now())) {
    throw new Error('QA_RECOVERY_STATE_INVALID');
  }
  try {
    window.localStorage.setItem(scopedKey(recovery.userId, recovery.orgId), JSON.stringify(recovery));
  } catch { throw new Error('QA_LOCAL_STORAGE_UNAVAILABLE'); }
}

export function clearQaRecovery(userId: string, orgId: string): void {
  try { window.localStorage.removeItem(scopedKey(userId, orgId)); } catch { /* no-op */ }
  try { window.sessionStorage.removeItem(LEGACY_SESSION_KEY); } catch { /* no-op */ }
}

export async function verifyQaImageSignature(file: Blob): Promise<boolean> {
  if (file.size < 12 || file.size > 20 * 1024 * 1024) return false;
  const prefix = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const png = file.type === 'image/png' &&
    [137,80,78,71,13,10,26,10].every((b, i) => prefix[i] === b);
  const jpeg = file.type === 'image/jpeg' &&
    prefix[0] === 0xff && prefix[1] === 0xd8 && prefix[2] === 0xff;
  const webp = file.type === 'image/webp' &&
    [82,73,70,70].every((b, i) => prefix[i] === b) &&
    [87,69,66,80].every((b, i) => prefix[8+i] === b);
  return png || jpeg || webp;
}

export async function qaFileSha256(file: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}
