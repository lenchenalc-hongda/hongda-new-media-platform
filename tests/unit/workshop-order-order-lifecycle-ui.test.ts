import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  canWosOfficeRevise,
  isWosP2OfficeRpcResult,
  parseWosP2OfficeRevision,
} from '../../src/lib/workshop-orders/p2-office-revision-contract';
import {
  canActOnWosP2,
  isWosP2QaMutationEnabled,
  isWosP2RpcResult,
  parseWosP2Action,
} from '../../src/lib/workshop-orders/p2-action-contract';
import {
  getWosOperatorWorkflowActions,
  hasCurrentWosResubmission,
} from '../../src/lib/workshop-orders/operator-order-actions';
import {
  classifyWosWriteFailure,
  shouldApplyWosOfficeReturnedRead,
  wosResponsibleDisplay,
} from '../../src/lib/workshop-orders/order-lifecycle-state';
import type { WosInboxItem } from '../../src/lib/workshop-orders/api-contract';

const orderId = '11111111-1111-4111-8111-111111111111';
const organizationId = '33333333-3333-4333-8333-333333333333';
const requestId = '22222222-2222-4222-8222-222222222222';
const item: WosInboxItem = {
  entityType: 'PRODUCTION_ORDER',
  id: orderId,
  organizationId,
  projectOwnerProfileId: '44444444-4444-4444-8444-444444444444',
  customerNameSnapshot: 'QA customer',
  productName: 'QA product',
  workflowStatus: 'SUBMITTED',
  version: 2,
  versionLabel: 'V1',
  submittedAt: '2026-11-22T00:00:00.000Z',
  priority: 'MEDIUM',
  isUrgent: false,
  orderNumber: 'QA-NONPROD-LIFECYCLE',
};

assert.deepEqual(
  getWosOperatorWorkflowActions(item, null).map(option => option.action),
  ['ACCEPT', 'RETURN_FOR_INFORMATION'],
);

const workshopReview = { ...item, workflowStatus: 'WORKSHOP_REVIEW', version: 6, versionLabel: 'QA-R2' };
assert.deepEqual(
  getWosOperatorWorkflowActions(workshopReview, {
    item: workshopReview,
    history: [],
  }).map(option => option.action),
  ['RETURN_FOR_INFORMATION'],
  'review correction must stay unavailable before a current-version resubmission proof',
);

const history = [{
  organization_id: organizationId,
  entity_type: 'PRODUCTION_ORDER' as const,
  entity_id: orderId,
  previous_status: 'NEEDS_INFORMATION',
  next_status: 'WORKSHOP_REVIEW',
  actor_profile_id: '99999999-9999-4999-8999-999999999999',
  actor_role: 'admin',
  reason_code: 'QA_P2_OFFICE_RESUBMIT_CORRECTION',
  created_at: '2026-11-22T01:00:00.000Z',
  metadata: { expectedVersion: 5, newVersion: 6, newVersionLabel: 'QA-R2', requestId },
}];
assert.equal(hasCurrentWosResubmission(workshopReview, { item: workshopReview, history }), true);
assert.deepEqual(
  getWosOperatorWorkflowActions(workshopReview, { item: workshopReview, history })
    .map(option => option.action),
  ['REVIEW_CORRECTION', 'RETURN_FOR_INFORMATION'],
);
assert.equal(hasCurrentWosResubmission(workshopReview, {
  item: { ...workshopReview, version: 7 },
  history,
}), false, 'an old version proof must not authorize a newer order');
assert.equal(hasCurrentWosResubmission(workshopReview, {
  item: workshopReview,
  history: [{
    ...history[0],
    metadata: { ...history[0].metadata, requestId: 'forged' },
  }],
}), false, 'forged request identity must not authorize review');
assert.equal(hasCurrentWosResubmission(workshopReview, {
  item: workshopReview,
  history: [history[0], history[0]],
}), false, 'duplicate current-version resubmission evidence must fail closed');
assert.deepEqual(
  getWosOperatorWorkflowActions(
    { ...item, workflowStatus: 'WAITING_MATERIAL', version: 7 },
    null,
  ),
  [],
  'inbox actions must stop after review enters material preparation',
);

