import assert from 'node:assert/strict';
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import WorkshopSchedulePreview from '../../src/components/workshop-orders/WorkshopSchedulePreview';
import {
  SCHEDULING_PREVIEW_FIXTURE,
  buildSchedulingPreview,
  createRescheduleProposal,
  evaluateScheduleCandidate,
  type ExistingBooking,
  type ScheduleCandidate,
  type SchedulingContext,
} from '../../src/lib/workshop-orders/scheduling';
import {
  productionOrderFixture,
  samplingRequestFixture,
} from '../../src/lib/workshop-orders/fixtures';
import type {
  ProductionWorkshopReadinessInput,
  SamplingWorkshopReadinessInput,
} from '../../src/lib/workshop-orders/readiness';
import type { VisualBaselineSummary } from '../../src/lib/workshop-orders/spec';

const readyBaseline: VisualBaselineSummary = {
  versionLabel: 'V1',
  isCurrent: true,
  productImageCount: 1,
  filmImageCount: 1,
  customerApprovedSampleCount: 1,
  signedSampleCount: 1,
  workshopConfirmed: true,
};

const productionReadiness: ProductionWorkshopReadinessInput = {
  entityType: 'PRODUCTION_ORDER',
  order: productionOrderFixture,
  technicalConfirmed: true,
  supervisorConfirmed: true,
  filmReadiness: 'VERSION_VERIFIED',
  fixtureReadiness: 'FIT_VERIFIED',
  incomingMaterialReadiness: 'QUANTITY_VERIFIED',
  signedSampleReadiness: 'VERIFIED',
  filmVersionLabel: 'V1',
  filmRequired: true,
  fixtureRequired: true,
  customerSampleRequired: true,
  signedSampleRequired: true,
  visualBaseline: readyBaseline,
  unresolvedBlockerCount: 0,
};

const samplingReadiness: SamplingWorkshopReadinessInput = {
  entityType: 'SAMPLING_REQUEST',
  request: samplingRequestFixture,
  priority: 'HIGH',
  technicianAccepted: true,
  filmReadiness: 'VERSION_VERIFIED',
  fixtureReadiness: 'FIT_VERIFIED',
  incomingMaterialReadiness: 'QUANTITY_VERIFIED',
  signedSampleReadiness: 'VERIFIED',
  filmVersionLabel: 'V1',
  filmRequired: true,
  fixtureRequired: true,
  customerSampleRequired: true,
  signedSampleRequired: true,
  visualBaseline: readyBaseline,
  unresolvedBlockerCount: 0,
};

const productionCandidate: ScheduleCandidate = {
  id: 'candidate-production',
  taskType: 'PRODUCTION',
  entityType: 'PRODUCTION_ORDER',
  entityId: productionOrderFixture.id,
  identifier: productionOrderFixture.orderNumber,
  versionLabel: 'V1',
  priority: 'HIGH',
  machineSlotId: 'slot-a-morning',
  technicianProfileId: 'technician-1',
  scheduledStart: '2026-11-02T09:00',
  scheduledEnd: '2026-11-02T11:00',
  dueDate: '2026-11-03',
  quantity: 5000,
  capacityEstimate: {
    estimateId: 'estimate-production',
    estimatedQuantity: 5000,
    durationMinutes: 120,
    estimatedByTechnicianProfileId: 'technician-1',
  },
  readiness: productionReadiness,
};

const samplingCandidate: ScheduleCandidate = {
  id: 'candidate-sampling',
  taskType: 'SAMPLING',
  entityType: 'SAMPLING_REQUEST',
  entityId: samplingRequestFixture.id,
  identifier: 'SR-FIXTURE-001',
  versionLabel: 'V1',
  priority: 'CRITICAL',
  machineSlotId: 'slot-a-afternoon',
  technicianProfileId: 'technician-1',
  scheduledStart: '2026-11-02T13:00',
  scheduledEnd: '2026-11-02T14:00',
  dueDate: '2026-11-02',
  quantity: 8,
  capacityEstimate: {
    estimateId: 'estimate-sampling',
    estimatedQuantity: 8,
    durationMinutes: 60,
    estimatedByTechnicianProfileId: 'technician-1',
  },
  readiness: samplingReadiness,
};

