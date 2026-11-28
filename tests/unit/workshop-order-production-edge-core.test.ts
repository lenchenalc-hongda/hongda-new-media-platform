import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pngValid } from '../../supabase/functions/_shared/wos-png-integrity';
import {
  approvedBrowserOrigin,
  approvedSupabaseRuntimeUrl,
  canonicalWosV1ImagePath,
  deterministicProofRequestId,
  evaluateWosV1ImageAccess,
  isWosV1ProofResult,
  matchesLegacyQaCloserJwt,
  selectWosV1AdminApiKey,
  objectSnapshotStable,
  parseAllowedOrigins,
  parseAllowedSupabaseRefs,
  parseWosV1ImageVerificationBody,
  snapshotMatchesUpload,
} from '../../supabase/functions/wos-v1-verify-image/core';

const organizationId = '11111111-1111-4111-8111-111111111111';
const foreignOrganizationId = '22222222-2222-4222-8222-222222222222';
const orderId = '33333333-3333-4333-8333-333333333333';
const imageId = '44444444-4444-4444-8444-444444444444';
const profileId = '55555555-5555-4555-8555-555555555555';
const userId = '66666666-6666-4666-8666-666666666666';
const objectId = '77777777-7777-4777-8777-777777777777';
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=',
  'base64',
);
const hash = (bytes: Uint8Array) =>
  createHash('sha256').update(bytes).digest('hex');

const body = parseWosV1ImageVerificationBody({
  category: 'PRODUCT',
  imageId,
  orderId,
  sha256: hash(png),
  storagePath: canonicalWosV1ImagePath({
    organizationId,
    orderId,
    versionLabel: 'V2',
    imageId,
    category: 'PRODUCT',
  }),
});
assert(body);
assert.equal(parseWosV1ImageVerificationBody({
  ...body,
  orgId: organizationId,
}), null);
assert.equal(parseWosV1ImageVerificationBody({
  ...body,
  storagePath: body.storagePath.replace('product', 'other'),
  category: 'OTHER',
}), null);

assert.deepEqual(parseAllowedSupabaseRefs(
  'amqpvxrurenevniilhtl,xulmpqaknlwqqculbsek',
), ['amqpvxrurenevniilhtl', 'xulmpqaknlwqqculbsek']);
assert.deepEqual(parseAllowedSupabaseRefs(
  'amqpvxrurenevniilhtl,amqpvxrurenevniilhtl',
), []);
assert.equal(approvedSupabaseRuntimeUrl(
  'https://amqpvxrurenevniilhtl.supabase.co',
  ['amqpvxrurenevniilhtl'],
), true);
assert.equal(approvedSupabaseRuntimeUrl(
  'https://example.supabase.co',
  ['amqpvxrurenevniilhtl'],
), false);
assert.deepEqual(parseAllowedOrigins(
  'https://qa-preview.example.com,https://staging.example.com/',
), ['https://qa-preview.example.com', 'https://staging.example.com']);
assert.deepEqual(parseAllowedOrigins(
  'http://qa-preview.example.com,https://qa-preview.example.com',
), []);
assert.equal(approvedBrowserOrigin(null, []), true);
assert.equal(approvedBrowserOrigin(
  'https://qa-preview.example.com',
  ['https://qa-preview.example.com'],
), true);
assert.equal(approvedBrowserOrigin(
  'https://evil.example.com',
  ['https://qa-preview.example.com'],
), false);
assert.equal(approvedSupabaseRuntimeUrl(
  'http://amqpvxrurenevniilhtl.supabase.co',
  ['amqpvxrurenevniilhtl'],
), false);