const accept = parseWosP2Action({
  orderId,
  expectedVersion: 2,
  requestId,
  action: 'ACCEPT',
  note: history[0].reason_code,
});
assert(accept);
assert.equal(isWosP2RpcResult({
  status: 'APPLIED', orderId, version: 3, requestId, workflowStatus: 'WORKSHOP_REVIEW',
}, accept), true);
assert.equal(isWosP2RpcResult({
  status: 'APPLIED', orderId, version: 4, requestId, workflowStatus: 'WORKSHOP_REVIEW',
}, accept), false, 'a concurrent/stale response cannot satisfy the expected version');
assert.equal(isWosP2RpcResult({
  status: 'APPLIED', orderId, version: 3, requestId, workflowStatus: 'IN_PRODUCTION',
}, accept), false, 'accept must never jump to production');

const review = parseWosP2Action({
  orderId,
  expectedVersion: 6,
  requestId,
  action: 'REVIEW_CORRECTION',
  note: '已核对办公室重新提交的当前版本和退回原因。',
});
assert(review);
assert.equal(isWosP2RpcResult({
  status: 'REVIEWED', orderId, version: 7, requestId,
  workflowStatus: 'WAITING_MATERIAL', resolvedBlockers: 1,
}, review), true);
assert.equal(isWosP2RpcResult({
  status: 'REVIEWED', orderId, version: 7, requestId,
  workflowStatus: 'READINESS_CHECK', resolvedBlockers: 1,
}, review), false);

const saveRevision = parseWosP2OfficeRevision({
  orderId,
  expectedVersion: 5,
  requestId,
  action: 'SAVE_CORRECTION',
  reason: '已按车间退回原因补充六项生产资料。',
  patch: {
    productName: 'Corrected product',
    productMaterial: 'Corrected material',
    requestedQuantity: 120,
    currentBatchQuantity: 100,
    customerAcceptanceStandard: 'Corrected acceptance standard',
    positionReference: 'Corrected print position',
  },
});
assert(saveRevision);
assert.equal(isWosP2OfficeRpcResult({
  status: 'UPDATED', orderId, requestId, version: 6,
  workflowStatus: 'NEEDS_INFORMATION',
}, saveRevision), true);
assert.equal(isWosP2OfficeRpcResult({
  status: 'UPDATED', orderId, requestId, version: 7,
  workflowStatus: 'NEEDS_INFORMATION',
}, saveRevision), false);

const resubmit = parseWosP2OfficeRevision({
  orderId,
  expectedVersion: 6,
  requestId,
  action: 'RESUBMIT_CORRECTION',
  reason: '六项资料已保存，现重新提交车间复核。',
  patch: {},
});
assert(resubmit);
assert.equal(isWosP2OfficeRpcResult({
  status: 'RESUBMITTED', orderId, requestId, version: 7,
  workflowStatus: 'WORKSHOP_REVIEW',
}, resubmit), true);

for (const role of ['admin', 'manager', 'operator']) assert(canActOnWosP2(role));
for (const role of ['sales', 'viewer', 'technician', 'workshop']) assert(!canActOnWosP2(role));
for (const role of ['admin', 'manager', 'sales']) assert(canWosOfficeRevise(role));
for (const role of ['operator', 'viewer', 'technician', 'workshop']) assert(!canWosOfficeRevise(role));

for (const env of [
  { vercelEnv: 'production', flag: 'true', supabaseUrl: 'https://xulmpqaknlwqqculbsek.supabase.co' },
  { vercelEnv: 'preview', flag: 'false', supabaseUrl: 'https://xulmpqaknlwqqculbsek.supabase.co' },
  { vercelEnv: 'preview', flag: 'true', supabaseUrl: 'https://amqpvxrurenevniilhtl.supabase.co' },
]) assert(!isWosP2QaMutationEnabled(env), 'operator write must fail closed');
assert.equal(classifyWosWriteFailure(409, 'VERSION_OR_IDEMPOTENCY_CONFLICT'), 'REFRESH_REQUIRED');
assert.equal(classifyWosWriteFailure(503, 'QA_P2_TRANSACTION_UNAVAILABLE'), 'RETRY_SAME_REQUEST');
assert.equal(classifyWosWriteFailure(403, 'FORBIDDEN'), 'FAILED');
assert.equal(shouldApplyWosOfficeReturnedRead({
  requestGeneration: 2, currentGeneration: 2, aborted: false,
}), true);
assert.equal(shouldApplyWosOfficeReturnedRead({
  requestGeneration: 1, currentGeneration: 2, aborted: false,
}), false, 'older returned-order response must not replace a newer result');
assert.deepEqual(wosResponsibleDisplay({
  responsibleName: null,
  responsibleProfileId: '44444444-4444-4444-8444-444444444444',
  responsibleRole: null,
  responsibleActive: null,
}), {
  name: '44444444-4444-4444-8444-444444444444',
  role: '档案受权限限制',
  warning: null,
});
assert.equal(wosResponsibleDisplay({
  responsibleName: 'Inactive owner',
  responsibleProfileId: '44444444-4444-4444-8444-444444444444',
  responsibleRole: 'sales',
  responsibleActive: false,
}).warning, '责任人账号已停用，需要重新指派');

