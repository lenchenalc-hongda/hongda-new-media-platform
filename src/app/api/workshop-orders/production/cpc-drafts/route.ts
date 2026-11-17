import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { resolveVerifiedSupabaseIdentity } from '@/lib/auth/supabase-identity';
import { isApprovedWosSandboxUrl, isWosNonproductionApiEnabled } from '@/lib/workshop-orders/api-contract';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store, private' };
const uuid = z.string().uuid();
const priority = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
const draftSchema = z.object({
  customerId: uuid,
  projectId: uuid,
  orderNumber: z.string().regex(/^QA-CPC-NONPROD-[0-9a-f-]{36}$/i),
  productName: z.string().trim().min(1).max(200),
  productMaterial: z.string().trim().min(1).max(200),
  requestedQuantity: z.number().int().positive(),
  currentBatchQuantity: z.number().int().positive(),
  priority,
  versionLabel: z.string().regex(/^V[1-9][0-9]{0,20}$/),
  plannedShipDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  surfaceTreatment: z.string().max(1000).nullable(),
  patternScope: z.enum(['FULL', 'PARTIAL', 'MIXED']).nullable(),
  seamTolerance: z.string().max(1000).nullable(),
  positionReference: z.string().max(1000).nullable(),
  customerAcceptanceStandard: z.string().max(2000).nullable(),
  packagingMethod: z.string().max(1000).nullable(),
  cartonQuantity: z.number().int().positive().nullable(),
  labelMarkingRule: z.string().max(2000).nullable(),
  isUrgent: z.boolean(),
  splitDelivery: z.boolean(),
}).strict().refine(v => v.currentBatchQuantity <= v.requestedQuantity,
  { message: 'QUANTITY_INVALID' });

function answer(status: number, code: string, data: unknown = null) {
  return NextResponse.json({ ok: status === 200, code, data }, { status, headers });
}

function isolated(): boolean {
  return isWosNonproductionApiEnabled({
    vercelEnv: process.env.VERCEL_ENV,
    nodeEnv: process.env.NODE_ENV,
    enabled: process.env.WOS_P5C_NONPROD_API_ENABLED,
  })
    && process.env.WOS_P7_NONPROD_SUBMIT_ENABLED === 'true'
    && isApprovedWosSandboxUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
}

async function office() {
  const client = await createClient();
  if (!client) return { error: answer(503, 'QA_DATABASE_UNAVAILABLE') } as const;
  const identity = await resolveVerifiedSupabaseIdentity(client);
  if (!identity) return { error: answer(401, 'UNAUTHENTICATED') } as const;
  const profile = await client.from('profiles')
    .select('id,user_id,org_id,role,is_active')
    .eq('user_id', identity.id).eq('is_active', true).maybeSingle();
  if (profile.error || !profile.data || profile.data.user_id !== identity.id
    || !['admin', 'manager', 'sales'].includes(profile.data.role)) {
    return { error: answer(403, 'FORBIDDEN') } as const;
  }
  return { client, actor: profile.data } as const;
}

export async function GET() {
  if (!isolated()) return answer(503, 'NONPRODUCTION_ONLY_DISABLED');
  const auth = await office();
  if ('error' in auth) return auth.error;
  try {
    const [c, p] = await Promise.all([
      auth.client.from('cpc_customer_references')
        .select('id,org_id,display_name_snapshot,status')
        .eq('org_id', auth.actor.org_id).limit(201),
      auth.client.from('cpc_projects')
        .select('id,org_id,customer_reference_id,title,owner_profile_id,status,archived_at')
        .eq('org_id', auth.actor.org_id).eq('status', 'active')
        .is('archived_at', null).limit(201),
    ]);
    if (c.error || p.error) return answer(503, 'CPC_READ_UNAVAILABLE');
    if ((c.data ?? []).length > 200 || (p.data ?? []).length > 200)
      return answer(409, 'CPC_OPTION_LIMIT_EXCEEDED');
    const customers = (c.data ?? []).filter(row =>
      row.org_id === auth.actor.org_id && typeof row.display_name_snapshot === 'string')
      .map(row => ({ id: row.id, name: row.display_name_snapshot, status: row.status }));
    const allowed = new Set(customers.map(row => row.id));
    const projects = (p.data ?? []).filter(row =>
      row.org_id === auth.actor.org_id && row.status === 'active'
      && row.archived_at === null && allowed.has(row.customer_reference_id))
      .map(row => ({
        id: row.id, customerId: row.customer_reference_id,
        name: row.title, ownerProfileId: row.owner_profile_id,
      }));
    return answer(200, 'CPC_OPTIONS_VERIFIED', { customers, projects });
  } catch {
    return answer(503, 'CPC_READ_UNAVAILABLE');
  }
}

