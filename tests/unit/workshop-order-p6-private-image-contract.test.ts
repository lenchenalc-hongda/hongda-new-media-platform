import assert from 'node:assert/strict';
import type {
  WosEntityType,
  WosReferenceImage,
  WosVisualBaseline,
} from '../../src/lib/workshop-orders/domain';
import {
  WOS_PRIVATE_IMAGE_MAX_BYTES,
  WOS_PRIVATE_IMAGE_PENDING_STATUS,
  buildWosPrivateImageObjectKey,
  evaluateWosPrivateImageGate,
  evaluateWosPrivateImageVersionContract,
  type WosPrivateImageContractInput,
  type WosPrivateImageIntent,
  type WosPrivateImageTrustedBinding,
} from '../../src/lib/workshop-orders/p6-private-image-contract';

const organizationId = '11111111-1111-4111-8111-111111111111';
const foreignOrganizationId = '22222222-2222-4222-8222-222222222222';
const profileId = '33333333-3333-4333-8333-333333333333';
const oldProfileId = '44444444-4444-4444-8444-444444444444';
const productionId = '55555555-5555-4555-8555-555555555555';
const samplingId = '66666666-6666-4666-8666-666666666666';
const oldImageId = '77777777-7777-4777-8777-777777777777';
const newImageId = '88888888-8888-4888-8888-888888888888';
const signedImageId = '99999999-9999-4999-8999-999999999999';
const baselineId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const replacementBaselineId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const fingerprint =
  'sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

type ContractInput = WosPrivateImageContractInput;

function entityIdFor(entityType: WosEntityType): string {
  return entityType === 'PRODUCTION_ORDER' ? productionId : samplingId;
}

function trustedFor(
  entityType: WosEntityType,
  overrides: Partial<WosPrivateImageTrustedBinding> = {},
): WosPrivateImageTrustedBinding {
  return {
    organizationId,
    entityType,
    entityId: entityIdFor(entityType),
    versionLabel: 'V2',
    profile: {
      profileId,
      organizationId,
      role: 'sales',
      isActive: true,
    },
    ...overrides,
  };
}

function intentFor(
  entityType: WosEntityType,
  overrides: Partial<WosPrivateImageIntent> = {},
): WosPrivateImageIntent {
  const id = overrides.id ?? newImageId;
  const versionLabel = overrides.versionLabel ?? 'V2';
  const category = overrides.category ?? 'PRODUCT';
  const fileName = overrides.fileName ?? 'reference.png';
  const entityId = overrides.entityId ?? entityIdFor(entityType);
  const organization = overrides.organizationId ?? organizationId;
  const storagePath = overrides.storagePath
    ?? buildWosPrivateImageObjectKey({
      organizationId: organization,
      entityType,
      entityId,
      category,
      versionLabel,
      imageId: id,
      fileName,
    });
  return {
    id,
    organizationId: organization,
    entityType,
    entityId,
    category,
    storageBucket: 'wos-private',
    storagePath,
    fileName,
    mimeType: 'image/png',
    versionLabel,
    imageStatus: 'READY',
    supersedesImageId: null,
    uploadedByProfileId: profileId,
    fileSize: 2048,
    uploadedAt: '2026-11-06T06:00:00.000Z',
    fingerprint,
    signedUrl: null,
    publicUrl: null,
    ...overrides,
  };
}

function imageFor(
  entityType: WosEntityType,
  overrides: Partial<WosPrivateImageIntent> = {},
): WosReferenceImage {
  const { fileSize: _fileSize, uploadedAt: _uploadedAt, ...image } =
    intentFor(entityType, overrides);
  return image;
}

function baselineFor(
  entityType: WosEntityType,
  overrides: Partial<WosVisualBaseline> = {},
): WosVisualBaseline {
  return {
    id: baselineId,
    organizationId,
    entityType,
    entityId: entityIdFor(entityType),
    versionLabel: 'V2',
    status: 'CURRENT',
    confirmedByOfficeProfileId: profileId,
    confirmedByWorkshopProfileId: oldProfileId,
    ...overrides,
  };
}

