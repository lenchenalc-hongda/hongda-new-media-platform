import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
// @ts-ignore Deno requires the explicit .ts extension for local imports.
import { executeWosV1ReadOnlyRequest, type WosV1ReadOnlyRequestDependencies } from '../../supabase/functions/wos-v1-verify-image-readonly/handler';
// @ts-ignore Deno requires the explicit .ts extension for local imports.
import {
  parseWosV1ReadOnlyVerificationBody,
  type WosV1ReadOnlyImage,
  type WosV1ReadOnlyOrder,
  type WosV1ReadOnlyProof,
  type WosV1ReadOnlyProfile,
  type WosV1ReadOnlyVerificationBody,
} from '../../supabase/functions/wos-v1-verify-image-readonly/core';
// @ts-ignore Deno requires the explicit .ts extension for local imports.
import type { WosV1ObjectSnapshot } from '../../supabase/functions/wos-v1-verify-image/core';

const readonlyHandler = readFileSync(
  'supabase/functions/wos-v1-verify-image-readonly/handler.ts',
  'utf8',
);
assert(readonlyHandler.includes('deps.currentImageFor(image, order)'));
assert(
  readonlyHandler.indexOf('deps.currentImageFor(image, order)')
    < readonlyHandler.indexOf('deps.download(item.image.storagePath)'),
  'current image/baseline check must precede private byte downloads',
);

const organizationId = '11111111-1111-4111-8111-111111111111';
const orderId = '33333333-3333-4333-8333-333333333333';
const userId = '44444444-4444-4444-8444-444444444444';
const profileId = '55555555-5555-4555-8555-555555555555';
const imageIds = [
  '71111111-1111-4111-8111-111111111111',
  '72222222-2222-4222-8222-222222222222',
  '73333333-3333-4333-8333-333333333333',
  '74444444-4444-4444-8444-444444444444',
] as const;
const objectIds = [
  '81111111-1111-4111-8111-111111111111',
  '82222222-2222-4222-8222-222222222222',
  '83333333-3333-4333-8333-333333333333',
  '84444444-4444-4444-8444-444444444444',
] as const;
const categories = [
  'PRODUCT',
  'FILM_PATTERN',
  'CUSTOMER_APPROVED_SAMPLE',
  'SIGNED_SAMPLE',
] as const;
const slugs = [
  'product',
  'film-pattern',
  'customer-approved-sample',
  'signed-sample',
] as const;
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=',
  'base64',
);
const pngSha = createHash('sha256').update(png).digest('hex');
const pathFor = (index: number) =>
  `organizations/${organizationId}/wos/production-order/${orderId}/images/`
  + `${slugs[index]}/versions/QA-R6/${imageIds[index]}/source.png`;
const images = categories.map((category, index) => ({
  category,
  imageId: imageIds[index],
  sha256: pngSha,
  storagePath: pathFor(index),
})) satisfies WosV1ReadOnlyImage[];
const parsedBody = parseWosV1ReadOnlyVerificationBody({
  expectedVersion: 11,
  expectedVersionLabel: 'QA-R6',
  images,
  orderId,
});
if (!parsedBody) throw new Error('test body must parse');
const body: WosV1ReadOnlyVerificationBody = parsedBody;

const profile = {
  id: profileId,
  user_id: userId,
  org_id: organizationId,
  role: 'admin',
  is_active: true,
} satisfies WosV1ReadOnlyProfile;
const order = {
  id: orderId,
  organization_id: organizationId,
  version: 11,
  version_label: 'QA-R6',
  workflow_status: 'READINESS_CHECK',
} satisfies WosV1ReadOnlyOrder;
const proofs = images.map((image, index) => ({
  image_id: image.imageId,
  organization_id: organizationId,
  order_id: orderId,
  actor_user_id: userId,
  storage_bucket: 'wos-private',
  storage_path: image.storagePath,
  storage_object_id: objectIds[index],
  storage_object_version: `object-version-${index + 1}`,
  storage_object_updated_at: `2026-11-23T00:00:00.${index + 1}00000Z`,
  verified_sha256: pngSha,
  verified_at: '2026-11-23T00:00:00.000000Z',
  expires_at: '2026-11-23T01:00:00.000000Z',
})) satisfies WosV1ReadOnlyProof[];
const snapshots = images.map((_image, index) => ({
  id: objectIds[index],
  ownerId: userId,
  version: `object-version-${index + 1}`,
  updatedAt: `2026-11-23T00:00:00.${index + 1}00000Z`,
  mimeType: 'image/png',
  byteSize: String(png.length),
})) satisfies WosV1ObjectSnapshot[];