const context: SchedulingContext = {
  workingDayWindows: [
    {
      id: 'window-1',
      startAt: '2026-11-02T08:00',
      endAt: '2026-11-02T17:00',
    },
  ],
  machineSlots: [
    {
      id: 'slot-a-morning',
      machineId: 'machine-a',
      machineLabel: 'A 机',
      workingWindowId: 'window-1',
      startAt: '2026-11-02T08:00',
      endAt: '2026-11-02T12:00',
      taskTypes: ['PRODUCTION', 'SAMPLING'],
    },
    {
      id: 'slot-a-afternoon',
      machineId: 'machine-a',
      machineLabel: 'A 机',
      workingWindowId: 'window-1',
      startAt: '2026-11-02T12:00',
      endAt: '2026-11-02T17:00',
      taskTypes: ['PRODUCTION', 'SAMPLING'],
    },
    {
      id: 'slot-b-afternoon',
      machineId: 'machine-b',
      machineLabel: 'B 机',
      workingWindowId: 'window-1',
      startAt: '2026-11-02T12:00',
      endAt: '2026-11-02T17:00',
      taskTypes: ['SAMPLING'],
    },
  ],
  technicianAvailability: [
    {
      technicianProfileId: 'technician-1',
      availableRanges: [
        {
          startAt: '2026-11-02T08:00',
          endAt: '2026-11-02T17:00',
        },
      ],
    },
    {
      technicianProfileId: 'technician-2',
      availableRanges: [
        {
          startAt: '2026-11-02T08:00',
          endAt: '2026-11-02T17:00',
        },
      ],
    },
  ],
  existingBookings: [],
};

function withCandidate(
  overrides: Partial<ScheduleCandidate>,
): ScheduleCandidate {
  return { ...productionCandidate, ...overrides };
}

function withContext(
  overrides: Partial<SchedulingContext>,
): SchedulingContext {
  return { ...context, ...overrides };
}

const readyProduction = evaluateScheduleCandidate(productionCandidate, context);
assert.equal(readyProduction.isSchedulable, true);
assert.deepEqual(readyProduction.blockers, []);
assert.equal(readyProduction.readiness?.isReady, true);

const readySampling = evaluateScheduleCandidate(samplingCandidate, context);
assert.equal(readySampling.isSchedulable, true);
assert.deepEqual(readySampling.blockers, []);

const negativeDuration = evaluateScheduleCandidate(
  withCandidate({
    scheduledStart: '2026-11-02T11:00',
    scheduledEnd: '2026-11-02T10:00',
  }),
  context,
);
assert.equal(negativeDuration.isSchedulable, false);
assert(
  negativeDuration.blockers.some(
    (blocker) => blocker.code === 'INVALID_TIME_RANGE',
  ),
);

const outsideWindow = evaluateScheduleCandidate(
  withCandidate({
    scheduledStart: '2026-11-02T07:00',
    scheduledEnd: '2026-11-02T09:00',
  }),
  context,
);
assert.equal(outsideWindow.isSchedulable, false);
assert(
  outsideWindow.blockers.some(
    (blocker) => blocker.code === 'OUTSIDE_WORKING_WINDOW',
  ),
);

const missingCapacity = evaluateScheduleCandidate(
  withCandidate({ capacityEstimate: null }),
  context,
);
assert.equal(missingCapacity.isSchedulable, false);
assert(
  missingCapacity.blockers.some(
    (blocker) => blocker.code === 'CAPACITY_ESTIMATE_MISSING',
  ),
);

const insufficientCapacity = evaluateScheduleCandidate(
  withCandidate({
    capacityEstimate: {
      ...productionCandidate.capacityEstimate!,
      estimatedQuantity: 100,
    },
  }),
  context,
);
assert.equal(insufficientCapacity.isSchedulable, false);
assert(
  insufficientCapacity.blockers.some(
    (blocker) => blocker.code === 'CAPACITY_ESTIMATE_INSUFFICIENT',
  ),
);

