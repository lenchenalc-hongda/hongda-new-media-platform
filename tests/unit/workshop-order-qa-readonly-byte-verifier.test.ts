import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  evaluateReadOnlyRequestGuard,
  evaluateWosV1ReadOnlyAccess,
  orderSnapshotStable,
  parseWosV1ReadOnlyVerificationBody,
  proofSnapshotStable,
  readOnlyOriginAllowed,
  safeReadOnlyVerification,
  verifyWosV1ReadOnlyImage,
  type WosV1ReadOnlyImage,
  type WosV1ReadOnlyOrder,
  type WosV1ReadOnlyProof,
  type WosV1ReadOnlyProfile,
} from '../../supabase/functions/wos-v1-verify-image-readonly/core';

const organizationId = '11111111-1111-4111-8111-111111111111';
const foreignOrganizationId = '22222222-2222-4222-8222-222222222222';
const orderId = '33333333-3333-4333-8333-333333333333';
const userId = '44444444-4444-4444-8444-444444444444';
const profileId = '55555555-5555-4555-8555-555555555555';
const objectId = '66666666-6666-4666-8666-666666666666';
const imageIds = [
  '71111111-1111-4111-8111-111111111111',
  '72222222-2222-4222-8222-222222222222',
  '73333333-3333-4333-8333-333333333333',
  '74444444-4444-4444-8444-444444444444',
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

const pathForVersion = (index: number, label: string) =>
  `organizations/${organizationId}/wos/production-order/${orderId}/images/`
  + `${slugs[index]}/versions/${label}/${imageIds[index]}/source.png`;
const pathFor = (index: number) => pathForVersion(index, 'QA-R6');

const images = categories.map((category, index) => ({
  category,
  imageId: imageIds[index],
  sha256: pngSha,
  storagePath: pathFor(index),
})) satisfies WosV1ReadOnlyImage[];

const body = parseWosV1ReadOnlyVerificationBody({
  expectedVersion: 11,
  expectedVersionLabel: 'QA-R6',
  images,
  orderId,
});
assert(body, 'exact four-image body must parse');
assert.equal(parseWosV1ReadOnlyVerificationBody({
  expectedVersion: 11,
  expectedVersionLabel: 'QA-R6',
  images: [...images.slice(0, 3), { ...images[3], category: 'PRODUCT' }],
  orderId,
}), null, 'duplicate category and missing category must fail closed');
assert.equal(parseWosV1ReadOnlyVerificationBody({
  expectedVersion: 11,
  expectedVersionLabel: 'QA-R6',
  images: [...images, { ...images[0], imageId: '75555555-5555-4555-8555-555555555555' }],
  orderId,
}), null, 'a fifth image must fail closed');
assert.equal(parseWosV1ReadOnlyVerificationBody({
  expectedVersion: 11,
  expectedVersionLabel: 'V11',
  images,
  orderId,
}), null, 'non-QA revision label must fail closed');
assert.equal(parseWosV1ReadOnlyVerificationBody({
  expectedVersion: 11,
  expectedVersionLabel: 'QA-R6',
  images: [images[0], images[0], images[2], images[3]],
  orderId,
}), null, 'duplicate reference image ID must fail closed');

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
const accessBase = {
  readOnlyEnabled: true,
  qaRuntimeBound: true,
  profile,
  order,
  expectedVersion: 11,
  expectedVersionLabel: 'QA-R6',
};
assert.equal(evaluateWosV1ReadOnlyAccess(accessBase).code, 'ALLOWED');
assert.equal(evaluateWosV1ReadOnlyAccess({
  ...accessBase,
  profile: { ...profile, role: 'operator' },
}).code, 'ROLE_FORBIDDEN');
assert.equal(evaluateWosV1ReadOnlyAccess({
  ...accessBase,
  profile: { ...profile, role: 'viewer' },
}).code, 'ROLE_FORBIDDEN');
assert.equal(evaluateWosV1ReadOnlyAccess({
  ...accessBase,
  profile: { ...profile, role: 'sales' },
}).code, 'ROLE_FORBIDDEN');
assert.equal(evaluateWosV1ReadOnlyAccess({
  ...accessBase,
  order: { ...order, organization_id: foreignOrganizationId },
}).code, 'ORGANIZATION_DENIED');
assert.equal(evaluateWosV1ReadOnlyAccess({
  ...accessBase,
  order: { ...order, version: 10 },
}).code, 'ORDER_VERSION_MISMATCH');
assert.equal(evaluateWosV1ReadOnlyAccess({
  ...accessBase,
  order: { ...order, version_label: 'QA-R7' },
}).code, 'ORDER_VERSION_MISMATCH');
assert.equal(evaluateWosV1ReadOnlyAccess({
  ...accessBase,
  order: { ...order, workflow_status: 'SUBMITTED' },
}).code, 'STATUS_DENIED');
assert.equal(evaluateWosV1ReadOnlyAccess({
  ...accessBase,
  readOnlyEnabled: false,
}).code, 'READONLY_VERIFY_DISABLED');
assert.equal(evaluateWosV1ReadOnlyAccess({
  ...accessBase,
  qaRuntimeBound: false,
}).code, 'RUNTIME_DENIED');
assert.equal(readOnlyOriginAllowed(
  'https://qa-preview.example.com',
  ['https://qa-preview.example.com'],
), true);
assert.equal(readOnlyOriginAllowed(
  'https://evil.example.com',
  ['https://qa-preview.example.com'],
), false);
assert.equal(readOnlyOriginAllowed(null, ['https://qa-preview.example.com']), false);
const requestBase = {
  origin: 'https://qa-preview.example.com',
  allowedOrigins: ['https://qa-preview.example.com'],
  readOnlyEnabled: true,
  qaRuntimeBound: true,
  contentType: 'application/json',
  authorization: 'Bearer test-token',
};
assert.equal(evaluateReadOnlyRequestGuard(requestBase).code, 'ALLOWED');
assert.equal(evaluateReadOnlyRequestGuard({
  ...requestBase,
  origin: 'https://evil.example.com',
}).code, 'WOS_V1_READONLY_ORIGIN_DENIED');
assert.equal(evaluateReadOnlyRequestGuard({
  ...requestBase,
  readOnlyEnabled: false,
}).code, 'WOS_V1_READONLY_VERIFY_DISABLED');
assert.equal(evaluateReadOnlyRequestGuard({
  ...requestBase,
  qaRuntimeBound: false,
}).code, 'WOS_V1_READONLY_RUNTIME_DENIED');
assert.equal(evaluateReadOnlyRequestGuard({
  ...requestBase,
  contentType: 'text/plain',
}).code, 'INVALID_INPUT');
assert.equal(evaluateReadOnlyRequestGuard({
  ...requestBase,
  authorization: null,
}).code, 'UNAUTHENTICATED');
assert.equal(orderSnapshotStable(order, { ...order }), true);
assert.equal(orderSnapshotStable(order, {
  ...order,
  version: 12,
  version_label: 'QA-R7',
}), false);

const image = images[0];
const proof = {
  image_id: image.imageId,
  organization_id: organizationId,
  order_id: orderId,
  actor_user_id: userId,
  storage_bucket: 'wos-private',
  storage_path: image.storagePath,
  storage_object_id: objectId,
  storage_object_version: 'object-version-1',
  storage_object_updated_at: '2026-11-23T00:00:00.000Z',
  verified_sha256: pngSha,
  verified_at: '2026-11-23T00:00:00.000Z',
  expires_at: '2026-11-23T01:00:00.000Z',
} satisfies WosV1ReadOnlyProof;
const snapshot = {
  id: objectId,
  ownerId: userId,
  version: 'object-version-1',
  updatedAt: '2026-11-23T00:00:00.000Z',
  mimeType: 'image/png',
  byteSize: String(png.length),
};
const verificationBase = {
  image,
  order,
  firstProof: proof,
  secondProof: proof,
  firstSnapshot: snapshot,
  secondSnapshot: snapshot,
  bytes: png,
  firstCheckedAt: '2026-11-23T00:10:00.000Z',
  secondCheckedAt: '2026-11-23T00:10:01.000Z',
};
assert.equal((await verifyWosV1ReadOnlyImage(verificationBase)).code, 'VERIFIED');
assert.equal(proofSnapshotStable(proof, proof), true);
for (const [index, currentImage] of images.entries()) {
  const currentProof = {
    ...proof,
    image_id: currentImage.imageId,
    storage_path: currentImage.storagePath,
  };
  assert.equal((await verifyWosV1ReadOnlyImage({
    ...verificationBase,
    image: currentImage,
    firstProof: currentProof,
    secondProof: currentProof,
  })).code, 'VERIFIED', `current-version image ${index + 1} must verify`);
}
assert.deepEqual(safeReadOnlyVerification({
  order,
  categories,
}), {
  orderId,
  orderVersion: 11,
  versionLabel: 'QA-R6',
  imageCategories: categories,
  metadataSnapshotStable: true,
  contentSha256Verified: true,
  byteVerificationPassed: true,
  reviewReady: false,
  canStart: false,
});

const tampered = Buffer.from(png);
tampered[tampered.length - 5] ^= 1;
assert.equal((await verifyWosV1ReadOnlyImage({
  ...verificationBase,
  bytes: tampered,
})).code, 'PNG_OR_SHA256_VERIFICATION_FAILED');
assert.equal((await verifyWosV1ReadOnlyImage({
  ...verificationBase,
  secondSnapshot: { ...snapshot, version: 'object-version-2' },
})).code, 'OBJECT_CHANGED_DURING_VERIFICATION');
assert.equal((await verifyWosV1ReadOnlyImage({
  ...verificationBase,
  secondProof: { ...proof, verified_sha256: '0'.repeat(64) },
})).code, 'PROOF_METADATA_MISMATCH');
assert.equal((await verifyWosV1ReadOnlyImage({
  ...verificationBase,
  secondCheckedAt: '2026-11-23T01:00:00.000Z',
})).code, 'PROOF_EXPIRED');
assert.equal((await verifyWosV1ReadOnlyImage({
  ...verificationBase,
  image: { ...image, storagePath: pathFor(1) },
})).code, 'PROOF_METADATA_MISMATCH');
assert.equal((await verifyWosV1ReadOnlyImage({
  ...verificationBase,
  bytes: png.subarray(0, png.length - 1),
})).code, 'PRIVATE_BINARY_SIZE_MISMATCH');

const microProof = {
  ...proof,
  storage_object_updated_at: '2026-11-23T00:00:00.123456Z',
  verified_at: '2026-11-23T00:00:00.123456Z',
} satisfies WosV1ReadOnlyProof;
const microSnapshot = {
  ...snapshot,
  updatedAt: '2026-11-23T00:00:00.123456Z',
};
const microVerification = {
  ...verificationBase,
  firstProof: microProof,
  secondProof: microProof,
  firstSnapshot: microSnapshot,
  secondSnapshot: microSnapshot,
};
assert.equal(
  (await verifyWosV1ReadOnlyImage(microVerification)).code,
  'VERIFIED',
  'the same microsecond identity must verify',
);
assert.equal(
  (await verifyWosV1ReadOnlyImage({
    ...microVerification,
    firstSnapshot: {
      ...microSnapshot,
      updatedAt: '2026-11-23T00:00:00.123457Z',
    },
    secondSnapshot: {
      ...microSnapshot,
      updatedAt: '2026-11-23T00:00:00.123457Z',
    },
  })).code,
  'PROOF_METADATA_MISMATCH',
  'different microseconds in the same millisecond must fail closed',
);
assert.equal(
  (await verifyWosV1ReadOnlyImage({
    ...microVerification,
    firstProof: {
      ...microProof,
      storage_object_updated_at: '2026-11-23T08:00:00.123456+08:00',
      verified_at: '2026-11-23T08:00:00.123456+08:00',
      expires_at: '2026-11-23T09:00:00.123456+08:00',
    },
    secondProof: {
      ...microProof,
      storage_object_updated_at: '2026-11-23T00:00:00.123456Z',
      verified_at: '2026-11-23T00:00:00.123456Z',
      expires_at: '2026-11-23T01:00:00.123456Z',
    },
  })).code,
  'VERIFIED',
  'equivalent UTC offsets must normalize to the same microsecond instant',
);
assert.equal(proofSnapshotStable(
  {
    ...microProof,
    storage_object_updated_at: '2026-11-23T08:00:00.123456+08:00',
    verified_at: '2026-11-23T08:00:00.123456+08:00',
    expires_at: '2026-11-23T09:00:00.123456+08:00',
  },
  {
    ...microProof,
    storage_object_updated_at: '2026-11-23T00:00:00.123456Z',
    verified_at: '2026-11-23T00:00:00.123456Z',
    expires_at: '2026-11-23T01:00:00.123456Z',
  },
), true, 'equivalent timezone snapshots must normalize consistently');
assert.equal(
  (await verifyWosV1ReadOnlyImage({
    ...microVerification,
    secondSnapshot: {
      ...microSnapshot,
      updatedAt: '2026-11-23T00:00:00.123457Z',
    },
  })).code,
  'OBJECT_CHANGED_DURING_VERIFICATION',
  'Storage update without a matching Proof update during verification must fail closed',
);

const boundaryProof = {
  ...proof,
  expires_at: '2026-11-23T00:10:01.123456Z',
} satisfies WosV1ReadOnlyProof;
assert.equal(
  (await verifyWosV1ReadOnlyImage({
    ...verificationBase,
    firstProof: boundaryProof,
    secondProof: boundaryProof,
    secondCheckedAt: '2026-11-23T00:10:01.123456Z',
  })).code,
  'PROOF_EXPIRED',
  'the exact expires_at microsecond must fail closed',
);
assert.equal(
  (await verifyWosV1ReadOnlyImage({
    ...verificationBase,
    firstProof: boundaryProof,
    secondProof: boundaryProof,
    secondCheckedAt: '2026-11-23T00:10:01.123455Z',
  })).code,
  'VERIFIED',
  'one microsecond before expiry must remain valid',
);
assert.equal(
  (await verifyWosV1ReadOnlyImage({
    ...verificationBase,
    firstProof: boundaryProof,
    secondProof: boundaryProof,
    firstCheckedAt: '2026-11-23T00:10:01.123Z',
    secondCheckedAt: '2026-11-23T00:10:01.123Z',
  })).code,
  'PROOF_EXPIRED',
  'a millisecond-only checkedAt must not accept a Proof expiring inside that millisecond',
);

const staleVersionImage = {
  ...images[1],
  storagePath: pathForVersion(1, 'QA-R5'),
} satisfies WosV1ReadOnlyImage;
const staleVersionProof = {
  ...proof,
  image_id: staleVersionImage.imageId,
  storage_path: staleVersionImage.storagePath,
} satisfies WosV1ReadOnlyProof;
assert.equal((await verifyWosV1ReadOnlyImage({
  ...verificationBase,
  image: staleVersionImage,
  firstProof: staleVersionProof,
  secondProof: staleVersionProof,
})).code, 'PROOF_METADATA_MISMATCH',
'one image from another order version must fail the four-image consistency contract');
assert.equal(orderSnapshotStable(order, {
  ...order,
  version: 12,
  version_label: 'QA-R7',
}), false, 'an order version switch during verification must fail closed');

const source = readFileSync(
  'supabase/functions/wos-v1-verify-image-readonly/index.ts',
  'utf8',
);
assert(!source.includes('wos_v1_renew_expired_image_proof'));
assert(!source.includes("rpc('wos_p7_record_trusted_image_proof'"));
const databaseMutations = [
  /\.from\([^)]*\)\s*\.insert\(/g,
  /\.from\([^)]*\)\s*\.update\(/g,
  /\.from\([^)]*\)\s*\.delete\(/g,
  /\.from\([^)]*\)\s*\.upsert\(/g,
];
for (const mutation of databaseMutations) {
  assert.equal(
    source.match(mutation)?.length ?? 0,
    0,
    'read-only verifier must contain no database table mutation',
  );
}
const rpcNames = [...source.matchAll(/\.rpc\(\s*['"]([^'"]+)['"]/g)]
  .map(match => match[1]);
assert.deepEqual(
  rpcNames,
  ['wos_p7_service_storage_snapshot'],
  'the only database RPC call must be the read-only Storage snapshot',
);
assert(source.includes("WOS_V1_EDGE_READONLY_VERIFY_ENABLED"));
assert(source.includes("const QA_REF = 'xulmpqaknlwqqculbsek'"));

console.log('WOS_V1_READONLY_BYTE_VERIFIER=PASS');