// Regression: sb_secret_* Admin RPC access and legacy closer JWT are separate.
const syntheticJwt = (payload: Record<string, unknown>) => {
  const encode = (value: Record<string, unknown>) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(payload)}.synthetic`;
};
const legacyCloserJwt = syntheticJwt({
  role: 'service_role',
  ref: 'xulmpqaknlwqqculbsek',
});
const ordinaryUserJwt = syntheticJwt({
  role: 'authenticated',
  ref: 'xulmpqaknlwqqculbsek',
});
const wrongProjectServiceJwt = syntheticJwt({
  role: 'service_role',
  ref: 'wrongprojectrefvalue',
});
const newAdminKey = 'sb_secret_test_only_admin';
assert.equal(selectWosV1AdminApiKey(
  JSON.stringify({ default: newAdminKey }), legacyCloserJwt,
), newAdminKey);
assert.equal(selectWosV1AdminApiKey('{}', legacyCloserJwt), legacyCloserJwt);
assert.equal(selectWosV1AdminApiKey('{invalid', legacyCloserJwt), legacyCloserJwt);
assert.equal(selectWosV1AdminApiKey('{}', undefined), '');
assert.equal(matchesLegacyQaCloserJwt(
  `Bearer ${legacyCloserJwt}`, legacyCloserJwt,
), true);
for (const header of [
  null, '', `Bearer ${newAdminKey}`, 'Bearer header.user.signature',
  `Bearer ${legacyCloserJwt}extra`, `bearer ${legacyCloserJwt}`,
]) {
  assert.equal(matchesLegacyQaCloserJwt(header, legacyCloserJwt), false);
}
assert.equal(matchesLegacyQaCloserJwt(
  `Bearer ${legacyCloserJwt}`, newAdminKey,
), false, 'sb_secret is not a legacy JWT');
assert.equal(matchesLegacyQaCloserJwt(
  `Bearer ${legacyCloserJwt}`, undefined,
), false, 'missing legacy key must fail closed');
assert.equal(matchesLegacyQaCloserJwt(
  `Bearer ${ordinaryUserJwt}`, ordinaryUserJwt,
), false, 'ordinary user claims cannot become service_role');
assert.equal(matchesLegacyQaCloserJwt(
  `Bearer ${wrongProjectServiceJwt}`, wrongProjectServiceJwt,
), false, 'service-role JWT must be bound to the QA project');

const profile = {
  id: profileId,
  user_id: userId,
  org_id: organizationId,
  role: 'sales',
  is_active: true,
} as const;
const order = {
  id: orderId,
  organization_id: organizationId,
  created_by_profile_id: profileId,
  sales_owner_profile_id: profileId,
  version: 5,
  version_label: 'V2',
  workflow_status: 'DRAFT',
} as const;
assert.equal(evaluateWosV1ImageAccess({
  runtimeAuthorized: true,
  writesEnabled: true,
  profile,
  order,
}).code, 'ALLOWED');
assert.equal(evaluateWosV1ImageAccess({
  runtimeAuthorized: true,
  writesEnabled: true,
  profile,
  order: { ...order, workflow_status: 'NEEDS_INFORMATION' },
}).code, 'ALLOWED');
assert.equal(evaluateWosV1ImageAccess({
  runtimeAuthorized: true,
  writesEnabled: true,
  qaRevisionAuthorized: false,
  profile,
  order: { ...order, workflow_status: 'WAITING_MATERIAL', version_label: 'QA-R6' },
}).code, 'STATUS_DENIED');
assert.equal(evaluateWosV1ImageAccess({
  runtimeAuthorized: true,
  writesEnabled: true,
  qaRevisionAuthorized: true,
  profile,
  order: { ...order, workflow_status: 'WAITING_MATERIAL', version_label: 'QA-R6' },
}).code, 'ALLOWED');
assert.equal(evaluateWosV1ImageAccess({
  runtimeAuthorized: true,
  writesEnabled: true,
  qaRevisionAuthorized: true,
  profile,
  order: { ...order, workflow_status: 'WAITING_MATERIAL', version_label: 'V1' },
}).code, 'VERSION_INVALID');
assert.equal(evaluateWosV1ImageAccess({
  runtimeAuthorized: true,
  writesEnabled: true,
  qaRevisionAuthorized: true,
  profile,
  order: { ...order, workflow_status: 'DRAFT', version_label: 'QA-R6' },
}).code, 'VERSION_INVALID');
assert.equal(evaluateWosV1ImageAccess({
  runtimeAuthorized: true,
  writesEnabled: true,
  profile: { ...profile, role: 'operator' },
  order,
}).code, 'ROLE_FORBIDDEN');
assert.equal(evaluateWosV1ImageAccess({
  runtimeAuthorized: true,
  writesEnabled: true,
  profile,
  order: { ...order, organization_id: foreignOrganizationId },
}).code, 'ORGANIZATION_DENIED');
assert.equal(evaluateWosV1ImageAccess({
  runtimeAuthorized: true,
  writesEnabled: true,
  profile: { ...profile, id: '88888888-8888-4888-8888-888888888888' },
  order,
}).code, 'OWNER_DENIED');
assert.equal(evaluateWosV1ImageAccess({
  runtimeAuthorized: true,
  writesEnabled: false,
  profile,
  order,
}).code, 'WRITES_DISABLED');
assert.equal(evaluateWosV1ImageAccess({
  runtimeAuthorized: true,
  writesEnabled: true,
  profile,
  order: { ...order, workflow_status: 'SUBMITTED' },
}).code, 'STATUS_DENIED');

const first = {
  id: objectId,
  ownerId: userId,
  version: 'object-version-1',
  updatedAt: '2026-11-23T00:00:00.123456Z',
  mimeType: 'image/png',
  byteSize: String(png.length),
};
assert.equal(snapshotMatchesUpload(first, userId, png.length), true);
assert.equal(snapshotMatchesUpload({
  ...first,
  version: null,
}, userId, png.length), false, 'unknown object version must fail closed');
assert.equal(snapshotMatchesUpload({
  ...first,
  ownerId: '99999999-9999-4999-8999-999999999999',
}, userId, png.length), false);
assert.equal(objectSnapshotStable(first, { ...first }), true);
assert.equal(objectSnapshotStable(first, {
  ...first,
  version: 'object-version-2',
}), false);
assert.equal(objectSnapshotStable(first, {
  ...first,
  updatedAt: '2026-11-23T00:00:01.123456Z',
}), false);

assert.equal(await pngValid(png, hash(png)), true);
const corrupt = Buffer.from(png);
corrupt[corrupt.length - 5] ^= 1;
assert.equal(await pngValid(corrupt, hash(corrupt)), false);
assert.equal(await pngValid(png, '0'.repeat(64)), false);

const proofIdOne = await deterministicProofRequestId('same-proof-input');
const proofIdTwo = await deterministicProofRequestId('same-proof-input');
assert.equal(proofIdOne, proofIdTwo);
assert.match(proofIdOne, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
assert.equal(isWosV1ProofResult({
  status: 'VERIFIED',
  imageId,
  category: 'product',
  sha256: hash(png),
}, {
  imageId,
  category: 'PRODUCT',
  sha256: hash(png),
}), true);
assert.equal(isWosV1ProofResult({
  status: 'VERIFIED',
  imageId,
  category: 'film_pattern',
  sha256: hash(png),
}, {
  imageId,
  category: 'PRODUCT',
  sha256: hash(png),
}), false);

const candidate = readFileSync(
  'tests/sql/wos_p8_p7_production_compatible_candidate.sql',
  'utf8',
);
const runtime = readFileSync(
  'docs/workshop-order-system/production-readiness/sql/WOS_V1_PRODUCTION_RUNTIME_FORWARD_NOT_AUTHORIZED.sql',
  'utf8',
);
const qaDependencies = readFileSync(
  'docs/workshop-order-system/production-readiness/sql/WOS_V1_HOSTED_QA_DEPENDENCIES_NOT_AUTHORIZED.sql',
  'utf8',
);
const edgeIndex = readFileSync(
  'supabase/functions/wos-v1-verify-image/index.ts',
  'utf8',
);
const edgeCore = readFileSync(
  'supabase/functions/wos-v1-verify-image/core.ts',
  'utf8',
);
assert(candidate.includes('TRUSTED_BINARY_PROOF_REQUIRED'));
assert(candidate.includes('FROM PUBLIC,anon,authenticated,service_role'));
assert(candidate.includes("proof.expires_at>clock_timestamp()"));
assert(runtime.includes(
  'REVOKE EXECUTE ON FUNCTION public.wos_register_uploaded_reference_image(',
));
assert(!runtime.includes(
  'GRANT EXECUTE ON FUNCTION public.wos_register_uploaded_reference_image(',
));
assert(qaDependencies.indexOf('pg_advisory_xact_lock') <
  qaDependencies.indexOf('SELECT * INTO v_order'));
assert(qaDependencies.includes("'wos-qa-m2:' || p_order_id::text"));
assert(edgeIndex.includes("request.method === 'OPTIONS'"));
assert(edgeIndex.includes('WOS_V1_EDGE_ALLOWED_ORIGINS'));
assert(edgeIndex.includes("'Access-Control-Allow-Methods'"));
assert(edgeIndex.includes('x-wos-qa-uat-authorization-id'));
assert(edgeIndex.includes('x-wos-qa-uat-execution-id'));
assert(edgeIndex.includes('x-wos-qa-uat-closer-nonce'));
assert(edgeIndex.includes('wos_v1_qa_uat_edge_write_allowed'));
assert(edgeIndex.includes('wos_v1_qa_uat_edge_probe'));
assert(!edgeIndex.includes('wos_v1_qa_uat_edge_renew_proof'));
assert(edgeIndex.includes('wos_v1_qa_uat_edge_record_proof'));
assert(edgeCore.includes('WOS_V1_QA_EDGE_CLOSED'));
assert(edgeCore.includes('matchesLegacyQaCloserJwt('));
assert(!edgeIndex.includes("request.headers.get('authorization') !== `Bearer ${service}`"));
assert(edgeCore.includes('WOS_V1_QA_EDGE_GATE_UNAVAILABLE'));
assert(edgeIndex.includes('evaluateWosV1QaCloserProbeAuth('));
assert(edgeIndex.includes('evaluateWosV1QaCloserProbeGate('));
assert(edgeIndex.includes('WOS_V1_QA_EDGE_CLOSER_SERVICE_ROLE_KEY'));
const adminDownload = edgeIndex.indexOf(
  "const downloaded = await admin.storage.from('wos-private').download(path);",
);
assert(adminDownload >= 0);
assert(!edgeIndex.includes(
  "const downloaded = await userDb.storage.from('wos-private').download(path);",
));
for (const priorGuard of [
  'const auth = await userDb.auth.getUser(token);',
  'const access = evaluateWosV1ImageAccess({',
  "const gate = await admin.rpc('wos_v1_qa_uat_edge_write_allowed'",
  'const path = canonicalWosV1ImagePath({',
  "return output(request, 'PRIVATE_OBJECT_NOT_VERIFIED', 409);",
]) {
  const guardIndex = edgeIndex.indexOf(priorGuard);
  assert(guardIndex >= 0, `missing guard before admin download: ${priorGuard}`);
  assert(
    guardIndex < adminDownload,
    `admin download precedes guard: ${priorGuard}`,
  );
}
assert(
  /function closerProbeDedicatedJwt\(\)[\s\S]{0,180}WOS_V1_QA_EDGE_CLOSER_SERVICE_ROLE_KEY/.test(
    edgeIndex,
  ),
);
assert(!edgeIndex.includes(
  'return Deno.env.get(\'WOS_V1_QA_EDGE_CLOSER_SERVICE_ROLE_KEY\')\n'
    + '    || Deno.env.get(\'SUPABASE_SERVICE_ROLE_KEY\')',
));
assert(edgeIndex.includes('WOS_V1_QA_UAT_AUTHORIZATION_ID'));
assert(edgeIndex.includes('x-wos-qa-closer-credential-preflight'));
assert(edgeIndex.includes('WOS_V1_QA_EDGE_CREDENTIAL_VERIFIED'));
assert(edgeCore.includes('WOS_V1_QA_EDGE_CLOSER_CREDENTIAL_MISSING'));
assert(edgeCore.includes('WOS_V1_QA_EDGE_CLOSER_CREDENTIAL_MISMATCH'));

console.log('workshop-order-production-edge-core.test.ts: PASS');
console.log('WOS_V1_EDGE_FOUR_CATEGORY_ACCESS=PASS');
console.log('WOS_V1_EDGE_REAL_SHA256_AND_OBJECT_STABILITY=PASS');
console.log('WOS_V1_DIRECT_REGISTER_REQUIRES_TRUSTED_PROOF=PASS');
console.log('WOS_V1_EDGE_CORS_ORIGIN_ALLOWLIST=PASS');
console.log('WOS_V1_QA_REVISION_STATE_CONTRACT=PASS');
console.log('WOS_V1_QA_EDGE_HARD_GATE=PASS');
