import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  appendImageVersion,
  buildImageVersionObjectKey,
  buildWorkshopInbox,
  persistOfficeSubmission,
  projectCurrentImageVersions,
  WOS_IMAGE_VERSION_CATEGORIES,
  WOS_PRIVATE_IMAGE_BUCKET,
  type WosImageVersionCategory,
  type WosImageVersionMetadata,
  type WosOfficeSubmissionCommand,
  type WosOfficeSubmissionRecord,
  type WosProfileSnapshot,
  type WosReadinessEvidenceSnapshot,
  type WosSourceSnapshot,
  type WosTechnicalAttemptSnapshot,
} from '../../src/lib/workshop-orders/nonproduction-persistence';

const ids = {
  organizationA: '00000000-0000-4000-8000-000000000101',
  organizationB: '00000000-0000-4000-8000-000000000102',
  productionOrder: '00000000-0000-4000-8000-000000000111',
  samplingRequest: '00000000-0000-4000-8000-000000000112',
  projectOwner: '00000000-0000-4000-8000-000000000121',
  submitter: '00000000-0000-4000-8000-000000000122',
  foreignOwner: '00000000-0000-4000-8000-000000000123',
  submissionProduction: '00000000-0000-4000-8000-000000000141',
  submissionSampling: '00000000-0000-4000-8000-000000000142',
  technicalAttempt: '00000000-0000-4000-8000-000000000151',
  otherAttempt: '00000000-0000-4000-8000-000000000152',
} as const;

const projectOwner: WosProfileSnapshot = {
  profileId: ids.projectOwner,
  organizationId: ids.organizationA,
  isActive: true,
  role: 'sales',
};

const submitter: WosProfileSnapshot = {
  profileId: ids.submitter,
  organizationId: ids.organizationA,
  isActive: true,
  role: 'manager',
};

const foreignOwner: WosProfileSnapshot = {
  profileId: ids.foreignOwner,
  organizationId: ids.organizationB,
  isActive: true,
  role: 'sales',
};

const productionSource: WosSourceSnapshot = {
  entityType: 'PRODUCTION_ORDER',
  sourceId: ids.productionOrder,
  organizationId: ids.organizationA,
  revision: 1,
  versionLabel: 'V1',
  projectOwnerProfileId: ids.projectOwner,
  workflowStatus: 'SUBMITTED',
};

const samplingSource: WosSourceSnapshot = {
  entityType: 'SAMPLING_REQUEST',
  sourceId: ids.samplingRequest,
  organizationId: ids.organizationA,
  revision: 1,
  versionLabel: 'V1',
  projectOwnerProfileId: ids.projectOwner,
  workflowStatus: 'SUBMITTED',
};

function evidenceFor(
  source: WosSourceSnapshot,
  overrides: Partial<WosReadinessEvidenceSnapshot> = {},
): WosReadinessEvidenceSnapshot {
  return {
    evidenceId:
      `00000000-0000-4000-8000-000000000${
        source.entityType === 'PRODUCTION_ORDER' ? '13' : '23'
      }${source.revision}`,
    evidenceType: 'OFFICE_COMPLETENESS',
    organizationId: source.organizationId,
    entityType: source.entityType,
    sourceId: source.sourceId,
    sourceRevision: source.revision,
    sourceVersionLabel: source.versionLabel,
    confirmedByProfileId: ids.projectOwner,
    confirmedAt: '2026-10-27T08:00:00+08:00',
    immutable: true,
    ...overrides,
  };
}