const operatorUi = readFileSync('src/components/workshop-orders/OperatorWorkflowActions.tsx', 'utf8');
const operatorState = readFileSync('src/lib/workshop-orders/operator-order-actions.ts', 'utf8');
const persistedInbox = readFileSync('src/components/workshop-orders/PersistedWorkshopInbox.tsx', 'utf8');
const returnedUi = readFileSync('src/components/workshop-orders/LiveQaReturnedOrders.tsx', 'utf8');
const returnsRoute = readFileSync('src/app/api/workshop-orders/p2/returns/route.ts', 'utf8');
const productionPage = readFileSync('src/app/workshop-orders/production/new/page.tsx', 'utf8');
const apiServer = readFileSync('src/lib/workshop-orders/api-server.ts', 'utf8');

for (const marker of [
  'writeEnabled',
  "fetch('/api/workshop-orders/p2/actions'",
  "'x-wos-p2-action': '1'",
  'pendingRef.current?.key === key',
  'crypto.randomUUID()',
  'isWosP2RpcResult(result.data, request)',
  'RETURN_FOR_INFORMATION',
  'canStart=false',
]) assert(operatorUi.includes(marker), 'operator workflow UI missing ' + marker);
assert(!operatorUi.includes('NEXT_PUBLIC_WOS_P2_QA_MUTATIONS_ENABLED'));
assert(operatorState.includes("'REVIEW_CORRECTION'"));
assert(operatorState.includes('hasCurrentWosResubmission'));
assert(!operatorUi.includes('CONFIRM_MATERIAL'));
assert(!operatorUi.includes("status:'IN_PRODUCTION'"));
assert(!operatorUi.includes('localStorage'));
assert(persistedInbox.includes('<OperatorWorkflowActions'));
assert(persistedInbox.includes('detail.blockers'));
assert(!persistedInbox.includes("method: 'POST'"));
assert(!persistedInbox.includes('.rpc('));
assert(apiServer.includes('canOperateWorkflow: canActOnWosP2(actor.role)'));
assert(apiServer.includes('workflowWriteEnabled: isWosP2QaMutationEnabled'));

for (const marker of [
  'WOS_QA_INBOX_READONLY_ENABLED',
  'isWosQaInboxReadonlyEnabled',
  "db.from('profiles')",
  'responsibleName',
  'responsibleRole',
  'responsibleActive',
  'revisionWriteEnabled',
  "db.from('wos_blockers')",
  ".eq('blocker_code','P2_DOCUMENTS_INCOMPLETE')",
  ".eq('blocker_category','DOCUMENT')",
  'buildWosP2ReturnReasons',
]) assert(returnsRoute.includes(marker), 'returned read route missing ' + marker);
assert(!returnsRoute.includes('WOS_P5C_NONPROD_API_ENABLED'));
assert(!returnsRoute.includes('WOS_P7_NONPROD_SUBMIT_ENABLED'));
assert(returnedUi.includes('负责责任') === false);
assert(returnedUi.includes('当前责任人'));
assert(returnedUi.includes('保存修订（生成新版本）'));
assert(returnedUi.includes('重新提交车间复核'));
assert(returnedUi.includes('writeEnabled'));
assert(returnedUi.includes('shouldApplyWosOfficeReturnedRead'));
assert(!returnedUi.includes('NEXT_PUBLIC_WOS_P2_QA_OFFICE_REVISION_ENABLED'));
assert(productionPage.includes(
  'returnedReadEnabled && !qaRuntime.readsEnabled && <LiveQaReturnedOrders />',
));

console.log('workshop-order-order-lifecycle-ui.test.ts: PASS');
console.log('WOS_OPERATOR_ACCEPT_RETURN_REVIEW=PASS');
console.log('WOS_OFFICE_SIX_FIELD_SAVE_RESUBMIT=PASS');
console.log('WOS_VERSION_IDEMPOTENCY_ROLE_GATES=PASS');
