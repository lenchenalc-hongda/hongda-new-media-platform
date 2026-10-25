import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  appendSamplingAttempt,
  deriveSamplingProductionDraft,
  evaluateSamplingResultReview,
  type SamplingAttemptCommand,
  type SamplingProductionGateEvidence,
  type SamplingResultConfirmation,
} from '../../src/lib/workshop-orders/sampling-execution';
import {
  samplingRequestFixture,
  WOS_FIXTURE_IDS,
} from '../../src/lib/workshop-orders/fixtures';
import type { WosSamplingRequest } from '../../src/lib/workshop-orders/domain';

const request: WosSamplingRequest = {
  ...samplingRequestFixture,
  organizationId: WOS_FIXTURE_IDS.organizationId,
  versionLabel: 'V1',
};

const technicianProfileId = WOS_FIXTURE_IDS.technicianProfileId;
const projectOwnerProfileId = WOS_FIXTURE_IDS.projectOwnerProfileId;

function attempt(
  overrides: Partial<SamplingAttemptCommand> = {},
): SamplingAttemptCommand {
  const attemptId =
    overrides.attemptId ?? `sampling-attempt-${overrides.attemptNumber ?? 1}`;
  return {
    attemptId,
    organizationId: request.organizationId,
    samplingRequestId: request.id,
    attemptNumber: 1,
    requestVersionLabel: 'V1',
    parameterVersion: {
      versionLabel: 'V1',
      machineLabel: 'A 机',
      temperatureC: 160,
      transferSeconds: 18,
      rollerHardness: '70A',
      fixtureMode: '活架',
      pressureLevel: 'MEDIUM',
      pressureNote: '中压，边界试印稳定',
      pretreatment: '酒精清洁并静置 10 分钟',
      filmVersionLabel: 'V1',
      adjustmentCount: 2,
      estimatedBulkEfficiency: '约 120 件/小时',
    },
    resultDecision: 'PASS',
    failureReason: null,
    bulkRiskNotes: '曲面转角需继续关注拉伸',
    improvementRecommendation: null,
    resultImages: [
      {
        imageId: `sampling-image-${attemptId}`,
        organizationId: request.organizationId,
        samplingRequestId: request.id,
        attemptId,
        category: 'OVERALL_RESULT',
        versionLabel: 'V1',
        status: 'READY',
      },
    ],
    technicianProfileId,
    completedAt: '2026-10-26T10:30:00+08:00',
    ...overrides,
  };
}

function confirmation(
  confirmationType: SamplingResultConfirmation['confirmationType'],
  attemptId: string,
  overrides: Partial<SamplingResultConfirmation> = {},
): SamplingResultConfirmation {
  return {
    confirmationId: `${confirmationType}-${attemptId}`,
    organizationId: request.organizationId,
    samplingRequestId: request.id,
    attemptId,
    confirmationType,
    decision: 'CONFIRMED',
    profileId:
      confirmationType === 'TECHNICIAN'
        ? technicianProfileId
        : projectOwnerProfileId,
    roleSnapshot:
      confirmationType === 'TECHNICIAN'
        ? 'TECHNICIAN'
        : 'PROJECT_OWNER',
    confirmedAt: '2026-10-26T11:00:00+08:00',
    ...overrides,
  };
}

const first = appendSamplingAttempt([], attempt(), request);
assert.equal(first.appended, true);
assert.deepEqual(first.blockers, []);
assert.equal(first.history.length, 1);
assert.equal(first.attempt?.attemptNumber, 1);
assert(Object.isFrozen(first.history));
assert(Object.isFrozen(first.attempt));
assert(Object.isFrozen(first.attempt?.parameterVersion));
assert(Object.isFrozen(first.attempt?.resultImages));