function contractFor(
  entityType: WosEntityType,
  overrides: Partial<ContractInput> = {},
): ContractInput {
  const candidate = overrides.candidate ?? intentFor(entityType);
  return {
    trustedBinding: trustedFor(entityType),
    candidate,
    existingImages: [],
    currentBaseline: baselineFor(entityType),
    baselineImageIds: [candidate.id],
    signedSampleRequired: false,
    action: 'START',
    ...overrides,
  };
}

function codes(value: ContractInput): readonly string[] {
  return evaluateWosPrivateImageVersionContract(value)
    .blockers.map((blocker) => blocker.code);
}

function assertBlocked(value: ContractInput, code: string): void {
  const decision = evaluateWosPrivateImageVersionContract(value);
  assert.equal(decision.status, 'REJECTED', `expected rejection for ${code}`);
  assert.equal(decision.offlineContractConsistent, false);
  assert.equal(decision.persisted, false);
  assert.equal(decision.uploadOccurred, false);
  assert.equal(decision.storagePolicyVerified, false);
  assert.equal(decision.storageAuthorizationVerified, false);
  assert.equal(decision.signedUrlIssued, false);
  assert.equal(decision.publicUrlIssued, false);
  assert(
    decision.blockers.some((blocker) => blocker.code === code),
    `expected ${code}; received ${codes(value).join(', ')}`,
  );
}

function assertPending(value: ContractInput): void {
  const decision = evaluateWosPrivateImageVersionContract(value);
  assert.equal(
    decision.status,
    WOS_PRIVATE_IMAGE_PENDING_STATUS,
    `expected pending; received ${decision.blockers
      .map((blocker) => blocker.code)
      .join(', ')}`,
  );
  assert.equal(decision.offlineContractConsistent, true);
  assert.equal(decision.persisted, false);
  assert.equal(decision.uploadOccurred, false);
  assert.equal(decision.storagePolicyVerified, false);
  assert.equal(decision.storageAuthorizationVerified, false);
  assert.equal(decision.signedUrlIssued, false);
  assert.equal(decision.publicUrlIssued, false);
  assert.equal(decision.serverVerification, 'REQUIRED');
  assert.deepEqual(decision.blockers, []);
  assert.equal(JSON.stringify(decision).includes('"persisted":true'), false);
  assert.equal(
    JSON.stringify(decision).includes('"signedUrlIssued":true'),
    false,
  );
  assert.equal(
    JSON.stringify(decision).includes(
      '"storageAuthorizationVerified":true',
    ),
    false,
  );
}

// Both business entry points retain independent identity and only obtain an
// unverified proposal, never persistence or storage authorization.
assertPending(contractFor('PRODUCTION_ORDER'));
assertPending(contractFor('SAMPLING_REQUEST'));
assertPending(contractFor('PRODUCTION_ORDER', {
  trustedBinding: trustedFor('PRODUCTION_ORDER', {
    profile: {
      profileId,
      organizationId,
      role: 'workshop',
      isActive: true,
    },
  }),
}));
assertPending(contractFor('SAMPLING_REQUEST', {
  trustedBinding: trustedFor('SAMPLING_REQUEST', {
    profile: {
      profileId,
      organizationId,
      role: 'technician',
      isActive: true,
    },
  }),
}));

// Fully self-consistent caller claims, including a plausible private bucket and
// signed URL, cannot become server evidence.
const forgedButConsistent = contractFor('PRODUCTION_ORDER', {
  candidate: intentFor('PRODUCTION_ORDER', {
    storageBucket: 'wos-private',
    signedUrl:
      'https://private.example.invalid/object/sign/wos-private?token=forged',
    fingerprint,
    claims: {
      persisted: true,
      uploadOccurred: true,
      signedUrlIssued: true,
      storageAuthorizationVerified: true,
      storagePolicyVerified: true,
    },
  }),
});
assertPending(JSON.parse(JSON.stringify(forgedButConsistent)) as ContractInput);

