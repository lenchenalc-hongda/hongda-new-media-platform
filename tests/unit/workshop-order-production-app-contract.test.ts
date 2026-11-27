import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  canExposeWosV1App,
  encodeWosV1Cursor,
  isWosV1RpcResult,
  parseWosV1Cursor,
  parseWosV1AppRequest,
  parseWosV1ReadQuery,
  resolveWosV1AppRuntime,
  resolveWosV1QaAppRuntime,
  resolveWosV1QaM2Runtime,
  wosV1OperationRoleAllowed,
  wosV1RpcInvocation,
} from '../../src/lib/workshop-orders/production-app-contract';

const organizationId = '11111111-1111-4111-8111-111111111111';
const orderId = '22222222-2222-4222-8222-222222222222';
const requestId = '33333333-3333-4333-8333-333333333333';
const imageId = '44444444-4444-4444-8444-444444444444';
const profileId = '55555555-5555-4555-8555-555555555555';

const production = resolveWosV1AppRuntime({
  vercelEnv: 'production',
  authMode: 'supabase',
  supabaseUrl: 'https://amqpvxrurenevniilhtl.supabase.co',
  appEnabled: 'true',
  writesEnabled: 'false',
});
assert.equal(production.readsEnabled, true);
assert.equal(production.writesEnabled, false);
assert.equal(canExposeWosV1App({
  vercelEnv: 'preview',
  authMode: 'supabase',
  supabaseUrl: 'https://amqpvxrurenevniilhtl.supabase.co',
  appEnabled: 'true',
  writesEnabled: 'true',
}), false);
assert.equal(canExposeWosV1App({
  vercelEnv: 'production',
  authMode: 'supabase',
  supabaseUrl: 'https://xulmpqaknlwqqculbsek.supabase.co',
  appEnabled: 'true',
  writesEnabled: 'true',
}), false);
assert.equal(resolveWosV1AppRuntime({
  vercelEnv: 'production',
  authMode: 'supabase',
  supabaseUrl: 'https://example.supabase.co',
  appEnabled: 'true',
  writesEnabled: 'true',
}).writesEnabled, false);