const absentAvailability = evaluateScheduleCandidate(
  withCandidate({ technicianProfileId: 'technician-without-calendar' }),
  context,
);
assert.equal(absentAvailability.isSchedulable, false);
assert(
  absentAvailability.blockers.some(
    (blocker) => blocker.code === 'TECHNICIAN_AVAILABILITY_MISSING',
  ),
);

const partiallyUnavailableTechnician = evaluateScheduleCandidate(
  productionCandidate,
  withContext({
    technicianAvailability: [
      {
        technicianProfileId: 'technician-1',
        availableRanges: [
          {
            startAt: '2026-11-02T08:00',
            endAt: '2026-11-02T10:00',
          },
        ],
      },
    ],
  }),
);
assert.equal(partiallyUnavailableTechnician.isSchedulable, false);
assert(
  partiallyUnavailableTechnician.blockers.some(
    (blocker) => blocker.code === 'TECHNICIAN_UNAVAILABLE',
  ),
);

const staleFilm = evaluateScheduleCandidate(
  withCandidate({
    readiness: {
      ...productionReadiness,
      filmReadiness: 'ARRIVED',
    },
  }),
  context,
);
assert.equal(staleFilm.isSchedulable, false);
assert(
  staleFilm.blockers.some(
    (blocker) => blocker.code === 'FILM_VERSION_UNVERIFIED',
  ),
);

const fixtureNotFitVerified = evaluateScheduleCandidate(
  withCandidate({
    readiness: {
      ...productionReadiness,
      fixtureReadiness: 'ARRIVED',
    },
  }),
  context,
);
assert.equal(fixtureNotFitVerified.isSchedulable, false);
assert(
  fixtureNotFitVerified.blockers.some(
    (blocker) => blocker.code === 'FIXTURE_NOT_READY',
  ),
);

const staleBaseline = evaluateScheduleCandidate(
  withCandidate({
    readiness: {
      ...productionReadiness,
      visualBaseline: { ...readyBaseline, isCurrent: false },
    },
  }),
  context,
);
assert.equal(staleBaseline.isSchedulable, false);
assert(
  staleBaseline.blockers.some(
    (blocker) => blocker.code === 'VISUAL_BASELINE_NOT_CURRENT',
  ),
);

const missingCustomerApprovedSample = evaluateScheduleCandidate(
  withCandidate({
    readiness: {
      ...productionReadiness,
      visualBaseline: {
        ...readyBaseline,
        customerApprovedSampleCount: 0,
      },
    },
  }),
  context,
);
assert.equal(missingCustomerApprovedSample.isSchedulable, false);
assert(
  missingCustomerApprovedSample.blockers.some(
    (blocker) => blocker.code === 'CUSTOMER_SAMPLE_MISSING',
  ),
);

const missingIncomingMaterial = evaluateScheduleCandidate(
  withCandidate({
    readiness: {
      ...productionReadiness,
      incomingMaterialReadiness: 'ARRIVED',
    },
  }),
  context,
);
assert.equal(missingIncomingMaterial.isSchedulable, false);
assert(
  missingIncomingMaterial.blockers.some(
    (blocker) => blocker.code === 'INCOMING_MATERIAL_NOT_READY',
  ),
);

const absentReadiness = evaluateScheduleCandidate(
  withCandidate({ readiness: null }),
  context,
);
assert.equal(absentReadiness.isSchedulable, false);
assert(
  absentReadiness.blockers.some(
    (blocker) => blocker.code === 'READINESS_INPUT_INCOMPLETE',
  ),
);

const dueDateWarning = evaluateScheduleCandidate(
  withCandidate({ dueDate: '2026-11-01' }),
  context,
);
assert.equal(dueDateWarning.isSchedulable, true);
assert.deepEqual(
  dueDateWarning.warnings.map((warning) => warning.code),
  ['LATE_AFTER_DUE_DATE'],
);

const occupiedProduction: ExistingBooking = {
  ...productionCandidate,
  bookingId: 'booking-production-1',
  version: 1,
};

