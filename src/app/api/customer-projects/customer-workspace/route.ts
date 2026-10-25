import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { resolveCpcProfile } from '@/lib/customer-projects/api';
import { uuidSchema } from '@/lib/customer-projects/schemas';

export const dynamic = 'force-dynamic';

const expectedVersion = z.number().int().min(0);

const noteSchema = z.object({
  section: z.literal('note'),
  customerReferenceId: uuidSchema,
  customerNote: z.string().max(3000),
  expectedVersion,
}).strict();

const planSchema = z.object({
  section: z.literal('plan'),
  customerReferenceId: uuidSchema,
  opportunitySummary: z.string().max(2000),
  estimatedAnnualOpportunityCnyYuan: z.number().int().min(0).max(1_000_000_000).nullable(),
  nextAction: z.string().max(300),
  nextCheckOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  expectedVersion,
}).strict();

const schema = z.discriminatedUnion('section', [noteSchema, planSchema]);

function fail(message: string, status: number) {
  return NextResponse.json({ ok: false, message }, { status });
}

export async function POST(request: NextRequest) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail('备注或开发计划字段不完整，请检查输入', 422);

  const supabase = await createClient();
  if (!supabase) return fail('客户服务暂不可用', 503);
  const auth = await resolveCpcProfile(supabase);
  if (!auth.ok) return fail(auth.message, auth.status);

  const item = parsed.data;
  const requestId = crypto.randomUUID();
  const result = item.section === 'note'
    ? await supabase.rpc('cpc_save_customer_note', {
      p_customer_reference_id: item.customerReferenceId,
      p_note: item.customerNote,
      p_expected_version: item.expectedVersion,
      p_request_id: requestId,
    })
    : await supabase.rpc('cpc_save_customer_development_plan', {
      p_customer_reference_id: item.customerReferenceId,
      p_opportunity_summary: item.opportunitySummary,
      p_estimated_annual_opportunity_cny_yuan: item.estimatedAnnualOpportunityCnyYuan,
      p_next_action: item.nextAction,
      p_next_check_on: item.nextCheckOn,
      p_expected_version: item.expectedVersion,
      p_request_id: requestId,
    });

  if (result.error) return fail('保存失败，请确认数据库升级完成并重试', 503);

  const reply = result.data as {
    ok?: boolean;
    code?: string;
    data?: { version: number };
  } | null;
  if (reply?.ok && reply.code === 'OK') {
    return NextResponse.json(
      { ok: true, data: reply.data },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  }
  if (reply?.code === 'VERSION_CONFLICT') return fail('内容已被其他人更新，请刷新后重试', 409);
  if (reply?.code === 'FORBIDDEN') return fail('你没有该客户的维护权限', 403);
  if (reply?.code === 'NOT_FOUND') return fail('客户不存在或不可见', 404);
  return fail('请检查输入内容或联系管理员', 422);
}
