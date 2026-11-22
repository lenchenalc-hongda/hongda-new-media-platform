import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  canActOnWosP2M2,
  isWosP2M2Enabled,
  isWosP2M2Result,
  parseWosP2M2Action,
  wosP2M2RpcArgs,
} from '../../src/lib/workshop-orders/p2-m2-contract';
import {
  isSameOriginWosMutation, isWosQaRevisionImageUploadEnabled,
} from '../../src/lib/workshop-orders/api-contract';
import {
  WOS_QA_IMAGE_CATEGORIES,
  buildWosQaImageObjectPath,
} from '../../src/lib/workshop-orders/qa-image-categories';

const orderId = '11111111-1111-4111-8111-111111111111';
const requestId = '22222222-2222-4222-8222-222222222222';
const baselineId = '33333333-3333-4333-8333-333333333333';
const imageIds = [
  '44444444-4444-4444-8444-444444444444',
  '55555555-5555-4555-8555-555555555555',
  '66666666-6666-4666-8666-666666666666',
  '77777777-7777-4777-8777-777777777777',
];
const qaUrl = 'https://xulmpqaknlwqqculbsek.supabase.co';
const identity = { orderId, requestId, expectedVersion: 7 };
assert(isSameOriginWosMutation(
  'http://localhost:3100/api/workshop-orders/p2/m2',
  'http://localhost:3100', null,
));
assert(isSameOriginWosMutation(
  'http://localhost:3100/api/workshop-orders/p2/m2',
  null, 'http://localhost:3100/workshop-orders/inbox',
));
assert(isSameOriginWosMutation(
  'http://localhost:3100/api/workshop-orders/p2/m2',
  null, 'http://127.0.0.1:3100/workshop-orders/inbox',
  '127.0.0.1:3100', 'http',
));
assert(!isSameOriginWosMutation(
  'http://localhost:3100/api/workshop-orders/p2/m2',
  null, 'https://attacker.example/path',
));
assert(!isSameOriginWosMutation(
  'http://localhost:3100/api/workshop-orders/p2/m2',
  'https://attacker.example', 'http://localhost:3100/path',
));
assert(!isSameOriginWosMutation(
  'http://localhost:3100/api/workshop-orders/p2/m2', null, null,
));
const select = parseWosP2M2Action({
  ...identity,
  action: 'BASELINE_SELECT',
  payload: {
    productionVersionLabel: 'V1',
    note: '本地合成 QA 四类图片基准选择核对',
    imageIds,
  },
});
assert(select && select.action === 'BASELINE_SELECT');
assert.equal(wosP2M2RpcArgs(select).p_order_id, orderId);
const office = parseWosP2M2Action({
  ...identity,
  action: 'BASELINE_OFFICE_CONFIRM',
  payload: {
    productionVersionLabel: 'V1',
    note: '办公室独立签认当前服务端摘要',
    baselineId,
  },
});
assert(office && office.action === 'BASELINE_OFFICE_CONFIRM');
const baseResponse = {
  status: 'APPLIED',
  orderId,
  requestId,
  version: 8,
  productionVersionLabel: 'V1',
  proofStatus: 'UNVERIFIED',
  canStart: false,
  workflowStatus: 'WAITING_MATERIAL',
  baselineId,
};
const finalReadiness = parseWosP2M2Action({
  ...identity,
  expectedVersion: 10,
  requestId: '88888888-8888-4888-8888-888888888888',
  action: 'FINAL_READINESS_CONFIRM',
  payload: {
    productionVersionLabel: 'V1',
    note: '四类物料在同一原子事务中完成最终核对',
    baselineId,
    physicalCheckAttested: true,
    filmArrivedAt: '2026-11-20T10:00:00Z',
    fixtureArrivedAt: '2026-11-20T10:01:00Z',
    incomingArrivedAt: '2026-11-20T10:02:00Z',
    signedSampleArrivedAt: '2026-11-20T10:03:00Z',
    quantityExpected: 100,
    quantityArrived: 110,
  },
});
assert(finalReadiness && finalReadiness.action === 'FINAL_READINESS_CONFIRM');
assert.equal(wosP2M2RpcArgs(finalReadiness).p_action, 'FINAL_READINESS_CONFIRM');
assert.equal(isWosP2M2Result({
  ...baseResponse,
  version: 11,
  requestId: finalReadiness.requestId,
  workflowStatus: 'READINESS_CHECK',
}, finalReadiness), true);
assert.equal(isWosP2M2Result({
  ...baseResponse,
  version: 11,
  requestId: finalReadiness.requestId,
  workflowStatus: 'WAITING_MATERIAL',
}, finalReadiness), false);
assert.equal(parseWosP2M2Action({
  ...finalReadiness,
  payload: { ...finalReadiness.payload, physicalCheckAttested: false },
}), null);
assert(isWosP2M2Result(baseResponse, select));
assert(isWosP2M2Result({ ...baseResponse, status: 'REPLAYED' }, select));
for (const bad of [
  { ...baseResponse, version: 9 },
  { ...baseResponse, canStart: true },
  { ...baseResponse, proofStatus: 'VERIFIED' },
  { ...baseResponse, requestId: baselineId },
  { ...baseResponse, workflowStatus: 'IN_PRODUCTION' },
]) assert(!isWosP2M2Result(bad, select));
assert.equal(parseWosP2M2Action({
  ...identity,
  action: 'BASELINE_SELECT',
  payload: {
    productionVersionLabel: 'V1',
    note: '本地合成 QA 四类图片基准选择核对',
    imageIds: imageIds.slice(0, 3),
  },
}), null);
assert.equal(parseWosP2M2Action({
  ...identity,
  action: 'BASELINE_SELECT',
  payload: {
    productionVersionLabel: 'V1',
    note: '本地合成 QA 四类图片基准选择核对',
    imageIds,
    actorProfileId: baselineId,
  },
}), null);

