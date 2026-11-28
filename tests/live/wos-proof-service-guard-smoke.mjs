import crypto from 'node:crypto';

const AUTHORIZATION_ID = 'WOS-V1-QA-PROOF-SERVICE-GUARD-REPLACEMENT';
const EXPECTED_PROJECT_REF = 'xulmpqaknlwqqculbsek';
const EXPECTED_BASE_URL = `https://${EXPECTED_PROJECT_REF}.supabase.co`;
const TARGET_ORDER = 'ba38e41b-8cac-469c-aabd-00b6ada033e2';

if (process.env.WOS_PROOF_GUARD_SMOKE !== 'YES') {
  throw new Error('PROOF_GUARD_SMOKE_NOT_AUTHORIZED');
}
if (process.env.WOS_PROOF_GUARD_SMOKE_AUTHORIZATION !== AUTHORIZATION_ID) {
  throw new Error('PROOF_GUARD_SMOKE_AUTHORIZATION_MISMATCH');
}
if (process.env.WOS_QA_SUPABASE_URL !== EXPECTED_BASE_URL) {
  throw new Error('PROOF_GUARD_SMOKE_PROJECT_MISMATCH');
}

const serviceRoleKey = process.env.WOS_QA_SERVICE_ROLE_KEY;
const authenticatedJwt = process.env.WOS_QA_AUTHENTICATED_JWT;
const anonKey = process.env.WOS_QA_ANON_KEY;
if (!serviceRoleKey || !authenticatedJwt || !anonKey) {
  throw new Error('PROOF_GUARD_SMOKE_CREDENTIALS_MISSING');
}

const recordNulls = {
  p_image_id: null,
  p_order_id: null,
  p_actor_user_id: null,
  p_storage_path: null,
  p_storage_object_id: null,
  p_storage_object_version: null,
  p_storage_object_updated_at: null,
  p_sha256: null,
};

