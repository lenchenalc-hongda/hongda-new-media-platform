#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const ORIGIN = process.env.WOS_UAT_ORIGIN || '';
const BYPASS = process.env.WOS_VERCEL_BYPASS || '';
const ANON_KEY = process.env.WOS_QA_ANON_KEY || '';
const DIRECT_RPC = process.env.WOS_UAT_DIRECT_RPC === 'true';
const AUTHORIZATION_ID =
  process.env.WOS_V1_QA_AUTHORIZATION_ID
  || 'WOS-V1-PRODUCTION-M2-QA-UAT-012';
const EXECUTION_ID =
  process.env.WOS_V1_QA_EXECUTION_ID
  || 'c32a81d1-b997-4cfa-a346-871461a1af47';
const EDGE_NONCE =
  process.env.WOS_V1_QA_EDGE_PROCESS_NONCE
  || 'dc068291-4ec1-426a-ae2d-bec50a32c937';
const RESUME_ORDER_ID = process.env.WOS_UAT_RESUME_ORDER_ID || '';
const PROJECT_REF = 'xulmpqaknlwqqculbsek';
const SUPABASE_URL = `https://${PROJECT_REF}.supabase.co`;
const INPUT_PATH =
  process.env.WOS_UAT_INPUT_PATH
  || 'docs/workshop-order-system/qa-fixture/production-m2-uat-20261126/inputs-uat012.json';
const EVIDENCE_PATH =
  process.env.WOS_UAT_EVIDENCE_PATH
  || 'output/uat/WOS_V1_PRODUCTION_M2_QA_BUSINESS_UAT_012_20261128.json';
const PSQL_IMAGE =
  'postgres@sha256:f9cf3e1f0066f0eb0c48707d864f0ac5941e9ff454a072077d97a4d278d07d73';

if (!ORIGIN.startsWith('https://') || !ANON_KEY
  || (!DIRECT_RPC && !BYPASS)) {
  throw new Error('WOS_UAT_ENVIRONMENT_INCOMPLETE');
}

const input = JSON.parse(readFileSync(INPUT_PATH, 'utf8'));
const RESUME_MODE = input.mode === 'RESUME_EXISTING_ORDER';
const BOUND_RESUME_ORDER_ID =
  RESUME_ORDER_ID || input.resumeOrderId || '';
if (RESUME_MODE) {
  assert.match(BOUND_RESUME_ORDER_ID, /^[a-f0-9-]{36}$/i);
  assert.equal(input.limits?.maxNewOrders, 0);
  assert.equal(input.limits?.maxCreateCalls, 0);
  assert.equal(input.authorizationId, AUTHORIZATION_ID);
  assert.equal(input.executionId, EXECUTION_ID);
  assert.equal(input.edgeProcessNonce, EDGE_NONCE);
} else {
  assert.equal(input.limits?.maxNewOrders, 1);
  assert.equal(input.limits?.maxCreateCalls, 1);
}
const test = {
  authorizationId: AUTHORIZATION_ID,
  executionId: EXECUTION_ID,
  edgeNonce: EDGE_NONCE,
  origin: ORIGIN,
  mode: RESUME_MODE ? 'RESUME_EXISTING_ORDER' : 'CREATE_NEW_ORDER',
  requestId: input.requestId,
  orderNumber: input.orderNumber,
  createPayloadFingerprint: input.createPayloadFingerprint,
  startedAt: new Date().toISOString(),
  steps: [],
  negative: [],
  orderId: null,
  finalState: null,
};

function keychainSession(service) {
  const hex = execFileSync(
    'security',
    ['find-generic-password', '-s', service, '-w'],
    { encoding: 'utf8' },
  ).trim();
  return JSON.parse(Buffer.from(hex, 'hex').toString('utf8'));
}

const identities = {
  office: keychainSession('WOS_V1_QA_IDENTITY_OFFICE_ADMIN'),
  operator: keychainSession('WOS_V1_QA_IDENTITY_OPERATOR'),
  manager: keychainSession('WOS_V1_QA_IDENTITY_INDEPENDENT_MANAGER'),
  viewer: keychainSession('WOS_V1_QA_IDENTITY_VIEWER'),
  crossorg: keychainSession('WOS_V1_QA_IDENTITY_CROSS_ORG_MANAGER'),
};

function cookieValue(identity) {
  return 'base64-' + Buffer.from(JSON.stringify(identity), 'utf8')
    .toString('base64url');
}

const clients = new Map();

function userClient(identity) {
  const key = identity.user_id;
  if (!clients.has(key)) {
    clients.set(key, createClient(SUPABASE_URL, ANON_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: {
        headers: { Authorization: `Bearer ${identity.access_token}` },
      },
    }));
  }
  return clients.get(key);
}

function appHeaders(identity, kind) {
  const cookie = `sb-${PROJECT_REF}-auth-token=${cookieValue(identity)}`;
  return {
    accept: 'application/json',
    'content-type': 'application/json',
    cookie,
    origin: ORIGIN,
    referer: `${ORIGIN}/workshop-orders`,
    'x-vercel-protection-bypass': BYPASS,
    ...(kind === 'm2'
      ? { 'x-wos-v1-m2': '1' }
      : kind === 'app'
        ? { 'x-wos-v1-action': '1' }
        : {}),
  };
}