function submissionFor(
  source: WosSourceSnapshot,
  overrides: Partial<WosOfficeSubmissionCommand> = {},
): WosOfficeSubmissionCommand {
  return {
    submissionId:
      source.entityType === 'PRODUCTION_ORDER'
        ? ids.submissionProduction
        : ids.submissionSampling,
    submissionKey: `${source.entityType.toLowerCase()}-submit-001`,
    organizationId: source.organizationId,
    entityType: source.entityType,
    sourceId: source.sourceId,
    sourceRevision: source.revision,
    sourceVersionLabel: source.versionLabel,
    projectOwnerProfileId: source.projectOwnerProfileId,
    submittedByProfileId: ids.submitter,
    readinessEvidence: evidenceFor(source),
    submittedAt: '2026-10-27T08:30:00+08:00',
    ...overrides,
  };
}

function persist(
  submissions: readonly WosOfficeSubmissionRecord[],
  source: WosSourceSnapshot,
  overrides: Partial<WosOfficeSubmissionCommand> = {},
  profiles: {
    projectOwnerProfile?: WosProfileSnapshot;
    submittedByProfile?: WosProfileSnapshot;
    readinessConfirmerProfile?: WosProfileSnapshot;
  } = {},
) {
  return persistOfficeSubmission({
    submissions,
    command: submissionFor(source, overrides),
    source,
    projectOwnerProfile: profiles.projectOwnerProfile ?? projectOwner,
    submittedByProfile: profiles.submittedByProfile ?? submitter,
    readinessConfirmerProfile:
      profiles.readinessConfirmerProfile ?? projectOwner,
  });
}

const firstProduction = persist([], productionSource);
assert.equal(firstProduction.status, 'CREATED');
assert.equal(firstProduction.submissions.length, 1);
assert.equal(firstProduction.submission?.sourceRevision, 1);
assert.equal(firstProduction.submission?.projectOwnerProfileId, ids.projectOwner);
assert.equal(firstProduction.submission?.readinessEvidence.immutable, true);
assert(Object.isFrozen(firstProduction.submission));
assert(Object.isFrozen(firstProduction.submission?.readinessEvidence));

const replay = persist(firstProduction.submissions, productionSource, {
  submissionId: '00000000-0000-4000-8000-000000000199',
  submittedAt: '2026-10-27T08:31:00+08:00',
});
assert.equal(replay.status, 'REPLAYED');
assert.equal(replay.submissions.length, 1);
assert.equal(replay.submission?.submissionId, ids.submissionProduction);
assert.equal(replay.submissions, firstProduction.submissions);

const idempotencyConflict = persist(firstProduction.submissions, productionSource, {
  readinessEvidence: {
    ...evidenceFor(productionSource),
    evidenceId: '00000000-0000-4000-8000-000000000198',
  },
});
assert.equal(idempotencyConflict.status, 'REJECTED');
assert(
  idempotencyConflict.blockers.some(
    (blocker) => blocker.code === 'IDEMPOTENCY_KEY_CONFLICT',
  ),
);

const duplicateVersion = persist(firstProduction.submissions, productionSource, {
  submissionId: '00000000-0000-4000-8000-000000000197',
  submissionKey: 'production-submit-another-key',
  readinessEvidence: {
    ...evidenceFor(productionSource),
    evidenceId: '00000000-0000-4000-8000-000000000196',
  },
});
assert.equal(duplicateVersion.status, 'REJECTED');
assert(
  duplicateVersion.blockers.some(
    (blocker) => blocker.code === 'SUBMISSION_VERSION_DUPLICATE',
  ),
);

const missingEvidence = persist([], productionSource, {
  readinessEvidence:
    undefined as unknown as WosReadinessEvidenceSnapshot,
});
assert.equal(missingEvidence.status, 'REJECTED');
assert(
  missingEvidence.blockers.some(
    (blocker) => blocker.code === 'READINESS_EVIDENCE_MISSING',
  ),
);

const staleEvidence = persist([], productionSource, {
  readinessEvidence: evidenceFor(productionSource, {
    sourceRevision: 0,
    sourceVersionLabel: 'V0',
  }),
});
assert.equal(staleEvidence.status, 'REJECTED');
assert(
  staleEvidence.blockers.some(
    (blocker) => blocker.code === 'READINESS_EVIDENCE_VERSION_MISMATCH',
  ),
);

