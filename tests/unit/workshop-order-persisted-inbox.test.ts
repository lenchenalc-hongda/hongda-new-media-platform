import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildWosInboxDetail,
  buildWosLiveInbox,
  classifyWosInboxImages,
  isWosQaInboxReadonlyEnabled,
  parseWosInboxReadRequest,
  resolveWosApiActor,
} from '../../src/lib/workshop-orders/api-contract';
import {
  canApplyWosInboxDetailResponse,
  emptyWosInboxEvidenceState,
  shouldApplyWosInboxListResponse,
  wosInboxDetailMatchesItem,
  wosInboxVersionIdentity,
  wosInboxVersionKey,
} from '../../src/lib/workshop-orders/persisted-inbox-state';

const user = '11111111-1111-4111-8111-111111111111';
const org = '0ff53d93-2b9e-48b9-8113-a4768c39cdd2';
const foreignOrg = 'fbdb0989-ae25-4ba4-92f9-3266cc845977';
const profile = '22222222-2222-4222-8222-222222222222';
const orderId = '953d2204-3e65-4b75-b10e-c6e97f1bbb56';
const owner = '33333333-3333-4333-8333-333333333333';
const inboxId = '44444444-4444-4444-8444-444444444444';
const receiptId = '55555555-5555-4555-8555-555555555555';
const qaUrl = 'https://xulmpqaknlwqqculbsek.supabase.co';

assert.equal(isWosQaInboxReadonlyEnabled({
  vercelEnv: 'preview',
  authMode: 'supabase',
  enabled: 'true',
  supabaseUrl: qaUrl,
}), true);
assert.equal(isWosQaInboxReadonlyEnabled({
  vercelEnv: 'preview',
  authMode: 'supabase',
  enabled: 'false',
  supabaseUrl: qaUrl,
}), false);
assert.equal(isWosQaInboxReadonlyEnabled({
  vercelEnv: 'production',
  authMode: 'supabase',
  enabled: 'true',
  supabaseUrl: qaUrl,
}), false);
assert.equal(isWosQaInboxReadonlyEnabled({
  vercelEnv: 'preview',
  authMode: 'mock',
  enabled: 'true',
  supabaseUrl: qaUrl,
}), false);
assert.equal(isWosQaInboxReadonlyEnabled({
  vercelEnv: 'preview',
  authMode: 'supabase',
  enabled: 'true',
  supabaseUrl: 'https://wrong.supabase.co',
}), false);
assert.equal(isWosQaInboxReadonlyEnabled({
  vercelEnv: 'preview',
  authMode: 'supabase',
  enabled: 'true',
  supabaseUrl: 'http://127.0.0.1:55421',
}), false);

assert.deepEqual(parseWosInboxReadRequest('https://preview.example/api/workshop-orders/inbox'), {
  ok: true, orderId: null,
});
assert.deepEqual(parseWosInboxReadRequest(
  'https://preview.example/api/workshop-orders/inbox?orderId=' + orderId,
), { ok: true, orderId });
assert.deepEqual(parseWosInboxReadRequest(
  'https://preview.example/api/workshop-orders/inbox?orderId=not-a-uuid',
), { ok: false, code: 'INVALID_READ_QUERY' });
assert.deepEqual(parseWosInboxReadRequest(
  'https://preview.example/api/workshop-orders/inbox?orderId=' + orderId + '&orgId=' + foreignOrg,
), { ok: false, code: 'INVALID_READ_QUERY' });

const office = resolveWosApiActor(user, {
  id: profile, user_id: user, org_id: org, role: 'admin', is_active: true,
});
const operator = resolveWosApiActor(user, {
  id: profile, user_id: user, org_id: org, role: 'operator', is_active: true,
});
const foreignSales = resolveWosApiActor(user, {
  id: profile, user_id: user, org_id: foreignOrg, role: 'sales', is_active: true,
});
assert.equal(office.ok, true);
assert.equal(operator.ok, true);
assert.equal(foreignSales.ok, true);
assert.deepEqual(resolveWosApiActor(user, {
  id: profile, user_id: user, org_id: org, role: 'viewer', is_active: true,
}), { ok: false, code: 'FORBIDDEN', status: 403 });

const production = {
  id: orderId,
  organization_id: org,
  project_owner_profile_id: owner,
  customer_name_snapshot: 'QA Customer',
  order_number: 'QA-NONPROD-WOS-V1',
  product_name: 'QA Product',
  priority: 'HIGH',
  is_urgent: false,
  version: 11,
  version_label: 'QA-R6',
  workflow_status: 'READINESS_CHECK',
  submitted_at: '2026-11-18T07:13:45.12185+00:00',
};

