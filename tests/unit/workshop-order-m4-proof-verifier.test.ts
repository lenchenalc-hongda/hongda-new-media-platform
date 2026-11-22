import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  WosM4ProofVerifierFailure,
  executeWosM4ProofVerifier,
  mapWosM4ProofDatabaseError,
  parseWosM4ProofSnapshot,
  parseWosM4ProofVerifierRequest,
  wosM4ProofSha256,
  wosM4SnapshotStableProjection,
  type WosM4ProofReferenceImage,
  type WosM4ProofSnapshot,
} from '../../src/lib/workshop-orders/m4-proof-verifier';
import {
  WOS_QA_IMAGE_CATEGORIES,
  buildWosQaImageObjectPath,
  type WosQaImageCategory,
} from '../../src/lib/workshop-orders/qa-image-categories';
import {
  isWosQaM4ProofReadonlyEnabled,
} from '../../src/lib/workshop-orders/api-contract';

const userId = '10101010-1010-4010-8010-101010101010';
const officeProfileId = '11111111-1111-4111-8111-111111111111';
const operatorProfileId = '22222222-2222-4222-8222-222222222222';
const orgId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const foreignOrgId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const orderId = '33333333-3333-4333-8333-333333333333';
const baselineId = '44444444-4444-4444-8444-444444444444';
const imageIds = [
  '51111111-1111-4111-8111-111111111111',
  '52222222-2222-4222-8222-222222222222',
  '53333333-3333-4333-8333-333333333333',
  '54444444-4444-4444-8444-444444444444',
] as const;
const checkedAt = '2026-11-22T10:00:00.000Z';

const actor = {
  userId,
  profileId: officeProfileId,
  organizationId: orgId,
  role: 'admin' as const,
};
const order = {
  id: orderId,
  organizationId: orgId,
  orderNumber: 'QA-NONPROD-' + orderId,
  version: 11,
  versionLabel: 'QA-R6',
  workflowStatus: 'READINESS_CHECK',
};

function bytesFor(category: WosQaImageCategory): Uint8Array {
  return Buffer.from('synthetic-proof:' + category, 'utf8');
}

function referenceImages(): WosM4ProofReferenceImage[] {
  return WOS_QA_IMAGE_CATEGORIES.map((category, index) => ({
    id: imageIds[index],
    organizationId: orgId,
    entityType: 'PRODUCTION_ORDER' as const,
    entityId: orderId,
    category,
    versionLabel: 'QA-R6',
    imageStatus: 'READY',
    supersededAt: null,
    storageBucket: 'wos-private',
    storagePath: buildWosQaImageObjectPath({
      organizationId: orgId,
      orderId,
      versionLabel: 'QA-R6',
      imageId: imageIds[index],
      category,
    }),
  }));
}

function snapshot(overrides: Partial<WosM4ProofSnapshot> = {}): WosM4ProofSnapshot {
  return {
    orderId,
    orderVersion: 11,
    versionLabel: 'QA-R6',
    baselineId,
    checkedAt,
    proofExpiresAt: '2026-11-22T10:20:00.000Z',
    snapshotFingerprint: 'a'.repeat(64),
    metadataSnapshotValid: true,
    officeWorkshopDistinct: true,
    proofSetDigestMatch: true,
    m2ReceiptChainComplete: true,
    images: WOS_QA_IMAGE_CATEGORIES.map((category, index) => ({
      imageId: imageIds[index],
      category,
      expectedSha256: wosM4ProofSha256(bytesFor(category)),
      expiresAt: '2026-11-22T10:20:00.000Z',
    })),
    canStart: false,
    ...overrides,
  };
}

async function expectFailure(
  code: WosM4ProofVerifierFailure['code'],
  run: () => Promise<unknown>,
) {
  await assert.rejects(run, (error: unknown) => {
    assert(error instanceof WosM4ProofVerifierFailure);
    assert.equal(error.code, code);
    return true;
  });
}

assert.deepEqual(parseWosM4ProofVerifierRequest(
  'https://qa.example/api/workshop-orders/m4/proof-verifier?orderId=' + orderId,
), { ok: true, orderId });
assert.deepEqual(parseWosM4ProofVerifierRequest(
  'https://qa.example/api/workshop-orders/m4/proof-verifier',
), { ok: false, code: 'INVALID_READ_QUERY' });