interface Counters {
  downloads: number;
  writes: number;
  renewals: number;
  recordings: number;
  proofReads: number;
  currentImageReads: number;
  snapshotReads: number;
  currentOrderReads: number;
}

function dependencies(options: {
  readonly readOnlyEnabled?: boolean;
  readonly proofAt?: (index: number) => WosV1ReadOnlyProof | null;
  readonly snapshotAt?: (index: number) => WosV1ObjectSnapshot | null;
  readonly now?: () => string;
  readonly currentOrderAt?: () => WosV1ReadOnlyOrder | null;
  readonly currentImageAllowed?: (index: number) => boolean;
  readonly currentImageBaselineAt?: (index: number, read: number) => string;
} = {}): {
  readonly deps: WosV1ReadOnlyRequestDependencies;
  readonly counters: Counters;
} {
  const counters: Counters = {
    downloads: 0,
    writes: 0,
    renewals: 0,
    recordings: 0,
    proofReads: 0,
    currentImageReads: 0,
    snapshotReads: 0,
    currentOrderReads: 0,
  };
  const currentImageCounts = new Map<string, number>();
  const deps: WosV1ReadOnlyRequestDependencies = {
    readOnlyEnabled: options.readOnlyEnabled ?? true,
    qaRuntimeBound: true,
    authenticate: async value =>
      value === 'Bearer valid-token' ? { userId } : null,
    profileFor: async value => value === userId ? profile : null,
    orderFor: async (id, orgId) =>
      id === orderId && orgId === organizationId ? order : null,
    proofFor: async (_imageId, _order) => {
      const index = counters.proofReads++ % images.length;
      return options.proofAt ? options.proofAt(index) : proofs[index];
    },
    currentImageFor: async image => {
      const index = images.findIndex(row => row.imageId === image.imageId);
      const readsForImage = (currentImageCounts.get(image.imageId) ?? 0) + 1;
      currentImageCounts.set(image.imageId, readsForImage);
      counters.currentImageReads++;
      return index >= 0
        && (options.currentImageAllowed?.(index) ?? true)
        ? {
            baselineId: options.currentImageBaselineAt?.(index, readsForImage)
              ?? '99999999-9999-4999-8999-999999999999',
            imageId: image.imageId,
            storagePath: image.storagePath,
            versionLabel: order.version_label,
          }
        : null;
    },
    snapshotFor: async path => {
      const index = images.findIndex(image => image.storagePath === path);
      counters.snapshotReads++;
      return index < 0
        ? null
        : options.snapshotAt
          ? options.snapshotAt(index)
          : snapshots[index];
    },
    download: async path => {
      assert(images.some(image => image.storagePath === path));
      counters.downloads++;
      return new Uint8Array(png);
    },
    currentOrder: async (id, orgId) => {
      counters.currentOrderReads++;
      return id === orderId && orgId === organizationId
        ? options.currentOrderAt?.() ?? order
        : null;
    },
    now: options.now ?? (() => '2026-11-23T00:10:00.000Z'),
    renewProof: async () => {
      counters.renewals++;
    },
    recordProof: async () => {
      counters.recordings++;
    },
    databaseWrite: async () => {
      counters.writes++;
    },
  };
  return { deps, counters };
}

function assertNoWrites(counters: Counters): void {
  assert.equal(counters.renewals, 0, 'Proof renewal calls must remain zero');
  assert.equal(counters.recordings, 0, 'Proof recording calls must remain zero');
  assert.equal(counters.writes, 0, 'database write calls must remain zero');
}

async function request(deps: WosV1ReadOnlyRequestDependencies) {
  return executeWosV1ReadOnlyRequest({
    authorization: 'Bearer valid-token',
    body,
    dependencies: deps,
  });
}