const occupiedContext = withContext({
  existingBookings: [occupiedProduction],
});
const collision = evaluateScheduleCandidate(
  withCandidate({
    id: 'critical-override-attempt',
    priority: 'CRITICAL',
    scheduledStart: '2026-11-02T10:00',
    scheduledEnd: '2026-11-02T12:00',
    capacityEstimate: {
      ...productionCandidate.capacityEstimate!,
      durationMinutes: 120,
    },
  }),
  occupiedContext,
);
assert.equal(collision.isSchedulable, false);
const machineConflict = collision.blockers.find(
  (blocker) => blocker.code === 'MACHINE_TIME_CONFLICT',
);
assert(machineConflict, 'priority must not override an existing machine booking');
assert.equal(machineConflict.relatedBookingId, 'booking-production-1');

const sameMachineSamplingCollision = evaluateScheduleCandidate(
  {
    ...samplingCandidate,
    scheduledStart: '2026-11-02T10:00',
    scheduledEnd: '2026-11-02T11:00',
  },
  withContext({
    existingBookings: [occupiedProduction],
  }),
);
assert.equal(sameMachineSamplingCollision.isSchedulable, false);
assert(
  sameMachineSamplingCollision.blockers.some(
    (blocker) => blocker.code === 'MACHINE_TIME_CONFLICT',
  ),
  'sampling and production remain separate tasks but cannot share occupied machine time',
);

const sameTimeOnDifferentMachine = evaluateScheduleCandidate(
  {
    ...samplingCandidate,
    machineSlotId: 'slot-b-morning',
    scheduledStart: '2026-11-02T10:00',
    scheduledEnd: '2026-11-02T11:00',
  },
  withContext({
    existingBookings: [
      {
        ...occupiedProduction,
        technicianProfileId: 'technician-2',
      },
    ],
    machineSlots: [
      ...context.machineSlots,
      {
        id: 'slot-b-morning',
        machineId: 'machine-b',
        machineLabel: 'B 机',
        workingWindowId: 'window-1',
        startAt: '2026-11-02T08:00',
        endAt: '2026-11-02T12:00',
        taskTypes: ['SAMPLING'],
      },
    ],
  }),
);
assert.equal(sameTimeOnDifferentMachine.isSchedulable, true);

const rescheduleRequest = {
  proposalId: 'reschedule-proposal-1',
  reason: '客户确认新增印刷位置复测',
  proposedByProfileId: 'supervisor-1',
  proposedByRole: 'WORKSHOP_SUPERVISOR' as const,
  scheduledStart: '2026-11-02T14:00',
  scheduledEnd: '2026-11-02T15:00',
  readiness: samplingReadiness,
};
const immutableOriginal = JSON.stringify(samplingCandidate);
const reschedule = createRescheduleProposal(
  {
    ...samplingCandidate,
    bookingId: 'booking-sampling-1',
    version: 1,
  },
  rescheduleRequest,
  withContext({
    existingBookings: [
      {
        ...samplingCandidate,
        bookingId: 'booking-sampling-1',
        version: 1,
      },
    ],
  }),
);
assert.equal(reschedule.proposal?.status, 'PROPOSED');
assert.equal(reschedule.proposal?.version, 2);
assert.equal(reschedule.proposal?.basedOnVersion, 1);
assert.equal(reschedule.proposal?.reason, rescheduleRequest.reason);
assert.equal(
  reschedule.proposal?.candidate.scheduledStart,
  '2026-11-02T14:00',
);
assert.equal(
  JSON.stringify(samplingCandidate),
  immutableOriginal,
  'creating a proposal must not mutate the current booking facts',
);
assert(Object.isFrozen(reschedule.proposal));
assert(Object.isFrozen(reschedule.proposal?.candidate));

const unchangedReschedule = createRescheduleProposal(
  {
    ...samplingCandidate,
    bookingId: 'booking-sampling-1',
    version: 1,
  },
  {
    ...rescheduleRequest,
    scheduledStart: samplingCandidate.scheduledStart,
    scheduledEnd: samplingCandidate.scheduledEnd,
  },
  context,
);
assert.equal(unchangedReschedule.proposal, null);
assert(unchangedReschedule.errors.includes('RESCHEDULE_TIME_UNCHANGED'));