assertBlocked(contractFor('PRODUCTION_ORDER', {
  trustedBinding: trustedFor('PRODUCTION_ORDER', {
    organizationId: foreignOrganizationId,
    profile: {
      profileId,
      organizationId: foreignOrganizationId,
      role: 'sales',
      isActive: true,
    },
  }),
}), 'ORGANIZATION_MISMATCH');
assertBlocked(contractFor('PRODUCTION_ORDER', {
  candidate: intentFor('SAMPLING_REQUEST'),
}), 'ENTITY_TYPE_MISMATCH');
assertBlocked(contractFor('PRODUCTION_ORDER', {
  candidate: intentFor('PRODUCTION_ORDER', {
    uploadedByProfileId: oldProfileId,
  }),
}), 'PROFILE_ORGANIZATION_MISMATCH');
assertBlocked(contractFor('PRODUCTION_ORDER', {
  candidate: intentFor('PRODUCTION_ORDER', { versionLabel: 'V1' }),
}), 'VERSION_MISMATCH');
assertBlocked(contractFor('PRODUCTION_ORDER', {
  candidate: intentFor('PRODUCTION_ORDER', {
    category: 'SAMPLING_RESULT',
    fileName: 'result.png',
  }),
}), 'IMAGE_CATEGORY_ENTITY_MISMATCH');

assertBlocked(contractFor('PRODUCTION_ORDER', {
  trustedBinding: trustedFor('PRODUCTION_ORDER', {
    profile: {
      profileId,
      organizationId,
      role: 'customer',
      isActive: true,
    },
  }),
}), 'PROFILE_ROLE_NOT_ALLOWED');
assertBlocked(contractFor('PRODUCTION_ORDER', {
  trustedBinding: trustedFor('PRODUCTION_ORDER', {
    profile: {
      profileId,
      organizationId,
      role: 'sales',
      isActive: false,
    },
  }),
}), 'PROFILE_INACTIVE');
assertBlocked(contractFor('PRODUCTION_ORDER', {
  trustedBinding: trustedFor('PRODUCTION_ORDER', {
    profile: {
      profileId,
      organizationId: foreignOrganizationId,
      role: 'sales',
      isActive: true,
    },
  }),
}), 'PROFILE_ORGANIZATION_MISMATCH');

for (const status of ['UPLOADING', 'FAILED', 'QUARANTINED'] as const) {
  assertBlocked(contractFor('PRODUCTION_ORDER', {
    candidate: intentFor('PRODUCTION_ORDER', { imageStatus: status }),
  }), 'IMAGE_NOT_READY');
}

assertBlocked(contractFor('PRODUCTION_ORDER', {
  currentBaseline: baselineFor('PRODUCTION_ORDER', {
    status: 'SUPERSEDED',
  }),
}), 'BASELINE_NOT_CURRENT');
assertBlocked(contractFor('PRODUCTION_ORDER', {
  currentBaseline: baselineFor('SAMPLING_REQUEST'),
}), 'BASELINE_ENTITY_MISMATCH');
assertBlocked(contractFor('PRODUCTION_ORDER', {
  currentBaseline: baselineFor('PRODUCTION_ORDER', {
    versionLabel: 'V1',
  }),
}), 'BASELINE_VERSION_MISMATCH');

const staleId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const staleImage = imageFor('PRODUCTION_ORDER', {
  id: staleId,
  imageStatus: 'SUPERSEDED',
});
assertBlocked(contractFor('PRODUCTION_ORDER', {
  existingImages: [staleImage],
  baselineImageIds: [staleId],
}), 'BASELINE_IMAGE_SUPERSEDED');