function directRpcName(operation) {
  return {
    CREATE_ORDER: 'wos_create_production_order',
    REGISTER_IMAGE: 'wos_register_uploaded_reference_image',
    CONFIRM_OFFICE: 'wos_confirm_office_completeness',
    SUBMIT_ORDER: 'wos_submit_production_order',
    OPERATOR_ACTION: 'wos_operator_order_action',
    SAVE_CORRECTION: 'wos_office_save_correction',
    RESUBMIT_ORDER: 'wos_office_resubmit_order',
    REVIEW_CORRECTION: 'wos_operator_review_correction',
  }[operation];
}

function directRpcArgs(identity, body) {
  switch (body.operation) {
    case 'CREATE_ORDER':
      return {
        p_request_id: body.requestId,
        p_payload: {
          ...body.payload,
          salesOwnerProfileId: identity.profile_id,
          projectOwnerProfileId: identity.profile_id,
        },
      };
    case 'REGISTER_IMAGE':
      return {
        p_order_id: body.orderId,
        p_image_id: body.imageId,
        p_category: body.category,
        p_storage_path: body.storagePath,
      };
    case 'CONFIRM_OFFICE':
      return {
        p_order_id: body.orderId,
        p_expected_revision: body.expectedVersion,
        p_expected_label: body.expectedLabel,
        p_note: body.note,
      };
    case 'SUBMIT_ORDER':
      return {
        p_order_id: body.orderId,
        p_expected_revision: body.expectedVersion,
        p_expected_label: body.expectedLabel,
        p_idempotency_key: body.requestId,
      };
    case 'OPERATOR_ACTION':
      return {
        p_order_id: body.orderId,
        p_expected_version: body.expectedVersion,
        p_request_id: body.requestId,
        p_action: body.action,
        p_reason: body.reason,
      };
    case 'SAVE_CORRECTION':
      return {
        p_order_id: body.orderId,
        p_expected_version: body.expectedVersion,
        p_request_id: body.requestId,
        p_patch: body.patch,
        p_reason: body.reason,
      };
    case 'RESUBMIT_ORDER':
      return {
        p_order_id: body.orderId,
        p_expected_version: body.expectedVersion,
        p_request_id: body.requestId,
        p_reason: body.reason,
      };
    case 'REVIEW_CORRECTION':
      return {
        p_order_id: body.orderId,
        p_expected_version: body.expectedVersion,
        p_request_id: body.requestId,
        p_note: body.note,
      };
    default:
      throw new Error('WOS_UAT_DIRECT_APP_OPERATION_UNSUPPORTED');
  }
}

async function directAppPost(identity, body) {
  const rpc = directRpcName(body.operation);
  if (!rpc) throw new Error('WOS_UAT_DIRECT_APP_OPERATION_UNSUPPORTED');
  const result = await userClient(identity).rpc(
    rpc,
    directRpcArgs(identity, body),
  );
  if (result.error) {
    const status = result.error.code === '42501' ? 403
      : ['PT409', '23505'].includes(result.error.code) ? 409 : 400;
    return {
      status,
      payload: {
        ok: false,
        code: result.error.message || result.error.code || 'RPC_FAILED',
        data: null,
      },
    };
  }
  return {
    status: 200,
    payload: {
      ok: true,
      code: `${body.operation}_VERIFIED`,
      data: {
        operation: body.operation,
        result: result.data,
        canStart: false,
      },
    },
  };
}

async function directM2Post(identity, body) {
  const common = {
    p_authorization_id: AUTHORIZATION_ID,
    p_order_id: body.orderId,
    p_expected_version: body.expectedVersion,
    p_request_id: body.requestId,
    ...(body.action === 'START_RELEASE'
      ? {
          p_baseline_id: body.payload.baselineId,
          p_note: body.payload.note,
        }
      : {
          p_action: body.action,
          p_payload: body.payload,
        }),
  };
  const rpc = body.action === 'START_RELEASE'
    ? 'wos_v1_qa_uat_authorize_production_start'
    : 'wos_v1_qa_uat_m2_action';
  const result = await userClient(identity).rpc(rpc, common);
  if (result.error) {
    const status = result.error.code === '42501' ? 403
      : ['PT409', '23505'].includes(result.error.code) ? 409 : 400;
    return {
      status,
      payload: {
        ok: false,
        code: result.error.message || result.error.code || 'RPC_FAILED',
        data: null,
      },
    };
  }
  const replayed = result.data?.status === 'REPLAYED';
  return {
    status: 200,
    payload: {
      ok: true,
      code: body.action === 'START_RELEASE'
        ? replayed
          ? 'WOS_V1_START_RELEASE_REPLAY_VERIFIED'
          : 'WOS_V1_START_RELEASE_AUTHORIZED'
        : replayed
          ? 'WOS_V1_M2_REPLAY_VERIFIED'
          : 'WOS_V1_M2_ACTION_APPLIED',
      data: result.data,
    },
  };
}