{
  const { deps, counters } = dependencies({
    currentImageAllowed: index => index !== 2,
  });
  const result = await request(deps);
  assert.equal(result.code, 'PROOF_METADATA_MISMATCH');
  assert.equal(counters.downloads, 0,
    'orphaned or non-CURRENT image must be rejected before download');
  assertNoWrites(counters);
}

{
  const { deps, counters } = dependencies({
    currentImageBaselineAt: (index, read) =>
      index === 0 && read === 2
        ? 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
        : '99999999-9999-4999-8999-999999999999',
  });
  const result = await request(deps);
  assert.equal(result.code, 'PROOF_CHANGED_DURING_VERIFICATION');
  assert.equal(counters.downloads, 1,
    'baseline replacement must be detected immediately after download');
  assertNoWrites(counters);
}

{
  const { deps, counters } = dependencies({
    proofAt: index => index === 0
      ? { ...proofs[0], expires_at: '2026-11-23T00:09:59.999999Z' }
      : proofs[index],
  });
  const result = await request(deps);
  assert.equal(result.code, 'PROOF_EXPIRED');
  assert.equal(counters.downloads, 0, 'first expired Proof must download zero');
  assertNoWrites(counters);
}

{
  const { deps, counters } = dependencies({
    proofAt: index => index === 3
      ? { ...proofs[3], expires_at: '2026-11-23T00:09:59.999999Z' }
      : proofs[index],
  });
  const result = await request(deps);
  assert.equal(result.code, 'PROOF_EXPIRED');
  assert.equal(counters.downloads, 0, 'fourth expired Proof must download zero');
  assertNoWrites(counters);
}

{
  const { deps, counters } = dependencies({
    proofAt: index => index === 3 ? null : proofs[index],
  });
  const result = await request(deps);
  assert.equal(result.code, 'PROOF_METADATA_MISMATCH');
  assert.equal(counters.downloads, 0, 'missing Proof must download zero');
  assertNoWrites(counters);
}

{
  const { deps, counters } = dependencies({
    snapshotAt: index => index === 3
      ? { ...snapshots[3], id: '89999999-9999-4999-8999-999999999999' }
      : snapshots[index],
  });
  const result = await request(deps);
  assert.equal(result.code, 'PROOF_METADATA_MISMATCH');
  assert.equal(
    counters.downloads,
    0,
    'Storage metadata mismatch must download zero',
  );
  assertNoWrites(counters);
}

{
  const { deps, counters } = dependencies();
  const result = await request(deps);
  assert.equal(result.status, 200);
  assert.equal(result.code, 'WOS_V1_READONLY_IMAGE_PROOF_VERIFIED');
  assert.equal(counters.downloads, 4, 'all four images may download only after preflight');
  assert.equal(counters.proofReads, 8);
  assert.equal(counters.snapshotReads, 8);
  assert.equal(counters.currentOrderReads, 2);
  assertNoWrites(counters);
  assert.equal(result.data?.reviewReady, false);
  assert.equal(result.data?.canStart, false);
}

{
  let nowCalls = 0;
  const { deps, counters } = dependencies({
    now: () => nowCalls++ < 4
      ? '2026-11-23T00:10:00.000Z'
      : '2026-11-23T01:00:00.000000Z',
  });
  const result = await request(deps);
  assert.equal(result.code, 'PROOF_EXPIRED');
  assert.equal(
    counters.downloads,
    1,
    'expiry after download begins must reject after the first byte read',
  );
  assertNoWrites(counters);
}

{
  const { deps, counters } = dependencies({
    currentOrderAt: () => ({ ...order, version: 12, version_label: 'QA-R7' }),
  });
  const result = await request(deps);
  assert.equal(result.code, 'ORDER_CHANGED_DURING_VERIFICATION');
  assert.equal(counters.downloads, 0, 'order switch before download must fail closed');
  assertNoWrites(counters);
}

{
  const { deps, counters } = dependencies({ readOnlyEnabled: false });
  const result = await request(deps);
  assert.equal(result.status, 503);
  assert.equal(result.code, 'READONLY_VERIFY_DISABLED');
  assert.equal(counters.downloads, 0, 'disabled runtime flag must download zero');
  assertNoWrites(counters);
}

console.log('WOS_V1_READONLY_REQUEST_ORDER=PASS');