if (!office.ok || !operator.ok || !foreignSales.ok) throw Error('Expected actors');
const officeInbox = buildWosLiveInbox({
  actor: office.actor,
  productionRows: [production],
  samplingRows: [],
  activeOwnerProfileIds: [owner],
});
const operatorInbox = buildWosLiveInbox({
  actor: operator.actor,
  productionRows: [production],
  samplingRows: [],
  activeOwnerProfileIds: [owner],
});
assert.equal(officeInbox.ok, true);
assert.equal(operatorInbox.ok, true);
assert.deepEqual(buildWosLiveInbox({
  actor: foreignSales.actor,
  productionRows: [production],
  samplingRows: [],
  activeOwnerProfileIds: [owner],
}), { ok: false, code: 'UNTRUSTED_DB_ROW' });

if (!operatorInbox.ok) throw Error('Expected operator inbox');
const item = operatorInbox.items[0];
assert.equal(item.workflowStatus, 'READINESS_CHECK');
assert.equal(item.version, 11);
assert.equal(item.versionLabel, 'QA-R6');

const historyBase = [
  ['DRAFT', 'SUBMITTED', 'admin', 'OFFICE_SUBMISSION_COMMITTED', '2026-11-18T07:13:45.12185+00:00'],
  ['SUBMITTED', 'WORKSHOP_REVIEW', 'operator', 'QA_P2_ACCEPT', '2026-11-18T12:02:13.090567+00:00'],
  ['WORKSHOP_REVIEW', 'NEEDS_INFORMATION', 'operator', 'QA_P2_RETURN_FOR_INFORMATION', '2026-11-18T12:02:13.831018+00:00'],
  ['NEEDS_INFORMATION', 'NEEDS_INFORMATION', 'admin', 'QA_P2_OFFICE_SAVE_CORRECTION', '2026-11-18T12:02:15.551112+00:00'],
  ['NEEDS_INFORMATION', 'WORKSHOP_REVIEW', 'admin', 'QA_P2_OFFICE_RESUBMIT_CORRECTION', '2026-11-18T12:02:16.23468+00:00'],
  ['WORKSHOP_REVIEW', 'WAITING_MATERIAL', 'operator', 'QA_P2_REVIEW_CORRECTION', '2026-11-18T12:50:37.473496+00:00'],
  ['WAITING_MATERIAL', 'WAITING_MATERIAL', 'admin', 'QA_M2_BASELINE_SELECT', '2026-11-21T10:04:22.958329+00:00'],
  ['WAITING_MATERIAL', 'WAITING_MATERIAL', 'admin', 'QA_M2_BASELINE_OFFICE_CONFIRM', '2026-11-21T10:05:04.468749+00:00'],
  ['WAITING_MATERIAL', 'WAITING_MATERIAL', 'operator', 'QA_M2_BASELINE_WORKSHOP_CONFIRM', '2026-11-21T10:08:57.461871+00:00'],
  ['WAITING_MATERIAL', 'READINESS_CHECK', 'operator', 'QA_M2_FINAL_READINESS_CONFIRM', '2026-11-21T10:09:33.323443+00:00'],
] as const;
const history = historyBase.map((row, index) => ({
  organization_id: org,
  entity_type: 'PRODUCTION_ORDER' as const,
  entity_id: orderId,
  previous_status: row[0],
  next_status: row[1],
  actor_role: row[2],
  reason_code: row[3],
  created_at: row[4],
  metadata: index === 0 ? {
    sourceRevision: 1,
    idempotencyKey: '273d2bba-d479-42b9-a836-0617e424ef17',
  } : {
    expectedVersion: index + 1,
    newVersion: index + 2,
    requestId: [
      '37f83a39-384c-4872-b1e3-4e1ea7809051',
      'b8b9eb1f-310b-4ff5-9765-a26e39f04c10',
      '72fbce34-2fd3-4b3b-bfd2-bacd46040b95',
      '342d45c9-59d6-4172-a2f2-064e891ac85b',
      'd1e7a926-71a5-4d8e-9aff-b6c7f87f92ee',
      '70edc3d6-d8c8-4e02-bc9b-a156bb203dd6',
      'f57cd4f2-4b92-4915-930d-664246cc708a',
      'ccea2477-fcb3-45cf-b1a1-541f3091f1e1',
      '311659b5-5a50-4184-bf59-9a4779ca9ced',
    ][index - 1],
  },
}));
const resources = [
  ['FILM', 'VERSION_VERIFIED'],
  ['FIXTURE', 'FIT_VERIFIED'],
  ['INCOMING_MATERIAL', 'QUANTITY_VERIFIED'],
  ['SIGNED_SAMPLE', 'VERIFIED'],
].map(([resource_type, status]) => ({
  resource_type,
  status,
  version_label: 'QA-R6',
  quantity_expected: resource_type === 'INCOMING_MATERIAL' ? 101 : null,
  quantity_arrived: resource_type === 'INCOMING_MATERIAL' ? 101 : null,
  confirmed_by_profile_id: profile,
  confirmed_at: '2026-11-21T10:09:33.355699+00:00',
  expected_at: null,
  arrived_at: '2026-11-21T10:09:31.667+00:00',
  note: '四类物料与当前 proof-set 已完成最终实物核对',
}));
const baselines = [{
  version_label: 'QA-R6',
  status: 'CURRENT',
  office_confirmed_at: '2026-11-21T10:06:00+00:00',
  workshop_confirmed_at: '2026-11-21T10:09:00+00:00',
}];
const images = [
  {
    id: '66666666-6666-4666-8666-666666666666',
    organization_id: org,
    entity_type: 'PRODUCTION_ORDER' as const,
    entity_id: orderId,
    category: 'FILM_PATTERN',
    version_label: 'QA-R6',
    image_status: 'READY',
    file_name: 'current.png',
    uploaded_at: '2026-11-21T10:01:00+00:00',
    superseded_at: null,
  },
  {
    id: '77777777-7777-4777-8777-777777777777',
    organization_id: org,
    entity_type: 'PRODUCTION_ORDER' as const,
    entity_id: orderId,
    category: 'FILM_PATTERN',
    version_label: 'V3',
    image_status: 'READY',
    file_name: 'old.png',
    uploaded_at: '2026-11-18T12:00:00+00:00',
    superseded_at: '2026-11-21T10:00:00+00:00',
  },
];
const detail = buildWosInboxDetail({
  item,
  transaction: {
    inboxId,
    submissionReceiptId: receiptId,
    sourceRevision: 1,
    sourceVersionLabel: 'V1',
    originalWorkflowStatus: 'SUBMITTED',
  },
  production: {
    ...production,
    project_name_snapshot: 'QA Project',
    product_material: 'PP',
    requested_quantity: 101,
    current_batch_quantity: 101,
    planned_ship_date: '2026-11-30',
    surface_treatment: 'MATTE',
    pattern_scope: 'FULL',
    seam_tolerance: '±1mm',
    position_reference: 'CENTER',
    customer_acceptance_standard: 'QA STANDARD',
    packaging_method: 'CARTON',
    carton_quantity: 50,
    label_marking_rule: 'QA LABEL',
  },
  resources,
  blockers: [],
  baselines,
  history,
  images,
  confirmations: [
    {
      confirmation_type: 'WORKSHOP_FINAL_READINESS',
      decision: 'ACCEPT',
      role_snapshot: 'operator',
      note: '只读测试证据',
      confirmed_at: '2026-11-21T10:09:33.323443+00:00',
    },
    {
      confirmation_type: 'OFFICE_BASELINE',
      decision: 'CONFIRM',
      role_snapshot: 'admin',
      note: '只读测试证据',
      confirmed_at: '2026-11-21T10:06:00+00:00',
    },
  ],
});
assert.equal(detail.ok, true);
if (!detail.ok) throw Error('Expected persisted detail');
assert.equal(detail.detail.item.version, 11);
assert.equal(detail.detail.item.workflowStatus, 'READINESS_CHECK');
assert.equal(detail.detail.transaction.originalWorkflowStatus, 'SUBMITTED');
assert.equal(detail.detail.readiness.materialsVerified, true);
assert.equal(detail.detail.handoff.historySequenceVerified, true);
assert.equal(detail.detail.canStart, false);
const imageSet = classifyWosInboxImages(detail.detail.images, detail.detail.item);
assert.deepEqual(imageSet.current.map(image => image.file_name), ['current.png']);
assert.deepEqual(imageSet.historical.map(image => image.file_name), ['old.png']);