async function appPost(identity, path, body, kind) {
  if (RESUME_MODE && body.operation === 'CREATE_ORDER') {
    throw new Error('WOS_UAT_CREATE_FORBIDDEN_IN_RESUME_MODE');
  }
  if (DIRECT_RPC) {
    return kind === 'm2'
      ? directM2Post(identity, body)
      : directAppPost(identity, body);
  }
  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(ORIGIN + path, {
        method: 'POST',
        headers: appHeaders(identity, kind),
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(20_000),
      });
      const payload = await response.json().catch(() => null);
      return { status: response.status, payload };
    } catch (error) {
      lastError = error;
      await new Promise(resolve => setTimeout(resolve, 800));
    }
  }
  throw lastError;
}

function record(label, body) {
  test.steps.push({
    label,
    at: new Date().toISOString(),
    status: body.status,
    code: body.payload?.code ?? null,
    data: body.payload?.data ?? null,
  });
}

async function expectApp(identity, body, expectedCode) {
  const response = await appPost(
    identity,
    '/api/workshop-orders/v1-qa',
    body,
    'app',
  );
  record(body.operation + (body.action ? ':' + body.action : ''), response);
  assert.equal(response.status, 200);
  assert.equal(response.payload?.ok, true);
  assert.equal(response.payload?.code, expectedCode);
  return response.payload.data;
}

async function m2(identity, action, payload) {
  const response = await appPost(
    identity,
    '/api/workshop-orders/v1-qa/m2',
    { ...action, payload },
    'm2',
  );
  record(action.action + ':' + action.requestId, response);
  return response;
}

async function expectM2(identity, action, payload, expectedCode) {
  const response = await m2(identity, action, payload);
  assert.equal(response.status, 200);
  assert.equal(response.payload?.ok, true);
  assert.equal(response.payload?.code, expectedCode);
  return response.payload.data;
}

async function negativeM2(label, identity, action, payload, statuses) {
  const response = await m2(identity, action, payload);
  test.negative.push({
    label,
    at: new Date().toISOString(),
    status: response.status,
    code: response.payload?.code ?? null,
  });
  assert(statuses.includes(response.status), `${label}:${response.status}`);
  return response;
}

function databaseUrl() {
  return execFileSync(
    'security',
    [
      'find-generic-password',
      '-s',
      'WOS_V1_QA_DB_CLOSER_DSN',
      '-a',
      PROJECT_REF,
      '-w',
    ],
    { encoding: 'utf8' },
  ).trim();
}

function runSql(sql) {
  const url = new URL(databaseUrl());
  const result = spawnSync(
    'docker',
    [
      'run', '--rm', '-i',
      '-e', 'PGHOST',
      '-e', 'PGPORT',
      '-e', 'PGUSER',
      '-e', 'PGPASSWORD',
      '-e', 'PGDATABASE',
      '-e', 'PGSSLMODE',
      '-e', 'PGCONNECT_TIMEOUT',
      PSQL_IMAGE,
      'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-At', '-f', '-',
    ],
    {
      input: sql,
      encoding: 'utf8',
      env: {
        ...process.env,
        PGHOST: url.hostname,
        PGPORT: url.port || '5432',
        PGUSER: decodeURIComponent(url.username),
        PGPASSWORD: decodeURIComponent(url.password),
        PGDATABASE: url.pathname.slice(1),
        PGSSLMODE: url.searchParams.get('sslmode') || 'require',
        PGCONNECT_TIMEOUT: '20',
      },
    },
  );
  if (result.error || result.status !== 0) {
    const diagnostic = String(result.stderr || result.error || '')
      .split('\n')
      .find(line => /ERROR:|FATAL:|DETAIL:|HINT:/.test(line));
    throw new Error(diagnostic || 'WOS_UAT_DB_QUERY_FAILED');
  }
  return String(result.stdout || '').trim();
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function imageStoragePath(orderId, versionLabel, image) {
  const categorySlug = image.category.toLowerCase().replaceAll('_', '-');
  return [
    'organizations',
    input.qaOrganizationId,
    'wos',
    'production-order',
    orderId,
    'images',
    categorySlug,
    'versions',
    versionLabel,
    image.imageId,
    'source.png',
  ].join('/');
}

async function uploadAndVerify(identity, orderId, versionLabel, image) {
  const bytes = readFileSync(
    `docs/workshop-order-system/qa-fixture/production-m2-uat-20261126/${image.source}`,
  );
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  assert.equal(sha256, image.sha256);
  const storagePath = imageStoragePath(orderId, versionLabel, image);
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: { Authorization: `Bearer ${identity.access_token}` },
    },
  });
  const storage = userClient.storage.from('wos-private');
  const upload = await storage.upload(storagePath, bytes, {
    contentType: 'image/png',
    upsert: false,
  });
  if (upload.error) {
    const folder = storagePath.slice(0, storagePath.lastIndexOf('/'));
    const existing = await storage.list(folder, {
      limit: 2,
      search: 'source.png',
    });
    if (existing.error
      || !existing.data?.some(file =>
        file.name === 'source.png'
        && file.metadata?.size === bytes.length)) {
      throw new Error('WOS_UAT_PRIVATE_UPLOAD_FAILED');
    }
  }
  const edgeResponse = await fetch(
    `${SUPABASE_URL}/functions/v1/wos-v1-verify-image`,
    {
      method: 'POST',
      headers: {
        apikey: ANON_KEY,
        authorization: `Bearer ${identity.access_token}`,
        'content-type': 'application/json',
        'x-wos-qa-uat-authorization-id': AUTHORIZATION_ID,
        'x-wos-qa-uat-execution-id': EXECUTION_ID,
        'x-wos-qa-uat-closer-nonce': EDGE_NONCE,
      },
      body: JSON.stringify({
        orderId,
        imageId: image.imageId,
        category: image.category,
        storagePath,
        sha256,
      }),
      signal: AbortSignal.timeout(20_000),
    },
  );
  const edge = await edgeResponse.json().catch(() => null);
  record(`EDGE:${versionLabel}:${image.category}`, {
    status: edgeResponse.status,
    payload: edge,
  });
  assert.equal(edgeResponse.status, 200);
  assert.equal(edge?.ok, true);
  assert.equal(edge?.code, 'WOS_V1_TRUSTED_IMAGE_PROOF_ISSUED');
  assert.equal(edge?.data?.sha256, sha256);
  assert(['VERIFIED', 'REPLAYED'].includes(edge?.data?.proofStatus));

  await expectApp(
    identity,
    {
      operation: 'REGISTER_IMAGE',
      orderId,
      imageId: image.imageId,
      category: image.category,
      storagePath,
    },
    'REGISTER_IMAGE_VERIFIED',
  );
  return { ...image, storagePath, sha256 };
}

