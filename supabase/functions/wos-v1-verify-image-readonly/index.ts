import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.58.0';
import {
  evaluateReadOnlyRequestGuard,
  evaluateWosV1ReadOnlyAccess,
  orderSnapshotStable,
  parseWosV1ReadOnlyVerificationBody,
  readOnlyOriginAllowed,
  safeReadOnlyVerification,
  verifyWosV1ReadOnlyImage,
  type WosV1ReadOnlyOrder,
  type WosV1ReadOnlyProfile,
  type WosV1ReadOnlyProof,
} from './core.ts';
import {
  approvedSupabaseRuntimeUrl,
  canonicalWosV1ImagePath,
  parseAllowedOrigins,
  parseAllowedSupabaseRefs,
  type WosV1ObjectSnapshot,
} from '../wos-v1-verify-image/core.ts';

const QA_REF = 'xulmpqaknlwqqculbsek';
const MAX_REQUEST_BYTES = 8192;
const BODY_READ_TIMEOUT_MS = 5000;
const MAX_EXECUTION_MS = 30000;
const baseHeaders = {
  'Cache-Control': 'no-store, private',
  'Content-Type': 'application/json; charset=utf-8',
};
type AdminClient = SupabaseClient<any, 'public', any>;

function output(
  code: string,
  status: number,
  data: Record<string, unknown> | null = null,
  origin: string | null = null,
): Response {
  const headers = new Headers(baseHeaders);
  if (origin) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Headers',
      'authorization, apikey, content-type, x-client-info');
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
  try {
    const keys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}');
    if (typeof keys.default === 'string' && keys.default) return keys.default;
  } catch {
    // Older isolated project fallback.
  }
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
}

function qaRuntimeBound(): boolean {
  const refs = parseAllowedSupabaseRefs(
    Deno.env.get('WOS_SUPABASE_ALLOWED_REFS'),
  );
  return refs.length === 1
    && refs[0] === QA_REF
    && approvedSupabaseRuntimeUrl(Deno.env.get('SUPABASE_URL'), refs);
}

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function readProof(value: unknown): WosV1ReadOnlyProof | null {
  const row = object(value);
  if (!row
    || typeof row.image_id !== 'string'
    || typeof row.organization_id !== 'string'
    || typeof row.order_id !== 'string'
    || typeof row.actor_user_id !== 'string'
    || typeof row.storage_bucket !== 'string'
    || typeof row.storage_path !== 'string'
    || typeof row.storage_object_id !== 'string'
    || (row.storage_object_version !== null
      && typeof row.storage_object_version !== 'string')
    || typeof row.storage_object_updated_at !== 'string'
    || typeof row.verified_sha256 !== 'string'
    || typeof row.verified_at !== 'string'
    || typeof row.expires_at !== 'string') return null;
  return row as unknown as WosV1ReadOnlyProof;
}

async function proofFor(
  admin: AdminClient,
  imageId: string,
  order: WosV1ReadOnlyOrder,
): Promise<WosV1ReadOnlyProof | null> {
  const result = await admin.from('wos_qa_verified_image_proofs')
    .select([
      'image_id',
      'organization_id',
      'order_id',
      'actor_user_id',
      'storage_bucket',
      'storage_path',
      'storage_object_id',
      'storage_object_version',
      'storage_object_updated_at',
      'verified_sha256',
      'verified_at',
      'expires_at',
    ].join(','))
    .eq('image_id', imageId)
    .eq('order_id', order.id)
    .eq('organization_id', order.organization_id)
    .limit(2);
  if (result.error || !Array.isArray(result.data) || result.data.length !== 1) {
    return null;
  }
  return readProof(result.data[0]);
}

async function snapshotFor(
  admin: AdminClient,
  path: string,
): Promise<WosV1ObjectSnapshot | null> {
  const result = await admin.rpc('wos_p7_service_storage_snapshot', {
    p_path: path,
  });
  const row = object(result.data);
  if (result.error || !row
    || typeof row.id !== 'string'
    || typeof row.ownerId !== 'string'
    || (row.version !== null && typeof row.version !== 'string')
    || typeof row.updatedAt !== 'string'
    || typeof row.mimeType !== 'string'
    || typeof row.byteSize !== 'string') return null;
  return row as unknown as WosV1ObjectSnapshot;
}

async function withTimeout<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('WOS_V1_READONLY_VERIFY_TIMEOUT')),
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