async function callRpc(endpoint, authorization, apikey, payload) {
  const response = await fetch(
    `${EXPECTED_BASE_URL}/rest/v1/rpc/${endpoint}`,
    {
      method: 'POST',
      headers: {
        apikey,
        Authorization: `Bearer ${authorization}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20_000),
    },
  );
  const body = await response.json().catch(() => ({}));
  return { status: response.status, body };
}

async function callRpcWithoutAuthorization(endpoint, apikey, payload) {
  const response = await fetch(
    `${EXPECTED_BASE_URL}/rest/v1/rpc/${endpoint}`,
    {
      method: 'POST',
      headers: {
        apikey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20_000),
    },
  );
  const body = await response.json().catch(() => ({}));
  return { status: response.status, body };
}

function makeUnsignedWrongRoleJwt(role) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const header = encode({ alg: 'HS256', typ: 'JWT' });
  const payload = encode({ role, iat: now, exp: now + 300 });
  const wrongSignature = crypto
    .createHmac('sha256', crypto.randomBytes(32))
    .update(`${header}.${payload}`)
    .digest('base64url');
  return `${header}.${payload}.${wrongSignature}`;
}

async function readCount(path) {
  const response = await fetch(`${EXPECTED_BASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      Prefer: 'count=exact',
      Range: '0-0',
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    throw new Error(`PROOF_GUARD_SMOKE_COUNT_FAILED:${path}:${response.status}`);
  }
  const count = Number((response.headers.get('content-range') ?? '').split('/').at(-1));
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error(`PROOF_GUARD_SMOKE_COUNT_INVALID:${path}`);
  }
  return count;
}

async function readState() {
  const [
    orders,
    referenceImages,
    proofs,
    receipts,
    baselines,
    baselineItems,
    enabledGates,
  ] = await Promise.all([
    readCount('wos_production_orders?select=id&limit=0'),
    readCount('wos_reference_images?select=id&limit=0'),
    readCount('wos_qa_verified_image_proofs?select=image_id&limit=0'),
    readCount('wos_qa_trusted_proof_receipts?select=order_id&limit=0'),
    readCount('wos_visual_baselines?select=id&limit=0'),
    readCount('wos_visual_baseline_items?select=baseline_id&limit=0'),
    readCount('wos_qa_p2_m2_gate?select=gate_name&enabled=eq.true&limit=0'),
  ]);
  const targetProofs = await readCount(
    `wos_qa_verified_image_proofs?select=image_id&order_id=eq.${TARGET_ORDER}&limit=0`,
  );
  const targetReceipts = await readCount(
    `wos_qa_trusted_proof_receipts?select=order_id&order_id=eq.${TARGET_ORDER}&limit=0`,
  );
  return {
    orders,
    referenceImages,
    proofs,
    receipts,
    baselines,
    baselineItems,
    enabledGates,
    targetProofs,
    targetReceipts,
  };
}

async function assertAuthenticatedJwt() {
  const response = await fetch(`${EXPECTED_BASE_URL}/auth/v1/user`, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${authenticatedJwt}`,
    },
    signal: AbortSignal.timeout(20_000),
  });
  const body = await response.json().catch(() => ({}));
  if (response.status !== 200 || typeof body?.id !== 'string') {
    throw new Error(
      `PROOF_GUARD_SMOKE_AUTHENTICATED_JWT_INVALID:${response.status}`,
    );
  }
  console.log('AUTHENTICATED_JWT_VALID=PASS');
}

function assertInvalidInput(label, result, expectedMessage) {
  if (
    result.status !== 400
    || result.body?.code !== '22023'
    || result.body?.message !== expectedMessage
  ) {
    throw new Error(`${label}_MISMATCH:${result.status}`);
  }
  console.log(`${label}=HTTP400/22023/${expectedMessage}`);
}

function assertDenied(label, result) {
  if (result.status !== 401 && result.status !== 403) {
    throw new Error(`${label}_NOT_DENIED:${result.status}`);
  }
  console.log(`${label}=DENIED:${result.status}`);
}

await assertAuthenticatedJwt();
const before = await readState();

assertInvalidInput(
  'RECORD_PROOF_NULLS',
  await callRpc(
    'wos_p7_record_trusted_image_proof',
    serviceRoleKey,
    serviceRoleKey,
    recordNulls,
  ),
  'INVALID_PROOF_INPUT',
);
assertInvalidInput(
  'RENEW_PROOF_NULLS',
  await callRpc(
    'wos_v1_renew_expired_image_proof',
    serviceRoleKey,
    serviceRoleKey,
    recordNulls,
  ),
  'INVALID_RENEWAL_INPUT',
);
assertInvalidInput(
  'STORAGE_SNAPSHOT_NULL',
  await callRpc(
    'wos_p7_service_storage_snapshot',
    serviceRoleKey,
    serviceRoleKey,
    { p_path: null },
  ),
  'INVALID_STORAGE_PATH',
);

assertDenied(
  'AUTHENTICATED',
  await callRpc(
    'wos_p7_record_trusted_image_proof',
    authenticatedJwt,
    anonKey,
    recordNulls,
  ),
);
assertDenied(
  'ANON',
  await callRpc(
    'wos_p7_record_trusted_image_proof',
    anonKey,
    anonKey,
    recordNulls,
  ),
);
assertDenied(
  'SERVICE_APIKEY_WITH_USER_JWT',
  await callRpc(
    'wos_p7_record_trusted_image_proof',
    authenticatedJwt,
    serviceRoleKey,
    recordNulls,
  ),
);
assertDenied(
  'NO_AUTHORIZATION',
  await callRpcWithoutAuthorization(
    'wos_p7_record_trusted_image_proof',
    serviceRoleKey,
    recordNulls,
  ),
);
assertDenied(
  'FORGED_SERVICE_SIGNATURE',
  await callRpc(
    'wos_p7_record_trusted_image_proof',
    makeUnsignedWrongRoleJwt('service_role'),
    serviceRoleKey,
    recordNulls,
  ),
);

const after = await readState();
if (JSON.stringify(before) !== JSON.stringify(after)) {
  throw new Error('PROOF_GUARD_SMOKE_STATE_CHANGED');
}
if (after.targetProofs !== 0 || after.targetReceipts !== 0) {
  throw new Error('PROOF_GUARD_SMOKE_CREATED_TARGET_ROWS');
}

console.log(`ORDERS=${after.orders}`);
console.log(`REFERENCE_IMAGES=${after.referenceImages}`);
console.log(`PROOFS=${after.proofs}`);
console.log(`TRUSTED_PROOF_RECEIPTS=${after.receipts}`);
console.log(`BASELINES=${after.baselines}`);
console.log(`BASELINE_ITEMS=${after.baselineItems}`);
console.log(`ENABLED_WRITE_GATES=${after.enabledGates}`);
console.log(`TARGET_PROOFS=${after.targetProofs}`);
console.log(`TARGET_TRUSTED_PROOF_RECEIPTS=${after.targetReceipts}`);
console.log('PROOF_GUARD_HOSTED_SMOKE=PASS');