const firstHistorySnapshot = JSON.stringify(first.history);
const firstAttemptSnapshot = JSON.stringify(attempt());
const secondAttempt = attempt({
  attemptId: 'sampling-attempt-2',
  attemptNumber: 2,
  resultDecision: 'FAIL',
  failureReason: '转角出现明显露底',
  completedAt: '2026-10-26T12:30:00+08:00',
});
const repeated = appendSamplingAttempt(
  first.history,
  secondAttempt,
  request,
);
assert.equal(repeated.appended, true);
assert.equal(repeated.history.length, 2);
assert.equal(repeated.history[0].attemptId, 'sampling-attempt-1');
assert.equal(repeated.history[1].attemptId, 'sampling-attempt-2');
assert.equal(JSON.stringify(first.history), firstHistorySnapshot);
assert.equal(JSON.stringify(attempt()), firstAttemptSnapshot);

const thirdAttempt = attempt({
  attemptId: 'sampling-attempt-3',
  attemptNumber: 3,
  completedAt: '2026-10-26T14:30:00+08:00',
});
const third = appendSamplingAttempt(repeated.history, thirdAttempt, request);
assert.equal(third.appended, true);
assert.equal(third.history.length, 3);

const overwriteAttempt = appendSamplingAttempt(
  third.history,
  attempt({
    attemptId: 'sampling-attempt-1',
    attemptNumber: 4,
  }),
  request,
);
assert.equal(overwriteAttempt.appended, false);
assert(
  overwriteAttempt.blockers.some(
    (blocker) => blocker.code === 'ATTEMPT_ID_DUPLICATE',
  ),
);
assert.equal(overwriteAttempt.history, third.history);

const missingParameter = appendSamplingAttempt(
  [],
  attempt({
    parameterVersion: {
      ...attempt().parameterVersion,
      pressureLevel: null,
    },
  }),
  request,
);
assert.equal(missingParameter.appended, false);
assert(
  missingParameter.blockers.some(
    (blocker) => blocker.code === 'PARAMETER_MISSING',
  ),
);

const missingParameterVersion = appendSamplingAttempt(
  [],
  attempt({
    parameterVersion: {
      ...attempt().parameterVersion,
      versionLabel: '',
    },
  }),
  request,
);
assert.equal(missingParameterVersion.appended, false);
assert(
  missingParameterVersion.blockers.some(
    (blocker) => blocker.code === 'PARAMETER_VERSION_MISSING',
  ),
);

const missingRequestVersion = appendSamplingAttempt(
  [],
  attempt({ requestVersionLabel: '' }),
  request,
);
assert.equal(missingRequestVersion.appended, false);
assert(
  missingRequestVersion.blockers.some(
    (blocker) => blocker.code === 'REQUEST_VERSION_MISSING',
  ),
);

const parameterVersionMismatch = appendSamplingAttempt(
  [],
  attempt({
    parameterVersion: {
      ...attempt().parameterVersion,
      versionLabel: 'V0',
    },
  }),
  request,
);
assert.equal(parameterVersionMismatch.appended, false);
assert(
  parameterVersionMismatch.blockers.some(
    (blocker) => blocker.code === 'PARAMETER_VERSION_STALE',
  ),
);

const mismatchedPhoto = appendSamplingAttempt(
  [],
  attempt({
    resultImages: [
      {
        ...attempt().resultImages[0],
        versionLabel: 'V0',
      },
    ],
  }),
  request,
);
assert.equal(mismatchedPhoto.appended, false);
assert(
  mismatchedPhoto.blockers.some(
    (blocker) => blocker.code === 'RESULT_IMAGE_VERSION_MISMATCH',
  ),
);

const mismatchedAttemptId = appendSamplingAttempt(
  [],
  attempt({
    resultImages: [
      {
        ...attempt().resultImages[0],
        attemptId: 'different-attempt',
      },
    ],
  }),
  request,
);
assert.equal(mismatchedAttemptId.appended, false);
assert(
  mismatchedAttemptId.blockers.some(
    (blocker) => blocker.code === 'RESULT_IMAGE_ATTEMPT_MISMATCH',
  ),
);
assert(
  mismatchedAttemptId.blockers.some(
    (blocker) => blocker.code === 'ATTEMPT_ID_MISMATCH',
  ),
);