const staleSource = persist([], productionSource, {
  sourceRevision: 2,
  sourceVersionLabel: 'V2',
});
assert.equal(staleSource.status, 'REJECTED');
assert(
  staleSource.blockers.some(
    (blocker) => blocker.code === 'STALE_SOURCE_VERSION',
  ),
);

const wrongOwner = persist(
  [],
  productionSource,
  {},
  {
    projectOwnerProfile: foreignOwner,
  },
);
assert.equal(wrongOwner.status, 'REJECTED');
assert(
  wrongOwner.blockers.some(
    (blocker) => blocker.code === 'PROJECT_OWNER_MISMATCH',
  ),
);

const wrongOrganization = persist(
  [],
  productionSource,
  {},
  {
    submittedByProfile: {
      ...submitter,
      organizationId: ids.organizationB,
    },
  },
);
assert.equal(wrongOrganization.status, 'REJECTED');
assert(
  wrongOrganization.blockers.some(
    (blocker) => blocker.code === 'PROFILE_ORGANIZATION_MISMATCH',
  ),
);

const wrongRole = persist(
  [],
  productionSource,
  {},
  {
    submittedByProfile: {
      ...submitter,
      role: 'viewer',
    },
  },
);
assert.equal(wrongRole.status, 'REJECTED');
assert(
  wrongRole.blockers.some(
    (blocker) => blocker.code === 'PROFILE_ROLE_NOT_ALLOWED',
  ),
);

const sourceNotSubmitted: WosSourceSnapshot = {
  ...productionSource,
  workflowStatus: 'DRAFT',
};
const notSubmitted = persist([], sourceNotSubmitted);
assert.equal(notSubmitted.status, 'REJECTED');
assert(
  notSubmitted.blockers.some(
    (blocker) => blocker.code === 'SOURCE_NOT_SUBMITTED',
  ),
);

const firstSampling = persist([], samplingSource);
assert.equal(firstSampling.status, 'CREATED');

const initialInbox = buildWorkshopInbox({
  submissions: [
    ...firstProduction.submissions,
    ...firstSampling.submissions,
  ],
  sources: [productionSource, samplingSource],
  profiles: [projectOwner, submitter],
});
assert.equal(initialInbox.tasks.length, 2);
assert.deepEqual(
  new Set(initialInbox.tasks.map((task) => task.entityType)),
  new Set(['PRODUCTION_ORDER', 'SAMPLING_REQUEST']),
);
assert.equal(
  new Set(initialInbox.tasks.map((task) => task.taskKey)).size,
  initialInbox.tasks.length,
);
for (const task of initialInbox.tasks) {
  assert.equal(task.organizationId, ids.organizationA);
  assert.equal(task.projectOwnerProfileId, ids.projectOwner);
  assert.equal(task.sourceRevision, 1);
  assert.equal(task.versionLabel, 'V1');
}

const productionV2Source: WosSourceSnapshot = {
  ...productionSource,
  revision: 2,
  versionLabel: 'V2',
};
const secondProduction = persist(firstProduction.submissions, productionV2Source, {
  submissionId: '00000000-0000-4000-8000-000000000143',
  submissionKey: 'production-submit-v2',
  readinessEvidence: evidenceFor(productionV2Source),
});
assert.equal(secondProduction.status, 'CREATED');
assert.equal(secondProduction.submissions.length, 2);

const currentInbox = buildWorkshopInbox({
  submissions: [
    ...secondProduction.submissions,
    ...firstSampling.submissions,
  ],
  sources: [productionV2Source, samplingSource],
  profiles: [projectOwner, submitter],
});
assert.equal(currentInbox.tasks.length, 2);
const currentProductionTask = currentInbox.tasks.find(
  (task) => task.entityType === 'PRODUCTION_ORDER',
);
assert.equal(currentProductionTask?.sourceRevision, 2);
assert.equal(currentProductionTask?.versionLabel, 'V2');
assert.equal(
  currentInbox.tasks.filter(
    (task) => task.entityType === 'PRODUCTION_ORDER',
  ).length,
  1,
);
assert(
  currentInbox.blockers.some(
    (blocker) => blocker.code === 'STALE_SOURCE_VERSION',
  ),
  'the previous submission remains auditable but cannot project to the inbox',
);