const qaPreview = resolveWosV1QaAppRuntime({
  vercelEnv: 'preview',
  authMode: 'supabase',
  supabaseUrl: 'https://xulmpqaknlwqqculbsek.supabase.co',
  qaEnabled: 'true',
  qaWritesEnabled: 'false',
});
assert.equal(qaPreview.project, 'qa');
assert.equal(qaPreview.readsEnabled, true);
assert.equal(qaPreview.writesEnabled, false);
assert.equal(qaPreview.m2Adapter, undefined);
assert.equal(qaPreview.m2WritesEnabled, false);
assert.equal(qaPreview.adapter, 'qa-preview');
assert.equal(resolveWosV1QaAppRuntime({
  vercelEnv: 'preview',
  authMode: 'supabase',
  supabaseUrl: 'https://xulmpqaknlwqqculbsek.supabase.co',
  qaEnabled: 'true',
  qaWritesEnabled: 'true',
}).writesEnabled, true, 'QA writes are available only with the fixed QA runtime');
const qaM2 = resolveWosV1QaM2Runtime({
  vercelEnv: 'preview',
  authMode: 'supabase',
  supabaseUrl: 'https://xulmpqaknlwqqculbsek.supabase.co',
  qaEnabled: 'true',
  qaUatM2Enabled: 'true',
  qaUatM2WritesEnabled: 'true',
  qaUatAuthorizationId: 'WOS-V1-PRODUCTION-M2-QA-UAT-004',
});
assert.equal(qaM2.enabled, true);
assert.equal(qaM2.writesEnabled, true);
assert.equal(qaM2.adapter, 'qa-uat');
assert.equal(resolveWosV1QaAppRuntime({
  vercelEnv: 'preview',
  authMode: 'supabase',
  supabaseUrl: 'https://xulmpqaknlwqqculbsek.supabase.co',
  qaEnabled: 'true',
  qaWritesEnabled: 'false',
  qaUatM2Enabled: 'true',
  qaUatM2WritesEnabled: 'true',
  qaUatAuthorizationId: 'WOS-V1-PRODUCTION-M2-QA-UAT-004',
}).m2WritesEnabled, true);
assert.equal(resolveWosV1QaAppRuntime({
  vercelEnv: 'preview',
  authMode: 'supabase',
  supabaseUrl: 'https://xulmpqaknlwqqculbsek.supabase.co',
  qaEnabled: 'true',
  qaUatM2Enabled: 'true',
  qaUatM2WritesEnabled: 'false',
  qaUatAuthorizationId: 'WOS-V1-PRODUCTION-M2-QA-UAT-004',
}).m2WritesEnabled, false);
for (const rejected of [
  resolveWosV1QaM2Runtime({
    vercelEnv: 'production',
    authMode: 'supabase',
    supabaseUrl: 'https://xulmpqaknlwqqculbsek.supabase.co',
    qaEnabled: 'true',
    qaUatM2Enabled: 'true',
    qaUatM2WritesEnabled: 'true',
    qaUatAuthorizationId: 'WOS-V1-PRODUCTION-M2-QA-UAT-004',
  }),
  resolveWosV1QaM2Runtime({
    vercelEnv: 'preview',
    authMode: 'supabase',
    supabaseUrl: 'https://amqpvxrurenevniilhtl.supabase.co',
    qaEnabled: 'true',
    qaUatM2Enabled: 'true',
    qaUatM2WritesEnabled: 'true',
    qaUatAuthorizationId: 'WOS-V1-PRODUCTION-M2-QA-UAT-004',
  }),
  resolveWosV1QaM2Runtime({
    vercelEnv: 'preview',
    authMode: 'not-supabase',
    supabaseUrl: 'https://xulmpqaknlwqqculbsek.supabase.co',
    qaEnabled: 'true',
    qaUatM2Enabled: 'true',
    qaUatM2WritesEnabled: 'true',
    qaUatAuthorizationId: 'WOS-V1-PRODUCTION-M2-QA-UAT-004',
  }),
  resolveWosV1QaM2Runtime({
    vercelEnv: 'preview',
    authMode: 'supabase',
    supabaseUrl: 'https://xulmpqaknlwqqculbsek.supabase.co',
    qaEnabled: 'true',
    qaUatM2Enabled: 'false',
    qaUatM2WritesEnabled: 'true',
    qaUatAuthorizationId: 'WOS-V1-PRODUCTION-M2-QA-UAT-004',
  }),
  resolveWosV1QaM2Runtime({
    vercelEnv: 'preview',
    authMode: 'supabase',
    supabaseUrl: 'https://xulmpqaknlwqqculbsek.supabase.co',
    qaEnabled: 'true',
    qaUatM2Enabled: 'true',
    qaUatM2WritesEnabled: 'true',
    qaUatAuthorizationId: 'WOS-V1-STALE-AUTHORIZATION',
  }),
]) {
  assert.equal(rejected.enabled, false);
  assert.equal(rejected.writesEnabled, false);
}
const qaM2ReadOnly = resolveWosV1QaM2Runtime({
  vercelEnv: 'preview',
  authMode: 'supabase',
  supabaseUrl: 'https://xulmpqaknlwqqculbsek.supabase.co',
  qaEnabled: 'true',
  qaUatM2Enabled: 'true',
  qaUatM2WritesEnabled: 'false',
  qaUatAuthorizationId: 'WOS-V1-PRODUCTION-M2-QA-UAT-004',
});
assert.equal(qaM2ReadOnly.enabled, true);
assert.equal(qaM2ReadOnly.writesEnabled, false);
for (const rejected of [
  resolveWosV1QaAppRuntime({
    vercelEnv: 'production',
    authMode: 'supabase',
    supabaseUrl: 'https://xulmpqaknlwqqculbsek.supabase.co',
    qaEnabled: 'true',
    qaWritesEnabled: 'true',
  }),
  resolveWosV1QaAppRuntime({
    vercelEnv: 'preview',
    authMode: 'supabase',
    supabaseUrl: 'https://amqpvxrurenevniilhtl.supabase.co',
    qaEnabled: 'true',
    qaWritesEnabled: 'true',
  }),
  resolveWosV1QaAppRuntime({
    vercelEnv: 'preview',
    authMode: 'supabase',
    supabaseUrl: 'https://example.supabase.co',
    qaEnabled: 'true',
    qaWritesEnabled: 'true',
  }),
  resolveWosV1QaAppRuntime({
    vercelEnv: 'preview',
    authMode: 'supabase',
    supabaseUrl: 'https://xulmpqaknlwqqculbsek.supabase.co',
    qaEnabled: 'false',
    qaWritesEnabled: 'true',
  }),
]) {
  assert.equal(rejected.readsEnabled, false);
  assert.equal(rejected.writesEnabled, false);
}

