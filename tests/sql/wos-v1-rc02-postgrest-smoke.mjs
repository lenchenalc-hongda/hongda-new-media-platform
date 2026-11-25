import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

const container = process.env.WOS_PG_DOCKER_CONTAINER;
const database = 'wos_v1_rollback_ci';
const secret = 'rc02-local-postgrest-secret-32-bytes-minimum';
const postgrestImage = 'public.ecr.aws/supabase/postgrest:v16.4';
const postgrestName = `codex-wos-rc02-postgrest-${process.pid}`;

if (!container) {
  throw new Error('WOS_PG_DOCKER_CONTAINER_REQUIRED');
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
    ...options,
  });
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    error: result.error,
  };
}

function inspectValue(format) {
  const result = run('docker', [
    'inspect',
    '--format',
    format,
    container,
  ]);
  if (result.status !== 0) throw new Error('POSTGREST_CONTAINER_INSPECT_FAILED');
  return result.stdout.trim();
}

function psqlScalar(sql) {
  const result = run('docker', [
    'exec',
    '-i',
    container,
    'psql',
    '-X',
    '-qAt',
    '-v',
    'ON_ERROR_STOP=1',
    '-U',
    'postgres',
    '-d',
    database,
    '-c',
    sql,
  ]);
  if (result.status !== 0) throw new Error('POSTGREST_DB_QUERY_FAILED');
  return result.stdout.trim();
}

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}

function token(role, sub, extraClaims = {}) {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify({
    role,
    sub,
    exp: Math.floor(Date.now() / 1000) + 600,
    ...extraClaims,
  }));
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${header}.${payload}`)
    .digest('base64url');
  return `${header}.${payload}.${signature}`;
}

function postgrestRequest(path, body, jwt, apiKey = jwt) {
  const payload = JSON.stringify(body);
  const headers = [
    `POST /${path} HTTP/1.0`,
    'Host: 127.0.0.1:3000',
    `apikey: ${apiKey}`,
    ...(jwt ? [`Authorization: Bearer ${jwt}`] : []),
    'Content-Type: application/json',
    'Accept: application/json',
    'Prefer: return=representation',
    `Content-Length: ${Buffer.byteLength(payload)}`,
    'Connection: close',
    '',
    payload,
  ].join('\r\n');
  const result = run('docker', [
    'exec',
    '-i',
    container,
    'nc',
    '127.0.0.1',
    '3000',
  ], {
    input: headers,
  });
  const statusMatch = /HTTP\/1\.[01]\s+([0-9]{3})/.exec(result.stdout);
  const headerEnd = result.stdout.indexOf('\r\n\r\n');
  return {
    status: statusMatch ? Number(statusMatch[1]) : null,
    stdout: headerEnd === -1
      ? result.stdout.trim()
      : result.stdout.slice(headerEnd + 4).trim(),
    stderr: result.stderr.trim(),
  };
}

const containerId = inspectValue('{{.Id}}');
const rawEnvironment = JSON.parse(inspectValue('{{json .Config.Env}}'));
const passwordEntry = rawEnvironment.find(value =>
  value.startsWith('POSTGRES_PASSWORD='));
if (!passwordEntry) throw new Error('POSTGREST_DB_PASSWORD_UNAVAILABLE');
const password = passwordEntry.slice('POSTGRES_PASSWORD='.length);

const orderId = psqlScalar(`
  SELECT id
  FROM public.wos_production_orders
  WHERE order_number =
    'QA-NONPROD-PG17-71000000-0000-4000-8000-000000000001'
