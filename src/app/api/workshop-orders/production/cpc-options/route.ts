import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveVerifiedSupabaseIdentity } from '@/lib/auth/supabase-identity';
import {
  buildWosCpcOptions, isWosCpcReadCandidateEnabled, parseWosCpcPairRequest,
  resolveWosCpcActor, verifyWosCpcPair,
} from '@/lib/workshop-orders/prod-cpc-eligibility';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store, max-age=0', Vary: 'Cookie' };
function response(status: number, code: string, data: unknown = null) {
  return NextResponse.json({ ok: status === 200, code, data }, { status, headers });
}
function allowedCandidate() {
  return isWosCpcReadCandidateEnabled({
    vercelEnv: process.env.VERCEL_ENV,
    nodeEnv: process.env.NODE_ENV,
    enabled: process.env.WOS_PROD_CPC_READ_CANDIDATE_ENABLED,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  });
}
async function currentActor() {
  const client = await createClient();
  if (!client) return { ok: false, result: response(503, 'QA_DATABASE_UNAVAILABLE') } as const;
  const identity = await resolveVerifiedSupabaseIdentity(client);
  if (!identity) return { ok: false, result: response(401, 'UNAUTHENTICATED') } as const;
  const profile = await client.from('profiles')
    .select('id,user_id,org_id,role,is_active').eq('user_id', identity.id)
    .eq('is_active', true).maybeSingle();
  if (profile.error || !profile.data) {
    return { ok: false, result: response(403, 'FORBIDDEN') } as const;
  }
  const actor = resolveWosCpcActor(identity.id, profile.data);
  if (!actor.ok) {
    return { ok: false, result: response(actor.code === 'UNAUTHENTICATED' ? 401 : 403, actor.code) } as const;
  }
  return { ok: true, client, actor: actor.actor } as const;
}

// Lists only source-CPC-RLS-readable customers and projects. No WOS DB write.
export async function GET() {
  if (!allowedCandidate()) return response(503, 'PRODUCTION_CPC_CANDIDATE_DISABLED');
  const auth = await currentActor();
  if (!auth.ok) return auth.result;
  try {
    const [customers, projects] = await Promise.all([
      auth.client.from('cpc_customer_references')
        .select('id,org_id,display_name_snapshot,status')
        .eq('org_id', auth.actor.orgId).eq('status', 'active')
        .order('display_name_snapshot', { ascending: true }).limit(201),
      auth.client.from('cpc_projects')
        .select('id,org_id,customer_reference_id,title,owner_profile_id,status,archived_at')
        .eq('org_id', auth.actor.orgId).eq('status', 'active')
        .is('archived_at', null).order('title', { ascending: true }).limit(201),
    ]);
    if (customers.error || projects.error) return response(503, 'CPC_READ_UNAVAILABLE');
    const options = buildWosCpcOptions({
      actor: auth.actor,
      customers: customers.data ?? [],
      projects: projects.data ?? [],
    });
    if (!options.ok) {
      return response(options.code === 'CPC_OPTION_LIMIT_EXCEEDED' ? 409 : 503, options.code);
    }
    return response(200, 'CPC_OPTIONS_RLS_VERIFIED', options);
  } catch {
    return response(503, 'CPC_READ_UNAVAILABLE');
  }
}

// POST validates a caller-selected pair; deliberately does not create a draft.
// The subsequent draft RPC must repeat this authorization *inside its own transaction*.
export async function POST(req: NextRequest) {
  if (!allowedCandidate()) return response(503, 'PRODUCTION_CPC_CANDIDATE_DISABLED');
  if (!req.headers.get('content-type')?.toLowerCase().startsWith('application/json')
    || Number(req.headers.get('content-length') || '0') > 1024) {
    return response(400, 'INVALID_INPUT');
  }
  const auth = await currentActor();
  if (!auth.ok) return auth.result;
  let pair: ReturnType<typeof parseWosCpcPairRequest>;
  try {
    const raw = await req.text();
    if (raw.length > 1024) return response(400, 'INVALID_INPUT');
    pair = parseWosCpcPairRequest(JSON.parse(raw));
  } catch {
    return response(400, 'INVALID_INPUT');
  }
  if (!pair) return response(400, 'INVALID_INPUT');
  try {
    const [customer, project, customerPermission, projectPermission] = await Promise.all([
      auth.client.from('cpc_customer_references')
        .select('id,org_id,display_name_snapshot,status')
        .eq('id', pair.customerId).eq('org_id', auth.actor.orgId)
        .eq('status', 'active').maybeSingle(),
      auth.client.from('cpc_projects')
        .select('id,org_id,customer_reference_id,title,owner_profile_id,status,archived_at')
        .eq('id', pair.projectId).eq('org_id', auth.actor.orgId)
        .eq('status', 'active').is('archived_at', null).maybeSingle(),
      auth.client.rpc('cpc_can_read_customer_reference', {
        p_customer_reference_id: pair.customerId, p_org_id: auth.actor.orgId,
      }),
      auth.client.rpc('cpc_can_read_project', {
        p_project_id: pair.projectId, p_org_id: auth.actor.orgId,
      }),
    ]);
    if (customer.error || project.error || customerPermission.error || projectPermission.error) {
      return response(503, 'CPC_AUTHORIZATION_CHECK_UNAVAILABLE');
    }
    const result = verifyWosCpcPair({
      actor: auth.actor,
      customer: customer.data,
      project: project.data,
      canReadCustomer: customerPermission.data === true,
      canReadProject: projectPermission.data === true,
    });
    if (!result.ok) return response(403, result.code);
    return response(200, 'CPC_PAIR_READ_VERIFIED_NO_WRITE', {
      ...result, draftWritable: false,
      // A future draft RPC must re-check owner is active and the pairing is unchanged.
      ownerActiveNotYetVerified: true,
    });
  } catch {
    return response(503, 'CPC_READ_UNAVAILABLE');
  }
}