assert.equal(parseWosV1ReadQuery('https://example.test/api?view=inbox')?.view, 'inbox');
assert.equal(parseWosV1ReadQuery(
  `https://example.test/api?view=office&orderId=${orderId}`,
)?.orderId, orderId);
assert.equal(parseWosV1ReadQuery(
  `https://example.test/api?view=inbox&orgId=${organizationId}`,
), null);
assert.equal(parseWosV1ReadQuery(
  'https://example.test/api?view=inbox&view=office',
), null);
const cursor = encodeWosV1Cursor({
  updatedAt: '2026-11-23T00:00:00.000Z',
  id: orderId,
});
assert.deepEqual(parseWosV1Cursor(cursor), {
  updatedAt: '2026-11-23T00:00:00.000Z',
  id: orderId,
});
assert.equal(parseWosV1Cursor('not-a-cursor'), null);

const create = parseWosV1AppRequest({
  operation: 'CREATE_ORDER',
  requestId,
  payload: {
    orderNumber: 'WOS-PROD-001',
    customerId: '81000000-0000-4000-8000-000000000001',
    customerNameSnapshot: 'Synthetic Customer',
    projectId: '82000000-0000-4000-8000-000000000001',
    projectNameSnapshot: 'Synthetic Project',
    productName: 'Synthetic cup',
    priority: 'MEDIUM',
    requestedQuantity: 100,
    currentBatchQuantity: 80,
    productMaterial: 'PP',
  },
});
assert(create);
assert.equal(wosV1RpcInvocation(create).rpc, 'wos_create_production_order');
assert.equal(isWosV1RpcResult(create, {
  status: 'CREATED',
  orderId,
  requestId,
  version: 1,
  versionLabel: 'V1',
  workflowStatus: 'DRAFT',
}), true);
assert.equal(isWosV1RpcResult(create, {
  status: 'CREATED',
  orderId,
  requestId,
  version: 1,
  versionLabel: 'V1',
  workflowStatus: 'SUBMITTED',
  canStart: false,
}), false);
assert.equal(parseWosV1AppRequest({
  operation: 'CREATE_ORDER',
  requestId,
  payload: {
    orderNumber: 'WOS-PROD-001',
    customerId: '81000000-0000-4000-8000-000000000001',
    customerNameSnapshot: 'Synthetic Customer',
    projectId: '82000000-0000-4000-8000-000000000001',
    projectNameSnapshot: 'Synthetic Project',
    productName: 'Synthetic cup',
    salesOwnerProfileId: profileId,
    priority: 'MEDIUM',
    requestedQuantity: 100,
    currentBatchQuantity: 80,
    productMaterial: 'PP',
  },
}), null, 'client may not choose owner profiles');
assert.equal(parseWosV1AppRequest({
  operation: 'CREATE_ORDER',
  requestId,
  payload: {
    orderNumber: 'WOS-PROD-NO-CPC',
    customerNameSnapshot: 'Synthetic Customer',
    projectNameSnapshot: 'Synthetic Project',
    productName: 'Synthetic cup',
    priority: 'MEDIUM',
    requestedQuantity: 100,
    currentBatchQuantity: 80,
    productMaterial: 'PP',
  },
}), null, 'production create requires an actual CPC customer and project');
assert.equal(parseWosV1AppRequest({
  operation: 'CREATE_ORDER',
  requestId,
  payload: {
    orderNumber: 'WOS-PROD-SPLIT',
    customerId: '81000000-0000-4000-8000-000000000001',
    customerNameSnapshot: 'Synthetic Customer',
    projectId: '82000000-0000-4000-8000-000000000001',
    projectNameSnapshot: 'Synthetic Project',
    productName: 'Synthetic cup',
    priority: 'MEDIUM',
    requestedQuantity: 100,
    currentBatchQuantity: 80,
    splitDelivery: true,
    productMaterial: 'PP',
  },
}), null, 'first release must reject split delivery');

