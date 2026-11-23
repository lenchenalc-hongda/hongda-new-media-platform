import { createClient } from 'npm:@supabase/supabase-js@2.58.0';
import { pngValid } from '../_shared/wos-png-integrity.ts';
import {
  approvedSupabaseRuntimeUrl,
  canonicalWosV1ImagePath,
  deterministicProofRequestId,
  evaluateWosV1ImageAccess,
  isWosV1ProofResult,
  objectSnapshotStable,
  parseAllowedSupabaseRefs,
  parseWosV1ImageVerificationBody,
  snapshotMatchesUpload,
  type WosV1ImageOrder,
  type WosV1ImageProfile,
  type WosV1ObjectSnapshot,
} from './core.ts';

const MAX_REQUEST_BYTES = 4096;
const BODY_READ_TIMEOUT_MS = 5000;
const MAX_EXECUTION_MS = 20000;
const headers = {
  'Cache-Control': 'no-store, private',
  'Content-Type': 'application/json; charset=utf-8',
};

function output(
  code: string,
  status: number,
  data: Record<string, unknown> | null = null,
): Response {
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
  try {
    const keys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}');
    if (typeof keys.default === 'string' && keys.default) return keys.default;
  } catch {
    // Older isolated project fallback.
  }
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
}

async function withTimeout<T>(promise: Promise<T>): Promise<T> {
  let timer: number | undefined;
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
  let timer: number | undefined;
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

Deno.serve(async request => {
  if (request.method !== 'POST') return output('METHOD_NOT_ALLOWED', 405);
  const runtimeUrl = Deno.env.get('SUPABASE_URL');
  const allowedRefs = parseAllowedSupabaseRefs(
    Deno.env.get('WOS_SUPABASE_ALLOWED_REFS'),
  );
  if (!approvedSupabaseRuntimeUrl(runtimeUrl, allowedRefs)) {
    return output('WOS_V1_EDGE_RUNTIME_DENIED', 503);
  }
  if (Deno.env.get('WOS_V1_EDGE_WRITES_ENABLED') !== 'true') {
    return output('WOS_V1_EDGE_WRITES_DISABLED', 503);
  }
  if (!request.headers.get('content-type')?.startsWith('application/json')) {
    return output('INVALID_INPUT', 400);
  }
  const authorization = request.headers.get('authorization') || '';
  if (!/^Bearer [^\s]+$/.test(authorization)) {
    return output('UNAUTHENTICATED', 401);
  }
  const publishable = publicKey();
  const service = secretKey();
  if (!publishable || !service) {
    return output('WOS_V1_EDGE_SERVER_CONFIG_INCOMPLETE', 503);
  }
  let body: ReturnType<typeof parseWosV1ImageVerificationBody>;
  try {
    const text = await readBoundedText(request, MAX_REQUEST_BYTES);
    if (text === null) return output('INVALID_INPUT', 400);
    body = parseWosV1ImageVerificationBody(JSON.parse(text));
  } catch {
    return output('INVALID_INPUT', 400);
  }
  if (!body) return output('INVALID_INPUT', 400);

  try {
    return await withTimeout((async () => {
      const token = authorization.substring(7);
      const userDb = createClient(runtimeUrl!, publishable, {
        global: { headers: { Authorization: authorization } },
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const auth = await userDb.auth.getUser(token);
      if (auth.error || !auth.data.user?.id) {
        return output('UNAUTHENTICATED', 401);
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
        profile,
        order,
      });
      if (!access.allowed || !profile || !order) {
        return output(access.code, access.code === 'ORDER_NOT_FOUND' ? 404 : 403);
      }
      const path = canonicalWosV1ImagePath({
        organizationId: profile.org_id,
        orderId: order.id,
        versionLabel: order.version_label,
        imageId: body.imageId,
        category: body.category,
      });
      if (path !== body.storagePath) {
        return output('INVALID_IMAGE_PATH', 400);
      }

      const admin = createClient(runtimeUrl!, service, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
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
      if (!first
        || !snapshotMatchesUpload(first, auth.data.user.id, declaredSize)) {
        return output('PRIVATE_OBJECT_NOT_VERIFIED', 409);
      }
      const downloaded = await userDb.storage.from('wos-private').download(path);
      if (downloaded.error || !downloaded.data
        || downloaded.data.size !== declaredSize) {
        return output('PRIVATE_BINARY_UNAVAILABLE', 409);
      }
      const bytes = new Uint8Array(await downloaded.data.arrayBuffer());
      if (bytes.length !== declaredSize) {
        return output('PRIVATE_BINARY_SIZE_MISMATCH', 409);
      }
      if (!await pngValid(bytes, body.sha256)) {
        return output('PNG_OR_SHA256_VERIFICATION_FAILED', 422);
      }
      const second = await snapshot();
      if (!second || !objectSnapshotStable(first, second)) {
        return output('OBJECT_CHANGED_DURING_VERIFICATION', 409);
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
      const renewal = await admin.rpc('wos_v1_renew_expired_image_proof', {
        p_image_id: body.imageId,
        p_order_id: order.id,
        p_actor_user_id: auth.data.user.id,
        p_storage_path: path,
        p_storage_object_id: first.id,
        p_storage_object_version: first.version,
        p_storage_object_updated_at: first.updatedAt,
        p_sha256: body.sha256,
      });
      if (renewal.error
        || !renewal.data
        || typeof renewal.data !== 'object'
        || Array.isArray(renewal.data)
        || !['ABSENT', 'UNCHANGED', 'RENEWED'].includes(
          String((renewal.data as Record<string, unknown>).status),
        )) {
        return output('WOS_V1_PROOF_RENEWAL_UNAVAILABLE', 503);
      }
      const proof = await admin.rpc('wos_p7_record_trusted_image_proof', {
        p_image_id: body.imageId,
        p_order_id: order.id,
        p_actor_user_id: auth.data.user.id,
        p_storage_path: path,
        p_storage_object_id: first.id,
        p_storage_object_version: first.version,
        p_storage_object_updated_at: first.updatedAt,
        p_sha256: body.sha256,
      });
      if (proof.error
        || !isWosV1ProofResult(proof.data, {
          imageId: body.imageId,
          category: body.category,
          sha256: body.sha256,
        })) {
        return output('WOS_V1_PROOF_WRITE_UNAVAILABLE', 503);
      }
      const result = proof.data as { status: string };
      return output('WOS_V1_TRUSTED_IMAGE_PROOF_ISSUED', 200, {
        sha256: body.sha256,
        proofStatus: result.status,
      });
    })());
  } catch (error) {
    if (error instanceof Error && error.message === 'WOS_V1_IMAGE_VERIFY_TIMEOUT') {
      return output('WOS_V1_IMAGE_VERIFY_TIMEOUT', 504);
    }
    return output('WOS_V1_IMAGE_VERIFY_UNAVAILABLE', 503);
  }
});