const staleImage = appendSamplingAttempt(
  [],
  attempt({
    resultImages: [
      {
        ...attempt().resultImages[0],
        status: 'SUPERSEDED',
      },
    ],
  }),
  request,
);
assert.equal(staleImage.appended, false);
assert(
  staleImage.blockers.some(
    (blocker) => blocker.code === 'RESULT_IMAGE_NOT_READY',
  ),
);

const missingImage = appendSamplingAttempt(
  [],
  attempt({ resultImages: [] }),
  request,
);
assert.equal(missingImage.appended, false);
assert(
  missingImage.blockers.some(
    (blocker) => blocker.code === 'RESULT_IMAGE_MISSING',
  ),
);

const missingReason = appendSamplingAttempt(
  [],
  attempt({
    resultDecision: 'CANNOT_SAMPLE',
    failureReason: null,
  }),
  request,
);
assert.equal(missingReason.appended, false);
assert(
  missingReason.blockers.some(
    (blocker) => blocker.code === 'FAILURE_REASON_MISSING',
  ),
);

const latestAttemptId = third.history[third.history.length - 1].attemptId;
const latestConfirmations: SamplingResultConfirmation[] = [
  confirmation('TECHNICIAN', latestAttemptId),
  confirmation('PROJECT_OWNER', latestAttemptId),
];

const missingProjectConfirmation = evaluateSamplingResultReview({
  request,
  attempts: third.history,
  confirmations: [latestConfirmations[0]],
  selectedAttemptId: latestAttemptId,
});
assert.equal(missingProjectConfirmation.allowed, false);
assert.equal(
  missingProjectConfirmation.workflowStatus,
  'PROJECT_CONFIRMATION',
);
assert.equal(missingProjectConfirmation.productionDraftEligible, false);
assert(
  missingProjectConfirmation.blockers.some(
    (blocker) => blocker.code === 'PROJECT_OWNER_CONFIRMATION_MISSING',
  ),
);

const wrongTechnician = evaluateSamplingResultReview({
  request,
  attempts: third.history,
  confirmations: [
    confirmation('TECHNICIAN', latestAttemptId, {
      profileId: projectOwnerProfileId,
    }),
    confirmation('PROJECT_OWNER', latestAttemptId),
  ],
  selectedAttemptId: latestAttemptId,
});
assert.equal(wrongTechnician.allowed, false);
assert(
  wrongTechnician.blockers.some(
    (blocker) =>
      blocker.code === 'TECHNICIAN_CONFIRMATION_PROFILE_MISMATCH',
  ),
);

const wrongConfirmationRole = evaluateSamplingResultReview({
  request,
  attempts: third.history,
  confirmations: [
    confirmation('TECHNICIAN', latestAttemptId, {
      roleSnapshot: 'PROJECT_OWNER',
    }),
    confirmation('PROJECT_OWNER', latestAttemptId),
  ],
  selectedAttemptId: latestAttemptId,
});
assert.equal(wrongConfirmationRole.allowed, false);
assert(
  wrongConfirmationRole.blockers.some(
    (blocker) => blocker.code === 'CONFIRMATION_ROLE_MISMATCH',
  ),
);

const staleResult = evaluateSamplingResultReview({
  request,
  attempts: third.history,
  confirmations: [
    confirmation('TECHNICIAN', first.history[0].attemptId),
    confirmation('PROJECT_OWNER', first.history[0].attemptId),
  ],
  selectedAttemptId: first.history[0].attemptId,
});
assert.equal(staleResult.allowed, false);
assert(
  staleResult.blockers.some((blocker) => blocker.code === 'STALE_RESULT'),
);