const m4ReadFlagInput = {
  authMode: 'supabase',
  supabaseUrl: 'https://xulmpqaknlwqqculbsek.supabase.co',
} as const;
assert.equal(isWosQaM4ProofReadonlyEnabled({
  ...m4ReadFlagInput,
  vercelEnv: 'preview',
  enabled: 'true',
}), true);
assert.equal(isWosQaM4ProofReadonlyEnabled({
  ...m4ReadFlagInput,
  vercelEnv: 'preview',
  enabled: 'false',
}), false);
assert.equal(isWosQaM4ProofReadonlyEnabled({
  ...m4ReadFlagInput,
  vercelEnv: 'production',
  enabled: 'true',
}), false);
assert.equal(isWosQaM4ProofReadonlyEnabled({
  ...m4ReadFlagInput,
  supabaseUrl: 'https://amqpvxrurenevniilhtl.supabase.co',
  vercelEnv: 'preview',
  enabled: 'true',
}), false);
assert.deepEqual(parseWosM4ProofVerifierRequest(
  'https://qa.example/api/workshop-orders/m4/proof-verifier?orderId=' + orderId
    + '&orgId=' + foreignOrgId,
), { ok: false, code: 'INVALID_READ_QUERY' });
assert.deepEqual(parseWosM4ProofVerifierRequest(
  'https://qa.example/api/workshop-orders/m4/proof-verifier?orderId=not-a-uuid',
), { ok: false, code: 'INVALID_READ_QUERY' });

assert(parseWosM4ProofSnapshot(snapshot()));
assert.equal(wosM4SnapshotStableProjection(snapshot()), wosM4SnapshotStableProjection(snapshot()));
assert.equal(parseWosM4ProofSnapshot(snapshot({
  images: snapshot().images.map((image, index) =>
    index === 3 ? { ...image, category: 'PRODUCT' } : image),
})), null);
assert.equal(parseWosM4ProofSnapshot(snapshot({
  images: snapshot().images.slice(0, 3),
})), null);
assert.equal(parseWosM4ProofSnapshot(snapshot({
  proofExpiresAt: '2026-11-22T09:59:59.000Z',
})), null);
assert.equal(parseWosM4ProofSnapshot(snapshot({
  canStart: true as never,
})), null);
assert.equal(parseWosM4ProofSnapshot({ ...snapshot(), storagePath: '/private' }), null);

const stableDeps = {
  now: () => Date.parse('2026-11-22T10:00:30.000Z'),
  async readSnapshot() {
    return snapshot();
  },
  async readReferenceImages() {
    return referenceImages();
  },
  async downloadObject(_bucket: string, path: string) {
    const image = referenceImages().find(candidate => candidate.storagePath === path);
    assert(image);
    return bytesFor(image.category);
  },
};

const positive = await executeWosM4ProofVerifier({
  actor,
  orderId,
  order,
  dependencies: stableDeps,
});
assert.deepEqual(positive.imageCategories, WOS_QA_IMAGE_CATEGORIES);
assert.equal(positive.metadataSnapshotStable, true);
assert.equal(positive.contentSha256Verified, true);
assert.equal(positive.officeWorkshopDistinct, true);
assert.equal(positive.proofSetDigestMatch, true);
assert.equal(positive.m2ReceiptChainComplete, true);
assert.equal(positive.canStart, false);
assert(!JSON.stringify(positive).includes('storage'));
assert(!JSON.stringify(positive).includes('object'));
assert.equal(
  mapWosM4ProofDatabaseError('PROOF_ORDER_NOT_READY').code,
  'PROOF_ORDER_NOT_READY',
);

for (const role of ['manager', 'sales', 'operator'] as const) {
  const result = await executeWosM4ProofVerifier({
    actor: { ...actor, role },
    orderId,
    order,
    dependencies: stableDeps,
  });
  assert.equal(result.contentSha256Verified, true);
}

await expectFailure('FORBIDDEN', () => executeWosM4ProofVerifier({
  actor: { ...actor, role: 'viewer' as never },
  orderId,
  order,
  dependencies: stableDeps,
}));
await expectFailure('ORDER_NOT_AVAILABLE', () => executeWosM4ProofVerifier({
  actor,
  orderId,
  order: { ...order, organizationId: foreignOrgId },
  dependencies: stableDeps,
}));
await expectFailure('PROOF_ORDER_NOT_READY', () => executeWosM4ProofVerifier({
  actor,
  orderId,
  order: { ...order, workflowStatus: 'WAITING_MATERIAL' },
  dependencies: stableDeps,
}));
await expectFailure('VERSION_CONFLICT', () => executeWosM4ProofVerifier({
  actor,
  orderId,
  order: { ...order, version: 10 },
  dependencies: {
    ...stableDeps,
    async readSnapshot() {
      return snapshot();
    },
  },
}));
const aborted = new AbortController();
aborted.abort();
await expectFailure('PROOF_VERIFIER_TIMEOUT', () => executeWosM4ProofVerifier({
  actor,
  orderId,
  order,
  dependencies: stableDeps,
  signal: aborted.signal,
}));