for (const role of ['admin', 'manager', 'sales']) {
  assert(canActOnWosP2M2('BASELINE_SELECT', role));
}
for (const role of ['operator', 'viewer', null]) {
  assert(!canActOnWosP2M2('BASELINE_SELECT', role));
}
for (const role of ['admin', 'manager', 'operator']) {
  assert(canActOnWosP2M2('BASELINE_WORKSHOP_CONFIRM', role));
  assert(canActOnWosP2M2('FINAL_READINESS_CONFIRM', role));
}
assert(!canActOnWosP2M2('BASELINE_WORKSHOP_CONFIRM', 'sales'));
assert(!canActOnWosP2M2('FINAL_READINESS_CONFIRM', 'sales'));

assert(!isWosP2M2Enabled({
  vercelEnv: 'preview', nodeEnv: 'development', flag: 'true',
  supabaseUrl: 'http://127.0.0.1:55421',
}));
assert(isWosP2M2Enabled({
  vercelEnv: 'preview', nodeEnv: 'development', flag: 'true',
  supabaseUrl: 'http://127.0.0.1:55421', allowLocal: 'true',
}));
assert(!isWosP2M2Enabled({
  vercelEnv: 'preview', nodeEnv: 'production', flag: 'true',
  supabaseUrl: 'http://127.0.0.1:55421', allowLocal: 'true',
}));
assert(isWosP2M2Enabled({
  vercelEnv: 'preview', flag: 'true',
  supabaseUrl: 'https://xulmpqaknlwqqculbsek.supabase.co',
}));
assert(isWosQaRevisionImageUploadEnabled({
  enabled: 'true', nodeEnv: 'development', supabaseUrl: 'http://127.0.0.1:55421',
  allowLocal: 'true',
}));
assert(isWosQaRevisionImageUploadEnabled({
  enabled: 'true', vercelEnv: 'preview', nodeEnv: 'production',
  supabaseUrl: qaUrl,
}));
assert(!isWosQaRevisionImageUploadEnabled({
  enabled: 'true', vercelEnv: 'production', nodeEnv: 'production',
  supabaseUrl: qaUrl,
}));
assert(!isWosQaRevisionImageUploadEnabled({
  enabled: 'false', nodeEnv: 'development', supabaseUrl: 'http://127.0.0.1:55421',
  allowLocal: 'true',
}));
assert(!isWosQaRevisionImageUploadEnabled({
  enabled: 'true', vercelEnv: 'staging', nodeEnv: 'production', supabaseUrl: qaUrl,
}));
assert(!isWosQaRevisionImageUploadEnabled({
  enabled: 'true', vercelEnv: 'preview', nodeEnv: 'production',
  supabaseUrl: 'https://amqpvxrurenevniilhtl.supabase.co',
}));
assert(!isWosQaRevisionImageUploadEnabled({
  enabled: 'true', nodeEnv: 'production', supabaseUrl: 'http://127.0.0.1:55421',
  allowLocal: 'true',
}));
assert(!isWosQaRevisionImageUploadEnabled({
  enabled: 'true', nodeEnv: undefined, supabaseUrl: 'http://127.0.0.1:55421',
  allowLocal: 'true',
}));

assert.deepEqual(WOS_QA_IMAGE_CATEGORIES, [
  'PRODUCT', 'FILM_PATTERN', 'CUSTOMER_APPROVED_SAMPLE', 'SIGNED_SAMPLE',
]);
assert.equal(buildWosQaImageObjectPath({
  organizationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  orderId,
  versionLabel: 'V1',
  imageId: imageIds[1],
  category: 'FILM_PATTERN',
}), 'organizations/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/wos/production-order/'
  + orderId + '/images/film-pattern/versions/V1/' + imageIds[1]
  + '/qa-preview-proof.png');

const route = readFileSync('src/app/api/workshop-orders/p2/m2/route.ts', 'utf8');
assert(route.includes('resolveVerifiedSupabaseIdentity'));
assert(route.includes("client.rpc('wos_qa_p2_m2_action'"));
assert(route.includes("startsWith('QA-NONPROD-')"));
assert(route.includes('created_by_profile_id'));
assert(route.includes('sales_owner_profile_id'));
assert(route.includes("request.action === 'BASELINE_SELECT'"));
assert(route.includes("request.action === 'BASELINE_OFFICE_CONFIRM'"));
assert(!route.includes('service_role'));
assert(!route.includes('.insert('));
assert(!route.includes('.update('));
const m2Sql = readFileSync(
  'docs/workshop-order-system/nonproduction-only/WOS_P2_M2_NONPROD_SQL_NOT_INSTALLED.sql',
  'utf8');
