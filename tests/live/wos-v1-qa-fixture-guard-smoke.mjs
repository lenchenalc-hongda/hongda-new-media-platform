const AUTHORIZATION_ID =
  'WOS-V1-PR280-QA-FUNCTION-GUARD-REPLACEMENT';
const EXPECTED_PROJECT_REF = 'xulmpqaknlwqqculbsek';
const EXPECTED_BASE_URL =
  `https://${EXPECTED_PROJECT_REF}.supabase.co`;

if (process.env.WOS_QA_FIXTURE_GUARD_SMOKE !== 'YES') {
  throw new Error('HOSTED_GUARD_SMOKE_NOT_AUTHORIZED');
}
if (process.env.WOS_QA_FIXTURE_GUARD_SMOKE_AUTHORIZATION !== AUTHORIZATION_ID) {
  throw new Error('HOSTED_GUARD_SMOKE_AUTHORIZATION_MISMATCH');
}
if (process.env.WOS_QA_SUPABASE_URL !== EXPECTED_BASE_URL) {
  throw new Error('HOSTED_GUARD_SMOKE_PROJECT_MISMATCH');
}

const serviceRoleKey = process.env.WOS_QA_SERVICE_ROLE_KEY;
const authenticatedJwt = process.env.WOS_QA_AUTHENTICATED_JWT;
const anonKey = process.env.WOS_QA_ANON_KEY;
if (!serviceRoleKey || !authenticatedJwt || !anonKey) {
  throw new Error('HOSTED_GUARD_SMOKE_CREDENTIALS_MISSING');
}

const baseUrl = EXPECTED_BASE_URL;

async function callRpc(endpoint, authorization, apikey, payload) {
  const response = await fetch(`${baseUrl}/rest/v1/rpc/${endpoint}`, {
    method: 'POST',
    headers: {
      apikey,
      Authorization: `Bearer ${authorization}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(20_000),
  });
  const body = await response.json().catch(() => ({}));
  return { status: response.status, body };
}

async function readCount(path) {
  const response = await fetch(`${baseUrl}/rest/v1/${path}`, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      Prefer: 'count=exact',
      Range: '0-0',
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    throw new Error(`HOSTED_GUARD_SMOKE_COUNT_FAILED:${path}:${response.status}`);
  }
  const contentRange = response.headers.get('content-range') ?? '';
  const count = Number(contentRange.split('/').at(-1));
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error(`HOSTED_GUARD_SMOKE_COUNT_INVALID:${path}`);
  }
  return count;
}

async function readState() {
  const [
    orders,
    referenceImages,
    proofs,
    manifests,
    operatorGates,
    officeGates,
    m2Gates,
  ] = await Promise.all([
    readCount('wos_production_orders?select=id&limit=0'),
    readCount('wos_reference_images?select=id&limit=0'),
    readCount('wos_qa_verified_image_proofs?select=order_id&limit=0'),
    readCount(
      'wos_qa_canonical_fixture_manifests?select=request_id&limit=0',
    ),
    readCount(
      'wos_qa_p2_execution_gate?select=gate_name&enabled=eq.true&limit=0',
    ),
    readCount(
      'wos_qa_p2_office_execution_gate?select=gate_name&enabled=eq.true&limit=0',
    ),
    readCount(
      'wos_qa_p2_m2_gate?select=gate_name&enabled=eq.true&limit=0',
    ),
  ]);
  return {
    orders,
    referenceImages,
    proofs,
    manifests,
    enabledWriteGates: operatorGates + officeGates + m2Gates,
  };
}

async function assertAuthenticatedJwt() {
  const response = await fetch(`${baseUrl}/auth/v1/user`, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${authenticatedJwt}`,
    },
    signal: AbortSignal.timeout(20_000),
  });
  const body = await response.json().catch(() => ({}));
  if (response.status !== 200 || typeof body?.id !== 'string') {
    throw new Error(
      `HOSTED_GUARD_SMOKE_AUTHENTICATED_JWT_INVALID:${response.status}`,
    );
  }
  console.log('AUTHENTICATED_JWT_VALID=PASS');
}

function assertDenied(label, result) {
  if (result.status !== 401 && result.status !== 403) {
    throw new Error(`HOSTED_GUARD_SMOKE_${label}_NOT_DENIED:${result.status}`);
  }
  if (result.body?.message === 'INVALID_FIXTURE_INPUT') {
    throw new Error(`HOSTED_GUARD_SMOKE_${label}_REACHED_BODY`);
  }
  console.log(`${label}=DENIED:${result.status}`);
}

await assertAuthenticatedJwt();
const before = await readState();

const prepareInvalid = await callRpc(
  'wos_qa_create_canonical_v1_fixture',
  serviceRoleKey,
  serviceRoleKey,
  { p_input: null },
);
if (
  prepareInvalid.status !== 400
  || prepareInvalid.body?.code !== '22023'
  || prepareInvalid.body?.message !== 'INVALID_FIXTURE_INPUT'
) {
  throw new Error(
    `HOSTED_GUARD_SMOKE_PREPARE_INVALID_MISMATCH:${prepareInvalid.status}`,
  );
}
console.log(`PREPARE_INVALID_INPUT=HTTP${prepareInvalid.status}`);

const rollbackInvalid = await callRpc(
  'wos_qa_rollback_canonical_v1_fixture',
  serviceRoleKey,
  serviceRoleKey,
  { p_request_id: null, p_order_id: null },
);
if (
  rollbackInvalid.status !== 400
  || rollbackInvalid.body?.code !== '22023'
  || rollbackInvalid.body?.message !== 'INVALID_ROLLBACK_INPUT'
) {
  throw new Error(
    `HOSTED_GUARD_SMOKE_ROLLBACK_INVALID_MISMATCH:${rollbackInvalid.status}`,
  );
}
console.log(`ROLLBACK_INVALID_INPUT=HTTP${rollbackInvalid.status}`);

assertDenied(
  'AUTHENTICATED',
  await callRpc(
    'wos_qa_create_canonical_v1_fixture',
    authenticatedJwt,
    anonKey,
    { p_input: null },
  ),
);
assertDenied(
  'ANON',
  await callRpc(
    'wos_qa_create_canonical_v1_fixture',
    anonKey,
    anonKey,
    { p_input: null },
  ),
);
assertDenied(
  'SERVICE_APIKEY_WITH_USER_JWT',
  await callRpc(
    'wos_qa_create_canonical_v1_fixture',
    authenticatedJwt,
    serviceRoleKey,
    { p_input: null },
  ),
);

const after = await readState();
if (JSON.stringify(before) !== JSON.stringify(after)) {
  throw new Error('HOSTED_GUARD_SMOKE_STATE_CHANGED');
}

console.log(`HOSTED_ORDERS=${after.orders}`);
console.log(`HOSTED_REFERENCE_IMAGES=${after.referenceImages}`);
console.log(`HOSTED_PROOFS=${after.proofs}`);
console.log(`HOSTED_MANIFESTS=${after.manifests}`);
console.log(`HOSTED_ENABLED_WRITE_GATES=${after.enabledWriteGates}`);
console.log('HOSTED_GUARD_SMOKE=PASS');