const missingReason = createRescheduleProposal(
  {
    ...samplingCandidate,
    bookingId: 'booking-sampling-1',
    version: 1,
  },
  { ...rescheduleRequest, reason: '  ' },
  context,
);
assert.equal(missingReason.proposal, null);
assert(missingReason.errors.includes('PROPOSAL_REASON_MISSING'));

const blockedReschedule = createRescheduleProposal(
  {
    ...samplingCandidate,
    bookingId: 'booking-sampling-1',
    version: 1,
  },
  {
    ...rescheduleRequest,
    scheduledStart: '2026-11-02T10:00',
    scheduledEnd: '2026-11-02T11:00',
  },
  withContext({
    existingBookings: [
      {
        ...samplingCandidate,
        bookingId: 'booking-sampling-1',
        version: 1,
      },
      occupiedProduction,
    ],
  }),
);
assert.equal(blockedReschedule.proposal?.status, 'BLOCKED');
assert(
  blockedReschedule.evaluation?.blockers.some(
    (blocker) => blocker.code === 'MACHINE_TIME_CONFLICT',
  ),
);

const preview = buildSchedulingPreview(
  [productionCandidate, samplingCandidate],
  context,
);
assert.equal(preview.production.length, 1);
assert.equal(preview.sampling.length, 1);
assert.equal(preview.production[0].taskLabel, '生产排期');
assert.equal(preview.sampling[0].taskLabel, '打样排期');
assert.equal(preview.sampling[0].isLate, false);
assert.match(preview.production[0].nextActionLabel, /[\u4e00-\u9fff]/);
assert.match(preview.production[0].ownershipLabel, /车间主管/);
assert.match(preview.production[0].ownershipLabel, /技术员/);

assert.equal(SCHEDULING_PREVIEW_FIXTURE.production.length, 1);
assert.equal(SCHEDULING_PREVIEW_FIXTURE.sampling.length, 1);
assert.equal(SCHEDULING_PREVIEW_FIXTURE.production[0].blockers.length, 0);
assert.equal(SCHEDULING_PREVIEW_FIXTURE.sampling[0].blockers.length, 0);
assert.equal(SCHEDULING_PREVIEW_FIXTURE.sampling[0].isLate, true);

const populatedMarkup = renderToStaticMarkup(
  React.createElement(WorkshopSchedulePreview, {
    preview: SCHEDULING_PREVIEW_FIXTURE,
  }),
);
assert(populatedMarkup.includes('Phase 4 排期非生产预览'));
assert(populatedMarkup.includes('生产排期提案'));
assert(populatedMarkup.includes('打样排期提案'));
assert(populatedMarkup.includes('A 机'));
assert(populatedMarkup.includes('延期预警'));
assert(populatedMarkup.includes('技术员提供产能与时长'));
assert(populatedMarkup.includes('不读取或写入预排期记录'));
assert(!/<button\b/i.test(populatedMarkup));
assert(!/<form\b/i.test(populatedMarkup));
assert(!/<input\b/i.test(populatedMarkup));

const emptyMarkup = renderToStaticMarkup(
  React.createElement(WorkshopSchedulePreview),
);
assert(emptyMarkup.includes('当前没有排期预览项'));
assert(emptyMarkup.includes('真实排期读取、版本提案保存和主管确认尚未接入'));

const pageSource = fs.readFileSync(
  'src/app/workshop-orders/schedule/page.tsx',
  'utf8',
);
const componentSource = fs.readFileSync(
  'src/components/workshop-orders/WorkshopSchedulePreview.tsx',
  'utf8',
);
const modelSource = fs.readFileSync(
  'src/lib/workshop-orders/scheduling.ts',
  'utf8',
);

assert(pageSource.includes('SCHEDULING_PREVIEW_FIXTURE'));
assert(pageSource.includes('WorkshopSchedulePreview'));
assert(!pageSource.includes('supabase'));
assert(!pageSource.includes('/api/'));

for (const [label, source] of [
  ['schedule page', pageSource],
  ['schedule component', componentSource],
  ['scheduling model', modelSource],
] as const) {
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
  ]) {
    assert(
      !forbiddenPattern.test(source),
      `${label} must not use ${forbiddenPattern}`,
    );
  }
}

console.log('workshop-order-scheduling.test.ts: PASS');
