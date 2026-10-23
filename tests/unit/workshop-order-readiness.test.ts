import assert from 'node:assert/strict';
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import WorkshopInbox from '../../src/components/workshop-orders/WorkshopInbox';
import {
  buildWorkshopQueue,
  buildWorkshopQueueItem,
  EMPTY_WORKSHOP_QUEUE,
  evaluateWorkshopReadiness,
  type ProductionWorkshopReadinessInput,
  type SamplingWorkshopReadinessInput,
  type WorkshopReadinessFacts,
  type WorkshopReadinessInput,
} from '../../src/lib/workshop-orders/readiness';
import {
  productionOrderFixture,
  samplingRequestFixture,
} from '../../src/lib/workshop-orders/fixtures';
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

const readyFacts: WorkshopReadinessFacts = {
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

function productionInput(
  overrides: Partial<ProductionWorkshopReadinessInput> = {},
): ProductionWorkshopReadinessInput {
  return {
    entityType: 'PRODUCTION_ORDER',
    order: productionOrderFixture,
    technicalConfirmed: true,
    supervisorConfirmed: true,
    ...readyFacts,
    ...overrides,
  };
}

function samplingInput(
  overrides: Partial<SamplingWorkshopReadinessInput> = {},
): SamplingWorkshopReadinessInput {
  return {
    entityType: 'SAMPLING_REQUEST',
    request: samplingRequestFixture,
    priority: 'HIGH',
    technicianAccepted: true,
    ...readyFacts,
    ...overrides,
  };
}

const productionReady = evaluateWorkshopReadiness(productionInput());
assert.equal(productionReady.isReady, true);
assert.deepEqual(productionReady.blockers, []);

const samplingReady = evaluateWorkshopReadiness(samplingInput());
assert.equal(samplingReady.isReady, true);
assert.deepEqual(samplingReady.blockers, []);

const pointFailures: ReadonlyArray<{
  label: string;
  input: WorkshopReadinessInput;
  code: string;
}> = [
  {
    label: 'film version unverified',
    input: productionInput({ filmReadiness: 'ARRIVED' }),
    code: 'FILM_VERSION_UNVERIFIED',
  },
  {
    label: 'fixture not fit checked',
    input: productionInput({ fixtureReadiness: 'ARRIVED' }),
    code: 'FIXTURE_NOT_READY',
  },
  {
    label: 'incoming quantity unchecked',
    input: productionInput({ incomingMaterialReadiness: 'ARRIVED' }),
    code: 'INCOMING_MATERIAL_NOT_READY',
  },
  {
    label: 'required production signed sample absent',
    input: productionInput({ signedSampleReadiness: 'MISSING' }),
    code: 'SIGNED_SAMPLE_MISSING',
  },
  {
    label: 'required sampling signed sample absent',
    input: samplingInput({ signedSampleReadiness: 'MISSING' }),
    code: 'SIGNED_SAMPLE_MISSING',
  },
  {
    label: 'visual baseline absent',
    input: productionInput({ visualBaseline: null }),
    code: 'VISUAL_BASELINE_MISSING',
  },
  {
    label: 'visual baseline stale',
    input: productionInput({
      visualBaseline: { ...readyBaseline, isCurrent: false },
    }),
    code: 'VISUAL_BASELINE_NOT_CURRENT',
  },
  {
    label: 'required workshop image absent',
    input: productionInput({
      visualBaseline: { ...readyBaseline, productImageCount: 0 },
    }),
    code: 'PRODUCT_IMAGE_MISSING',
  },
  {
    label: 'visual baseline version mismatch',
    input: productionInput({
      visualBaseline: { ...readyBaseline, versionLabel: 'V2' },
    }),
    code: 'VERSION_MISMATCH',
  },
  {
    label: 'workshop visual confirmation absent',
    input: productionInput({
      visualBaseline: { ...readyBaseline, workshopConfirmed: false },
    }),
    code: 'WORKSHOP_VISUAL_CONFIRMATION_MISSING',
  },
  {
    label: 'unresolved blocker',
    input: productionInput({ unresolvedBlockerCount: 1 }),
    code: 'OPEN_BLOCKER',
  },
];

for (const failure of pointFailures) {
  const result = evaluateWorkshopReadiness(failure.input);
  assert.equal(result.isReady, false, `${failure.label} must fail closed`);
  assert(
    result.blockers.some((blocker) => blocker.code === failure.code),
    `${failure.label} must report ${failure.code}`,
  );
}

const mismatchedVersionAndImages = evaluateWorkshopReadiness(
  productionInput({
    filmVersionLabel: 'V0',
    visualBaseline: {
      ...readyBaseline,
      versionLabel: 'V2',
      productImageCount: 0,
      filmImageCount: 0,
      customerApprovedSampleCount: 0,
    },
  }),
);
assert.equal(mismatchedVersionAndImages.isReady, false);
assert(
  mismatchedVersionAndImages.blockers.some(
    (blocker) => blocker.code === 'FILM_VERSION_UNVERIFIED',
  ),
);
assert(
  mismatchedVersionAndImages.blockers.some(
    (blocker) => blocker.code === 'VERSION_MISMATCH',
  ),
);
for (const requiredCode of [
  'PRODUCT_IMAGE_MISSING',
  'FILM_IMAGE_MISSING',
  'CUSTOMER_SAMPLE_MISSING',
] as const) {
  assert(
    mismatchedVersionAndImages.blockers.some(
      (blocker) => blocker.code === requiredCode,
    ),
  );
}

const orderedFailure = evaluateWorkshopReadiness(
  productionInput({
    order: { ...productionOrderFixture, workflowStatus: 'DRAFT' },
    filmReadiness: 'ARRIVED',
    filmVersionLabel: 'V0',
    fixtureReadiness: 'ARRIVED',
    incomingMaterialReadiness: 'ARRIVED',
    signedSampleReadiness: 'MISSING',
    technicalConfirmed: false,
    supervisorConfirmed: false,
    visualBaseline: {
      ...readyBaseline,
      versionLabel: 'V2',
      isCurrent: false,
      productImageCount: 0,
      filmImageCount: 0,
      customerApprovedSampleCount: 0,
      workshopConfirmed: false,
    },
    unresolvedBlockerCount: 1,
  }),
);
const orderedCodes = orderedFailure.blockers.map((blocker) => blocker.code);
assert.equal(orderedCodes[0], 'INVALID_WORKFLOW_STATUS');
assert.equal(orderedCodes.at(-1), 'OPEN_BLOCKER');
assert(
  orderedCodes.indexOf('VERSION_MISMATCH')
    < orderedCodes.indexOf('PRODUCT_IMAGE_MISSING'),
);
assert(
  orderedCodes.indexOf('WORKSHOP_VISUAL_CONFIRMATION_MISSING')
    < orderedCodes.indexOf('TECHNICAL_CONFIRMATION_MISSING'),
);

const malformedBaseline = evaluateWorkshopReadiness(
  productionInput({
    visualBaseline: {
      ...readyBaseline,
      productImageCount: undefined,
    } as unknown as VisualBaselineSummary,
  }),
);
assert.equal(malformedBaseline.isReady, false);
assert(
  malformedBaseline.blockers.some(
    (blocker) => blocker.code === 'READINESS_INPUT_INCOMPLETE',
  ),
);

const missingRequiredFacts = evaluateWorkshopReadiness(
  productionInput({
    filmRequired: undefined as unknown as boolean,
  }),
);
assert.equal(missingRequiredFacts.isReady, false);
assert(
  missingRequiredFacts.blockers.some(
    (blocker) => blocker.code === 'READINESS_INPUT_INCOMPLETE',
  ),
);

const earlyWorkflow = evaluateWorkshopReadiness(
  productionInput({
    order: { ...productionOrderFixture, workflowStatus: 'READY_TO_SCHEDULE' },
  }),
);
assert.equal(
  earlyWorkflow.isReady,
  false,
  'an earlier consequential status must not become start-ready',
);
assert(
  earlyWorkflow.blockers.some(
    (blocker) => blocker.code === 'INVALID_WORKFLOW_STATUS',
  ),
);

const mixedQueue = buildWorkshopQueue([
  samplingInput({ priority: 'MEDIUM' }),
  productionInput(),
  {
    ...samplingInput(),
    request: {
      ...samplingRequestFixture,
      id: '00000000-0000-4000-8000-000000000099',
    },
  },
]);
assert.equal(mixedQueue.productionOrders.length, 1);
assert.equal(mixedQueue.samplingRequests.length, 2);
assert(
  mixedQueue.productionOrders.every(
    (item) => item.entityType === 'PRODUCTION_ORDER',
  ),
);
assert(
  mixedQueue.samplingRequests.every(
    (item) => item.entityType === 'SAMPLING_REQUEST',
  ),
);
assert.equal(mixedQueue.samplingRequests[0].priority, 'HIGH');
assert.equal(mixedQueue.samplingRequests[1].priority, 'MEDIUM');

const productionItem = buildWorkshopQueueItem(productionInput());
assert.equal(productionItem.isReady, true);
assert.equal(productionItem.typeLabel, '生产单');
assert.match(productionItem.statusLabel, /[\u4e00-\u9fff]/);
assert.equal(productionItem.priorityLabel, '高');
assert.equal(productionItem.customerName, productionOrderFixture.customerNameSnapshot);
assert.equal(productionItem.projectName, productionOrderFixture.projectNameSnapshot);
assert.equal(productionItem.productName, productionOrderFixture.productName);
assert.equal(productionItem.versionLabel, productionOrderFixture.versionLabel);

const before = JSON.stringify(productionInput());
const immutableInput = productionInput();
const immutableSnapshot = JSON.stringify(immutableInput);
evaluateWorkshopReadiness(immutableInput);
buildWorkshopQueueItem(immutableInput);
buildWorkshopQueue([immutableInput]);
assert.equal(JSON.stringify(immutableInput), immutableSnapshot);
assert.equal(JSON.stringify(productionInput()), before);

const emptyMarkup = renderToStaticMarkup(
  React.createElement(WorkshopInbox, { queue: EMPTY_WORKSHOP_QUEUE }),
);
assert(emptyMarkup.includes('当前没有可展示的车间任务'));
assert(emptyMarkup.includes('真实 Supabase 持久化'));
assert(emptyMarkup.includes('角色限制的数据加载'));
assert(emptyMarkup.includes('图片上传'));
assert(emptyMarkup.includes('最终工作流状态变更'));
assert(emptyMarkup.includes('尚未接入'));
assert(!/<button\b/i.test(emptyMarkup));
assert(!/type=["']file["']/i.test(emptyMarkup));

const populatedMarkup = renderToStaticMarkup(
  React.createElement(WorkshopInbox, {
    queue: buildWorkshopQueue([productionInput(), samplingInput()]),
  }),
);
assert(populatedMarkup.includes('生产单齐套队列'));
assert(populatedMarkup.includes('打样申请齐套队列'));
assert(populatedMarkup.includes(productionOrderFixture.customerNameSnapshot));
assert(populatedMarkup.includes(samplingRequestFixture.customerNameSnapshot));

const pageSource = fs.readFileSync(
  'src/app/workshop-orders/inbox/page.tsx',
  'utf8',
);
const componentSource = fs.readFileSync(
  'src/components/workshop-orders/WorkshopInbox.tsx',
  'utf8',
);
const modelSource = fs.readFileSync(
  'src/lib/workshop-orders/readiness.ts',
  'utf8',
);

assert(pageSource.includes('WorkshopInbox'));
assert(pageSource.includes('EMPTY_WORKSHOP_QUEUE'));
assert(!pageSource.includes('productionOrderFixture'));
assert(!pageSource.includes('samplingRequestFixture'));

for (const [label, source] of [
  ['inbox page', pageSource],
  ['inbox component', componentSource],
  ['readiness model', modelSource],
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

assert(!/<button\b/i.test(componentSource));
assert(!/>\s*(接单|开工|确认放行|放行)\s*</.test(componentSource));

console.log('workshop-order-readiness.test.ts: PASS');