`);
if (!orderId) throw new Error('POSTGREST_ORDER_FIXTURE_MISSING');

const before = {
  orders: Number(psqlScalar(
    'SELECT count(*) FROM public.wos_production_orders',
  )),
  images: Number(psqlScalar(
    'SELECT count(*) FROM public.wos_reference_images',
  )),
  proofs: Number(psqlScalar(
    'SELECT count(*) FROM public.wos_qa_verified_image_proofs',
  )),
  storageObjects: Number(psqlScalar(
    "SELECT count(*) FROM storage.objects WHERE bucket_id = 'wos-private'",
  )),
};

let started = false;
try {
  run('docker', ['rm', '-f', postgrestName]);
  const start = run('docker', [
    'run',
    '-d',
    '--rm',
    '--name',
    postgrestName,
    '--network',
    `container:${containerId}`,
    '-e',
    `PGRST_DB_URI=postgres://postgres:${encodeURIComponent(password)}@127.0.0.1:5432/${database}`,
    '-e',
    'PGRST_DB_SCHEMAS=public',
    '-e',
    'PGRST_DB_ANON_ROLE=anon',
    '-e',
    `PGRST_JWT_SECRET=${secret}`,
    '-e',
    'PGRST_SERVER_PORT=3000',
    postgrestImage,
  ]);
  if (start.status !== 0) throw new Error('POSTGREST_START_FAILED');
  started = true;

  let ready = false;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const probe = run('docker', [
      'exec',
      container,
      'wget',
      '-q',
      '-O',
      '-',
      'http://127.0.0.1:3000/',
    ]);
    if (probe.status === 0) {
      ready = true;
      break;
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  if (!ready) throw new Error('POSTGREST_NOT_READY');

  const officeJwt = token(
    'authenticated',
    '10101010-1010-4010-8010-101010101010',
  );
  const directOrder = postgrestRequest(
    'wos_production_orders',
    {
      organization_id: '0ff53d93-2b9e-48b9-8113-a4768c39cdd2',
      order_number: 'QA-NONPROD-PG17-POSTGREST-DENIED',
      product_name: 'PostgREST denied product',
      workflow_status: 'DRAFT',
      version_label: 'V1',
      requested_quantity: 1,
      current_batch_quantity: 1,
      product_material: 'PostgREST denied material',
    },
    officeJwt,
  );

  const closedGateRpc = postgrestRequest(
    'rpc/wos_register_uploaded_reference_image',
    {
      p_order_id: orderId,
      p_image_id: '73900000-0000-4000-8000-000000000001',
      p_category: 'PRODUCT',
      p_storage_path:
        'organizations/0ff53d93-2b9e-48b9-8113-a4768c39cdd2',
    },
    officeJwt,
  );

  const serviceJwt = token(
    'service_role',
    '10101010-1010-4010-8010-101010101010',
  );
  const serviceApiWithUserJwt = postgrestRequest(
    'wos_production_orders',
    {
      order_number: 'QA-NONPROD-PG17-SERVICE-JWT-DENIED',
    },
    officeJwt,
    serviceJwt,
  );
  const nullProofBody = {
    p_image_id: null,
    p_order_id: null,
    p_actor_user_id: null,
    p_storage_path: null,
    p_storage_object_id: null,
    p_storage_object_version: null,
    p_storage_object_updated_at: null,
    p_sha256: null,
  };
  const authenticatedProof = postgrestRequest(
    'rpc/wos_p7_record_trusted_image_proof',
    nullProofBody,
    officeJwt,
  );
  const anonToken = token('anon');
  const anonProof = postgrestRequest(
    'rpc/wos_p7_record_trusted_image_proof',
    nullProofBody,
    anonToken,
  );
  const noAuthorizationProof = postgrestRequest(
    'rpc/wos_p7_record_trusted_image_proof',
    nullProofBody,
    null,
    anonToken,
  );
  const fakeClaimJwt = token(
    'authenticated',
    '10101010-1010-4010-8010-101010101010',
    {
      'request.jwt.claim.role': 'service_role',
      request: { jwt: { claim: { role: 'service_role' } } },
    },
  );
  const fakeClaimProof = postgrestRequest(
    'rpc/wos_p7_record_trusted_image_proof',
    nullProofBody,
    fakeClaimJwt,
  );
  const forgedJwt = (() => {
    const wrongSecret = 'rc02-local-postgrest-wrong-secret-32-bytes';
    const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const payload = base64url(JSON.stringify({
      role: 'service_role',
      exp: Math.floor(Date.now() / 1000) + 600,
    }));
    const signature = crypto
      .createHmac('sha256', wrongSecret)
      .update(`${header}.${payload}`)
      .digest('base64url');
    return `${header}.${payload}.${signature}`;
  })();
  const forgedProof = postgrestRequest(
    'rpc/wos_p7_record_trusted_image_proof',
    nullProofBody,
    forgedJwt,
  );
  const serviceProofNulls = postgrestRequest(
    'rpc/wos_p7_record_trusted_image_proof',
    nullProofBody,
    serviceJwt,
  );
  const serviceRenewNulls = postgrestRequest(
    'rpc/wos_v1_renew_expired_image_proof',
    {
      p_image_id: null,
      p_order_id: null,
      p_actor_user_id: null,
      p_storage_path: null,
      p_storage_object_id: null,
      p_storage_object_version: null,
      p_storage_object_updated_at: null,
      p_sha256: null,
    },
    serviceJwt,
  );
  const serviceApiWithUserProof = postgrestRequest(
    'rpc/wos_p7_record_trusted_image_proof',
    nullProofBody,
    officeJwt,
    serviceJwt,
  );

  if (![401, 403].includes(directOrder.status)) {
    throw new Error(
      `POSTGREST_DIRECT_ORDER_NOT_DENIED:${directOrder.status}:${directOrder.stdout}`,
    );
  }
  if (![401, 403].includes(closedGateRpc.status)) {
    throw new Error(`POSTGREST_CLOSED_RPC_NOT_DENIED:${closedGateRpc.status}`);
  }
  if (![401, 403].includes(serviceApiWithUserJwt.status)) {
    throw new Error(
      `POSTGREST_SERVICE_JWT_TABLE_BYPASS:${serviceApiWithUserJwt.status}`,
    );
  }
  for (const [label, response] of [
    ['AUTHENTICATED_PROOF', authenticatedProof],
    ['ANON_PROOF', anonProof],
    ['NO_AUTHORIZATION_PROOF', noAuthorizationProof],
    ['FAKE_CLAIM_PROOF', fakeClaimProof],
    ['FORGED_SIGNATURE_PROOF', forgedProof],
    ['SERVICE_API_WITH_USER_PROOF', serviceApiWithUserProof],
  ]) {
    if (![401, 403].includes(response.status)) {
      throw new Error(`POSTGREST_${label}_NOT_DENIED:${response.status}`);
    }
  }
  for (const [label, response, code] of [
    ['PROOF_NULLS', serviceProofNulls, 'INVALID_PROOF_INPUT'],
    ['RENEW_NULLS', serviceRenewNulls, 'INVALID_RENEWAL_INPUT'],
  ]) {
    if (response.status !== 400 || !response.stdout.includes(code)) {
      throw new Error(
        `POSTGREST_SERVICE_${label}_WRONG:${response.status}:${response.stdout}:${response.stderr}`,
      );
    }
  }

  const after = {
    orders: Number(psqlScalar(
      'SELECT count(*) FROM public.wos_production_orders',
    )),
    images: Number(psqlScalar(
      'SELECT count(*) FROM public.wos_reference_images',
    )),
    proofs: Number(psqlScalar(
      'SELECT count(*) FROM public.wos_qa_verified_image_proofs',
    )),
    storageObjects: Number(psqlScalar(
      "SELECT count(*) FROM storage.objects WHERE bucket_id = 'wos-private'",
    )),
  };
  if (
    before.orders !== after.orders
    || before.images !== after.images
    || before.proofs !== after.proofs
    || before.storageObjects !== after.storageObjects
  ) {
    throw new Error('POSTGREST_DENIAL_CHANGED_BUSINESS_DATA');
  }

  console.log('WOS_V1_RC02_POSTGREST_DIRECT_ORDER_DENIED=PASS');
  console.log('WOS_V1_RC02_POSTGREST_CLOSED_RPC_DENIED=PASS');
  console.log('WOS_V1_RC02_POSTGREST_SERVICE_JWT_TABLE_DENIED=PASS');
  console.log('WOS_V1_RC04_POSTGREST_SERVICE_ROLE_GUARD=PASS');
  console.log('WOS_V1_RC04_POSTGREST_NEGATIVE_ROLE_MATRIX=PASS');
  console.log('WOS_V1_RC02_POSTGREST_BUSINESS_WRITES=0');
} finally {
  if (started) {
    run('docker', ['rm', '-f', postgrestName]);
  }
}