await expectFailure('PROOF_SHA_MISMATCH', () => executeWosM4ProofVerifier({
  actor,
  orderId,
  order,
  dependencies: {
    ...stableDeps,
    async downloadObject() {
      return Buffer.from('tampered');
    },
  },
}));
await expectFailure('PROOF_OBJECT_UNAVAILABLE', () => executeWosM4ProofVerifier({
  actor,
  orderId,
  order,
  dependencies: {
    ...stableDeps,
    async downloadObject() {
      throw new Error('storage denied');
    },
  },
}));
await expectFailure('SNAPSHOT_CHANGED', () => {
  let call = 0;
  return executeWosM4ProofVerifier({
    actor,
    orderId,
    order,
    dependencies: {
      ...stableDeps,
      async readSnapshot() {
        call += 1;
        return snapshot(call === 1 ? {} : { snapshotFingerprint: 'b'.repeat(64) });
      },
    },
  });
});
await expectFailure('PROOF_OBJECT_CHANGED', () => executeWosM4ProofVerifier({
  actor,
  orderId,
  order,
  dependencies: {
    ...stableDeps,
    async readReferenceImages() {
      return referenceImages().map((image, index) =>
        index === 0 ? { ...image, storagePath: 'organizations/other/private.png' } : image);
    },
  },
}));
await expectFailure('PROOF_EXPIRED', () => executeWosM4ProofVerifier({
  actor,
  orderId,
  order,
  dependencies: {
    ...stableDeps,
    async readSnapshot() {
      return snapshot({
        checkedAt: '2026-11-22T10:21:00.000Z',
      });
    },
  },
}));
await expectFailure('PROOF_EXPIRED', () => {
  let call = 0;
  return executeWosM4ProofVerifier({
    actor,
    orderId,
    order,
    dependencies: {
      ...stableDeps,
      now: () => Date.parse('2026-11-22T10:21:00.000Z'),
      async readSnapshot() {
        call += 1;
        return call === 1
          ? snapshot({ checkedAt: '2026-11-22T10:00:05.000Z' })
          : snapshot({ checkedAt: '2026-11-22T10:00:10.000Z' });
      },
    },
  });
});

const route = readFileSync(
  'src/app/api/workshop-orders/m4/proof-verifier/route.ts',
  'utf8',
);
const server = readFileSync(
  'src/lib/workshop-orders/m4-proof-verifier-server.ts',
  'utf8',
);
assert(route.includes('export async function GET'));
assert(!route.includes('export async function POST'));
assert(server.includes("client.rpc('wos_qa_m4_readonly_proof_snapshot'"));
assert(server.includes("client.storage.from(bucket).download(path)"));
assert(server.includes('resolveVerifiedSupabaseIdentity'));
assert(server.includes('WOS_QA_M4_PROOF_READONLY_ENABLED'));
assert(!server.includes('WOS_QA_INBOX_READONLY_ENABLED'));
assert(server.includes("from('profiles')"));
assert(server.includes("from('wos_production_orders')"));
assert(server.includes("from('wos_reference_images')"));
assert(!server.includes('service_role'));
assert(!server.includes("from('wos_qa_verified_image_proofs')"));
assert(!server.includes("from('wos_qa_p2_m2_receipts')"));
assert(!server.includes('createSignedUrl'));
assert(!server.includes('.insert('));
assert(!server.includes('.update('));
assert(server.includes('new AbortController()'));
assert(server.includes('.abortSignal(controller.signal)'));
assert(server.includes('PROOF_VERIFIER_TIMEOUT'));

console.log('workshop-order-m4-proof-verifier.test.ts: PASS');
console.log('WOS_M4_PROOF_ROLE_MATRIX=PASS');
console.log('WOS_M4_PROOF_REAL_BYTES_SHA256=PASS');
console.log('WOS_M4_PROOF_DOUBLE_SNAPSHOT=PASS');
console.log('WOS_M4_PROOF_SAFE_DTO=PASS');
console.log('WOS_M4_PROOF_CAN_START=false');