const duplicateInboxSubmission: WosOfficeSubmissionRecord = {
  ...secondProduction.submissions[1],
  submissionId: '00000000-0000-4000-8000-000000000144',
  submissionKey: 'production-submit-v2-duplicate',
};
const duplicateInbox = buildWorkshopInbox({
  submissions: [
    ...secondProduction.submissions,
    duplicateInboxSubmission,
  ],
  sources: [productionV2Source],
  profiles: [projectOwner, submitter],
});
assert.equal(duplicateInbox.tasks.length, 0);
assert(
  duplicateInbox.blockers.some(
    (blocker) => blocker.code === 'DUPLICATE_INBOX_SOURCE',
  ),
);

const attempt: WosTechnicalAttemptSnapshot = {
  technicalAttemptId: ids.technicalAttempt,
  organizationId: ids.organizationA,
  samplingRequestId: ids.samplingRequest,
  immutable: true,
};

function imageFor(
  overrides: Partial<WosImageVersionMetadata> & {
    category: WosImageVersionCategory;
    imageId: string;
    fileName: string;
  },
): WosImageVersionMetadata {
  const identity = {
    organizationId: ids.organizationA,
    entityType: productionSource.entityType,
    sourceId: productionSource.sourceId,
    sourceRevision: 1,
    sourceVersionLabel: 'V1',
    technicalAttemptId: null as string | null,
    ...overrides,
  };
  return {
    imageId: identity.imageId,
    organizationId: identity.organizationId,
    entityType: identity.entityType,
    sourceId: identity.sourceId,
    category: identity.category,
    sourceRevision: identity.sourceRevision,
    sourceVersionLabel: identity.sourceVersionLabel,
    storageBucket: identity.storageBucket ?? WOS_PRIVATE_IMAGE_BUCKET,
    storagePath:
      identity.storagePath
      ?? buildImageVersionObjectKey({
        organizationId: identity.organizationId,
        entityType: identity.entityType,
        sourceId: identity.sourceId,
        category: identity.category,
        sourceRevision: identity.sourceRevision,
        imageId: identity.imageId,
        fileName: identity.fileName,
        technicalAttemptId: identity.technicalAttemptId,
      }),
    fileName: identity.fileName,
    mimeType: identity.mimeType ?? 'image/jpeg',
    fileSize: identity.fileSize ?? 1024,
    uploadedByProfileId:
      identity.uploadedByProfileId ?? ids.projectOwner,
    imageStatus: identity.imageStatus ?? 'READY',
    supersedesImageId: identity.supersedesImageId ?? null,
    technicalAttemptId: identity.technicalAttemptId,
    uploadedAt: identity.uploadedAt ?? '2026-10-27T09:00:00+08:00',
  };
}

const productV1 = imageFor({
  imageId: '00000000-0000-4000-8000-000000000201',
  category: 'PRODUCT',
  fileName: 'product-v1.jpg',
});
const firstImage = appendImageVersion({
  images: [],
  supersessions: [],
  candidate: productV1,
  source: productionSource,
  uploaderProfile: projectOwner,
  technicalAttempt: null,
});
assert.equal(firstImage.appended, true);
assert.equal(firstImage.images.length, 1);
assert.equal(firstImage.image?.storagePath, productV1.storagePath);
assert(Object.isFrozen(firstImage.images));
assert(Object.isFrozen(firstImage.image));

