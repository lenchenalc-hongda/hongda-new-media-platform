import type { SupabaseClient } from '@supabase/supabase-js';
import {
  canonicalWosV1ImagePath,
  WOS_V1_PRODUCTION_M2_QA_UAT_AUTHORIZATION_ID,
  WOS_V1_IMAGE_CATEGORIES,
  type WosV1AppRequest,
  type WosV1AppOperation,
} from './production-app-contract';

const WOS_V1_HTTP_PATH = process.env.NEXT_PUBLIC_WOS_V1_QA_PREVIEW === 'true'
  ? '/api/workshop-orders/v1-qa'
  : '/api/workshop-orders/v1';

export interface WosV1HttpResult {
  readonly status: number;
  readonly ok: boolean;
  readonly code: string;
  readonly data: unknown;
}

export async function fetchWosV1(
  options: {
    readonly method: 'GET' | 'POST';
    readonly query?: string;
    readonly body?: WosV1AppRequest;
    readonly signal?: AbortSignal;
  },
): Promise<WosV1HttpResult> {
  const response = await fetch(WOS_V1_HTTP_PATH + (options.query ?? ''), {
    method: options.method,
    credentials: 'same-origin',
    cache: 'no-store',
    signal: options.signal,
    headers: options.method === 'POST'
      ? {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'x-wos-v1-action': '1',
        }
      : { Accept: 'application/json' },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  let value: unknown = null;
  try {
    value = await response.json();
  } catch {
    return {
      status: response.status,
      ok: false,
      code: 'INVALID_JSON_RESPONSE',
      data: null,
    };
  }
  const row = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
  return {
    status: response.status,
    ok: response.ok && row?.ok === true,
    code: typeof row?.code === 'string' ? row.code : 'UNKNOWN_RESPONSE',
    data: row?.data ?? null,
  };
}

export function isWosV1VerifiedOperation(
  result: WosV1HttpResult,
  operation: WosV1AppOperation,
): boolean {
  const data = result.data && typeof result.data === 'object'
    ? result.data as Record<string, unknown>
    : null;
  return result.status === 200
    && result.ok
    && result.code === operation + '_VERIFIED'
    && data?.operation === operation
    && data.canStart === false;
}

export async function sha256File(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map(value => value.toString(16).padStart(2, '0'))
    .join('');
}

export async function uploadAndVerifyWosV1Image(input: {
  readonly client: SupabaseClient;
  readonly organizationId: string;
  readonly orderId: string;
  readonly versionLabel: string;
  readonly imageId: string;
  readonly category: (typeof WOS_V1_IMAGE_CATEGORIES)[number];
  readonly file: File;
}): Promise<
  | {
      readonly ok: true;
      readonly imageId: string;
      readonly sha256: string;
      readonly proofStatus: string;
    }
  | { readonly ok: false; readonly code: string }
> {
  if (input.file.type !== 'image/png'
    || input.file.size < 60
    || input.file.size > 20 * 1024 * 1024) {
    return { ok: false, code: 'PNG_ONLY_60_BYTES_TO_20MB' };
  }
  const canonicalPath = canonicalWosV1ImagePath({
    organizationId: input.organizationId,
    orderId: input.orderId,
    versionLabel: input.versionLabel,
    imageId: input.imageId,
    category: input.category,
    fileName: 'source.png',
  });
  const sha256 = await sha256File(input.file);
  const storage = input.client.storage.from('wos-private');
  const upload = await storage.upload(canonicalPath, input.file, {
    contentType: 'image/png',
    upsert: false,
  });
  if (upload.error) {
    const folder = canonicalPath.slice(0, canonicalPath.lastIndexOf('/'));
    const existing = await storage.list(folder, {
      limit: 2,
      search: 'source.png',
    });
    if (existing.error
      || !existing.data?.some(file =>
        file.name === 'source.png'
        && typeof file.metadata?.size === 'number'
        && file.metadata.size === input.file.size)) {
      return { ok: false, code: 'PRIVATE_UPLOAD_FAILED' };
    }
  }
  const invoked = await input.client.functions.invoke('wos-v1-verify-image', {
    headers: process.env.NEXT_PUBLIC_WOS_V1_QA_PREVIEW === 'true'
      ? {
          'x-wos-qa-uat-authorization-id':
            WOS_V1_PRODUCTION_M2_QA_UAT_AUTHORIZATION_ID,
          'x-wos-qa-uat-execution-id':
            process.env.NEXT_PUBLIC_WOS_V1_QA_UAT_EXECUTION_ID || '',
          'x-wos-qa-uat-closer-nonce':
            process.env.NEXT_PUBLIC_WOS_V1_QA_UAT_CLOSER_NONCE || '',
        }
      : {},
    body: {
      orderId: input.orderId,
      imageId: input.imageId,
      category: input.category,
      storagePath: canonicalPath,
      sha256,
    },
  });
  const edge = invoked.data && typeof invoked.data === 'object'
    ? invoked.data as Record<string, unknown>
    : null;
  const proof = edge?.data && typeof edge.data === 'object'
    ? edge.data as Record<string, unknown>
    : null;
  if (invoked.error
    || edge?.ok !== true
    || edge.code !== 'WOS_V1_TRUSTED_IMAGE_PROOF_ISSUED'
    || proof?.sha256 !== sha256
    || !['VERIFIED', 'REPLAYED'].includes(String(proof.proofStatus))) {
    return {
      ok: false,
      code: typeof edge?.code === 'string'
        ? edge.code
        : 'TRUSTED_IMAGE_VERIFIER_UNAVAILABLE',
    };
  }
  const registered = await fetchWosV1({
    method: 'POST',
    body: {
      operation: 'REGISTER_IMAGE',
      orderId: input.orderId,
      imageId: input.imageId,
      category: input.category,
      storagePath: canonicalPath,
    },
  });
  if (!isWosV1VerifiedOperation(registered, 'REGISTER_IMAGE')) {
    return { ok: false, code: registered.code };
  }
  return {
    ok: true,
    imageId: input.imageId,
    sha256,
    proofStatus: String(proof.proofStatus),
  };
}

export async function renewWosV1CurrentImageProofs(input: {
  readonly client: SupabaseClient;
  readonly orderId: string;
  readonly versionLabel: string;
}): Promise<
  | { readonly ok: true; readonly verifiedCount: number }
  | { readonly ok: false; readonly code: string }
> {
  const images = await input.client.from('wos_reference_images')
    .select('id,category,storage_bucket,storage_path,image_status,version_label')
    .eq('entity_type', 'PRODUCTION_ORDER')
    .eq('entity_id', input.orderId)
    .eq('image_status', 'READY')
    .eq('version_label', input.versionLabel)
    .is('superseded_at', null);
  if (images.error || !Array.isArray(images.data)) {
    return { ok: false, code: 'CURRENT_IMAGES_UNAVAILABLE' };
  }
  if (images.data.length !== WOS_V1_IMAGE_CATEGORIES.length) {
    return { ok: false, code: 'CURRENT_FOUR_IMAGE_SET_INCOMPLETE' };
  }

  const byCategory = new Map<string, Record<string, unknown>>();
  for (const value of images.data) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    const row = value as Record<string, unknown>;
    if (typeof row.category === 'string') byCategory.set(row.category, row);
  }
  if (byCategory.size !== WOS_V1_IMAGE_CATEGORIES.length) {
    return { ok: false, code: 'CURRENT_FOUR_IMAGE_SET_INCOMPLETE' };
  }

  for (const category of WOS_V1_IMAGE_CATEGORIES) {
    const row = byCategory.get(category);
    if (!row
      || typeof row.id !== 'string'
      || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i
        .test(row.id)
      || row.image_status !== 'READY'
      || row.version_label !== input.versionLabel
      || row.storage_bucket !== 'wos-private'
      || typeof row.storage_path !== 'string'
      || row.storage_path.length === 0
      || row.storage_path.length > 600
      || row.storage_path.includes('..')) {
      return { ok: false, code: 'CURRENT_IMAGE_IDENTITY_INVALID' };
    }
    const invoked = await input.client.functions.invoke(
      'wos-v1-verify-image',
      {
        headers: process.env.NEXT_PUBLIC_WOS_V1_QA_PREVIEW === 'true'
          ? {
              'x-wos-qa-uat-authorization-id':
                WOS_V1_PRODUCTION_M2_QA_UAT_AUTHORIZATION_ID,
              'x-wos-qa-uat-execution-id':
                process.env.NEXT_PUBLIC_WOS_V1_QA_UAT_EXECUTION_ID || '',
              'x-wos-qa-uat-closer-nonce':
                process.env.NEXT_PUBLIC_WOS_V1_QA_UAT_CLOSER_NONCE || '',
            }
          : {},
        body: {
          orderId: input.orderId,
          imageId: row.id,
          category,
          reverifyExistingProof: true,
        },
      },
    );
    const edge = invoked.data && typeof invoked.data === 'object'
      ? invoked.data as Record<string, unknown>
      : null;
    const proof = edge?.data && typeof edge.data === 'object'
      ? edge.data as Record<string, unknown>
      : null;
    if (invoked.error
      || edge?.ok !== true
      || edge.code !== 'WOS_V1_TRUSTED_IMAGE_PROOF_ISSUED'
      || typeof proof?.sha256 !== 'string'
      || !/^[a-f0-9]{64}$/.test(proof.sha256)
      || proof.reverifiedExistingProof !== true
      || !['VERIFIED', 'REPLAYED'].includes(String(proof.proofStatus))) {
      return {
        ok: false,
        code: typeof edge?.code === 'string'
          ? edge.code
          : 'TRUSTED_IMAGE_REVERIFICATION_UNAVAILABLE',
      };
    }
  }
  return { ok: true, verifiedCount: WOS_V1_IMAGE_CATEGORIES.length };
}