const traversalPaths = [
  '../wos-private/reference.png',
  'organizations/../reference.png',
  '/organizations/private/reference.png',
  'organizations/private\\reference.png',
  'https://public.example.invalid/reference.png',
  'organizations/private/reference.png?token=reusable',
];
for (const storagePath of traversalPaths) {
  assertBlocked(contractFor('PRODUCTION_ORDER', {
    candidate: intentFor('PRODUCTION_ORDER', { storagePath }),
  }), storagePath.includes('https://')
    ? 'PUBLIC_URL_NOT_ALLOWED'
    : 'INVALID_OBJECT_KEY');
}

assertBlocked(contractFor('PRODUCTION_ORDER', {
  candidate: intentFor('PRODUCTION_ORDER', {
    storageBucket: 'public-reference-images',
  }),
}), 'INVALID_IMAGE_FILE');
assertBlocked(contractFor('PRODUCTION_ORDER', {
  candidate: intentFor('PRODUCTION_ORDER', {
    publicUrl: 'https://public.example.invalid/reference.png',
  }),
}), 'PUBLIC_URL_NOT_ALLOWED');
for (const writeInstruction of [
  { upsert: true },
  { overwrite: true },
  { upsert: 'false' },
  { overwrite: 1 },
  { upsert: null },
  { mode: 'UPSERT' },
  { mode: ' OverWrite ' },
  { mode: 'up_sert' },
] as const) {
  assertBlocked(contractFor('PRODUCTION_ORDER', {
    candidate: intentFor('PRODUCTION_ORDER', writeInstruction),
  }), 'UPSERT_OR_OVERWRITE_NOT_ALLOWED');
}
const alternateFlagCandidate = {
  ...intentFor('PRODUCTION_ORDER'),
  UPSERT: false,
} as unknown as WosPrivateImageIntent;
assertBlocked(contractFor('PRODUCTION_ORDER', {
  candidate: alternateFlagCandidate,
}), 'UPSERT_OR_OVERWRITE_NOT_ALLOWED');
assertPending(contractFor('PRODUCTION_ORDER', {
  candidate: intentFor('PRODUCTION_ORDER', {
    upsert: false,
    overwrite: false,
    mode: 'append',
  }),
}));

for (const candidate of [
  intentFor('PRODUCTION_ORDER', { mimeType: 'image/svg+xml', fileName: 'x.svg' }),
  intentFor('PRODUCTION_ORDER', { fileSize: 0 }),
  intentFor('PRODUCTION_ORDER', {
    fileSize: WOS_PRIVATE_IMAGE_MAX_BYTES + 1,
  }),
  intentFor('PRODUCTION_ORDER', { fileName: 'reference.jpg' }),
]) {
  assertBlocked(contractFor('PRODUCTION_ORDER', { candidate }), 'INVALID_IMAGE_FILE');
}

const duplicateIdInput = contractFor('PRODUCTION_ORDER');
assertBlocked({
  ...duplicateIdInput,
  existingImages: [imageFor('PRODUCTION_ORDER')],
}, 'DUPLICATE_IMAGE_ID');
const duplicateKeyCandidate = intentFor('PRODUCTION_ORDER');
assertBlocked(contractFor('PRODUCTION_ORDER', {
  candidate: duplicateKeyCandidate,
  existingImages: [imageFor('PRODUCTION_ORDER', {
    id: oldImageId,
    storagePath: duplicateKeyCandidate.storagePath,
  })],
}), 'DUPLICATE_OBJECT_KEY');