const productV2 = imageFor({
  imageId: '00000000-0000-4000-8000-000000000202',
  category: 'PRODUCT',
  sourceRevision: 2,
  sourceVersionLabel: 'V2',
  fileName: 'product-v2.jpg',
  supersedesImageId: productV1.imageId,
  uploadedAt: '2026-10-27T10:00:00+08:00',
});
const replacedImage = appendImageVersion({
  images: firstImage.images,
  supersessions: firstImage.supersessions,
  candidate: productV2,
  source: productionV2Source,
  uploaderProfile: projectOwner,
  technicalAttempt: null,
});
assert.equal(replacedImage.appended, true);
assert.equal(replacedImage.images.length, 2);
assert.equal(replacedImage.images[0].imageStatus, 'READY');
assert.equal(replacedImage.supersession?.previousImageId, productV1.imageId);
assert.equal(replacedImage.supersession?.nextImageId, productV2.imageId);
assert.equal(replacedImage.supersession?.nextSourceRevision, 2);

const currentImages = projectCurrentImageVersions({
  images: replacedImage.images,
  supersessions: replacedImage.supersessions,
});
assert.deepEqual(currentImages.blockers, []);
assert.deepEqual(
  currentImages.currentImages.map((image) => image.imageId),
  [productV2.imageId],
);
assert.deepEqual(currentImages.supersededImageIds, [productV1.imageId]);

const duplicateImage = appendImageVersion({
  images: replacedImage.images,
  supersessions: replacedImage.supersessions,
  candidate: {
    ...productV2,
    storagePath: `${productV2.storagePath}.duplicate`,
  },
  source: productionV2Source,
  uploaderProfile: projectOwner,
  technicalAttempt: null,
});
assert.equal(duplicateImage.appended, false);
assert(
  duplicateImage.blockers.some(
    (blocker) => blocker.code === 'DUPLICATE_IMAGE_ID',
  ),
);

const reusedTarget = appendImageVersion({
  images: replacedImage.images,
  supersessions: replacedImage.supersessions,
  candidate: imageFor({
    imageId: '00000000-0000-4000-8000-000000000203',
    category: 'PRODUCT',
    sourceRevision: 2,
    sourceVersionLabel: 'V2',
    fileName: 'product-v2b.jpg',
    supersedesImageId: productV1.imageId,
  }),
  source: productionV2Source,
  uploaderProfile: projectOwner,
  technicalAttempt: null,
});
assert.equal(reusedTarget.appended, false);
assert(
  reusedTarget.blockers.some(
    (blocker) => blocker.code === 'SUPERSEDE_TARGET_ALREADY_USED',
  ),
);

const foreignObjectKey = appendImageVersion({
  images: [],
  supersessions: [],
  candidate: imageFor({
    imageId: '00000000-0000-4000-8000-000000000204',
    category: 'PRODUCT',
    fileName: 'product.jpg',
    storagePath:
      `organizations/${ids.organizationB}/wos/production-order/${ids.productionOrder}/product/v1/no-attempt/00000000-0000-4000-8000-000000000204/product.jpg`,
  }),
  source: productionSource,
  uploaderProfile: projectOwner,
  technicalAttempt: null,
});
assert.equal(foreignObjectKey.appended, false);
assert(
  foreignObjectKey.blockers.some(
    (blocker) => blocker.code === 'INVALID_IMAGE_OBJECT_KEY',
  ),
);

const traversalObjectKey = appendImageVersion({
  images: [],
  supersessions: [],
  candidate: imageFor({
    imageId: '00000000-0000-4000-8000-000000000205',
    category: 'PRODUCT',
    fileName: 'product.jpg',
    storagePath:
      `organizations/${ids.organizationA}/../other/product.jpg`,
  }),
  source: productionSource,
  uploaderProfile: projectOwner,
  technicalAttempt: null,
});
assert.equal(traversalObjectKey.appended, false);
assert(
  traversalObjectKey.blockers.some(
    (blocker) => blocker.code === 'INVALID_IMAGE_OBJECT_KEY',
  ),
);