const accept = parseWosV1AppRequest({
  operation: 'OPERATOR_ACTION',
  orderId,
  expectedVersion: 2,
  requestId,
  action: 'ACCEPT',
  reason: 'Synthetic operator accepts the current submitted order.',
});
assert(accept);
assert.equal(wosV1OperationRoleAllowed(accept, 'operator'), true);
assert.equal(wosV1OperationRoleAllowed(accept, 'viewer'), false);
assert.equal(wosV1OperationRoleAllowed(create, 'sales'), true);
assert.equal(wosV1OperationRoleAllowed(create, 'operator'), false);
assert.equal(isWosV1RpcResult(accept, {
  status: 'APPLIED',
  orderId,
  requestId,
  expectedVersion: 2,
  version: 3,
  versionLabel: 'V1',
  workflowStatus: 'WORKSHOP_REVIEW',
  canStart: false,
}), true);
assert.equal(isWosV1RpcResult(accept, {
  status: 'APPLIED',
  orderId,
  requestId,
  expectedVersion: 2,
  version: 4,
  versionLabel: 'V1',
  workflowStatus: 'WORKSHOP_REVIEW',
  canStart: false,
}), false);

const save = parseWosV1AppRequest({
  operation: 'SAVE_CORRECTION',
  orderId,
  expectedVersion: 4,
  requestId,
  reason: 'Synthetic office correction after the document return.',
  patch: {
    customerAcceptanceStandard: 'Corrected synthetic acceptance',
  },
});
assert(save);
assert.equal(isWosV1RpcResult(save, {
  status: 'SAVED',
  orderId,
  requestId,
  version: 5,
  versionLabel: 'V2',
  workflowStatus: 'NEEDS_INFORMATION',
  canStart: false,
}), true);

const review = parseWosV1AppRequest({
  operation: 'REVIEW_CORRECTION',
  orderId,
  expectedVersion: 6,
  requestId,
  note: 'Synthetic current revision review with one resolved document blocker.',
});
assert(review);
assert.equal(isWosV1RpcResult(review, {
  status: 'REVIEWED',
  orderId,
  requestId,
  expectedVersion: 6,
  version: 7,
  versionLabel: 'V3',
  workflowStatus: 'WAITING_MATERIAL',
  resolvedBlockers: 1,
  canStart: false,
}), true);

const server = readFileSync(
  'src/lib/workshop-orders/production-app-server.ts',
  'utf8',
) + readFileSync(
  'src/lib/workshop-orders/production-app-handler.ts',
  'utf8',
);
const route = readFileSync(
  'src/app/api/workshop-orders/v1/route.ts',
  'utf8',
);
const qaRoute = readFileSync(
  'src/app/api/workshop-orders/v1-qa/route.ts',
  'utf8',
);
const edge = readFileSync(
  'supabase/functions/wos-v1-verify-image/index.ts',
  'utf8',
);
const officeWorkflow = readFileSync(
  'src/components/workshop-orders/ProductionOfficeWorkflow.tsx',
  'utf8',
);
const cpcSelector = readFileSync(
  'src/components/workshop-orders/ProductionCpcSelector.tsx',
  'utf8',
);
const workshopInbox = readFileSync(
  'src/components/workshop-orders/ProductionWorkshopInbox.tsx',
  'utf8',
);
const officeOrders = readFileSync(
  'src/components/workshop-orders/ProductionOfficeOrders.tsx',
  'utf8',
);
const appClient = readFileSync(
  'src/lib/workshop-orders/production-app-client.ts',
  'utf8',
);
const officePage = readFileSync(
  'src/app/workshop-orders/production/new/page.tsx',
  'utf8',
);
const workshopPage = readFileSync(
  'src/app/workshop-orders/inbox/page.tsx',
  'utf8',
);
for (const marker of [
  'WOS_V1_WRITES_DISABLED',
  'x-wos-v1-action',
  'resolveVerifiedSupabaseIdentity',
  "from('profiles')",
  'WOS_V1_UNVERIFIED_TRANSACTION_RESULT',
  'WOS_V1_DETAIL_VERSION_CHANGED',
  "return ['DRAFT', ...ACTIVE_ORDER_STATUSES]",
  'salesOwnerProfileId: auth.actor.profileId',
  'CPC_LINK_DENIED',
  'PROJECT_CUSTOMER_MISMATCH',
]) assert(server.includes(marker), 'production app server missing ' + marker);
assert(!server.includes('service_role'));
assert(!route.includes('service_role'));
assert(!qaRoute.includes('service_role'));
for (const marker of [
  'customerId: cpcSelection.customerId',
  'projectId: cpcSelection.projectId',
  "persisted.workflow_status !== 'DRAFT'",
]) assert(officeWorkflow.includes(marker),
  'production office workflow missing ' + marker);
