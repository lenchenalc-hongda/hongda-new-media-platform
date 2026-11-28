/// <reference lib="deno.ns" />
import { createClient } from 'npm:@supabase/supabase-js@2.58.0';
import { pngValid } from '../_shared/wos-png-integrity.ts';
import {
  approvedSupabaseRuntimeUrl,
  approvedBrowserOrigin,
  canonicalWosV1ImagePath,
  deterministicProofRequestId,
  evaluateWosV1ImageAccess,
  evaluateWosV1QaCloserProbeAuth,
  evaluateWosV1QaCloserProbeGate,
  isWosV1ProofResult,
  objectSnapshotStable,
  selectWosV1AdminApiKey,
  parseAllowedSupabaseRefs,
  parseAllowedOrigins,
  parseWosV1ImageVerificationBody,
  snapshotMatchesUpload,
  wosV1EdgeWritesEnabled,
  type WosV1ImageOrder,
  type WosV1ImageProfile,
  type WosV1ObjectSnapshot,
} from './core.ts';

const MAX_REQUEST_BYTES = 4096;
const BODY_READ_TIMEOUT_MS = 5000;
const MAX_EXECUTION_MS = 20000;
const QA_UAT_PROJECT_REF = 'xulmpqaknlwqqculbsek';
const baseHeaders = {
  'Cache-Control': 'no-store, private',
  'Content-Type': 'application/json; charset=utf-8',
};

function output(
  request: Request | null,
  code: string,
  status: number,
  data: Record<string, unknown> | null = null,
): Response {
  const origin = request?.headers.get('origin') ?? null;
  const allowedOrigins = parseAllowedOrigins(
    Deno.env.get('WOS_V1_EDGE_ALLOWED_ORIGINS'),
  );
  const headers = new Headers(baseHeaders);
  if (origin && allowedOrigins.includes(origin)) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Headers',
      'authorization, apikey, content-type, x-client-info, x-wos-qa-uat-authorization-id, x-wos-qa-uat-execution-id, x-wos-qa-uat-closer-nonce, x-wos-qa-closer-credential-preflight');
    headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    headers.set('Access-Control-Max-Age', '600');
    headers.set('Vary', 'Origin');
  }
  return new Response(JSON.stringify({
    ok: status === 200,
    code,
    data,
  }), { status, headers });
}

function publicKey(): string {
  try {
    const keys = JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') || '{}');
    if (typeof keys.default === 'string' && keys.default) return keys.default;
  } catch {
    // Older isolated project fallback.
  }
  return Deno.env.get('SUPABASE_ANON_KEY') || '';
}

function secretKey(): string {
  return selectWosV1AdminApiKey(
    Deno.env.get('SUPABASE_SECRET_KEYS'),
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
  );
}

function qaUatAuthorizationId(): string {
  return Deno.env.get('WOS_V1_QA_UAT_AUTHORIZATION_ID') || '';
}

function closerProbeDedicatedJwt(): string | undefined {
  return Deno.env.get('WOS_V1_QA_EDGE_CLOSER_SERVICE_ROLE_KEY');
}

async function withTimeout<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('WOS_V1_IMAGE_VERIFY_TIMEOUT')),
          MAX_EXECUTION_MS,
        );
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

async function readWithDeadline(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  remainingMs: number,
): Promise<ReadableStreamReadResult<Uint8Array>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      reader.read(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('BODY_READ_TIMEOUT')),
          remainingMs,
        );
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

async function readBoundedText(
  request: Request,
  maxBytes: number,
): Promise<string | null> {
  if (!request.body) return '';
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  const deadline = Date.now() + BODY_READ_TIMEOUT_MS;
  let bytesRead = 0;
  let text = '';
  try {
    while (true) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        await reader.cancel();
        return null;
      }
      const read = await readWithDeadline(reader, remaining);
      if (read.done) {
        text += decoder.decode();
        return text;
      }
      bytesRead += read.value.byteLength;
      if (bytesRead > maxBytes) {
        await reader.cancel();
        return null;
      }
      text += decoder.decode(read.value, { stream: true });
    }
  } catch {
    await reader.cancel().catch(() => undefined);
    return null;
  }
}

export type WosV1VerifyImageHandlerOptions = {
  createAdminClient?: typeof createClient;
  createUserClient?: typeof createClient;
};