const staleImage = appendImageVersion({
  images: [],
  supersessions: [],
  candidate: imageFor({
    imageId: '00000000-0000-4000-8000-000000000206',
    category: 'FILM_PATTERN',
    sourceRevision: 2,
    sourceVersionLabel: 'V0',
    fileName: 'film-v0.png',
    mimeType: 'image/png',
    storagePath:
      `organizations/${ids.organizationA}/wos/production-order/${ids.productionOrder}/film-pattern/v2/no-attempt/00000000-0000-4000-8000-000000000206/film-v0.png`,
  }),
  source: productionSource,
  uploaderProfile: projectOwner,
  technicalAttempt: null,
});
assert.equal(staleImage.appended, false);
assert(
  staleImage.blockers.some(
    (blocker) => blocker.code === 'STALE_SOURCE_VERSION',
  ),
);

const wrongUploader = appendImageVersion({
  images: [],
  supersessions: [],
  candidate: imageFor({
    imageId: '00000000-0000-4000-8000-000000000207',
    category: 'CUSTOMER_APPROVED_SAMPLE',
    fileName: 'customer-reference.webp',
    mimeType: 'image/webp',
    uploadedByProfileId: ids.foreignOwner,
  }),
  source: productionSource,
  uploaderProfile: foreignOwner,
  technicalAttempt: null,
});
assert.equal(wrongUploader.appended, false);
assert(
  wrongUploader.blockers.some(
    (blocker) => blocker.code === 'PROFILE_ORGANIZATION_MISMATCH',
  ),
);

assert.deepEqual(
  [...WOS_IMAGE_VERSION_CATEGORIES],
  [
    'PRODUCT',
    'FILM_PATTERN',
    'CUSTOMER_APPROVED_SAMPLE',
    'SIGNED_SAMPLE',
    'SAMPLING_RESULT',
    'PACKAGING_LABEL',
    'DEFECT_RISK',
    'OTHER',
  ],
  'all canonical workshop image categories must remain available',
);

for (const category of WOS_IMAGE_VERSION_CATEGORIES) {
  if (category === 'SAMPLING_RESULT') continue;
  const candidate = imageFor({
    imageId: `category-${category.toLowerCase().replaceAll('_', '-')}`,
    category,
    fileName: `${category.toLowerCase()}.jpg`,
  });
  const appended = appendImageVersion({
    images: [],
    supersessions: [],
    candidate,
    source: productionSource,
    uploaderProfile: projectOwner,
    technicalAttempt: null,
  });
  assert.equal(appended.appended, true, `${category} object key must be valid`);
  assert(
    candidate.storagePath.startsWith(
      `organizations/${ids.organizationA}/wos/production-order/${ids.productionOrder}/${category.toLowerCase().replaceAll('_', '-')}/v1/no-attempt/`,
    ),
    `${category} object key segment must match its canonical category`,
  );
}

const invalidCategory = appendImageVersion({
  images: [],
  supersessions: [],
  candidate: {
    ...productV1,
    imageId: '00000000-0000-4000-8000-000000000211',
    category: 'UNKNOWN' as WosImageVersionCategory,
  },
  source: productionSource,
  uploaderProfile: projectOwner,
  technicalAttempt: null,
});
assert.equal(invalidCategory.appended, false);
assert(
  invalidCategory.blockers.some(
    (blocker) => blocker.code === 'INVALID_INPUT',
  ),
  'unknown image categories fail closed',
);

const categoryWithAttempt = appendImageVersion({
  images: [],
  supersessions: [],
  candidate: {
    ...imageFor({
      imageId: '00000000-0000-4000-8000-000000000212',
      category: 'OTHER',
      fileName: 'other-reference.jpg',
    }),
    technicalAttemptId: ids.technicalAttempt,
  },
  source: productionSource,
  uploaderProfile: projectOwner,
  technicalAttempt: attempt,
});
assert.equal(categoryWithAttempt.appended, false);
assert(
  categoryWithAttempt.blockers.some(
    (blocker) => blocker.code === 'TECHNICAL_ATTEMPT_NOT_ALLOWED',
  ),
  'only sampling-result images may bind a technical attempt',
);