assert(m2Sql.includes(
  "AND v_actor.id IS DISTINCT FROM v_order.created_by_profile_id"));
assert(m2Sql.includes(
  "AND v_actor.id IS DISTINCT FROM v_order.sales_owner_profile_id"));
assert(!m2Sql.includes("order_number LIKE 'QA-%'"));
assert(m2Sql.includes("order_number LIKE 'QA-NONPROD-%'"));
const m2Rollback = readFileSync(
  'docs/workshop-order-system/codex-v1-integration/rc-sql/qa_m2_install_rollback.sql',
  'utf8',
);
assert(m2Rollback.includes('M2_ROLLBACK_REVISION_IMAGE_DEPENDENCY_ACTIVE'));
assert(m2Rollback.includes(
  'DROP TRIGGER IF EXISTS wos_qa_p2_m2_reference_image_guard'));
assert(m2Rollback.includes(
  'DROP FUNCTION IF EXISTS public.wos_qa_p2_m2_invalidate_signoff'));
assert(m2Rollback.includes(
  'DROP FUNCTION IF EXISTS public.wos_qa_p2_m2_image_change_guard'));
assert(!/DROP\s+(TABLE|FUNCTION|TRIGGER)[^;]*CASCADE/i.test(m2Rollback));
const revisionRollback = readFileSync(
  'docs/workshop-order-system/nonproduction-only/wos_qa_revision_images_QA_ONLY_ROLLBACK_NOT_INSTALLED.sql',
  'utf8',
);
assert(revisionRollback.includes('wos_revision_install_marker'));
assert(revisionRollback.includes('wos_qa_revision_object_insert'));
assert(revisionRollback.includes('wos_register_qa_revision_image'));
assert(revisionRollback.includes('wos_qa_revision_gate_allows'));
assert(revisionRollback.includes('wos_qa_trusted_proof_receipts'));
assert(revisionRollback.includes('wos_acl_backup'));
assert(!/DROP\s+(TABLE|POLICY|FUNCTION|TRIGGER)[^;]*CASCADE/i.test(revisionRollback));
const imageRoute = readFileSync(
  'src/app/api/workshop-orders/qa-image-verify/route.ts', 'utf8');
const edge = readFileSync('supabase/functions/wos-p7-verify-image/index.ts', 'utf8');
const revisionSql = readFileSync(
  'docs/workshop-order-system/nonproduction-only/wos_qa_revision_images_QA_ONLY_NOT_INSTALLED.sql',
  'utf8');
assert(imageRoute.includes('isWosQaRevisionImageUploadEnabled'));
assert(imageRoute.includes('vercelEnv:process.env.VERCEL_ENV'));
assert(edge.includes("Deno.env.get('WOS_QA_REVISION_IMAGES_ENABLED')"));
assert(edge.includes('deterministicProofRequestId'));
assert(edge.includes("crypto.subtle.digest(\n    'SHA-256'"));
assert(!edge.includes('crypto.randomUUID()'));
assert(edge.includes("admin.rpc(\n      'wos_qa_p2_m2_record_trusted_proof'"));
assert(!edge.includes("from('wos_qa_verified_image_proofs')"));
assert(!edge.includes('.upsert('));
assert(edge.includes("'CREATED','UPDATED','REPLAYED'"));
assert(revisionSql.includes('wos_qa_revision_gate_allows'));
assert(revisionSql.includes("g.gate_name='M2_OFFICE_WRITES'"));
assert(revisionSql.includes(
  'DROP TRIGGER IF EXISTS wos_qa_trusted_proof_write_guard'));
assert(revisionSql.includes(
  'DROP TRIGGER IF EXISTS wos_qa_p2_m2_verified_proof_guard'));
assert(revisionSql.includes('CREATE TRIGGER wos_qa_trusted_proof_guard'));
assert(revisionSql.includes('wos_qa_p2_m2_record_trusted_proof'));
assert(revisionSql.includes(
  "pg_catalog.current_setting('wos.qa.actor_user_id',true)"));
assert(revisionSql.includes(
  'REVOKE INSERT,UPDATE,DELETE,TRUNCATE'));
assert(revisionSql.indexOf('pg_advisory_xact_lock') <
  revisionSql.indexOf('WHERE id=p_order_id FOR UPDATE'));
assert(revisionSql.includes('supersedes_image_id'));
assert(revisionSql.includes("image_status='SUPERSEDED'"));
assert(revisionSql.includes(
  'REVOKE INSERT ON public.wos_reference_images FROM PUBLIC,anon,authenticated'));
assert(!/GRANT\s+INSERT\s+ON\s+public\.wos_reference_images/i.test(revisionSql));
console.log('workshop-order-p2-m2-http-contract.test.ts: PASS');
console.log('WOS_P2_M2_HTTP_NO_AUTO_START=PASS');