async function readBoundedText(request: Request): Promise<string | null> {
  if (!request.body) return '';
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  const deadline = Date.now() + BODY_READ_TIMEOUT_MS;
  let total = 0;
  let text = '';
  try {
    while (true) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        await reader.cancel();
        return null;
      }
      const read = await readWithDeadline(reader, remaining);
      if (read.done) return text + decoder.decode();
      total += read.value.byteLength;
      if (total > MAX_REQUEST_BYTES) {
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
  const origin = request.headers.get('origin');
  const allowedOrigins = parseAllowedOrigins(
    Deno.env.get('WOS_V1_EDGE_ALLOWED_ORIGINS'),
  );
  if (!readOnlyOriginAllowed(origin, allowedOrigins)) {
    return output('WOS_V1_READONLY_ORIGIN_DENIED', 403);
  }
  const approvedOrigin = origin as string;
  if (request.method === 'OPTIONS') {
    const headers = new Headers(baseHeaders);
    headers.delete('Content-Type');
    headers.set('Access-Control-Allow-Origin', approvedOrigin);
    headers.set('Access-Control-Allow-Headers',
      'authorization, apikey, content-type, x-client-info');
    headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    headers.set('Access-Control-Max-Age', '600');
    headers.set('Vary', 'Origin');
    return new Response(null, { status: 204, headers });
  }
  if (request.method !== 'POST') {
    return output('METHOD_NOT_ALLOWED', 405, null, origin);
  }
  const requestGuard = evaluateReadOnlyRequestGuard({
    origin,
    allowedOrigins,
    readOnlyEnabled:
      Deno.env.get('WOS_V1_EDGE_READONLY_VERIFY_ENABLED') === 'true',
    qaRuntimeBound: qaRuntimeBound(),
    contentType: request.headers.get('content-type'),
    authorization: request.headers.get('authorization'),
  });
  if (!requestGuard.allowed) {
    return output(requestGuard.code, requestGuard.status, null, origin);
  }
  const authorization = request.headers.get('authorization') || '';
  const publishable = publicKey();
  const service = secretKey();
  if (!publishable || !service) {
    return output('WOS_V1_READONLY_SERVER_CONFIG_INCOMPLETE', 503, null, origin);
  }
  let body: ReturnType<typeof parseWosV1ReadOnlyVerificationBody>;
  try {
    const text = await readBoundedText(request);
    if (text === null) return output('INVALID_INPUT', 400, null, origin);
    body = parseWosV1ReadOnlyVerificationBody(JSON.parse(text));
  } catch {
    return output('INVALID_INPUT', 400, null, origin);
  }
  if (!body) return output('INVALID_INPUT', 400, null, origin);

  try {
    return await withTimeout((async () => {
      const runtimeUrl = Deno.env.get('SUPABASE_URL')!;
      const token = authorization.substring(7);
      const userDb = createClient(runtimeUrl, publishable, {
        global: { headers: { Authorization: authorization } },
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const auth = await userDb.auth.getUser(token);
      if (auth.error || !auth.data.user?.id) {
        return output('UNAUTHENTICATED', 401, null, origin);
      }
      const profileResult = await userDb.from('profiles')
        .select('id,user_id,org_id,role,is_active')
        .eq('user_id', auth.data.user.id)
        .eq('is_active', true)
        .maybeSingle();
      const profile = profileResult.error
        ? null
        : profileResult.data as WosV1ReadOnlyProfile | null;
      const orderResult = await userDb.from('wos_production_orders')
        .select('id,organization_id,version,version_label,workflow_status')
        .eq('id', body.orderId)
        .eq('organization_id', profile?.org_id ?? '')
        .maybeSingle();
      const order = orderResult.error
        ? null
        : orderResult.data as WosV1ReadOnlyOrder | null;
      const access = evaluateWosV1ReadOnlyAccess({
        readOnlyEnabled: true,
        qaRuntimeBound: true,
        profile,
        order,
        expectedVersion: body.expectedVersion,
        expectedVersionLabel: body.expectedVersionLabel,
      });
      if (!access.allowed || !order) {
        return output(access.code, access.code === 'ORDER_VERSION_MISMATCH' ? 409 : 403,
          null, origin);
      }

      const admin = createClient(runtimeUrl, service, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      // This branch validates bytes and metadata only. It never writes a Proof,
      // Receipt or history row and never changes M4 review/start readiness.
      for (const image of body.images) {
        const canonicalPath = canonicalWosV1ImagePath({
          organizationId: order.organization_id,
          orderId: order.id,
          versionLabel: order.version_label,
          imageId: image.imageId,
          category: image.category,
        });
        if (canonicalPath !== image.storagePath) {
          return output('INVALID_IMAGE_PATH', 400, null, origin);
        }
        const firstCheckedAt = new Date().toISOString();
        const firstProof = await proofFor(admin, image.imageId, order);
        const firstSnapshot = await snapshotFor(admin, canonicalPath);
        if (!firstProof || !firstSnapshot) {
          return output('PROOF_METADATA_MISMATCH', 409, null, origin);
        }
        const downloaded = await userDb.storage.from('wos-private')
          .download(canonicalPath);
        if (downloaded.error || !downloaded.data) {
          return output('PRIVATE_BINARY_UNAVAILABLE', 409, null, origin);
        }
        const bytes = new Uint8Array(await downloaded.data.arrayBuffer());
        const secondProof = await proofFor(admin, image.imageId, order);
        const secondSnapshot = await snapshotFor(admin, canonicalPath);
        const secondCheckedAt = new Date().toISOString();
        if (!secondProof || !secondSnapshot) {
          return output('PROOF_METADATA_MISMATCH', 409, null, origin);
        }
        const verified = await verifyWosV1ReadOnlyImage({
          image,
          order,
          firstProof,
          secondProof,
          firstSnapshot,
          secondSnapshot,
          bytes,
          firstCheckedAt,
          secondCheckedAt,
        });
        if (!verified.ok) return output(verified.code, 409, null, origin);
      }
      const currentOrderResult = await userDb.from('wos_production_orders')
        .select('id,organization_id,version,version_label,workflow_status')
        .eq('id', order.id)
        .eq('organization_id', order.organization_id)
        .maybeSingle();
      const currentOrder = currentOrderResult.error
        ? null
        : currentOrderResult.data as WosV1ReadOnlyOrder | null;
      if (!currentOrder || !orderSnapshotStable(order, currentOrder)) {
        return output('ORDER_CHANGED_DURING_VERIFICATION', 409, null, origin);
      }
      return output(
        'WOS_V1_READONLY_IMAGE_PROOF_VERIFIED',
        200,
        safeReadOnlyVerification({
          order,
          categories: body.images.map(image => image.category),
        }),
        origin,
      );
    })());
  } catch (error) {
    if (error instanceof Error
      && error.message === 'WOS_V1_READONLY_VERIFY_TIMEOUT') {
      return output('WOS_V1_READONLY_VERIFY_TIMEOUT', 504, null, origin);
    }
    return output('WOS_V1_READONLY_VERIFY_UNAVAILABLE', 503, null, origin);
  }
});