const resultOnProduction = appendImageVersion({
  images: [],
  supersessions: [],
  candidate: imageFor({
    imageId: '00000000-0000-4000-8000-000000000213',
    category: 'SAMPLING_RESULT',
    technicalAttemptId: ids.technicalAttempt,
    fileName: 'wrong-scope-result.jpg',
  }),
  source: productionSource,
  uploaderProfile: projectOwner,
  technicalAttempt: attempt,
});
assert.equal(resultOnProduction.appended, false);
assert(
  resultOnProduction.blockers.some(
    (blocker) => blocker.code === 'IMAGE_CATEGORY_ENTITY_MISMATCH',
  ),
  'sampling-result images cannot bind to a production order',
);

const samplingInProgressSource: WosSourceSnapshot = {
  ...samplingSource,
  workflowStatus: 'SAMPLING_IN_PROGRESS',
};
const resultImage = imageFor({
  imageId: '00000000-0000-4000-8000-000000000208',
  category: 'SAMPLING_RESULT',
  entityType: 'SAMPLING_REQUEST',
  sourceId: ids.samplingRequest,
  technicalAttemptId: ids.technicalAttempt,
  fileName: 'sampling-result.jpg',
});
const appendedResult = appendImageVersion({
  images: [],
  supersessions: [],
  candidate: resultImage,
  source: samplingInProgressSource,
  uploaderProfile: projectOwner,
  technicalAttempt: attempt,
});
assert.equal(appendedResult.appended, true);
assert.equal(appendedResult.image?.technicalAttemptId, ids.technicalAttempt);
assert(
  resultImage.storagePath.includes(`attempt/${ids.technicalAttempt}`),
  'sampling result object keys bind the exact technical attempt',
);

const wrongAttempt = appendImageVersion({
  images: [],
  supersessions: [],
  candidate: imageFor({
    imageId: '00000000-0000-4000-8000-000000000209',
    category: 'SAMPLING_RESULT',
    entityType: 'SAMPLING_REQUEST',
    sourceId: ids.samplingRequest,
    technicalAttemptId: ids.otherAttempt,
    fileName: 'wrong-attempt.jpg',
  }),
  source: samplingInProgressSource,
  uploaderProfile: projectOwner,
  technicalAttempt: attempt,
});
assert.equal(wrongAttempt.appended, false);
assert(
  wrongAttempt.blockers.some(
    (blocker) => blocker.code === 'TECHNICAL_ATTEMPT_MISMATCH',
  ),
);

const wrongAttemptOrganization = appendImageVersion({
  images: [],
  supersessions: [],
  candidate: imageFor({
    imageId: '00000000-0000-4000-8000-000000000214',
    category: 'SAMPLING_RESULT',
    entityType: 'SAMPLING_REQUEST',
    sourceId: ids.samplingRequest,
    technicalAttemptId: ids.technicalAttempt,
    fileName: 'foreign-attempt.jpg',
  }),
  source: samplingInProgressSource,
  uploaderProfile: projectOwner,
  technicalAttempt: {
    ...attempt,
    organizationId: ids.organizationB,
  },
});
assert.equal(wrongAttemptOrganization.appended, false);
assert(
  wrongAttemptOrganization.blockers.some(
    (blocker) => blocker.code === 'TECHNICAL_ATTEMPT_MISMATCH',
  ),
  'technical attempts cannot cross organization boundaries',
);

