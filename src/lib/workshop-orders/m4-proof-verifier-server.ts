import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { resolveVerifiedSupabaseIdentity } from '@/lib/auth/supabase-identity';
import { createClient } from '@/lib/supabase/server';
import {
  isWosQaM4ProofReadonlyEnabled,
  resolveWosApiActor,
} from './api-contract';
import {
  WOS_M4_PROOF_READ_ROLES,
  WosM4ProofVerifierFailure,
  executeWosM4ProofVerifier,
  mapWosM4ProofDatabaseError,
  parseWosM4ProofVerifierRequest,
  type WosM4ProofReadRole,
  type WosM4ProofVerifierActor,
  type WosM4ProofVerifierOrder,
} from './m4-proof-verifier';

const headers = { 'Cache-Control': 'no-store, private' } as const;
const PROOF_VERIFIER_TIMEOUT_MS = 15_000;

function response(code: string, status: number, data: unknown = null) {
  return NextResponse.json(
    { ok: status === 200, code, data },
    { status, headers },
  );
}

function verifierEnabled(): boolean {
  return process.env.NEXT_PUBLIC_FEATURE_WORKSHOP_ORDERS === 'true'
    && isWosQaM4ProofReadonlyEnabled({
      vercelEnv: process.env.VERCEL_ENV,
      authMode: process.env.AUTH_MODE,
      enabled: process.env.WOS_QA_M4_PROOF_READONLY_ENABLED,
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    });
}

function rpcFailure(message: string): WosM4ProofVerifierFailure {
  return mapWosM4ProofDatabaseError(message);
}

function throwIfAborted(controller: AbortController): void {
  if (controller.signal.aborted) {
    throw new WosM4ProofVerifierFailure('PROOF_VERIFIER_TIMEOUT', 504);
  }
}

async function withDeadline<T>(
  task: Promise<T>,
  controller: AbortController,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      task,
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new WosM4ProofVerifierFailure('PROOF_VERIFIER_TIMEOUT', 504));
        }, PROOF_VERIFIER_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function readWosM4ProofVerifier(request: NextRequest) {
  if (!verifierEnabled()) return response('QA_PROOF_VERIFIER_DISABLED', 503);
  const parsed = parseWosM4ProofVerifierRequest(request.url);
  if (!parsed.ok) return response(parsed.code, 400);

  const client = await createClient();
  if (!client) return response('DATABASE_UNAVAILABLE', 503);

  const controller = new AbortController();
  try {
    return await withDeadline((async () => {
      const identity = await resolveVerifiedSupabaseIdentity(client);
      throwIfAborted(controller);
      if (!identity) return response('UNAUTHENTICATED', 401);

      const profileResult = await client.from('profiles')
        .select('id,user_id,org_id,role,is_active')
        .eq('user_id', identity.id)
        .eq('is_active', true)
        .abortSignal(controller.signal)
        .maybeSingle();
      throwIfAborted(controller);
      if (profileResult.error || !profileResult.data
        || !(WOS_M4_PROOF_READ_ROLES as readonly string[]).includes(profileResult.data.role)) {
        return response('FORBIDDEN', 403);
      }
      const actorResult = resolveWosApiActor(identity.id, profileResult.data);
      if (!actorResult.ok) return response(actorResult.code, actorResult.status);
      const actor: WosM4ProofVerifierActor = {
        userId: actorResult.actor.userId,
        profileId: actorResult.actor.id,
        organizationId: actorResult.actor.orgId,
        role: actorResult.actor.role as WosM4ProofReadRole,
      };

      const orderResult = await client.from('wos_production_orders')
        .select('id,organization_id,order_number,version,version_label,workflow_status')
        .eq('organization_id', actor.organizationId)
        .eq('id', parsed.orderId)
        .abortSignal(controller.signal)
        .maybeSingle();
      throwIfAborted(controller);
      if (orderResult.error) return response('DATABASE_READ_UNAVAILABLE', 503);
      if (!orderResult.data) return response('ORDER_NOT_AVAILABLE', 404);
      const order: WosM4ProofVerifierOrder = {
        id: orderResult.data.id,
        organizationId: orderResult.data.organization_id,
        orderNumber: orderResult.data.order_number,
        version: orderResult.data.version,
        versionLabel: orderResult.data.version_label,
        workflowStatus: orderResult.data.workflow_status,
      };

      return await executeWosM4ProofVerifier({
        actor,
        orderId: parsed.orderId,
        order,
        signal: controller.signal,
        dependencies: {
          async readSnapshot(orderId, expectedVersion, versionLabel) {
            const snapshot = await client.rpc('wos_qa_m4_readonly_proof_snapshot', {
              p_order_id: orderId,
              p_expected_version: expectedVersion,
              p_version_label: versionLabel,
            }).abortSignal(controller.signal);
            throwIfAborted(controller);
            if (snapshot.error) throw rpcFailure(snapshot.error.message);
            return snapshot.data;
          },
          async readReferenceImages(orderId, imageIds) {
            const rows = await client.from('wos_reference_images')
              .select('id,organization_id,entity_type,entity_id,category,version_label,image_status,superseded_at,storage_bucket,storage_path')
              .eq('organization_id', actor.organizationId)
              .eq('entity_type', 'PRODUCTION_ORDER')
              .eq('entity_id', orderId)
              .in('id', imageIds)
              .limit(5)
              .abortSignal(controller.signal);
            throwIfAborted(controller);
            if (rows.error || !Array.isArray(rows.data)) {
              throw new WosM4ProofVerifierFailure('DATABASE_READ_UNAVAILABLE', 503);
            }
            return rows.data.map(row => ({
              id: row.id,
              organizationId: row.organization_id,
              entityType: row.entity_type,
              entityId: row.entity_id,
              category: row.category,
              versionLabel: row.version_label,
              imageStatus: row.image_status,
              supersededAt: row.superseded_at,
              storageBucket: row.storage_bucket,
              storagePath: row.storage_path,
            }));
          },
          async readObjectInfo(bucket, path) {
            throwIfAborted(controller);
            const information = await client.storage.from(bucket).info(path);
            throwIfAborted(controller);
            if (information.error || !information.data) {
              throw new WosM4ProofVerifierFailure(
                'PROOF_OBJECT_UNAVAILABLE',
                409,
              );
            }
            return information.data;
          },
          async downloadObject(bucket, path) {
            throwIfAborted(controller);
            const downloaded = await client.storage.from(bucket).download(path);
            throwIfAborted(controller);
            if (downloaded.error || !downloaded.data
              || downloaded.data.size < 1
              || downloaded.data.size > 20 * 1024 * 1024) {
              throw new WosM4ProofVerifierFailure('PROOF_OBJECT_UNAVAILABLE', 409);
            }
            return new Uint8Array(await downloaded.data.arrayBuffer());
          },
        },
      }).then(result => response('QA_PROOF_VERIFIED', 200, result));
    })(), controller);
  } catch (error) {
    if (controller.signal.aborted) return response('PROOF_VERIFIER_TIMEOUT', 504);
    if (error instanceof WosM4ProofVerifierFailure) {
      return response(error.code, error.status);
    }
    return response('PROOF_VERIFIER_UNAVAILABLE', 503);
  }
}
