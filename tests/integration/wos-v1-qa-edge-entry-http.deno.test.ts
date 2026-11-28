/// <reference lib="deno.ns" />
import { createClient } from 'npm:@supabase/supabase-js@2.58.0';
import {
  handleWosV1VerifyImageRequest,
  type WosV1VerifyImageHandlerOptions,
} from '../../supabase/functions/wos-v1-verify-image/index.ts';

const authId = 'WOS-V1-PRODUCTION-M2-QA-UAT-017';
const executionId = 'efddb60c-4a70-4b46-bf18-46629a4397d2';
const processNonce = '77ac7769-25a2-495a-8892-467d16abb00e';
const qaProjectRef = 'xulmpqaknlwqqculbsek';
const qaRuntimeUrl = `https://${qaProjectRef}.supabase.co`;
const newSecret = 'sb_secret_synthetic_admin_only';

function syntheticJwt(payload: Record<string, unknown>): string {
  const encode = (value: Record<string, unknown>) =>
    btoa(JSON.stringify(value))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(payload)}.synthetic`;
}

const legacyJwt = syntheticJwt({
  role: 'service_role',
  ref: qaProjectRef,
  sub: 'synthetic-closer',
});
const wrongJwt = syntheticJwt({
  role: 'service_role',
  ref: qaProjectRef,
  sub: 'different-token',
});
const userJwt = syntheticJwt({
  role: 'authenticated',
  ref: qaProjectRef,
});
const wrongProjectJwt = syntheticJwt({
  role: 'service_role',
  ref: 'wrongprojectrefvalue',
});

type Scenario = {
  secretKeysJson: string;
  legacyServiceRoleJwt: string;
  dedicatedCloserJwt?: string;
  omitDedicatedCloserJwt?: boolean;
  authorization: string | null;
  requestAuthId?: string;
  requestExecutionId?: string;
  requestNonce?: string;
  runtimeUrl?: string;
  gateError?: boolean;
  credentialPreflight?: boolean;
  control: Record<string, unknown> | null;
  expectedStatus: number;
  expectedCode: string;
  expectedAdminKey?: string;
};

const openControl = {
  status: 'OPEN',
  executionId,
  edgeProcessNonce: processNonce,
  dbLastHeartbeatAt: '2026-11-27T00:00:00.000Z',
  edgeLastHeartbeatAt: '2026-11-27T00:00:00.000Z',
  writeDeadlineAt: '2026-11-27T00:08:00.000Z',
};

const cases: Record<string, Scenario> = {
  credential_preflight_not_armed_pass: {
    secretKeysJson: '{}',
    legacyServiceRoleJwt: legacyJwt,
    dedicatedCloserJwt: legacyJwt,
    authorization: `Bearer ${legacyJwt}`,
    credentialPreflight: true,
    control: {
      status: 'NOT_ARMED',
      executionId,
      edgeProcessNonce: processNonce,
    },
    expectedStatus: 200,
    expectedCode: 'WOS_V1_QA_EDGE_CREDENTIAL_VERIFIED',
    expectedAdminKey: legacyJwt,
  },
  legacy_only_closer_pass: {
    secretKeysJson: '{}',
    legacyServiceRoleJwt: legacyJwt,
    dedicatedCloserJwt: legacyJwt,
    authorization: `Bearer ${legacyJwt}`,
    control: openControl,
    expectedStatus: 200,
    expectedCode: 'WOS_V1_QA_EDGE_OPEN_PROBE',
    expectedAdminKey: legacyJwt,
  },
  dual_key_closer_pass_admin_new_secret: {
    secretKeysJson: JSON.stringify({ default: newSecret }),
    legacyServiceRoleJwt: legacyJwt,
    dedicatedCloserJwt: legacyJwt,
    authorization: `Bearer ${legacyJwt}`,
    control: openControl,
    expectedStatus: 200,
    expectedCode: 'WOS_V1_QA_EDGE_OPEN_PROBE',
    expectedAdminKey: newSecret,
  },
  dedicated_closer_secret_wins_over_stale_reserved_secret: {
    secretKeysJson: JSON.stringify({ default: newSecret }),
    legacyServiceRoleJwt: wrongJwt,
    dedicatedCloserJwt: legacyJwt,
    authorization: `Bearer ${legacyJwt}`,
    control: openControl,
    expectedStatus: 200,
    expectedCode: 'WOS_V1_QA_EDGE_OPEN_PROBE',
    expectedAdminKey: newSecret,
  },
  wrong_jwt_denied: {
    secretKeysJson: JSON.stringify({ default: newSecret }),
    legacyServiceRoleJwt: legacyJwt,
    dedicatedCloserJwt: legacyJwt,
    authorization: `Bearer ${wrongJwt}`,
    control: openControl,
    expectedStatus: 503,
    expectedCode: 'WOS_V1_QA_EDGE_CLOSER_CREDENTIAL_MISMATCH',
  },
  ordinary_user_jwt_denied: {
    secretKeysJson: JSON.stringify({ default: newSecret }),
    legacyServiceRoleJwt: legacyJwt,
    dedicatedCloserJwt: legacyJwt,
    authorization: `Bearer ${userJwt}`,
    control: openControl,
    expectedStatus: 503,
    expectedCode: 'WOS_V1_QA_EDGE_CLOSER_CREDENTIAL_MISMATCH',
  },
  ordinary_user_claim_in_trusted_env_denied: {
    secretKeysJson: JSON.stringify({ default: newSecret }),
    legacyServiceRoleJwt: userJwt,
    dedicatedCloserJwt: userJwt,
    authorization: `Bearer ${userJwt}`,
    control: openControl,
    expectedStatus: 503,
    expectedCode: 'WOS_V1_QA_EDGE_CLOSER_CREDENTIAL_MISMATCH',
  },
  wrong_project_service_claim_denied: {
    secretKeysJson: JSON.stringify({ default: newSecret }),
    legacyServiceRoleJwt: wrongProjectJwt,
    dedicatedCloserJwt: wrongProjectJwt,
    authorization: `Bearer ${wrongProjectJwt}`,
    control: openControl,
    expectedStatus: 503,
    expectedCode: 'WOS_V1_QA_EDGE_CLOSER_CREDENTIAL_MISMATCH',
  },
  new_secret_as_closer_denied: {
    secretKeysJson: JSON.stringify({ default: newSecret }),
    legacyServiceRoleJwt: legacyJwt,
    dedicatedCloserJwt: legacyJwt,
    authorization: `Bearer ${newSecret}`,
    control: openControl,
    expectedStatus: 503,
    expectedCode: 'WOS_V1_QA_EDGE_CLOSER_CREDENTIAL_MISMATCH',
  },
  missing_authorization_denied: {
    secretKeysJson: JSON.stringify({ default: newSecret }),
    legacyServiceRoleJwt: legacyJwt,
    dedicatedCloserJwt: legacyJwt,
    authorization: null,
    control: openControl,
    expectedStatus: 503,
    expectedCode: 'WOS_V1_QA_EDGE_CLOSER_CREDENTIAL_MISMATCH',
  },
  missing_dedicated_closer_jwt_denied: {
    secretKeysJson: JSON.stringify({ default: newSecret }),
    legacyServiceRoleJwt: '',
    omitDedicatedCloserJwt: true,
    authorization: `Bearer ${legacyJwt}`,
    control: openControl,
    expectedStatus: 503,
    expectedCode: 'WOS_V1_QA_EDGE_CLOSER_CREDENTIAL_MISSING',
  },
  project_mismatch_denied: {
    secretKeysJson: JSON.stringify({ default: newSecret }),
    legacyServiceRoleJwt: legacyJwt,
    authorization: `Bearer ${legacyJwt}`,
    runtimeUrl: 'https://wrongproject.supabase.co',
    control: openControl,
    expectedStatus: 503,
    expectedCode: 'WOS_V1_EDGE_RUNTIME_DENIED',
  },
  authorization_id_mismatch_denied: {
    secretKeysJson: JSON.stringify({ default: newSecret }),
    legacyServiceRoleJwt: legacyJwt,
    authorization: `Bearer ${legacyJwt}`,
    requestAuthId: 'WOS-V1-WRONG-AUTHORIZATION',
    control: openControl,
    expectedStatus: 503,
    expectedCode: 'WOS_V1_QA_EDGE_AUTHORIZATION_REQUIRED',
  },
  execution_id_mismatch_denied: {
    secretKeysJson: JSON.stringify({ default: newSecret }),
    legacyServiceRoleJwt: legacyJwt,
    authorization: `Bearer ${legacyJwt}`,
    requestExecutionId: '91919191-9191-4191-8191-919191919191',
    control: openControl,
    expectedStatus: 503,
    expectedCode: 'WOS_V1_QA_EDGE_PROBE_SCOPE_DENIED',
    expectedAdminKey: newSecret,
  },
  nonce_mismatch_denied: {
    secretKeysJson: JSON.stringify({ default: newSecret }),
    legacyServiceRoleJwt: legacyJwt,
    authorization: `Bearer ${legacyJwt}`,
    requestNonce: '93939393-9393-4393-8393-939393939393',
    control: {
      status: 'DENIED',
      executionId,
      edgeProcessNonce: processNonce,
    },
    expectedStatus: 503,
    expectedCode: 'WOS_V1_QA_EDGE_PROBE_SCOPE_DENIED',
    expectedAdminKey: newSecret,
  },
  database_gate_missing_fail_closed: {
    secretKeysJson: JSON.stringify({ default: newSecret }),
    legacyServiceRoleJwt: legacyJwt,
    authorization: `Bearer ${legacyJwt}`,
    control: {
      status: 'NOT_ARMED',
      executionId,
      edgeProcessNonce: null,
    },
    expectedStatus: 503,
    expectedCode: 'WOS_V1_QA_EDGE_CLOSED',
    expectedAdminKey: newSecret,
  },
  database_unavailable_fail_closed: {
    secretKeysJson: JSON.stringify({ default: newSecret }),
    legacyServiceRoleJwt: legacyJwt,
    authorization: `Bearer ${legacyJwt}`,
    gateError: true,
    control: openControl,
    expectedStatus: 503,
    expectedCode: 'WOS_V1_QA_EDGE_GATE_UNAVAILABLE',
    expectedAdminKey: newSecret,
  },
  expired_gate_fail_closed: {
    secretKeysJson: JSON.stringify({ default: newSecret }),
    legacyServiceRoleJwt: legacyJwt,
    authorization: `Bearer ${legacyJwt}`,
    control: {
      status: 'EXPIRED',
      executionId,
      edgeProcessNonce: processNonce,
    },
    expectedStatus: 503,
    expectedCode: 'WOS_V1_QA_EDGE_CLOSED',
    expectedAdminKey: newSecret,
  },
  stale_heartbeat_fail_closed: {
    secretKeysJson: JSON.stringify({ default: newSecret }),
    legacyServiceRoleJwt: legacyJwt,
    authorization: `Bearer ${legacyJwt}`,
    control: {
      status: 'STALE',
      executionId,
      edgeProcessNonce: processNonce,
    },
    expectedStatus: 503,
    expectedCode: 'WOS_V1_QA_EDGE_CLOSED',
    expectedAdminKey: newSecret,
  },
  closed_gate_fail_closed: {
    secretKeysJson: JSON.stringify({ default: newSecret }),
    legacyServiceRoleJwt: legacyJwt,
    authorization: `Bearer ${legacyJwt}`,
    control: {
      status: 'CLOSED',
      executionId,
      edgeProcessNonce: processNonce,
      closedAt: '2026-11-27T00:00:00.000Z',
    },
    expectedStatus: 503,
    expectedCode: 'WOS_V1_QA_EDGE_CLOSED',
    expectedAdminKey: newSecret,
  },
};

Deno.test('Edge entry dual-key and fail-closed matrix', async () => {
  Deno.env.set('WOS_SUPABASE_ALLOWED_REFS', qaProjectRef);
  Deno.env.set(
    'WOS_V1_EDGE_ALLOWED_ORIGINS',
    'https://hongda-wos-p00202-qa-preview-git-0f95f1-lens-projects-3fc386bd.vercel.app',
  );
  Deno.env.set('SUPABASE_URL', qaRuntimeUrl);
  Deno.env.set(
    'SUPABASE_PUBLISHABLE_KEYS',
    JSON.stringify({ default: 'sb_publishable_synthetic' }),
  );
  Deno.env.set('WOS_V1_EDGE_WRITES_ENABLED', 'false');
  Deno.env.set('WOS_V1_QA_UAT_AUTHORIZATION_ID', authId);

  let activeScenario = cases.legacy_only_closer_pass;
  let capturedAdminKey = '';
  let capturedRpcUrl = '';
  let capturedRpcHeaders = new Headers();
  let capturedRpcBody: Record<string, unknown> | null = null;
  let rpcCalls = 0;

  let resolvePostgrestPort: (port: number) => void;
  const postgrestPortReady = new Promise<number>(resolve => {
    resolvePostgrestPort = resolve;
  });
  const postgrest = Deno.serve({
    hostname: '127.0.0.1',
    port: 0,
    onListen: ({ port }) => resolvePostgrestPort(port),
  }, async request => {
    rpcCalls += 1;
    capturedRpcUrl = request.url;
    capturedRpcHeaders = request.headers;
    capturedRpcBody = JSON.parse(
      await request.text(),
    ) as Record<string, unknown>;
    const pathname = new URL(request.url).pathname;
    if (request.method !== 'POST'
      || pathname !== '/rest/v1/rpc/wos_v1_qa_uat_edge_probe') {
      return Response.json({ message: 'unexpected_request' }, { status: 404 });
    }
    if (activeScenario.gateError) {
      return Response.json({
        code: 'PGRST000',
        message: 'synthetic_database_unavailable',
      }, { status: 503 });
    }
    return Response.json(activeScenario.control, { status: 200 });
  });
  const postgrestPort = await postgrestPortReady;
  const mockPostgrestUrl = `http://127.0.0.1:${postgrestPort}`;

  const options = {
    createAdminClient: ((_url: string, key: string, clientOptions: unknown) => {
      capturedAdminKey = key;
      return createClient(mockPostgrestUrl, key, clientOptions as never);
    }) as unknown as NonNullable<
      WosV1VerifyImageHandlerOptions['createAdminClient']
    >,
  };

  let resolveEdgePort: (port: number) => void;
  const edgePortReady = new Promise<number>(resolve => {
    resolveEdgePort = resolve;
  });
  const edge = Deno.serve({
    hostname: '127.0.0.1',
    port: 0,
    onListen: ({ port }) => resolveEdgePort(port),
  }, request => handleWosV1VerifyImageRequest(request, options));
  const edgePort = await edgePortReady;
  const edgeBase = `http://127.0.0.1:${edgePort}`;

  try {
    for (const [name, scenario] of Object.entries(cases)) {
      activeScenario = scenario;
      capturedAdminKey = '';
      capturedRpcUrl = '';
      capturedRpcHeaders = new Headers();
      capturedRpcBody = null;
      rpcCalls = 0;
      Deno.env.set('SUPABASE_SECRET_KEYS', scenario.secretKeysJson);
      Deno.env.set(
        'SUPABASE_SERVICE_ROLE_KEY',
        scenario.legacyServiceRoleJwt,
      );
      if (scenario.dedicatedCloserJwt === undefined) {
        if (scenario.omitDedicatedCloserJwt) {
          Deno.env.delete('WOS_V1_QA_EDGE_CLOSER_SERVICE_ROLE_KEY');
        } else {
          Deno.env.set(
            'WOS_V1_QA_EDGE_CLOSER_SERVICE_ROLE_KEY',
            scenario.legacyServiceRoleJwt,
          );
        }
      } else {
        Deno.env.set(
          'WOS_V1_QA_EDGE_CLOSER_SERVICE_ROLE_KEY',
          scenario.dedicatedCloserJwt,
        );
      }
      Deno.env.set('SUPABASE_URL', scenario.runtimeUrl || qaRuntimeUrl);
      const headers = new Headers({
        'Content-Type': 'application/json',
        'x-wos-qa-uat-authorization-id':
          scenario.requestAuthId || authId,
        'x-wos-qa-uat-execution-id':
          scenario.requestExecutionId || executionId,
        'x-wos-qa-uat-closer-nonce':
          scenario.requestNonce || processNonce,
        'x-wos-qa-closer-probe': '1',
      });
      if (scenario.authorization !== null) {
        headers.set('Authorization', scenario.authorization || '');
      }
      if (scenario.credentialPreflight) {
        headers.set('x-wos-qa-closer-credential-preflight', '1');
      }
      const response = await fetch(`${edgeBase}/`, {
        method: 'POST',
        headers,
        body: '{}',
      });
      const body = await response.json();
      if (response.status !== scenario.expectedStatus
        || body.code !== scenario.expectedCode) {
        throw new Error(`${name}:${response.status}:${body.code}`);
      }
      if (scenario.expectedAdminKey !== undefined) {
        if (capturedAdminKey !== scenario.expectedAdminKey) {
          throw new Error(`${name}:admin_key_mismatch`);
        }
        if (capturedRpcHeaders.get('apikey') !== scenario.expectedAdminKey) {
          throw new Error(`${name}:rpc_apikey_mismatch`);
        }
        const requestAuthorization =
          capturedRpcHeaders.get('authorization');
        if (requestAuthorization
          !== `Bearer ${scenario.expectedAdminKey}`) {
          throw new Error(`${name}:rpc_authorization_mismatch`);
        }
        if (capturedRpcUrl
          !== `${mockPostgrestUrl}/rest/v1/rpc/wos_v1_qa_uat_edge_probe`) {
          throw new Error(`${name}:rpc_url_mismatch`);
        }
        const rpcBody = capturedRpcBody as Record<string, unknown> | null;
        if (rpcBody?.['p_execution_id']
          !== (scenario.requestExecutionId || executionId)
          || rpcBody?.['p_process_nonce']
          !== (scenario.requestNonce || processNonce)) {
          throw new Error(`${name}:rpc_body_mismatch`);
        }
      }
      const expectedRpcCalls = scenario.expectedAdminKey !== undefined ? 1 : 0;
      if (rpcCalls !== expectedRpcCalls) {
        throw new Error(`${name}:rpc_call_count_mismatch`);
      }
      if ((scenario.expectedCode === 'WOS_V1_QA_EDGE_CLOSED')
        && body.data?.gateStatus !== String(scenario.control?.status || '')) {
        throw new Error(`${name}:closed_gate_status_mismatch`);
      }
      console.log(`${name}=PASS`);
    }

    const writesDisabled = await fetch(`${edgeBase}/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-wos-qa-uat-authorization-id': authId,
        'x-wos-qa-uat-execution-id': executionId,
        'x-wos-qa-uat-closer-nonce': processNonce,
      },
      body: '{}',
    });
    const writesDisabledBody = await writesDisabled.json();
    if (writesDisabled.status !== 503
      || writesDisabledBody.code !== 'WOS_V1_EDGE_WRITES_DISABLED') {
      throw new Error('edge_writes_disabled');
    }
    console.log('edge_writes_disabled=PASS');
    console.log('EDGE_CREDENTIAL_PREFLIGHT=PASS');
    console.log('HTTP_503_CLOSED_PROBE=PASS');
    console.log('WRONG_CREDENTIAL_DENIAL=PASS');
    console.log('GATE_UNAVAILABLE_FAIL_CLOSED=PASS');
  } finally {
    await edge.shutdown();
    await postgrest.shutdown();
  }

  console.log('WOS_V1_EDGE_ENTRY_HTTP_DENO_HARNESS=PASS');
});

Deno.test('Production current-order Proof renewal uses real HTTP and skips writer', async () => {
  const productionRef = 'amqpvxrurenevniilhtl';
  const productionRuntime = `https://${productionRef}.supabase.co`;
  const userId = '10101010-1010-4010-8010-101010101010';
  const profileId = '11111111-1111-4111-8111-111111111111';
  const orgId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const orderId = '33333333-3333-4333-8333-333333333333';
  const imageId = '41111111-1111-4111-8111-111111111111';
  const objectId = '51111111-1111-4111-8111-111111111111';
  const storagePath =
    `organizations/${orgId}/wos/production-order/${orderId}`
    + `/images/product/versions/V2/${imageId}/source.png`;
  const png = Uint8Array.from(
    atob(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=',
    ),
    value => value.charCodeAt(0),
  );
  const digest = Array.from(
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', png),
    ),
  ).map(value => value.toString(16).padStart(2, '0')).join('');
  let writerCalls = 0;
  let renewalCalls = 0;
  const rpcNames: string[] = [];

  let resolvePort: (port: number) => void;
  const portReady = new Promise<number>(resolve => {
    resolvePort = resolve;
  });
  const supabase = Deno.serve({
    hostname: '127.0.0.1',
    port: 0,
    onListen: ({ port }) => resolvePort(port),
  }, async request => {
    const url = new URL(request.url);
    if (url.pathname === '/auth/v1/user') {
      return Response.json({ id: userId, email: 'office@example.test' });
    }
    if (url.pathname === '/rest/v1/profiles') {
      return Response.json([{
        id: profileId,
        user_id: userId,
        org_id: orgId,
        role: 'sales',
        is_active: true,
      }]);
    }
    if (url.pathname === '/rest/v1/wos_production_orders') {
      return Response.json([{
        id: orderId,
        organization_id: orgId,
        created_by_profile_id: profileId,
        sales_owner_profile_id: profileId,
        version: 9,
        version_label: 'V2',
        workflow_status: 'WAITING_MATERIAL',
      }]);
    }
    if (url.pathname.startsWith('/rest/v1/rpc/')) {
      const rpcName = url.pathname.split('/').at(-1) || '';
      rpcNames.push(rpcName);
      if (rpcName === 'wos_p7_service_storage_snapshot') {
        return Response.json({
          id: objectId,
          ownerId: '99999999-9999-4999-8999-999999999999',
          version: 'object-version-1',
          updatedAt: '2026-11-28T10:00:00.123456Z',
          mimeType: 'image/png',
          byteSize: String(png.length),
        });
      }
      if (rpcName === 'wos_v1_renew_expired_image_proof') {
        renewalCalls += 1;
        return Response.json({
          status: 'RENEWED',
          imageId,
          category: 'PRODUCT',
          sha256: digest,
          canStart: false,
        });
      }
      if (rpcName === 'wos_p7_record_trusted_image_proof') {
        writerCalls += 1;
        return Response.json({ status: 'UNEXPECTED_WRITER_CALL' });
      }
    }
    if (url.pathname.startsWith('/storage/v1/object/wos-private/')) {
      return new Response(png, {
        status: 200,
        headers: { 'content-type': 'image/png' },
      });
    }
    return Response.json({ message: 'unexpected_request' }, { status: 404 });
  });
  const mockPort = await portReady;
  const mockUrl = `http://127.0.0.1:${mockPort}`;

  Deno.env.set('SUPABASE_URL', productionRuntime);
  Deno.env.set('WOS_SUPABASE_ALLOWED_REFS', productionRef);
  Deno.env.set('WOS_V1_EDGE_ALLOWED_ORIGINS', '');
  Deno.env.set(
    'SUPABASE_PUBLISHABLE_KEYS',
    JSON.stringify({ default: 'sb_publishable_synthetic' }),
  );
  Deno.env.set(
    'SUPABASE_SECRET_KEYS',
    JSON.stringify({ default: 'sb_secret_synthetic_admin' }),
  );
  Deno.env.set('WOS_V1_EDGE_WRITES_ENABLED', 'true');

  const redirect = ((_url: string, key: string, options: unknown) =>
    createClient(mockUrl, key, options as never)) as unknown as NonNullable<
      WosV1VerifyImageHandlerOptions['createAdminClient']
    >;
  let resolveEdgePort: (port: number) => void;
  const edgePortReady = new Promise<number>(resolve => {
    resolveEdgePort = resolve;
  });
  const edge = Deno.serve({
    hostname: '127.0.0.1',
    port: 0,
    onListen: ({ port }) => resolveEdgePort(port),
  }, request => handleWosV1VerifyImageRequest(request, {
    createAdminClient: redirect,
    createUserClient: redirect,
  }));
  const edgePort = await edgePortReady;
  try {
    const response = await fetch(`http://127.0.0.1:${edgePort}/`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${syntheticJwt({
          role: 'authenticated',
          ref: productionRef,
        })}`,
        apikey: 'sb_publishable_synthetic',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        category: 'PRODUCT',
        imageId,
        orderId,
        sha256: digest,
        storagePath,
      }),
    });
    const body = await response.json();
    if (response.status !== 200
      || body.code !== 'WOS_V1_TRUSTED_IMAGE_PROOF_ISSUED'
      || body.data?.proofStatus !== 'REPLAYED'
      || body.data?.renewalStatus !== 'RENEWED'
      || body.data?.sha256 !== digest
      || renewalCalls !== 1
      || writerCalls !== 0
      || rpcNames.filter(name =>
        name === 'wos_p7_service_storage_snapshot').length !== 2) {
      throw new Error(
        `production_proof_renewal_failed:${response.status}:`
        + `${JSON.stringify({ body, renewalCalls, writerCalls, rpcNames })}`,
      );
    }
    console.log('WOS_V1_PRODUCTION_PROOF_REFRESH_HTTP=PASS');
    console.log('WOS_V1_PRODUCTION_PROOF_RENEWAL_SKIPS_WRITER=PASS');
  } finally {
    await edge.shutdown();
    await supabase.shutdown();
  }
});

Deno.test('QA current-order Proof uses the renewal wrapper for a non-uploader reviewer', async () => {
  const userId = '30303030-3030-4030-8030-303030303030';
  const uploaderId = '99999999-9999-4999-8999-999999999999';
  const profileId = '33333333-3333-4333-8333-333333333333';
  const orgId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const orderId = '77777777-7777-4777-8777-777777777777';
  const imageId = '41111111-1111-4111-8111-111111111111';
  const objectId = '51111111-1111-4111-8111-111111111111';
  const storagePath =
    `organizations/${orgId}/wos/production-order/${orderId}`
    + `/images/product/versions/V2/${imageId}/source.png`;
  const png = Uint8Array.from(
    atob(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=',
    ),
    value => value.charCodeAt(0),
  );
  const digest = Array.from(
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', png),
    ),
  ).map(value => value.toString(16).padStart(2, '0')).join('');
  let gateCalls = 0;
  let snapshotCalls = 0;
  let writerCalls = 0;
  let renewalCalls = 0;

  let resolvePort: (port: number) => void;
  const portReady = new Promise<number>(resolve => {
    resolvePort = resolve;
  });
  const supabase = Deno.serve({
    hostname: '127.0.0.1',
    port: 0,
    onListen: ({ port }) => resolvePort(port),
  }, async request => {
    const url = new URL(request.url);
    if (url.pathname === '/auth/v1/user') {
      return Response.json({ id: userId, email: 'manager@example.test' });
    }
    if (url.pathname === '/rest/v1/profiles') {
      return Response.json([{
        id: profileId,
        user_id: userId,
        org_id: orgId,
        role: 'manager',
        is_active: true,
      }]);
    }
    if (url.pathname === '/rest/v1/wos_production_orders') {
      return Response.json([{
        id: orderId,
        organization_id: orgId,
        created_by_profile_id: '11111111-1111-4111-8111-111111111111',
        sales_owner_profile_id: '11111111-1111-4111-8111-111111111111',
        version: 7,
        version_label: 'V2',
        workflow_status: 'WAITING_MATERIAL',
      }]);
    }
    if (url.pathname.startsWith('/rest/v1/rpc/')) {
      const rpcName = url.pathname.split('/').at(-1) || '';
      if (rpcName === 'wos_v1_qa_uat_edge_write_allowed') {
        gateCalls += 1;
        return Response.json(true);
      }
      if (rpcName === 'wos_p7_service_storage_snapshot') {
        snapshotCalls += 1;
        return Response.json({
          id: objectId,
          ownerId: uploaderId,
          version: 'object-version-1',
          updatedAt: '2026-11-28T10:00:00.123456Z',
          mimeType: 'image/png',
          byteSize: String(png.length),
        });
      }
      if (rpcName === 'wos_v1_qa_uat_edge_renew_proof') {
        renewalCalls += 1;
        return Response.json({
          status: 'RENEWED',
          imageId,
          category: 'PRODUCT',
          sha256: digest,
          canStart: false,
        });
      }
      if (rpcName === 'wos_v1_qa_uat_edge_record_proof') {
        writerCalls += 1;
        return Response.json({
          status: 'UNEXPECTED_WRITER_CALL',
        });
      }
    }
    if (url.pathname.startsWith('/storage/v1/object/wos-private/')) {
      return new Response(png, {
        status: 200,
        headers: { 'content-type': 'image/png' },
      });
    }
    return Response.json({ message: 'unexpected_request' }, { status: 404 });
  });
  const mockPort = await portReady;
  const mockUrl = `http://127.0.0.1:${mockPort}`;

  Deno.env.set('SUPABASE_URL', qaRuntimeUrl);
  Deno.env.set('WOS_SUPABASE_ALLOWED_REFS', qaProjectRef);
  Deno.env.set('WOS_V1_EDGE_ALLOWED_ORIGINS', '');
  Deno.env.set(
    'SUPABASE_PUBLISHABLE_KEYS',
    JSON.stringify({ default: 'sb_publishable_synthetic' }),
  );
  Deno.env.set(
    'SUPABASE_SECRET_KEYS',
    JSON.stringify({ default: 'sb_secret_synthetic_admin' }),
  );
  Deno.env.set('WOS_V1_EDGE_WRITES_ENABLED', 'true');
  Deno.env.set('WOS_V1_QA_UAT_AUTHORIZATION_ID', authId);

  const redirect = ((_url: string, key: string, options: unknown) =>
    createClient(mockUrl, key, options as never)) as unknown as NonNullable<
      WosV1VerifyImageHandlerOptions['createAdminClient']
    >;
  let resolveEdgePort: (port: number) => void;
  const edgePortReady = new Promise<number>(resolve => {
    resolveEdgePort = resolve;
  });
  const edge = Deno.serve({
    hostname: '127.0.0.1',
    port: 0,
    onListen: ({ port }) => resolveEdgePort(port),
  }, request => handleWosV1VerifyImageRequest(request, {
    createAdminClient: redirect,
    createUserClient: redirect,
  }));
  const edgePort = await edgePortReady;
  try {
    const response = await fetch(`http://127.0.0.1:${edgePort}/`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${syntheticJwt({
          role: 'authenticated',
          ref: qaProjectRef,
        })}`,
        apikey: 'sb_publishable_synthetic',
        'content-type': 'application/json',
        'x-wos-qa-uat-authorization-id': authId,
        'x-wos-qa-uat-execution-id': executionId,
        'x-wos-qa-uat-closer-nonce': processNonce,
      },
      body: JSON.stringify({
        category: 'PRODUCT',
        imageId,
        orderId,
        sha256: digest,
        storagePath,
      }),
    });
    const body = await response.json();
    if (response.status !== 200
      || body.code !== 'WOS_V1_TRUSTED_IMAGE_PROOF_ISSUED'
      || body.data?.proofStatus !== 'REPLAYED'
      || body.data?.renewalStatus !== 'RENEWED'
      || body.data?.sha256 !== digest
      || gateCalls !== 1
      || snapshotCalls !== 2
      || writerCalls !== 0
      || renewalCalls !== 1) {
      throw new Error(
        `qa_current_order_proof_failed:${response.status}:`
        + `${JSON.stringify({
          body,
          gateCalls,
          snapshotCalls,
          writerCalls,
          renewalCalls,
        })}`,
      );
    }
    console.log('WOS_V1_QA_CURRENT_ORDER_PROOF_HTTP=PASS');
    console.log('WOS_V1_QA_CURRENT_ORDER_NON_UPLOADER_REVIEW=PASS');
    console.log('WOS_V1_QA_CURRENT_ORDER_RENEWAL_SKIPS_WRITER=PASS');
  } finally {
    await edge.shutdown();
    await supabase.shutdown();
  }
});