const currentRequestV2: WosSamplingRequest = {
  ...request,
  versionLabel: 'V2',
};
const staleRequestVersion = evaluateSamplingResultReview({
  request: currentRequestV2,
  attempts: third.history,
  confirmations: latestConfirmations,
  selectedAttemptId: latestAttemptId,
});
assert.equal(staleRequestVersion.allowed, false);
assert(
  staleRequestVersion.blockers.some(
    (blocker) => blocker.code === 'REQUEST_VERSION_STALE',
  ),
);

const approved = evaluateSamplingResultReview({
  request,
  attempts: third.history,
  confirmations: latestConfirmations,
  selectedAttemptId: latestAttemptId,
});
assert.equal(approved.allowed, true);
assert.equal(approved.workflowStatus, 'CLOSED');
assert.equal(approved.decision, 'PASS');
assert.equal(approved.technicianConfirmed, true);
assert.equal(approved.projectOwnerConfirmed, true);
assert.equal(approved.productionDraftEligible, true);
assert.deepEqual(approved.blockers, []);

const failedAttempt = attempt({
  attemptId: 'failed-latest',
  attemptNumber: 4,
  resultDecision: 'FAIL',
  failureReason: '边缘仍然起翘',
  completedAt: '2026-10-26T15:30:00+08:00',
});
const failedHistory = appendSamplingAttempt(
  third.history,
  failedAttempt,
  request,
);
const failedReview = evaluateSamplingResultReview({
  request,
  attempts: failedHistory.history,
  confirmations: [
    confirmation('TECHNICIAN', failedAttempt.attemptId),
    confirmation('PROJECT_OWNER', failedAttempt.attemptId),
  ],
  selectedAttemptId: failedAttempt.attemptId,
});
assert.equal(failedReview.allowed, true);
assert.equal(failedReview.decision, 'FAIL');
assert.equal(failedReview.workflowStatus, 'CLOSED');
assert.equal(failedReview.productionDraftEligible, false);

const stalePassAfterFail = evaluateSamplingResultReview({
  request,
  attempts: failedHistory.history,
  confirmations: [
    confirmation('TECHNICIAN', third.history[2].attemptId),
    confirmation('PROJECT_OWNER', third.history[2].attemptId),
  ],
  selectedAttemptId: third.history[2].attemptId,
});
assert.equal(stalePassAfterFail.allowed, false);
assert.equal(stalePassAfterFail.productionDraftEligible, false);
assert(
  stalePassAfterFail.blockers.some(
    (blocker) => blocker.code === 'STALE_RESULT',
  ),
);

const failedDraft = deriveSamplingProductionDraft({
  draftId: 'draft-from-fail',
  orderNumber: 'DRAFT-FAIL',
  request,
  review: failedReview,
  productionGate: null,
});
assert.equal(failedDraft.draft, null);
assert(
  failedDraft.blockers.some(
    (blocker) => blocker.code === 'PASS_DECISION_REQUIRED',
  ),
);

const unconfirmedDraft = deriveSamplingProductionDraft({
  draftId: 'draft-without-project-owner',
  orderNumber: 'DRAFT-UNCONFIRMED',
  request,
  review: missingProjectConfirmation,
  productionGate: null,
});
assert.equal(unconfirmedDraft.draft, null);
assert(
  unconfirmedDraft.blockers.some(
    (blocker) => blocker.code === 'RESULT_REVIEW_NOT_APPROVED',
  ),
);

const readyGate: SamplingProductionGateEvidence = {
  filmRequired: true,
  customerSampleRequired: true,
  signedSampleRequired: true,
  filmReadiness: 'VERSION_VERIFIED',
  fixtureReadiness: 'FIT_VERIFIED',
  incomingMaterialReadiness: 'QUANTITY_VERIFIED',
  signedSampleReadiness: 'VERIFIED',
  visualBaseline: {
    versionLabel: 'V1',
    isCurrent: true,
    productImageCount: 1,
    filmImageCount: 1,
    customerApprovedSampleCount: 1,
    signedSampleCount: 1,
    workshopConfirmed: true,
  },
  technicalConfirmed: true,
  supervisorConfirmed: true,
  unresolvedBlockerCount: 0,
};