for (const marker of [
  'loadWosV1CpcOptions',
  'CPC 客户',
  'CPC 项目',
]) assert(cpcSelector.includes(marker), 'CPC selector missing ' + marker);
for (const marker of [
  'createWosV1QaHandlerDependencies',
  'handleWosV1Request',
  'WOS_V1_QA_EXECUTION_TIMEOUT',
]) assert(qaRoute.includes(marker), 'QA app route missing ' + marker);
for (const marker of [
  'WOS_SUPABASE_ALLOWED_REFS',
  'WOS_V1_EDGE_WRITES_ENABLED',
  'WOS_V1_QA_EDGE_AUTHORIZATION_REQUIRED',
  'wos_v1_qa_uat_edge_write_allowed',
  'wos_v1_qa_uat_edge_probe',
  'wos_v1_qa_uat_edge_record_proof',
  'x-wos-qa-uat-execution-id',
  'x-wos-qa-uat-closer-nonce',
  'readBoundedText(request, MAX_REQUEST_BYTES)',
  'wos_p7_service_storage_snapshot',
  'wos_v1_renew_expired_image_proof',
  'wos_p7_record_trusted_image_proof',
  'pngValid(bytes, body.sha256)',
  'OBJECT_CHANGED_DURING_VERIFICATION',
  'WOS_V1_TRUSTED_IMAGE_PROOF_ISSUED',
]) assert(edge.includes(marker), 'production Edge missing ' + marker);
assert(!edge.includes('wos_v1_qa_uat_edge_renew_proof'));
assert(edge.includes('QA_UAT_PROJECT_REF'));
assert(edge.includes('QA_UAT_AUTHORIZATION_ID'));
assert(edge.includes('qaUatRuntime'));
assert(!edge.includes('storagePath: body.storagePath'));
for (const marker of [
  'WOS_V1_IMAGE_CATEGORIES',
  'uploadAndVerifyWosV1Image',
  "'CREATE_ORDER'",
  "'CONFIRM_OFFICE'",
  "'SUBMIT_ORDER'",
  'existingImageIdsRef',
  'DRAFT_PAYLOAD_MISMATCH',
  'DRAFT_IMAGE_SET_CONFLICT',
  'canStart=false',
]) assert(officeWorkflow.includes(marker), 'Office production UI missing ' + marker);
assert(appClient.includes("functions.invoke('wos-v1-verify-image'"));
assert(appClient.includes('NEXT_PUBLIC_WOS_V1_QA_PREVIEW'));
assert(appClient.includes('x-wos-qa-uat-authorization-id'));
assert(appClient.includes('WOS_V1_PRODUCTION_M2_QA_UAT_AUTHORIZATION_ID'));
assert(appClient.includes('NEXT_PUBLIC_WOS_V1_QA_UAT_EXECUTION_ID'));
assert(appClient.includes('NEXT_PUBLIC_WOS_V1_QA_UAT_CLOSER_NONCE'));
assert(appClient.includes('/api/workshop-orders/v1-qa'));
for (const page of [officePage, workshopPage]) {
  assert(page.includes('resolveWosV1QaAppRuntime'));
  assert(page.includes('WOS_V1_QA_APP_ENABLED'));
}
for (const marker of [
  "query: '?view=inbox'",
  "'OPERATOR_ACTION'",
  "'REVIEW_CORRECTION'",
  'currentPrivateProofState',
  'canStart=false',
]) assert(workshopInbox.includes(marker), 'Workshop production UI missing ' + marker);
for (const marker of ['detailGeneration', 'detailAbort', 'signal: controller.signal']) {
  assert(workshopInbox.includes(marker), 'Workshop stale-detail guard missing ' + marker);
  assert(officeOrders.includes(marker), 'Office stale-detail guard missing ' + marker);
}
for (const marker of ['nextCursor', 'loadMore', 'cursor=']) {
  assert(workshopInbox.includes(marker), 'Workshop pagination missing ' + marker);
  assert(officeOrders.includes(marker), 'Office pagination missing ' + marker);
}
assert(!workshopInbox.includes('IN_PRODUCTION'));
assert(!officeWorkflow.includes('service_role'));

console.log('workshop-order-production-app-contract.test.ts: PASS');
console.log('WOS_V1_APP_PRODUCTION_ONLY_RUNTIME=PASS');
console.log('WOS_V1_APP_ROLE_AND_RESULT_CONTRACTS=PASS');
console.log('WOS_V1_PROJECT_NEUTRAL_EDGE_SOURCE=PASS');
console.log('WOS_V1_EDGE_QA_HARD_LEASE_BRANCH=PASS');
console.log('WOS_V1_QA_ADAPTER_DEFAULT_DENY=PASS');