const replayImage = imageFor('PRODUCTION_ORDER', {
  id: newImageId,
  versionLabel: 'V2',
});
const selfConsistentReplay = contractFor('PRODUCTION_ORDER', {
  existingImages: [replayImage],
  baselineImageIds: [newImageId],
  replay: {
    imageId: newImageId,
    objectKey: replayImage.storagePath,
    fingerprint,
  },
});
assertBlocked(selfConsistentReplay, 'REPLAY_MISMATCH');
assertBlocked(
  JSON.parse(JSON.stringify(selfConsistentReplay)) as ContractInput,
  'REPLAY_MISMATCH',
);
assertBlocked(contractFor('PRODUCTION_ORDER', {
  existingImages: [replayImage],
  replay: {
    imageId: newImageId,
    objectKey: replayImage.storagePath,
    fingerprint:
      'sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
  },
}), 'REPLAY_MISMATCH');

const oldImage = imageFor('PRODUCTION_ORDER', {
  id: oldImageId,
  versionLabel: 'V1',
  fileName: 'old.png',
});
const supersedingCandidate = intentFor('PRODUCTION_ORDER', {
  supersedesImageId: oldImageId,
});
const superseding = evaluateWosPrivateImageVersionContract(
  contractFor('PRODUCTION_ORDER', {
    candidate: supersedingCandidate,
    existingImages: [oldImage],
    baselineImageIds: [newImageId],
  }),
);
assert.equal(superseding.status, WOS_PRIVATE_IMAGE_PENDING_STATUS);
assert.equal(
  superseding.proposedImages?.find((image) => image.id === oldImageId)
    ?.imageStatus,
  'SUPERSEDED',
);
assert.equal(
  superseding.proposedImages?.find((image) => image.id === newImageId)
    ?.imageStatus,
  'READY',
);

const backwardV3ToV2Target = imageFor('PRODUCTION_ORDER', {
  id: oldImageId,
  versionLabel: 'V3',
  fileName: 'old-v3.png',
});
assertBlocked(contractFor('PRODUCTION_ORDER', {
  candidate: intentFor('PRODUCTION_ORDER', {
    supersedesImageId: oldImageId,
  }),
  existingImages: [backwardV3ToV2Target],
}), 'SUPERSEDE_VERSION_MISMATCH');

const backwardV2ToV1Target = imageFor('PRODUCTION_ORDER', {
  id: oldImageId,
  versionLabel: 'V2',
  fileName: 'old-v2.png',
});
assertBlocked(contractFor('PRODUCTION_ORDER', {
  trustedBinding: trustedFor('PRODUCTION_ORDER', { versionLabel: 'V1' }),
  candidate: intentFor('PRODUCTION_ORDER', {
    versionLabel: 'V1',
    supersedesImageId: oldImageId,
  }),
  currentBaseline: baselineFor('PRODUCTION_ORDER', {
    versionLabel: 'V1',
  }),
  existingImages: [backwardV2ToV1Target],
  baselineImageIds: [newImageId],
}), 'SUPERSEDE_VERSION_MISMATCH');

for (const malformedTargetVersion of ['V02', 'V2-B', 'V0', 'legacy']) {
  assertBlocked(contractFor('PRODUCTION_ORDER', {
    candidate: intentFor('PRODUCTION_ORDER', {
      supersedesImageId: oldImageId,
    }),
    existingImages: [imageFor('PRODUCTION_ORDER', {
      id: oldImageId,
      versionLabel: malformedTargetVersion,
      fileName: 'malformed-version.png',
    })],
  }), 'SUPERSEDE_VERSION_MISMATCH');
}
assertBlocked(contractFor('PRODUCTION_ORDER', {
  trustedBinding: trustedFor('PRODUCTION_ORDER', { versionLabel: 'V02' }),
  candidate: intentFor('PRODUCTION_ORDER', { versionLabel: 'V02' }),
  currentBaseline: baselineFor('PRODUCTION_ORDER', {
    versionLabel: 'V02',
  }),
  baselineImageIds: [newImageId],
}), 'VERSION_MISMATCH');