const draftResult = deriveSamplingProductionDraft({
  draftId: 'production-draft-001',
  orderNumber: 'PO-DRAFT-001',
  request,
  review: approved,
  productionGate: readyGate,
});
assert.deepEqual(draftResult.blockers, []);
assert(draftResult.draft);
assert.equal(draftResult.draft.workflowStatus, 'DRAFT');
assert.equal(draftResult.draft.sourceResultDecision, 'PASS');
assert.equal(draftResult.draft.sourceAttemptId, latestAttemptId);
assert.equal(draftResult.draft.versionLabel, 'V1');
assert.equal(draftResult.draft.parameterVersion.versionLabel, 'V1');
assert.equal(draftResult.draft.resultImages[0].attemptId, latestAttemptId);
assert.equal(draftResult.draft.canStartProduction, false);
assert.equal(draftResult.draft.productionStartGate.allowed, false);
assert(
  draftResult.draft.productionStartGate.blockingCodes.includes(
    'INVALID_WORKFLOW_STATUS',
  ),
  'a generated draft cannot be mistaken for an approved production start',
);
assert(Object.isFrozen(draftResult.draft));
assert(Object.isFrozen(draftResult.draft.parameterVersion));
assert(Object.isFrozen(draftResult.draft.resultImages));

const missingSignedSampleDraft = deriveSamplingProductionDraft({
  draftId: 'production-draft-002',
  orderNumber: 'PO-DRAFT-002',
  request,
  review: approved,
  productionGate: {
    ...readyGate,
    signedSampleRequired: false,
    signedSampleReadiness: 'MISSING',
    visualBaseline: {
      ...readyGate.visualBaseline!,
      signedSampleCount: 0,
    },
  },
});
assert(missingSignedSampleDraft.draft);
assert.equal(
  missingSignedSampleDraft.draft.productionStartGate.allowed,
  false,
);
assert(
  missingSignedSampleDraft.draft.productionStartGate.blockingCodes.includes(
    'SIGNED_SAMPLE_MISSING',
  ),
);

const staleVersionDraft = deriveSamplingProductionDraft({
  draftId: 'production-draft-003',
  orderNumber: 'PO-DRAFT-003',
  request,
  review: approved,
  productionGate: {
    ...readyGate,
    visualBaseline: {
      ...readyGate.visualBaseline!,
      versionLabel: 'V0',
    },
  },
});
assert(staleVersionDraft.draft);
assert(
  staleVersionDraft.draft.productionStartGate.blockingCodes.includes(
    'VERSION_MISMATCH',
  ),
);

const repeatedReview = evaluateSamplingResultReview({
  request,
  attempts: third.history,
  confirmations: latestConfirmations,
  selectedAttemptId: latestAttemptId,
});
assert.deepEqual(repeatedReview, approved);

const source = fs.readFileSync(
  'src/lib/workshop-orders/sampling-execution.ts',
  'utf8',
);
for (const forbiddenPattern of [
  /\blocalStorage\b/,
  /\bsessionStorage\b/,
  /\bindexedDB\b/,
  /\bfetch\s*\(/,
  /\bDate\.now\b/,
  /\.insert\s*\(/,
  /\.update\s*\(/,
  /\.delete\s*\(/,
  /\.upsert\s*\(/,
  /\/api\/workshop-orders/,
  /\bsupabase\b/i,
]) {
  assert(
    !forbiddenPattern.test(source),
    `sampling execution domain must not use ${forbiddenPattern}`,
  );
}

console.log('workshop-order-sampling-execution.test.ts: PASS');