export async function handleWosV1VerifyImageRequest(
  request: Request,
  options: WosV1VerifyImageHandlerOptions = {},
): Promise<Response> {
  const adminClientFactory = options.createAdminClient ?? createClient;
  const userClientFactory = options.createUserClient ?? createClient;
  const origin = request.headers.get('origin');
  const allowedOrigins = parseAllowedOrigins(
    Deno.env.get('WOS_V1_EDGE_ALLOWED_ORIGINS'),
  );
  if (!approvedBrowserOrigin(origin, allowedOrigins)) {
    return output(null, 'WOS_V1_EDGE_ORIGIN_DENIED', 403);
  }
  if (request.method === 'OPTIONS') {
    if (origin === null) {
      return output(null, 'WOS_V1_EDGE_ORIGIN_REQUIRED', 403);
    }
    const headers = new Headers(baseHeaders);
    headers.delete('Content-Type');
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Headers',
      'authorization, apikey, content-type, x-client-info, x-wos-qa-uat-authorization-id, x-wos-qa-uat-execution-id, x-wos-qa-uat-closer-nonce, x-wos-qa-closer-credential-preflight');
    headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    headers.set('Access-Control-Max-Age', '600');
    headers.set('Vary', 'Origin');
    return new Response(null, { status: 204, headers });
  }
  if (request.method !== 'POST') {
    return output(request, 'METHOD_NOT_ALLOWED', 405);
  }
  const runtimeUrl = Deno.env.get('SUPABASE_URL');
  const allowedRefs = parseAllowedSupabaseRefs(
    Deno.env.get('WOS_SUPABASE_ALLOWED_REFS'),
  );
  if (!approvedSupabaseRuntimeUrl(runtimeUrl, allowedRefs)) {
    return output(request, 'WOS_V1_EDGE_RUNTIME_DENIED', 503);
  }
  const publishable = publicKey();
  const service = secretKey();
  const qaUatRuntime = new URL(runtimeUrl!).hostname ===
    `${QA_UAT_PROJECT_REF}.supabase.co`;
  const qaUatAuthorizationIdValue = qaUatAuthorizationId();
  const qaAuthorizationId =
    request.headers.get('x-wos-qa-uat-authorization-id');
  const qaExecutionId = request.headers.get('x-wos-qa-uat-execution-id');
  const qaCloserNonce =
    request.headers.get('x-wos-qa-uat-closer-nonce');
  const uuidPattern =
    /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
  if (qaUatRuntime && (
    !/^WOS-V1-PRODUCTION-M2-QA-UAT-[0-9]{3}$/.test(
      qaUatAuthorizationIdValue,
    )
    || qaAuthorizationId !== qaUatAuthorizationIdValue
    || !uuidPattern.test(qaExecutionId || '')
    || !uuidPattern.test(qaCloserNonce || '')
  )) {
    return output(request, 'WOS_V1_QA_EDGE_AUTHORIZATION_REQUIRED', 503);
  }
  if (qaUatRuntime
    && request.headers.get('x-wos-qa-closer-probe') === '1') {
    const authDecision = evaluateWosV1QaCloserProbeAuth({
      expectedAuthorizationId: qaUatAuthorizationIdValue,
      authorizationId: qaAuthorizationId,
      executionId: qaExecutionId,
      processNonce: qaCloserNonce,
      authorization: request.headers.get('authorization'),
      adminKey: service,
      dedicatedCloserJwt: closerProbeDedicatedJwt(),
    });
    if (!authDecision.allowed) {
      return output(
        request,
        authDecision.code,
        authDecision.status,
        authDecision.data ?? null,
      );
    }
    try {
      const admin = adminClientFactory(runtimeUrl!, service, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const control = await admin.rpc('wos_v1_qa_uat_edge_probe', {
        p_execution_id: qaExecutionId,
        p_process_nonce: qaCloserNonce,
      });
      const controlData = control.data
        && typeof control.data === 'object'
        && !Array.isArray(control.data)
        ? control.data as Record<string, unknown>
        : null;
      if (request.headers.get(
        'x-wos-qa-closer-credential-preflight',
      ) === '1') {
        if (Boolean(control.error)
          || String(controlData?.executionId || '') !== qaExecutionId
          || String(controlData?.status || '') === 'DENIED') {
          return output(
            request,
            'WOS_V1_QA_EDGE_GATE_UNAVAILABLE',
            503,
          );
        }
        return output(
          request,
          'WOS_V1_QA_EDGE_CREDENTIAL_VERIFIED',
          200,
          {
            gateStatus:
              String(controlData?.status || 'UNAVAILABLE'),
            executionId: qaExecutionId,
          },
        );
      }
      const gateDecision = evaluateWosV1QaCloserProbeGate({
        error: Boolean(control.error),
        executionId: qaExecutionId || '',
        processNonce: qaCloserNonce || '',
        control: controlData,
      });
      if (!gateDecision.allowed) {
        return output(
          request,
          gateDecision.code,
          gateDecision.status,
          gateDecision.data ?? null,
        );
      }
      return output(request, 'WOS_V1_QA_EDGE_OPEN_PROBE', 200, {
        gateStatus: 'OPEN',
        executionId: qaExecutionId,
      });
    } catch {
      return output(request, 'WOS_V1_QA_EDGE_GATE_UNAVAILABLE', 503);
    }
  }
  if (!wosV1EdgeWritesEnabled(
    Deno.env.get('WOS_V1_EDGE_WRITES_ENABLED'),
  )) {
    return output(request, 'WOS_V1_EDGE_WRITES_DISABLED', 503);
  }
  if (!request.headers.get('content-type')?.startsWith('application/json')) {
    return output(request, 'INVALID_INPUT', 400);
  }
  const authorization = request.headers.get('authorization') || '';
  if (!/^Bearer [^\s]+$/.test(authorization)) {
    return output(request, 'UNAUTHENTICATED', 401);
  }
  if (!publishable || !service) {
    return output(request, 'WOS_V1_EDGE_SERVER_CONFIG_INCOMPLETE', 503);
  }
  let body: ReturnType<typeof parseWosV1ImageVerificationBody>;
  try {
    const text = await readBoundedText(request, MAX_REQUEST_BYTES);
    if (text === null) return output(request, 'INVALID_INPUT', 400);
    body = parseWosV1ImageVerificationBody(JSON.parse(text));
  } catch {
    return output(request, 'INVALID_INPUT', 400);
  }
  if (!body) return output(request, 'INVALID_INPUT', 400);

  try {
    return await withTimeout((async () => {
      const token = authorization.substring(7);
      const userDb = userClientFactory(runtimeUrl!, publishable, {
        global: { headers: { Authorization: authorization } },
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const auth = await userDb.auth.getUser(token);
      if (auth.error || !auth.data.user?.id) {
        return output(request, 'UNAUTHENTICATED', 401);
      }
      const profileResult = await userDb.from('profiles')
        .select('id,user_id,org_id,role,is_active')
        .eq('user_id', auth.data.user.id)
        .eq('is_active', true)
        .maybeSingle();
      const profile = profileResult.error
        ? null
        : profileResult.data as WosV1ImageProfile | null;
      const orderResult = await userDb.from('wos_production_orders')
        .select('id,organization_id,created_by_profile_id,sales_owner_profile_id,version,version_label,workflow_status')
        .eq('id', body.orderId)
        .eq('organization_id', profile?.org_id ?? '')
        .maybeSingle();
      const order = orderResult.error
        ? null
        : orderResult.data as WosV1ImageOrder | null;
      const access = evaluateWosV1ImageAccess({
        runtimeAuthorized: true,
        writesEnabled: true,
        qaRevisionAuthorized:
          Deno.env.get('WOS_V1_QA_REVISION_IMAGES_ENABLED') === 'true',
        profile,
        order,
      });
      if (!access.allowed || !profile || !order) {
        return output(
          request,
          access.code,
          access.code === 'ORDER_NOT_FOUND' ? 404 : 403,
        );
      }
      const admin = adminClientFactory(runtimeUrl!, service, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      if (qaUatRuntime) {
        const gate = await admin.rpc('wos_v1_qa_uat_edge_write_allowed', {
          p_authorization_id: qaUatAuthorizationIdValue,
          p_project_ref: QA_UAT_PROJECT_REF,
          p_execution_id: qaExecutionId,
          p_process_nonce: qaCloserNonce,
          p_actor_profile_id: profile.id,
          p_organization_id: profile.org_id,
          p_order_id: order.id,
        });
        if (gate.error || gate.data !== true) {
          return output(request, 'WOS_V1_QA_EDGE_GATE_CLOSED', 503);
        }
      }
      const path = canonicalWosV1ImagePath({
        organizationId: profile.org_id,
        orderId: order.id,
        versionLabel: order.version_label,
        imageId: body.imageId,
        category: body.category,
      });
      if (path !== body.storagePath) {
        return output(request, 'INVALID_IMAGE_PATH', 400);
      }

      const snapshot = async (): Promise<WosV1ObjectSnapshot | null> => {
        const result = await admin.rpc('wos_p7_service_storage_snapshot', {
          p_path: path,
        });
        if (result.error || !result.data
          || typeof result.data !== 'object'
          || Array.isArray(result.data)) return null;
        return result.data as WosV1ObjectSnapshot;
      };
      const first = await snapshot();
      const declaredSize = first ? Number(first.byteSize) : Number.NaN;
      const currentOrderReverification =
        (order.workflow_status === 'WAITING_MATERIAL'
          || order.workflow_status === 'READINESS_CHECK')
        && /^V[2-9][0-9]{0,20}$/.test(order.version_label);
      if (!first
        || !snapshotMatchesUpload(
          first,
          auth.data.user.id,
          declaredSize,
          !currentOrderReverification,
        )) {
        return output(request, 'PRIVATE_OBJECT_NOT_VERIFIED', 409);
      }
      // Canonical path, current-order scope, Gate, and immutable object
      // snapshot checks authorize the byte read. A same-organization reviewer
      // may re-verify an uploader's object; new Proof creation still requires
      // the upstream object owner binding.
      const downloaded = await admin.storage.from('wos-private').download(path);
      if (downloaded.error || !downloaded.data
        || downloaded.data.size !== declaredSize) {
        return output(request, 'PRIVATE_BINARY_UNAVAILABLE', 409);
      }
      const bytes = new Uint8Array(await downloaded.data.arrayBuffer());
      if (bytes.length !== declaredSize) {
        return output(request, 'PRIVATE_BINARY_SIZE_MISMATCH', 409);
      }
      if (!await pngValid(bytes, body.sha256)) {
        return output(request, 'PNG_OR_SHA256_VERIFICATION_FAILED', 422);
      }
      const second = await snapshot();
      if (!second || !objectSnapshotStable(first, second)) {
        return output(request, 'OBJECT_CHANGED_DURING_VERIFICATION', 409);
      }

      const proofRequestId = await deterministicProofRequestId([
        order.id,
        body.imageId,
        body.category,
        auth.data.user.id,
        order.version,
        path,
        first.id,
        first.version ?? '',
        first.updatedAt,
        body.sha256,
      ].join('\n'));
      const renewalArgs = {
        ...(qaUatRuntime ? {
          p_execution_id: qaExecutionId,
          p_process_nonce: qaCloserNonce,
        } : {}),
        p_image_id: body.imageId,
        p_order_id: order.id,
        p_actor_user_id: auth.data.user.id,
        p_storage_path: path,
        p_storage_object_id: first.id,
        p_storage_object_version: first.version,
        p_storage_object_updated_at: first.updatedAt,
        p_sha256: body.sha256,
      };
      let proofData: unknown;
      let renewalStatus: string | null = null;
      const renewal = await admin.rpc(
        qaUatRuntime
          ? 'wos_v1_qa_uat_edge_renew_proof'
          : 'wos_v1_renew_expired_image_proof',
        renewalArgs,
      );
      if (renewal.error
        || !renewal.data
        || typeof renewal.data !== 'object'
        || Array.isArray(renewal.data)
        || !['ABSENT', 'UNCHANGED', 'RENEWED'].includes(
          String((renewal.data as Record<string, unknown>).status),
        )) {
        return output(request, 'WOS_V1_PROOF_RENEWAL_UNAVAILABLE', 503);
      }
      renewalStatus = String(
        (renewal.data as Record<string, unknown>).status,
      );
      proofData = renewalStatus === 'ABSENT' ? null : renewal.data;
      if (proofData === null) {
        const proof = await admin.rpc(
          qaUatRuntime
            ? 'wos_v1_qa_uat_edge_record_proof'
            : 'wos_p7_record_trusted_image_proof',
          renewalArgs,
        );
        if (proof.error) {
          return output(request, 'WOS_V1_PROOF_WRITE_UNAVAILABLE', 503);
        }
        proofData = proof.data;
      }
      if (!isWosV1ProofResult(proofData, {
          imageId: body.imageId,
          category: body.category,
          sha256: body.sha256,
        })) {
        return output(request, 'WOS_V1_PROOF_WRITE_UNAVAILABLE', 503);
      }
      const result = proofData as { status: string };
      const proofStatus = ['VERIFIED', 'REPLAYED'].includes(result.status)
        ? result.status
        : 'REPLAYED';
      return output(request, 'WOS_V1_TRUSTED_IMAGE_PROOF_ISSUED', 200, {
        sha256: body.sha256,
        proofStatus,
        renewalStatus,
      });
    })());
  } catch (error) {
    if (error instanceof Error && error.message === 'WOS_V1_IMAGE_VERIFY_TIMEOUT') {
      return output(request, 'WOS_V1_IMAGE_VERIFY_TIMEOUT', 504);
    }
    return output(request, 'WOS_V1_IMAGE_VERIFY_UNAVAILABLE', 503);
  }
}

if (import.meta.main) {
  Deno.serve(request => handleWosV1VerifyImageRequest(request));
}