const wrongAttemptRequest = appendImageVersion({
  images: [],
  supersessions: [],
  candidate: imageFor({
    imageId: '00000000-0000-4000-8000-000000000215',
    category: 'SAMPLING_RESULT',
    entityType: 'SAMPLING_REQUEST',
    sourceId: ids.samplingRequest,
    technicalAttemptId: ids.technicalAttempt,
    fileName: 'wrong-request.jpg',
  }),
  source: samplingInProgressSource,
  uploaderProfile: projectOwner,
  technicalAttempt: {
    ...attempt,
    samplingRequestId: ids.productionOrder,
  },
});
assert.equal(wrongAttemptRequest.appended, false);
assert(
  wrongAttemptRequest.blockers.some(
    (blocker) => blocker.code === 'TECHNICAL_ATTEMPT_MISMATCH',
  ),
  'technical attempts must bind to the exact sampling request',
);

const missingAttempt = appendImageVersion({
  images: [],
  supersessions: [],
  candidate: imageFor({
    imageId: '00000000-0000-4000-8000-000000000210',
    category: 'SAMPLING_RESULT',
    entityType: 'SAMPLING_REQUEST',
    sourceId: ids.samplingRequest,
    technicalAttemptId: null,
    fileName: 'missing-attempt.jpg',
    storagePath:
      `organizations/${ids.organizationA}/wos/sampling-request/${ids.samplingRequest}/sampling-result/v1/no-attempt/00000000-0000-4000-8000-000000000210/missing-attempt.jpg`,
  }),
  source: samplingInProgressSource,
  uploaderProfile: projectOwner,
  technicalAttempt: null,
});
assert.equal(missingAttempt.appended, false);
assert(
  missingAttempt.blockers.some(
    (blocker) => blocker.code === 'TECHNICAL_ATTEMPT_MISSING',
  ),
);

const repeatedInbox = buildWorkshopInbox({
  submissions: [
    ...firstProduction.submissions,
    ...firstSampling.submissions,
  ],
  sources: [productionSource, samplingSource],
  profiles: [projectOwner, submitter],
});
assert.equal(JSON.stringify(repeatedInbox), JSON.stringify(initialInbox));

const duplicateDraftMigration = new URL(
  '../../supabase/migrations/20261027073000_workshop_order_system_nonproduction_persistence.sql',
  import.meta.url,
);
assert.equal(
  fs.existsSync(duplicateDraftMigration),
  false,
  'the colliding draft SQL migration must be absent from this PR',
);
const migrationNames = fs.readdirSync(
  new URL('../../supabase/migrations/', import.meta.url),
);
assert.equal(
  migrationNames.some((name) =>
    name.endsWith('_workshop_order_system_nonproduction_persistence.sql'),
  ),
  false,
  'no renamed or replacement workshop persistence migration may be added',
);

const contractSource = fs.readFileSync(
  'src/lib/workshop-orders/nonproduction-persistence.ts',
  'utf8',
);
for (const forbiddenPattern of [
  /\bfetch\s*\(/,
  /\bDate\.now\b/,
  /\bnew Date\b/,
  /\blocalStorage\b/,
  /\bsupabase\b/i,
  /\.insert\s*\(/,
  /\.update\s*\(/,
  /\.delete\s*\(/,
]) {
  assert(
    !forbiddenPattern.test(contractSource),
    `pure persistence contract must not contain ${forbiddenPattern}`,
  );
}

const designDocument = fs.readFileSync(
  'docs/workshop-order-system/09_NONPRODUCTION_PERSISTENCE_AND_IMAGE_UPLOAD.md',
  'utf8',
);
for (const requiredBoundary of [
  'Phase 5B 离线契约',
  '不是数据库持久化',
  '不是已应用的 migration',
  '不是经测试的 RLS 保证',
  '不是实时图片上传',
  'UNIQUE-VERSION migration',
  'inherited INSERT/GRANT/policy',
  '强制 Production gate',
]) {
  assert(
    designDocument.includes(requiredBoundary),
    `offline contract documentation must state: ${requiredBoundary}`,
  );
}

console.log('workshop-order-nonproduction-persistence.test.ts: PASS');