async function readonlyEdge(identity, payload) {
  const response = await fetch(
    `${SUPABASE_URL}/functions/v1/wos-v1-verify-image-readonly`,
    {
      method: 'POST',
      headers: {
        ...(identity
          ? { authorization: `Bearer ${identity.access_token}` }
          : {}),
        apikey: ANON_KEY,
        'content-type': 'application/json',
        origin: ORIGIN,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30_000),
    },
  );
  const body = await response.json().catch(() => null);
  return { status: response.status, body };
}

async function downloadStorage(identity, storagePath) {
  const encoded = storagePath.split('/').map(encodeURIComponent).join('/');
  const response = await fetch(
    `${SUPABASE_URL}/storage/v1/object/wos-private/${encoded}`,
    {
      headers: {
        apikey: ANON_KEY,
        authorization: `Bearer ${identity.access_token}`,
      },
      signal: AbortSignal.timeout(30_000),
    },
  );
  const bytes = new Uint8Array(await response.arrayBuffer());
  return {
    status: response.status,
    contentType: response.headers.get('content-type') || '',
    sha256: createHash('sha256').update(bytes).digest('hex'),
    byteSize: bytes.length,
  };
}

function action(actionName, orderId, expectedVersion, payload) {
  return {
    action: actionName,
    orderId,
    expectedVersion,
    requestId: randomUUID(),
    payload,
  };
}