const v11Key = wosInboxVersionKey(wosInboxVersionIdentity(item));
const v12Item = {
  ...item,
  version: 12,
  versionLabel: 'QA-R7',
  workflowStatus: 'READINESS_CHECK',
};
const v12Key = wosInboxVersionKey(wosInboxVersionIdentity(v12Item));
const statusChangedItem = { ...item, workflowStatus: 'WAITING_MATERIAL' };
const labelChangedItem = { ...item, versionLabel: 'QA-R7' };

// 1. A loaded v11 detail is unreachable after the list advances to v12.
let evidence = {
  ...emptyWosInboxEvidenceState(),
  details: { [v11Key]: detail.detail },
  expanded: { [v11Key]: true },
};
assert.equal(v11Key === v12Key, false);
assert.equal(evidence.details[v12Key], undefined);
assert.equal(wosInboxDetailMatchesItem(evidence.details[v11Key], v12Item), false);

// 2. A v11 response that arrives after refresh to v12 is rejected.
assert.equal(canApplyWosInboxDetailResponse({
  requestListGeneration: 1,
  currentListGeneration: 2,
  requestDetailGeneration: 1,
  currentDetailGeneration: 1,
  expectedItem: item,
  currentItem: v12Item,
  detail: detail.detail,
}), false);