export async function POST(req: NextRequest) {
  if (!isolated()) return answer(503, 'NONPRODUCTION_ONLY_DISABLED');
  if (!req.headers.get('content-type')?.startsWith('application/json'))
    return answer(400, 'INVALID_INPUT');
  const size = Number(req.headers.get('content-length') || '0');
  if (!Number.isFinite(size) || size > 8192) return answer(400, 'INVALID_INPUT');
  const auth = await office();
  if ('error' in auth) return auth.error;
  let parsed: z.infer<typeof draftSchema>;
  try {
    const raw = await req.text();
    if (raw.length > 8192) return answer(400, 'INVALID_INPUT');
    const result = draftSchema.safeParse(JSON.parse(raw));
    if (!result.success) return answer(400, 'INVALID_INPUT');
    parsed = result.data;
  } catch {
    return answer(400, 'INVALID_INPUT');
  }
  try {
    const { client, actor } = auth;
    // CPC is the sole source of truth: never take organization, customer,
    // owner, project title or workflow status from the browser.
    const [customer, project] = await Promise.all([
      client.from('cpc_customer_references')
        .select('id,org_id,display_name_snapshot,status')
        .eq('id', parsed.customerId).eq('org_id', actor.org_id).maybeSingle(),
      client.from('cpc_projects')
        .select('id,org_id,customer_reference_id,title,owner_profile_id,status,archived_at')
        .eq('id', parsed.projectId).eq('org_id', actor.org_id)
        .eq('status', 'active').is('archived_at', null).maybeSingle(),
    ]);
    if (customer.error || project.error || !customer.data || !project.data
      || customer.data.org_id !== actor.org_id
      || project.data.org_id !== actor.org_id
      || project.data.customer_reference_id !== customer.data.id)
      return answer(403, 'CPC_RELATIONSHIP_DENIED');

    const owner = await client.from('profiles')
      .select('id,org_id,is_active')
      .eq('id', project.data.owner_profile_id)
      .eq('org_id', actor.org_id).eq('is_active', true).maybeSingle();
    if (owner.error || !owner.data || owner.data.org_id !== actor.org_id)
      return answer(403, 'CPC_OWNER_DENIED');

    const expected = {
      organization_id: actor.org_id,
      customer_id: customer.data.id,
      customer_name_snapshot: customer.data.display_name_snapshot,
      project_id: project.data.id,
      project_name_snapshot: project.data.title,
      order_number: parsed.orderNumber,
      product_name: parsed.productName,
      sales_owner_profile_id: actor.id,
      project_owner_profile_id: owner.data.id,
      created_by_profile_id: actor.id,
      workflow_status: 'DRAFT',
      priority: parsed.priority,
      is_urgent: parsed.isUrgent,
      version_label: parsed.versionLabel,
      requested_quantity: parsed.requestedQuantity,
      current_batch_quantity: parsed.currentBatchQuantity,
      planned_ship_date: parsed.plannedShipDate,
      split_delivery: parsed.splitDelivery,
      product_material: parsed.productMaterial,
      surface_treatment: parsed.surfaceTreatment,
      pattern_scope: parsed.patternScope,
      seam_tolerance: parsed.seamTolerance,
      position_reference: parsed.positionReference,
      customer_acceptance_standard: parsed.customerAcceptanceStandard,
      packaging_method: parsed.packagingMethod,
      carton_quantity: parsed.cartonQuantity,
      label_marking_rule: parsed.labelMarkingRule,
    };
    const matchExisting = async () => {
      const existing = await client.from('wos_production_orders')
        .select('id,organization_id,customer_id,customer_name_snapshot,project_id,project_name_snapshot,order_number,created_by_profile_id,sales_owner_profile_id,project_owner_profile_id,workflow_status,version,product_name,product_material,requested_quantity,current_batch_quantity,priority,is_urgent,version_label,planned_ship_date,split_delivery,surface_treatment,pattern_scope,seam_tolerance,position_reference,customer_acceptance_standard,packaging_method,carton_quantity,label_marking_rule')
        .eq('organization_id', actor.org_id)
        .eq('order_number', parsed.orderNumber).maybeSingle();
      if (existing.error) return answer(503, 'QA_DRAFT_READ_UNAVAILABLE');
      if (!existing.data) return null;
      const row = existing.data;
      if (row.organization_id !== actor.org_id || row.created_by_profile_id !== actor.id
        || row.customer_id !== expected.customer_id || row.project_id !== expected.project_id
        || row.project_owner_profile_id !== expected.project_owner_profile_id
        || row.sales_owner_profile_id !== expected.sales_owner_profile_id
        || row.customer_name_snapshot !== expected.customer_name_snapshot
        || row.project_name_snapshot !== expected.project_name_snapshot
        || row.product_name !== expected.product_name
        || row.product_material !== expected.product_material
        || row.requested_quantity !== expected.requested_quantity
        || row.current_batch_quantity !== expected.current_batch_quantity
        || row.priority !== expected.priority
        || row.is_urgent !== expected.is_urgent
        || row.version_label !== expected.version_label
        || row.planned_ship_date !== expected.planned_ship_date
        || row.split_delivery !== expected.split_delivery
        || row.surface_treatment !== expected.surface_treatment
        || row.pattern_scope !== expected.pattern_scope
        || row.seam_tolerance !== expected.seam_tolerance
        || row.position_reference !== expected.position_reference
        || row.customer_acceptance_standard !== expected.customer_acceptance_standard
        || row.packaging_method !== expected.packaging_method
        || row.carton_quantity !== expected.carton_quantity
        || row.label_marking_rule !== expected.label_marking_rule
        || row.workflow_status !== 'DRAFT' || row.version !== 1)
        return answer(409, 'QA_DRAFT_REPLAY_CONFLICT');
      return answer(200, 'QA_CPC_DRAFT_REPLAY_VERIFIED', {
        orderId: row.id, orderNumber: row.order_number, version: row.version,
        persisted: true, submitted: false, editable: false,
      });
    };
    // The order number is fixed for retries. It is unique per organization.
    const prior = await matchExisting();
    if (prior) return prior;
    const inserted = await client.from('wos_production_orders')
      .insert(expected).select('id,organization_id,created_by_profile_id,order_number,workflow_status,version').single();
    if (inserted.error || !inserted.data) {
      const recovered = await matchExisting();
      return recovered ?? answer(503, 'QA_DRAFT_WRITE_UNVERIFIED');
    }
    const row = inserted.data;
    if (row.organization_id !== actor.org_id
      || row.created_by_profile_id !== actor.id
      || row.workflow_status !== 'DRAFT' || row.version !== 1
      || row.order_number !== parsed.orderNumber)
      return answer(503, 'QA_DRAFT_WRITE_UNVERIFIED');
    return answer(200, 'QA_CPC_DRAFT_SAVED', {
      orderId: row.id, orderNumber: row.order_number, version: row.version,
      persisted: true, submitted: false, editable: false,
    });
  } catch {
    return answer(503, 'QA_DRAFT_WRITE_UNVERIFIED');
  }
}
