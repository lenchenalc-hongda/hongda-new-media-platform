/// <reference lib="deno.ns" />
import { createClient } from 'npm:@supabase/supabase-js@2.58.0';
import {
  handleWosV1VerifyImageRequest,
  type WosV1VerifyImageHandlerOptions,
} from '../../supabase/functions/wos-v1-verify-image/index.ts';

const authId = 'WOS-V1-PRODUCTION-M2-QA-UAT-005';
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
  authorization: string | null;
  requestAuthId?: string;
  requestExecutionId?: string;
  requestNonce?: string;
  runtimeUrl?: string;
  gateError?: boolean;
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
  legacy_only_closer_pass: {
    secretKeysJson: '{}',
    legacyServiceRoleJwt: legacyJwt,
    authorization: `Bearer ${legacyJwt}`,
    control: openControl,
    expectedStatus: 200,
    expectedCode: 'WOS_V1_QA_EDGE_OPEN_PROBE',
    expectedAdminKey: legacyJwt,
  },
  dual_key_closer_pass_admin_new_secret: {
    secretKeysJson: JSON.stringify({ default: newSecret }),
    legacyServiceRoleJwt: legacyJwt,
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
    authorization: `Bearer ${wrongJwt}`,
    control: openControl,
    expectedStatus: 503,
    expectedCode: 'WOS_V1_EDGE_SERVER_CONFIG_INCOMPLETE',
  },
  ordinary_user_jwt_denied: {
    secretKeysJson: JSON.stringify({ default: newSecret }),
    legacyServiceRoleJwt: legacyJwt,
    authorization: `Bearer ${userJwt}`,
    control: openControl,
    expectedStatus: 503,
    expectedCode: 'WOS_V1_EDGE_SERVER_CONFIG_INCOMPLETE',
  },
  ordinary_user_claim_in_trusted_env_denied: {
    secretKeysJson: JSON.stringify({ default: newSecret }),
    legacyServiceRoleJwt: userJwt,
    authorization: `Bearer ${userJwt}`,
    control: openControl,
    expectedStatus: 503,
    expectedCode: 'WOS_V1_EDGE_SERVER_CONFIG_INCOMPLETE',
  },
  wrong_project_service_claim_denied: {
    secretKeysJson: JSON.stringify({ default: newSecret }),
    legacyServiceRoleJwt: wrongProjectJwt,
    authorization: `Bearer ${wrongProjectJwt}`,
    control: openControl,
    expectedStatus: 503,
    expectedCode: 'WOS_V1_EDGE_SERVER_CONFIG_INCOMPLETE',
  },
  new_secret_as_closer_denied: {
    secretKeysJson: JSON.stringify({ default: newSecret }),
    legacyServiceRoleJwt: legacyJwt,
    authorization: `Bearer ${newSecret}`,
    control: openControl,
    expectedStatus: 503,
    expectedCode: 'WOS_V1_EDGE_SERVER_CONFIG_INCOMPLETE',
  },
  missing_authorization_denied: {
    secretKeysJson: JSON.stringify({ default: newSecret }),
    legacyServiceRoleJwt: legacyJwt,
    authorization: null,
    control: openControl,
    expectedStatus: 503,
    expectedCode: 'WOS_V1_EDGE_SERVER_CONFIG_INCOMPLETE',
  },
  missing_legacy_jwt_denied: {
    secretKeysJson: JSON.stringify({ default: newSecret }),
    legacyServiceRoleJwt: '',
    authorization: `Bearer ${legacyJwt}`,
    control: openControl,
    expectedStatus: 503,
    expectedCode: 'WOS_V1_EDGE_SERVER_CONFIG_INCOMPLETE',
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
        Deno.env.delete('WOS_V1_QA_EDGE_CLOSER_SERVICE_ROLE_KEY');
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
  } finally {
    await edge.shutdown();
    await postgrest.shutdown();
  }

  console.log('WOS_V1_EDGE_ENTRY_HTTP_DENO_HARNESS=PASS');
});