// 3-4. Status and version-label changes invalidate the same version number.
assert.equal(wosInboxDetailMatchesItem(detail.detail, statusChangedItem), false);
assert.equal(wosInboxDetailMatchesItem(detail.detail, labelChangedItem), false);
assert.equal(canApplyWosInboxDetailResponse({
  requestListGeneration: 1,
  currentListGeneration: 1,
  requestDetailGeneration: 1,
  currentDetailGeneration: 1,
  expectedItem: item,
  currentItem: statusChangedItem,
  detail: detail.detail,
}), false);

// 5. Refresh invalidation clears displayed evidence before a failed request.
evidence = {
  ...emptyWosInboxEvidenceState(),
  details: { [v11Key]: detail.detail },
  expanded: { [v11Key]: true },
  loading: { [v11Key]: true },
};
const refreshFailureEvidence = emptyWosInboxEvidenceState();
assert.deepEqual(refreshFailureEvidence.details, {});
assert.deepEqual(refreshFailureEvidence.expanded, {});
assert.deepEqual(refreshFailureEvidence.loading, {});
assert.equal(canApplyWosInboxDetailResponse({
  requestListGeneration: 1,
  currentListGeneration: 2,
  requestDetailGeneration: 1,
  currentDetailGeneration: undefined,
  expectedItem: item,
  currentItem: null,
  detail: detail.detail,
}), false);

// 6. Out-of-order list responses only apply to the current generation.
const appliedListGenerations: number[] = [];
if (shouldApplyWosInboxListResponse({
  responseGeneration: 1,
  currentGeneration: 2,
})) appliedListGenerations.push(1);
if (shouldApplyWosInboxListResponse({
  responseGeneration: 2,
  currentGeneration: 2,
})) appliedListGenerations.push(2);
assert.deepEqual(appliedListGenerations, [2]);

// 7. A current, fully matching detail remains valid.
assert.equal(canApplyWosInboxDetailResponse({
  requestListGeneration: 2,
  currentListGeneration: 2,
  requestDetailGeneration: 3,
  currentDetailGeneration: 3,
  expectedItem: item,
  currentItem: item,
  detail: detail.detail,
}), true);

const root = process.cwd();
const inboxPage = readFileSync(root + '/src/app/workshop-orders/inbox/page.tsx', 'utf8');
const inboxRoute = readFileSync(root + '/src/app/api/workshop-orders/inbox/route.ts', 'utf8');
const inboxComponent = readFileSync(root + '/src/components/workshop-orders/PersistedWorkshopInbox.tsx', 'utf8');
const apiServer = readFileSync(root + '/src/lib/workshop-orders/api-server.ts', 'utf8');
assert(inboxPage.includes('WOS_QA_INBOX_READONLY_ENABLED'));
assert(!inboxPage.includes('WOS_P5C_NONPROD_API_ENABLED'));
assert(!inboxPage.includes('WOS_P7_NONPROD_SUBMIT_ENABLED'));
assert(inboxRoute.includes('readWosWorkshopInbox(request)'));
assert(!inboxRoute.includes('POST('));
assert(!inboxRoute.includes('PATCH('));
assert(!inboxRoute.includes('DELETE('));
assert(inboxComponent.includes("method: 'GET'"));
assert(!inboxComponent.includes('.rpc('));
assert(!inboxComponent.includes('.insert('));
assert(!inboxComponent.includes('.update('));
assert((inboxComponent.match(/method: 'GET'/g) ?? []).length >= 2);
assert(!/method:\s*'(POST|PUT|PATCH|DELETE)'/.test(inboxComponent));
assert(!inboxComponent.includes('LiveQaWorkshopReadiness'));
assert(!inboxComponent.includes('LiveQaWorkshopActions'));
assert(!inboxComponent.includes('LiveQaM2WorkshopConfirm'));
assert(!inboxComponent.includes('LiveQaFinalReadiness'));
assert(inboxComponent.includes('canStart=false'));
assert(inboxComponent.includes('INBOX_READ_UNAVAILABLE_OR_UNVERIFIED'));
assert(apiServer.includes('WOS_QA_INBOX_READONLY_ENABLED'));
assert(apiServer.includes('INBOX_DETAIL_READ_UNAVAILABLE_OR_TRUNCATED'));

console.log('workshop-order-persisted-inbox.test.ts: PASS');