async function main() {
  const pre = JSON.parse(runSql(`
    SELECT wos_v1_qa_uat.closer_status(${sqlLiteral(EXECUTION_ID)}::uuid)::text;
  `).split('\n').filter(Boolean).at(-1));
  assert.equal(pre.status, 'FOUND');
  assert.equal(pre.authorizationId, AUTHORIZATION_ID);
  assert.equal(pre.codeSha256, process.env.WOS_V1_QA_CODE_SHA256);
  assert.equal(pre.dbState, 'ARMED');
  assert.equal(pre.edgeState, 'ARMED');
  assert(
    Date.parse(pre.writeDeadlineAt) - Date.now() > 240_000,
    'WOS_UAT_WRITE_WINDOW_TOO_SHORT',
  );
  test.control = pre;

  const resumeOrderId = BOUND_RESUME_ORDER_ID;
  let orderId;
  let receipt;
  let createBody = null;
  if (RESUME_MODE) {
    orderId = resumeOrderId;
    assert.match(orderId, /^[a-f0-9-]{36}$/i);
    test.orderId = orderId;
    const existingOrder = JSON.parse(runSql(`
      SELECT jsonb_build_object(
        'id',id,
        'orderNumber',order_number,
        'organizationId',organization_id,
        'version',version,
        'versionLabel',version_label,
        'workflowStatus',workflow_status,
        'createdByProfileId',created_by_profile_id,
        'salesOwnerProfileId',sales_owner_profile_id
      )::text
      FROM public.wos_production_orders
      WHERE id=${sqlLiteral(orderId)}::uuid;
    `).split('\n').filter(Boolean).at(-1));
    assert.equal(existingOrder.organizationId, input.qaOrganizationId);
    assert.equal(existingOrder.orderNumber, input.orderNumber);
    assert.equal(existingOrder.version, input.resumeExpectedVersion);
    assert.equal(
      existingOrder.versionLabel,
      input.resumeExpectedVersionLabel,
    );
    assert.equal(
      existingOrder.workflowStatus,
      input.resumeExpectedWorkflowStatus,
    );
    test.resumeState = existingOrder;
  } else {
    createBody = {
      operation: 'CREATE_ORDER',
      requestId: input.requestId,
      payload: input.createPayload,
    };
    const created = await expectApp(
      identities.office,
      createBody,
      'CREATE_ORDER_VERIFIED',
    );
    orderId = created?.result?.orderId;
    assert.match(orderId || '', /^[a-f0-9-]{36}$/i);
    test.orderId = orderId;
  }

  const receiptRaw = runSql(`
    SELECT jsonb_build_object(
      'requestId',request_id,
      'orderId',order_id,
      'organizationId',organization_id,
      'actorProfileId',actor_profile_id,
      'payloadFingerprint',payload_fingerprint,
      'response',response_json
    )::text
    FROM public.wos_order_create_receipts
    WHERE request_id=${sqlLiteral(input.requestId)}::uuid;
  `);
  receipt = JSON.parse(receiptRaw.split('\n').filter(Boolean).at(-1));
  assert.equal(receipt.orderId, orderId);
  assert.equal(receipt.requestId, input.requestId);
  assert.equal(receipt.organizationId, input.qaOrganizationId);
  assert.equal(
    receipt.actorProfileId,
    input.actors.office.profileId,
  );
  assert.equal(
    receipt.payloadFingerprint,
    input.createPayloadFingerprint,
  );
  test.createReceipt = receipt;

  const boundRaw = runSql(`
    SELECT wos_v1_qa_uat.bind_qa_uat_order(
      ${sqlLiteral(EXECUTION_ID)}::uuid,
      ${sqlLiteral(input.requestId)}::uuid,
      ${sqlLiteral(orderId)}::uuid,
      ${sqlLiteral(input.qaOrganizationId)}::uuid,
      ${sqlLiteral(input.actors.office.profileId)}::uuid,
      ${sqlLiteral(input.createPayloadFingerprint)}
    )::text;
  `);
  const bound = JSON.parse(boundRaw.split('\n').filter(Boolean).at(-1));
  assert(['BOUND', 'REPLAYED'].includes(bound.status));
  test.orderBinding = bound;

  const control = JSON.parse(runSql(`
    SELECT wos_v1_qa_uat.closer_status(${sqlLiteral(EXECUTION_ID)}::uuid)::text;
  `).split('\n').filter(Boolean).at(-1));
  const deadline = sqlLiteral(control.writeDeadlineAt);
  const openGates = runSql(`
    BEGIN;
    SET LOCAL wos_v1.qa_uat_gate_open_authorized='yes';
    SET LOCAL wos_v1.qa_project='${PROJECT_REF}';
    SELECT public.wos_v1_qa_uat_open_gate(
      ${sqlLiteral(AUTHORIZATION_ID)},
      ${sqlLiteral(orderId)}::uuid,
      ${sqlLiteral(input.qaOrganizationId)}::uuid,
      ${sqlLiteral(input.actors.office.profileId)}::uuid,
      ARRAY['BASELINE_SELECT','BASELINE_OFFICE_CONFIRM']::text[],
      ${deadline}::timestamptz
    )::text;
    SELECT public.wos_v1_qa_uat_open_gate(
      ${sqlLiteral(AUTHORIZATION_ID)},
      ${sqlLiteral(orderId)}::uuid,
      ${sqlLiteral(input.qaOrganizationId)}::uuid,
      ${sqlLiteral(input.actors.workshop.profileId)}::uuid,
      ARRAY['MATERIAL_RECORD','BASELINE_WORKSHOP_CONFIRM','FINAL_READINESS_CONFIRM']::text[],
      ${deadline}::timestamptz
    )::text;
    SELECT public.wos_v1_qa_uat_open_gate(
      ${sqlLiteral(AUTHORIZATION_ID)},
      ${sqlLiteral(orderId)}::uuid,
      ${sqlLiteral(input.qaOrganizationId)}::uuid,
      ${sqlLiteral(input.actors.independentRelease.profileId)}::uuid,
      ARRAY['START_RELEASE']::text[],
      ${deadline}::timestamptz
    )::text;
    COMMIT;
  `);
  assert.equal(openGates.split('\n').filter(Boolean).length >= 3, true);

  const v1Images = [];
  if (RESUME_MODE) {
    const supersededV1 = Number(runSql(`
      SELECT count(*)
      FROM public.wos_reference_images
      WHERE entity_id=${sqlLiteral(orderId)}::uuid
        AND version_label='V1'
        AND image_status='SUPERSEDED';
    `).split('\n').filter(Boolean).at(-1));
    assert.equal(supersededV1, 4);
    for (const image of input.images.v1) {
      v1Images.push({
        ...image,
        storagePath: imageStoragePath(orderId, 'V1', image),
      });
    }
    test.resumedAfterV1 = true;
  } else {
    for (const image of input.images.v1) {
      v1Images.push(await uploadAndVerify(
        identities.office,
        orderId,
        'V1',
        image,
      ));
    }
    await expectApp(
      identities.office,
      {
        operation: 'CONFIRM_OFFICE',
        orderId,
        expectedVersion: 1,
        expectedLabel: 'V1',
        note: 'Office confirms the four current V1 production images.',
      },
      'CONFIRM_OFFICE_VERIFIED',
    );
    const submitRequestId = randomUUID();
    await expectApp(
      identities.office,
      {
        operation: 'SUBMIT_ORDER',
        orderId,
        expectedVersion: 1,
        expectedLabel: 'V1',
        requestId: submitRequestId,
      },
      'SUBMIT_ORDER_VERIFIED',
    );

    const acceptRequestId = randomUUID();
    await expectApp(
      identities.operator,
      {
        operation: 'OPERATOR_ACTION',
        orderId,
        expectedVersion: 2,
        requestId: acceptRequestId,
        action: 'ACCEPT',
        reason: 'Operator accepts the current V1 production request.',
      },
      'OPERATOR_ACTION_VERIFIED',
    );
    await expectApp(
      identities.operator,
      {
        operation: 'OPERATOR_ACTION',
        orderId,
        expectedVersion: 3,
        requestId: randomUUID(),
        action: 'RETURN_FOR_INFORMATION',
        reason: 'Office must complete the customer acceptance correction.',
      },
      'OPERATOR_ACTION_VERIFIED',
    );
    const saveRequestId = randomUUID();
    await expectApp(
      identities.office,
      {
        operation: 'SAVE_CORRECTION',
        orderId,
        expectedVersion: 4,
        requestId: saveRequestId,
        reason: 'Office updates the requested acceptance standard.',
        patch: {
          customerAcceptanceStandard:
            'QA UAT acceptance updated for the current V2 printed sample.',
        },
      },
      'SAVE_CORRECTION_VERIFIED',
    );
  }
  const v2Images = [];
  for (const image of input.images.v2) {
    v2Images.push(await uploadAndVerify(
      identities.office,
      orderId,
      'V2',
      image,
    ));
  }
  const resubmitRequestId = randomUUID();
  await expectApp(
    identities.office,
    {
      operation: 'RESUBMIT_ORDER',
      orderId,
      expectedVersion: 5,
      requestId: resubmitRequestId,
      reason: 'Office resubmits the complete V2 image set.',
    },
    'RESUBMIT_ORDER_VERIFIED',
  );
  const reviewRequestId = randomUUID();
  await expectApp(
    identities.operator,
    {
      operation: 'REVIEW_CORRECTION',
      orderId,
      expectedVersion: 6,
      requestId: reviewRequestId,
      note: 'Operator reviews the immutable V2 resubmission.',
    },
    'REVIEW_CORRECTION_VERIFIED',
  );

  const v2Ids = input.images.v2.map(image => image.imageId);
  const now = new Date().toISOString();
  const materialPayloads = [
    {
      resourceType: 'FILM',
      resourceStatus: 'VERSION_VERIFIED',
      arrivedAt: now,
      quantityExpected: null,
      quantityArrived: null,
      physicalCheckAttested: true,
    },
    {
      resourceType: 'FIXTURE',
      resourceStatus: 'FIT_VERIFIED',
      arrivedAt: now,
      quantityExpected: null,
      quantityArrived: null,
      physicalCheckAttested: true,
    },
    {
      resourceType: 'INCOMING_MATERIAL',
      resourceStatus: 'QUANTITY_VERIFIED',
      arrivedAt: now,
      quantityExpected: 1000,
      quantityArrived: 1000,
      physicalCheckAttested: true,
    },
    {
      resourceType: 'SIGNED_SAMPLE',
      resourceStatus: 'VERIFIED',
      arrivedAt: now,
      quantityExpected: null,
      quantityArrived: null,
      physicalCheckAttested: true,
    },
  ];
  let version = 7;
  for (const material of materialPayloads) {
    const operation = action('MATERIAL_RECORD', orderId, version, {
      productionVersionLabel: 'V2',
      note: `Operator verifies ${material.resourceType} for the current V2 batch.`,
      ...material,
    });
    const result = await expectM2(
      identities.operator,
      operation,
      operation.payload,
      'WOS_V1_M2_ACTION_APPLIED',
    );
    assert.equal(result.version, version + 1);
    version += 1;
  }

  const oldImageAttempt = action('BASELINE_SELECT', orderId, version, {
    productionVersionLabel: 'V2',
    note: 'Old V1 image baseline must be rejected.',
    imageIds: input.images.v1.map(image => image.imageId),
  });
  await negativeM2(
    'OLD_IMAGE_REJECTED',
    identities.office,
    oldImageAttempt,
    oldImageAttempt.payload,
    [400, 409, 403],
  );

  const wrongCountBaseline = action('BASELINE_SELECT', orderId, version, {
    productionVersionLabel: 'V2',
    note: 'A partial image set must not become the current baseline.',
    imageIds: v2Ids.slice(0, 3),
  });
  await negativeM2(
    'BASELINE_WRONG_COUNT_REJECTED',
    identities.office,
    wrongCountBaseline,
    wrongCountBaseline.payload,
    [400, 409, 422],
  );

  const baselineOperation = action('BASELINE_SELECT', orderId, version, {
    productionVersionLabel: 'V2',
    note: 'Office selects all four current V2 images as the only current proof set.',
    imageIds: v2Ids,
  });
  const baseline = await expectM2(
    identities.office,
    baselineOperation,
    baselineOperation.payload,
    'WOS_V1_M2_ACTION_APPLIED',
  );
  assert.match(baseline.baselineId, /^[a-f0-9-]{36}$/i);
  version += 1;
  const baselineId = baseline.baselineId;

  const officeConfirm = action('BASELINE_OFFICE_CONFIRM', orderId, version, {
    productionVersionLabel: 'V2',
    note: 'Office signs the current V2 proof set for the selected baseline.',
    baselineId,
  });
  await expectM2(
    identities.office,
    officeConfirm,
    officeConfirm.payload,
    'WOS_V1_M2_ACTION_APPLIED',
  );
  version += 1;

  const duplicateSigner = action(
    'BASELINE_WORKSHOP_CONFIRM',
    orderId,
    version,
    {
      productionVersionLabel: 'V2',
      note: 'Office must not act as the workshop signer.',
      baselineId,
    },
  );
  await negativeM2(
    'DUPLICATE_SIGNER_REJECTED',
    identities.office,
    duplicateSigner,
    duplicateSigner.payload,
    [403],
  );

  const workshopConfirm = action(
    'BASELINE_WORKSHOP_CONFIRM',
    orderId,
    version,
    {
      productionVersionLabel: 'V2',
      note: 'Operator independently signs the exact same current V2 baseline.',
      baselineId,
    },
  );
  await expectM2(
    identities.operator,
    workshopConfirm,
    workshopConfirm.payload,
    'WOS_V1_M2_ACTION_APPLIED',
  );
  version += 1;

  const badReadiness = action('FINAL_READINESS_CONFIRM', orderId, version, {
    productionVersionLabel: 'V2',
    note: 'Wrong quantity must not become final readiness.',
    baselineId,
    physicalCheckAttested: true,
    filmArrivedAt: now,
    fixtureArrivedAt: now,
    incomingArrivedAt: now,
    signedSampleArrivedAt: now,
    quantityExpected: 1000,
    quantityArrived: 999,
  });
  await negativeM2(
    'WRONG_QUANTITY_REJECTED',
    identities.operator,
    badReadiness,
    badReadiness.payload,
    [400, 409],
  );

  const readiness = action('FINAL_READINESS_CONFIRM', orderId, version, {
    productionVersionLabel: 'V2',
    note: 'Operator confirms all four material categories and quantities in one transaction.',
    baselineId,
    physicalCheckAttested: true,
    filmArrivedAt: now,
    fixtureArrivedAt: now,
    incomingArrivedAt: now,
    signedSampleArrivedAt: now,
    quantityExpected: 1000,
    quantityArrived: 1000,
  });
  const readinessResult = await expectM2(
    identities.operator,
    readiness,
    readiness.payload,
    'WOS_V1_M2_ACTION_APPLIED',
  );
  assert.equal(readinessResult.workflowStatus, 'READINESS_CHECK');
  version += 1;

  const oldVersionStart = action('START_RELEASE', orderId, version - 1, {
    baselineId,
    note: 'Old version release must be rejected.',
  });
  oldVersionStart.payload = oldVersionStart.payload;
  await negativeM2(
    'OLD_VERSION_RELEASE_REJECTED',
    identities.manager,
    oldVersionStart,
    oldVersionStart.payload,
    [409, 403],
  );

  const startRelease = action('START_RELEASE', orderId, version, {
    baselineId,
    note: 'Independent manager authorizes manual start without automatic production.',
  });
  const release = await expectM2(
    identities.manager,
    startRelease,
    startRelease.payload,
    'WOS_V1_START_RELEASE_AUTHORIZED',
  );
  assert.equal(release.workflowStatus, 'READY_TO_START');
  assert.equal(release.productionStarted, false);
  assert.equal(release.canStart, false);
  test.release = release;
  version += 1;

  const replay = await expectM2(
    identities.manager,
    startRelease,
    startRelease.payload,
    'WOS_V1_START_RELEASE_REPLAY_VERIFIED',
  );
  assert.equal(replay.workflowStatus, 'READY_TO_START');

  if (!RESUME_MODE) {
    const duplicateCreate = await expectApp(
      identities.office,
      createBody,
      'CREATE_ORDER_VERIFIED',
    );
    assert.equal(duplicateCreate.result.orderId, orderId);
  } else {
    test.createCalls = 0;
  }

  for (const [label, identity] of [
    ['VIEWER_WRITE_REJECTED', identities.viewer],
    ['CROSS_ORG_WRITE_REJECTED', identities.crossorg],
  ]) {
    const denied = action('START_RELEASE', orderId, version - 1, {
      baselineId,
      note: 'Unauthorized identity must not authorize production.',
    });
    await negativeM2(label, identity, denied, denied.payload, [403]);
  }

  const state = JSON.parse(runSql(`
    SELECT jsonb_build_object(
      'id',id,
      'orderNumber',order_number,
      'version',version,
      'versionLabel',version_label,
      'workflowStatus',workflow_status,
      'customerId',customer_id,
      'projectId',project_id,
      'createdByProfileId',created_by_profile_id,
      'salesOwnerProfileId',sales_owner_profile_id
    )::text
    FROM public.wos_production_orders
    WHERE id=${sqlLiteral(orderId)}::uuid;
  `).split('\n').filter(Boolean).at(-1));
  assert.equal(state.version, version);
  assert.equal(state.versionLabel, 'V2');
  assert.equal(state.workflowStatus, 'READY_TO_START');
  test.finalState = state;

  const readonlyPayload = {
    orderId,
    expectedVersion: state.version,
    expectedVersionLabel: state.versionLabel,
    images: v2Images.map(image => ({
      imageId: image.imageId,
      category: image.category,
      storagePath: image.storagePath,
      sha256: image.sha256,
    })),
  };

  const storageResults = [];
  for (const image of v2Images) {
    const result = await downloadStorage(
      identities.operator,
      image.storagePath,
    );
    assert.equal(result.status, 200);
    assert.match(result.contentType, /^image\/png(?:\s*;|$)/i);
    assert.equal(result.sha256, image.sha256);
    storageResults.push({
      imageId: image.imageId,
      category: image.category,
      ...result,
    });
  }
  test.storagePositive = storageResults;

  const readonlyPositive = await readonlyEdge(
    identities.office,
    readonlyPayload,
  );
  record('READONLY_EDGE_V2', readonlyPositive);
  assert.equal(readonlyPositive.status, 200);
  assert.equal(
    readonlyPositive.body?.code,
    'WOS_V1_READONLY_IMAGE_PROOF_VERIFIED',
  );
  assert.equal(
    readonlyPositive.body?.data?.imageCategories?.length,
    4,
  );
  assert.equal(readonlyPositive.body?.data?.canStart, false);

  for (const [label, identity, payload, allowedStatuses] of [
    [
      'READONLY_WRONG_VERSION_REJECTED',
      identities.office,
      { ...readonlyPayload, expectedVersion: state.version - 1 },
      [409],
    ],
    [
      'READONLY_OLD_IMAGES_REJECTED',
      identities.office,
      {
        ...readonlyPayload,
        images: readonlyPayload.images.map((image, index) => ({
          ...image,
          imageId: v1Images[index].imageId,
          storagePath: v1Images[index].storagePath,
          sha256: v1Images[index].sha256,
        })),
      },
      [409],
    ],
    [
      'READONLY_WRONG_SHA_REJECTED',
      identities.office,
      {
        ...readonlyPayload,
        images: readonlyPayload.images.map((image, index) => ({
          ...image,
          sha256: index === 0
            ? '0'.repeat(64)
            : image.sha256,
        })),
      },
      [409, 422],
    ],
    [
      'READONLY_WRONG_COUNT_REJECTED',
      identities.office,
      {
        ...readonlyPayload,
        images: readonlyPayload.images.slice(0, 3),
      },
      [400, 409, 422],
    ],
    [
      'READONLY_VIEWER_REJECTED',
      identities.viewer,
      readonlyPayload,
      [403],
    ],
    [
      'READONLY_CROSS_ORG_REJECTED',
      identities.crossorg,
      readonlyPayload,
      [403],
    ],
    [
      'READONLY_ANON_REJECTED',
      null,
      readonlyPayload,
      [401, 403],
    ],
  ]) {
    const response = await readonlyEdge(identity, payload);
    test.negative.push({
      label,
      at: new Date().toISOString(),
      status: response.status,
      code: response.body?.code ?? null,
    });
    assert(
      allowedStatuses.includes(response.status),
      `${label}:${response.status}`,
    );
  }

  test.hostedReadonlyEdge = {
    status: readonlyPositive.status,
    code: readonlyPositive.body?.code,
    verifiedImageCount:
      readonlyPositive.body?.data?.imageCategories?.length,
    databaseWrites: 0,
    canStart: readonlyPositive.body?.data?.canStart,
  };

  writeFileSync(
    EVIDENCE_PATH,
    `${JSON.stringify(test, null, 2)}\n`,
    { mode: 0o600 },
  );
  process.stdout.write(`${JSON.stringify({
    status: 'PASS',
    orderId,
    finalVersion: state.version,
    finalLabel: state.versionLabel,
    finalWorkflowStatus: state.workflowStatus,
    evidence: EVIDENCE_PATH,
    writeDeadlineAt: control.writeDeadlineAt,
  })}\n`);
}

main().catch(error => {
  test.failure = error instanceof Error ? error.message : 'UNKNOWN';
  writeFileSync(
    EVIDENCE_PATH,
    `${JSON.stringify(test, null, 2)}\n`,
    { mode: 0o600 },
  );
  process.stderr.write(`WOS_BUSINESS_UAT=FAIL ${test.failure}\n`);
  process.exitCode = 1;
});