const sameVersionOldImage = imageFor('PRODUCTION_ORDER', {
  id: oldImageId,
  versionLabel: 'V2',
  fileName: 'same-version-old.png',
});
assertBlocked(contractFor('PRODUCTION_ORDER', {
  candidate: intentFor('PRODUCTION_ORDER', {
    supersedesImageId: oldImageId,
  }),
  existingImages: [sameVersionOldImage],
}), 'SUPERSEDE_VERSION_MISMATCH');

const replacement = evaluateWosPrivateImageVersionContract(
  contractFor('PRODUCTION_ORDER', {
    replacementBaseline: baselineFor('PRODUCTION_ORDER', {
      id: replacementBaselineId,
      status: 'DRAFT',
    }),
  }),
);
assert.equal(replacement.status, WOS_PRIVATE_IMAGE_PENDING_STATUS);
assert.equal(replacement.baselineReplacement?.previousBaseline.status, 'SUPERSEDED');
assert.equal(replacement.baselineReplacement?.nextBaseline.status, 'CURRENT');
assert.equal(
  replacement.baselineReplacement?.nextBaseline.confirmedByWorkshopProfileId,
  null,
);

const signedSample = imageFor('SAMPLING_REQUEST', {
  id: signedImageId,
  category: 'SIGNED_SAMPLE',
  fileName: 'signed.png',
});
assertPending(contractFor('SAMPLING_REQUEST', {
  candidate: intentFor('SAMPLING_REQUEST', {
    id: signedImageId,
    category: 'SIGNED_SAMPLE',
    fileName: 'signed.png',
  }),
  baselineImageIds: [signedImageId],
  signedSampleRequired: true,
}));
assertBlocked(contractFor('SAMPLING_REQUEST', {
  existingImages: [{ ...signedSample, imageStatus: 'QUARANTINED' }],
  baselineImageIds: [signedImageId],
  signedSampleRequired: true,
}), 'BASELINE_IMAGE_NOT_READY');

for (const stage of ['PREVIEW', 'START'] as const) {
  const images = [{
    ...imageFor('PRODUCTION_ORDER', {
      id: newImageId,
      imageStatus: 'UPLOADING',
    }),
  }];
  const gate = evaluateWosPrivateImageGate({
    trustedBinding: trustedFor('PRODUCTION_ORDER'),
    currentBaseline: baselineFor('PRODUCTION_ORDER'),
    images,
    baselineImageIds: [newImageId],
    stage,
  });
  assert.equal(gate.status, 'BLOCKED');
  assert.equal(gate.gateSatisfied, false);
  assert.equal(gate.serverReadinessVerified, false);
  assert.equal(gate.storageAuthorizationVerified, false);
  assert.equal(gate.persisted, false);
  assert.equal(gate.signedUrlIssued, false);
  assert(gate.blockers.some(
    (blocker) => blocker.code === 'BASELINE_IMAGE_NOT_READY',
  ));
}

const unsafeKeyCalls = [
  () => buildWosPrivateImageObjectKey({
    organizationId: '../foreign',
    entityType: 'PRODUCTION_ORDER',
    entityId: productionId,
    category: 'PRODUCT',
    versionLabel: 'V2',
    imageId: newImageId,
    fileName: 'reference.png',
  }),
  () => buildWosPrivateImageObjectKey({
    organizationId,
    entityType: 'PRODUCTION_ORDER',
    entityId: productionId,
    category: 'PRODUCT',
    versionLabel: 'V2/../../V1',
    imageId: newImageId,
    fileName: 'reference.png',
  }),
  () => buildWosPrivateImageObjectKey({
    organizationId,
    entityType: 'PRODUCTION_ORDER',
    entityId: productionId,
    category: 'PRODUCT',
    versionLabel: 'V2',
    imageId: newImageId,
    fileName: '../reference.png',
  }),
];
for (const unsafeCall of unsafeKeyCalls) {
  assert.throws(unsafeCall, /INVALID_PRIVATE_IMAGE/);
}

console.log('workshop-order-p6-private-image-contract.test.ts: PASS');
