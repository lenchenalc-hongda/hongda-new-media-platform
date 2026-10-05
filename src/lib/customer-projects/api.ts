import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import {
  PROJECT_EVENT_TYPES,
  PROJECT_LIFECYCLE_STATUSES,
  PROJECT_PRIORITIES,
  PROJECT_TYPES,
  WAITING_ON_VALUES,
  WORK_ITEM_STATUSES,
} from './domain';
import {
  expectedVersionSchema,
  isoDateSchema,
  isoDateTimeSchema,
  uuidSchema,
} from './schemas';
import {
  RELATIONSHIP_CONVERSION_SOURCE_KEY,
  RELATIONSHIP_EVENT_TYPES,
  trustedProjectConversionProvenanceFromAudit,
  type ProjectCreationAuditRow,
} from './old-customer-proactive';

export type CpcProfile = {
  id: string;
  orgId: string;
  role: 'admin' | 'manager' | 'sales';
};

export type CpcMutationCommand =
  | 'CREATE_PROVISIONAL_CUSTOMER'
  | 'CREATE_PROJECT'
  | 'RECORD_PROGRESS'
  | 'SET_WAITING'
  | 'TRANSITION_WORK_ITEM'
  | 'RESCHEDULE_WORK_ITEM'
  | 'TRANSITION_PROJECT'
  | 'RECORD_CUSTOMER_FOLLOW_UP'
  | 'CREATE_CUSTOMER_RELATIONSHIP_FOLLOW_UP'
  | 'CREATE_AI_WORK_ITEM_DRAFT'
  | 'ACCEPT_AI_DRAFT'
  | 'REJECT_AI_DRAFT'
  | 'GENERATE_DAILY_REPORT'
  | 'SUBMIT_REPORT'
  | 'CREATE_REPORT_CORRECTION';

type RpcResult = {
  data?: any;
  error?: {
    code?: string;
    message?: string;
    details?: string;
    hint?: string;
  } | null;
};

const cpcRoleSchema = z.enum(['admin', 'manager', 'sales']);

const createProvisionalSchema = z.object({
  displayNameSnapshot: z.string().trim().min(1).max(300),
  provisionalSourceReference: z.string().trim().min(1).max(300),
}).strict();

const createProjectSchema = z.object({
  customerReferenceId: uuidSchema,
  title: z.string().trim().min(1).max(300),
  objectiveSummary: z.string().trim().min(1).max(2000),
  projectType: z.enum(PROJECT_TYPES),
  stage: z.string().trim().min(1).max(100),
  priority: z.enum(PROJECT_PRIORITIES),
  ownerProfileId: uuidSchema.nullable().optional(),
  initialNextActionTitle: z.string().trim().min(1).max(300).nullable().optional(),
  initialNextActionDueAt: isoDateTimeSchema.nullable().optional(),
  waitingOn: z.enum(WAITING_ON_VALUES).default('none'),
  nextCheckAt: isoDateTimeSchema.nullable().optional(),
  sourceFollowUpEventId: uuidSchema.nullable().optional(),
}).strict();

const progressEventTypes = PROJECT_EVENT_TYPES.filter(eventType => [
  'CONTACT_LOGGED',
  'EFFECTIVE_PROGRESS_RECORDED',
  'CUSTOMER_RESPONSE_RECEIVED',
  'QUOTE_SENT',
  'SAMPLE_SENT',
  'CUSTOMER_CONFIRMED',
  'COMMERCIAL_CONFIRMED',
  'ORDER_CONFIRMED',
].includes(eventType)) as [
  'CONTACT_LOGGED',
  ...Array<
    | 'EFFECTIVE_PROGRESS_RECORDED'
    | 'CUSTOMER_RESPONSE_RECEIVED'
    | 'QUOTE_SENT'
    | 'SAMPLE_SENT'
    | 'CUSTOMER_CONFIRMED'
    | 'COMMERCIAL_CONFIRMED'
    | 'ORDER_CONFIRMED'
  >,
];

const progressPayloadSchema = z.record(z.string(), z.unknown())
  .default({})
  .superRefine((payload, context) => {
    if (Object.prototype.hasOwnProperty.call(
      payload,
      RELATIONSHIP_CONVERSION_SOURCE_KEY,
    )) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'reserved relationship conversion provenance key',
      });
    }
  });

const progressSchema = z.object({
  expectedVersion: expectedVersionSchema,
  eventType: z.enum(progressEventTypes),
  rawInput: z.string().trim().min(1).max(10000).nullable().optional(),
  payload: progressPayloadSchema,
  occurredAt: isoDateTimeSchema.nullable().optional(),
  newStage: z.string().trim().min(1).max(100).nullable().optional(),
  nextActionTitle: z.string().trim().min(1).max(300).nullable().optional(),
  nextActionDueAt: isoDateTimeSchema.nullable().optional(),
  waitingOn: z.enum(WAITING_ON_VALUES).nullable().optional(),
  nextCheckAt: isoDateTimeSchema.nullable().optional(),
}).strict();

const waitingValues = WAITING_ON_VALUES.filter(value => value !== 'none') as [
  'customer',
  ...Array<'internal' | 'supplier' | 'quality' | 'finance' | 'logistics' | 'other'>,
];

const waitingSchema = z.object({
  expectedVersion: expectedVersionSchema,
  waitingOn: z.enum(waitingValues),
  nextCheckAt: isoDateTimeSchema,
  reason: z.string().trim().min(1).max(2000),
}).strict();

const transitionableWorkItemStatuses = WORK_ITEM_STATUSES.filter(status =>
  ['in_progress', 'blocked', 'completed', 'cancelled'].includes(status),
) as ['in_progress', ...Array<'blocked' | 'completed' | 'cancelled'>];

const workItemTransitionSchema = z.object({
  expectedVersion: expectedVersionSchema,
  toStatus: z.enum(transitionableWorkItemStatuses),
  reason: z.string().trim().min(1).max(2000).nullable().optional(),
}).strict();

const workItemRescheduleSchema = z.object({
  expectedVersion: expectedVersionSchema,
  toDueAt: isoDateTimeSchema,
  reason: z.string().trim().min(1).max(2000),
}).strict();

const customerFollowUpSchema = z.object({
  eventType: z.enum(['CONTACT_LOGGED', 'CUSTOMER_RESPONSE_RECEIVED']),
  resultSummary: z.string().trim().min(1).max(10000),
  occurredAt: isoDateTimeSchema.nullable().optional(),
  currentFollowUpId: uuidSchema.nullable().optional(),
  nextFollowUpTitle: z.string().trim().min(1).max(300).nullable().optional(),
  nextFollowUpDueAt: isoDateTimeSchema.nullable().optional(),
  nextFollowUpPriority: z.enum(PROJECT_PRIORITIES).default('medium'),
}).strict();

const createRelationshipFollowUpSchema = z.object({
  title: z.string().trim().min(1).max(300).default('客户关系回访'),
  dueAt: isoDateTimeSchema,
  priority: z.enum(PROJECT_PRIORITIES).default('medium'),
}).strict();

const aiWorkItemDraftSchema = z.object({
  customerReferenceId: uuidSchema.nullable().optional(),
  projectId: uuidSchema.nullable().optional(),
  workItemType: z.enum(['NEXT_ACTION', 'FOLLOW_UP']),
  title: z.string().trim().min(1).max(300),
  description: z.string().trim().max(2000).nullable().optional(),
  dueAt: isoDateTimeSchema.nullable().optional(),
  priority: z.enum(PROJECT_PRIORITIES).default('medium'),
  rawInput: z.string().trim().min(1).max(10000),
  expiresAt: isoDateTimeSchema.nullable().optional(),
}).strict();

const aiDraftAcceptSchema = z.object({
  expectedVersion: expectedVersionSchema,
}).strict();

const aiDraftRejectSchema = z.object({
  expectedVersion: expectedVersionSchema,
  reason: z.string().trim().max(2000).nullable().optional(),
}).strict();

const generateDailyReportSchema = z.object({
  businessDate: isoDateSchema,
}).strict();

const reportSubmitSchema = z.object({
  expectedVersion: expectedVersionSchema,
}).strict();

const reportCorrectionSchema = z.object({
  expectedVersion: expectedVersionSchema,
  reason: z.string().trim().min(1).max(2000),
}).strict();

const transitionableProjectStatuses = PROJECT_LIFECYCLE_STATUSES.filter(status =>
  ['active', 'paused', 'won', 'lost', 'cancelled'].includes(status),
) as ['active', ...Array<'paused' | 'won' | 'lost' | 'cancelled'>];

const projectTransitionSchema = z.object({
  expectedVersion: expectedVersionSchema,
  toStatus: z.enum(transitionableProjectStatuses),
  reason: z.string().trim().min(1).max(2000).nullable().optional(),
  pauseNextCheckAt: isoDateTimeSchema.nullable().optional(),
  reopenNextActionTitle: z.string().trim().min(1).max(300).nullable().optional(),
  reopenNextActionDueAt: isoDateTimeSchema.nullable().optional(),
  reopenWaitingOn: z.enum(WAITING_ON_VALUES).nullable().optional(),
  reopenNextCheckAt: isoDateTimeSchema.nullable().optional(),
}).strict();

const COMMAND_SCHEMA = {
  CREATE_PROVISIONAL_CUSTOMER: createProvisionalSchema,
  CREATE_PROJECT: createProjectSchema,
  RECORD_PROGRESS: progressSchema,
  SET_WAITING: waitingSchema,
  TRANSITION_WORK_ITEM: workItemTransitionSchema,
  RESCHEDULE_WORK_ITEM: workItemRescheduleSchema,
  TRANSITION_PROJECT: projectTransitionSchema,
  RECORD_CUSTOMER_FOLLOW_UP: customerFollowUpSchema,
  CREATE_CUSTOMER_RELATIONSHIP_FOLLOW_UP: createRelationshipFollowUpSchema,
  CREATE_AI_WORK_ITEM_DRAFT: aiWorkItemDraftSchema,
  ACCEPT_AI_DRAFT: aiDraftAcceptSchema,
  REJECT_AI_DRAFT: aiDraftRejectSchema,
  GENERATE_DAILY_REPORT: generateDailyReportSchema,
  SUBMIT_REPORT: reportSubmitSchema,
  CREATE_REPORT_CORRECTION: reportCorrectionSchema,
} as const;

const LOCAL_MESSAGES: Record<string, string> = {
  FORBIDDEN: '无权执行此客户项目操作',
  NOT_FOUND: '记录不存在或无权访问',
  VERSION_CONFLICT: '记录已被其他操作更新，请刷新后重试',
  INVALID_TRANSITION: '当前状态不允许执行此操作',
  INVALID_PROJECT_STATE: '当前项目状态不允许执行此操作',
  INVALID_INPUT: '提交内容无效',
  INVALID_STAGE: '项目阶段不合法',
  INVALID_PRIORITY: '项目优先级不合法',
  INVALID_OWNER: '项目负责人无效',
  INVALID_NEXT_STEP: '下一步任务或等待状态不合法',
  NEXT_STEP_REQUIRED: '活跃项目必须保留下一步任务或明确等待/检查状态',
  INVALID_EVENT_TYPE: '推进事件类型不合法',
  INVALID_EVENT_PAYLOAD: '推进证据或事件内容不完整',
  INVALID_WAITING_STATE: '等待状态不合法',
  REASON_REQUIRED: '该操作必须填写原因',
  NEXT_CHECK_REQUIRED: '该状态必须设置下一次检查时间',
  INVALID_CUSTOMER_REFERENCE: '客户引用当前不可用于此操作',
  DUPLICATE_REFERENCE: '该临时客户来源已存在',
  DUPLICATE_FOLLOW_UP: '当前客户已有未完成的回访任务，请先处理或明确替换',
  CANONICAL_CUSTOMER_REQUIRED: '项目成交前必须先映射到正式客户',
  ORDER_CONFIRMATION_REQUIRED: '项目成交前必须先确认订单证据',
  DRAFT_EXPIRED: 'AI 建议已过期，请刷新后查看最新建议',
  REPORT_ALREADY_SUBMITTED: '该日期日报已经提交；如需修改请创建更正版',
  REPORT_DRAFT_EXISTS: '该周期已有更正草稿，请先处理现有草稿',
  INTERNAL_ERROR: '客户项目操作失败，请稍后重试',
};

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function internalError() {
  return {
    status: 500,
    body: {
      ok: false,
      code: 'INTERNAL_ERROR',
      message: LOCAL_MESSAGES.INTERNAL_ERROR,
      data: null,
    },
  };
}

export async function resolveCpcProfile(client: any): Promise<
  | { ok: true; profile: CpcProfile }
  | { ok: false; status: number; message: string }
> {
  let authUserId: string | null = null;
  try {
    const authResult = await client.auth.getUser();
    authUserId = typeof authResult?.data?.user?.id === 'string'
      ? authResult.data.user.id
      : null;
  } catch {
    return { ok: false, status: 401, message: '未登录或无权限' };
  }

  if (!authUserId) {
    return { ok: false, status: 401, message: '未登录或无权限' };
  }

  const profileResult = await client
    .from('profiles')
    .select('id,org_id,role')
    .eq('user_id', authUserId)
    .eq('is_active', true)
    .maybeSingle();

  if (profileResult.error || !profileResult.data) {
    return { ok: false, status: 403, message: '无有效档案' };
  }

  const parsedRole = cpcRoleSchema.safeParse(profileResult.data.role);
  if (!parsedRole.success) {
    return { ok: false, status: 403, message: '无权使用客户项目中心' };
  }

  if (
    typeof profileResult.data.id !== 'string'
    || typeof profileResult.data.org_id !== 'string'
  ) {
    return { ok: false, status: 403, message: '无有效档案' };
  }

  return {
    ok: true,
    profile: {
      id: profileResult.data.id,
      orgId: profileResult.data.org_id,
      role: parsedRole.data,
    },
  };
}

function safeString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function safePositiveInteger(value: unknown): number | null {
  return typeof value === 'number'
    && Number.isInteger(value)
    && value >= 1
    ? value
    : null;
}

function sanitizeSuccess(command: CpcMutationCommand, raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Record<string, unknown>;

  if (command === 'CREATE_PROVISIONAL_CUSTOMER') {
    const id = safeString(data.customer_reference_id);
    const status = safeString(data.status);
    const version = safePositiveInteger(data.version);
    if (!id || !status || !version) return null;
    return { customerReferenceId: id, status, version };
  }

  if (command === 'CREATE_PROJECT') {
    const id = safeString(data.project_id);
    const version = safePositiveInteger(data.version);
    if (!id || !version) return null;
    return {
      projectId: id,
      version,
      nextActionId: safeString(data.next_action_id),
    };
  }

  if (command === 'RECORD_PROGRESS') {
    const id = safeString(data.project_id);
    const version = safePositiveInteger(data.version);
    const eventId = safeString(data.event_id);
    if (!id || !version || !eventId) return null;
    return {
      projectId: id,
      version,
      eventId,
      nextActionId: safeString(data.next_action_id),
      waitingOn: safeString(data.waiting_on),
      nextCheckAt: safeString(data.next_check_at),
    };
  }

  if (command === 'SET_WAITING') {
    const id = safeString(data.project_id);
    const version = safePositiveInteger(data.version);
    const eventId = safeString(data.event_id);
    const waitingOn = safeString(data.waiting_on);
    const nextCheckAt = safeString(data.next_check_at);
    if (!id || !version || !eventId || !waitingOn || !nextCheckAt) return null;
    return { projectId: id, version, eventId, waitingOn, nextCheckAt };
  }

  if (command === 'TRANSITION_WORK_ITEM') {
    const id = safeString(data.work_item_id);
    const status = safeString(data.status);
    const version = safePositiveInteger(data.version);
    if (!id || !status || !version) return null;
    return { workItemId: id, status, version };
  }

  if (command === 'RESCHEDULE_WORK_ITEM') {
    const id = safeString(data.work_item_id);
    const dueAt = safeString(data.due_at);
    const version = safePositiveInteger(data.version);
    if (!id || !dueAt || !version) return null;
    return { workItemId: id, dueAt, version };
  }

  if (command === 'CREATE_AI_WORK_ITEM_DRAFT') {
    const id = safeString(data.ai_draft_id);
    const status = safeString(data.status);
    const version = safePositiveInteger(data.version);
    if (!id || !status || !version) return null;
    return { aiDraftId: id, status, version };
  }

  if (command === 'ACCEPT_AI_DRAFT') {
    const id = safeString(data.ai_draft_id);
    const status = safeString(data.status);
    const version = safePositiveInteger(data.version);
    const createdWorkItemId = safeString(data.created_work_item_id);
    if (!id || !status || !version || !createdWorkItemId) return null;
    return { aiDraftId: id, status, version, createdWorkItemId };
  }

  if (command === 'REJECT_AI_DRAFT') {
    const id = safeString(data.ai_draft_id);
    const status = safeString(data.status);
    const version = safePositiveInteger(data.version);
    if (!id || !status || !version) return null;
    return { aiDraftId: id, status, version };
  }

  if (
    command === 'GENERATE_DAILY_REPORT'
    || command === 'SUBMIT_REPORT'
    || command === 'CREATE_REPORT_CORRECTION'
  ) {
    const id = safeString(data.report_id);
    const status = safeString(data.status);
    const revisionNo = safePositiveInteger(data.revision_no);
    const version = safePositiveInteger(data.version);
    if (!id || !status || !revisionNo || !version) return null;
    return {
      reportId: id,
      status,
      revisionNo,
      version,
      ...(command === 'CREATE_REPORT_CORRECTION'
        ? { supersedesReportId: safeString(data.supersedes_report_id) }
        : {}),
    };
  }

  if (command === 'CREATE_CUSTOMER_RELATIONSHIP_FOLLOW_UP') {
    const id = safeString(data.work_item_id);
    const workItemType = safeString(data.work_item_type);
    const status = safeString(data.status);
    const version = safePositiveInteger(data.version);
    if (!id || workItemType !== 'FOLLOW_UP' || !status || !version) return null;
    return { workItemId: id, workItemType, status, version };
  }

  if (command === 'RECORD_CUSTOMER_FOLLOW_UP') {
    const customerReferenceId = safeString(data.customer_reference_id);
    const eventId = safeString(data.event_id);
    if (!customerReferenceId || !eventId) return null;
    return {
      customerReferenceId,
      eventId,
      completedFollowUpId: safeString(data.completed_follow_up_id),
      nextFollowUpId: safeString(data.next_follow_up_id),
    };
  }

  const id = safeString(data.project_id);
  const status = safeString(data.status);
  const version = safePositiveInteger(data.version);
  const eventId = safeString(data.event_id);
  if (!id || !status || !version || !eventId) return null;
  return {
    projectId: id,
    status,
    version,
    eventId,
    nextActionId: safeString(data.next_action_id),
  };
}

export function mapCpcRpcResult(
  command: CpcMutationCommand,
  result: RpcResult,
): { status: number; body: Record<string, unknown> } {
  if (result.error) return internalError();

  const envelope = result.data;
  if (!envelope || typeof envelope !== 'object') return internalError();

  if (envelope.ok === true && envelope.code === 'OK') {
    const data = sanitizeSuccess(command, envelope.data);
    if (!data) return internalError();
    return {
      status: 200,
      body: { ok: true, code: 'OK', message: 'success', data },
    };
  }

  const code = typeof envelope.code === 'string' ? envelope.code : 'UNKNOWN';
  const message = LOCAL_MESSAGES[code] ?? LOCAL_MESSAGES.INTERNAL_ERROR;

  if (code === 'FORBIDDEN') {
    return { status: 403, body: { ok: false, code, message, data: null } };
  }
  if (code === 'NOT_FOUND') {
    return { status: 404, body: { ok: false, code, message, data: null } };
  }
  if (
    code === 'VERSION_CONFLICT'
    || code === 'INVALID_TRANSITION'
    || code === 'INVALID_PROJECT_STATE'
    || code === 'NEXT_STEP_REQUIRED'
    || code === 'CANONICAL_CUSTOMER_REQUIRED'
    || code === 'ORDER_CONFIRMATION_REQUIRED'
    || code === 'DUPLICATE_REFERENCE'
    || code === 'DUPLICATE_FOLLOW_UP'
    || code === 'DRAFT_EXPIRED'
    || code === 'REPORT_ALREADY_SUBMITTED'
    || code === 'REPORT_DRAFT_EXISTS'
  ) {
    return { status: 409, body: { ok: false, code, message, data: null } };
  }
  if (
    code === 'INVALID_INPUT'
    || code === 'INVALID_STAGE'
    || code === 'INVALID_PRIORITY'
    || code === 'INVALID_OWNER'
    || code === 'INVALID_NEXT_STEP'
    || code === 'INVALID_EVENT_TYPE'
    || code === 'INVALID_EVENT_PAYLOAD'
    || code === 'INVALID_WAITING_STATE'
    || code === 'REASON_REQUIRED'
    || code === 'NEXT_CHECK_REQUIRED'
    || code === 'INVALID_CUSTOMER_REFERENCE'
  ) {
    return { status: 422, body: { ok: false, code, message, data: null } };
  }

  return internalError();
}

function commandSchema(command: CpcMutationCommand): z.ZodTypeAny {
  return COMMAND_SCHEMA[command] as z.ZodTypeAny;
}

async function findExistingTrustedProjectConversion(
  supabase: any,
  orgId: string,
  sourceFollowUpEventId: string,
  customerReferenceId: string,
): Promise<{
  projectId: string;
  version: number;
  nextActionId: string | null;
} | null> {
  const auditResult = await supabase
    .from('cpc_audit_log')
    .select('id,org_id,entity_type,entity_id,action,request_id,metadata,recorded_at')
    .eq('org_id', orgId)
    .eq('entity_type', 'PROJECT')
    .eq('action', 'PROJECT_CREATED')
    .eq('request_id', sourceFollowUpEventId)
    .maybeSingle();

  if (auditResult.error || !auditResult.data) return null;

  const provenance = trustedProjectConversionProvenanceFromAudit(
    auditResult.data as ProjectCreationAuditRow,
  );
  if (
    !provenance
    || provenance.sourceFollowUpEventId !== sourceFollowUpEventId
    || provenance.customerReferenceId !== customerReferenceId
  ) {
    return null;
  }

  const projectResult = await supabase
    .from('cpc_projects')
    .select('id,version,customer_reference_id')
    .eq('org_id', orgId)
    .eq('id', provenance.projectId)
    .maybeSingle();

  if (projectResult.error || !projectResult.data) return null;
  if (
    projectResult.data.customer_reference_id
    !== provenance.customerReferenceId
  ) {
    return null;
  }

  const version = safePositiveInteger(projectResult.data.version);
  const projectId = safeString(projectResult.data.id);
  if (!version || !projectId) return null;

  const nextActionResult = await supabase
    .from('cpc_work_items')
    .select('id,created_at')
    .eq('org_id', orgId)
    .eq('project_id', projectId)
    .eq('work_item_type', 'NEXT_ACTION')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    projectId,
    version,
    nextActionId: nextActionResult.error
      ? null
      : safeString(nextActionResult.data?.id),
  };
}

export async function runCpcMutation(
  req: NextRequest,
  params: Record<string, string>,
  command: CpcMutationCommand,
): Promise<NextResponse> {
  const idRequired = command === 'RECORD_PROGRESS'
    || command === 'SET_WAITING'
    || command === 'TRANSITION_WORK_ITEM'
    || command === 'RESCHEDULE_WORK_ITEM'
    || command === 'TRANSITION_PROJECT'
    || command === 'RECORD_CUSTOMER_FOLLOW_UP'
    || command === 'CREATE_CUSTOMER_RELATIONSHIP_FOLLOW_UP'
    || command === 'ACCEPT_AI_DRAFT'
    || command === 'REJECT_AI_DRAFT'
    || command === 'SUBMIT_REPORT'
    || command === 'CREATE_REPORT_CORRECTION';

  let resourceId: string | null = null;
  if (idRequired) {
    const parsedId = uuidSchema.safeParse(params.id);
    if (!parsedId.success) return jsonError('请求参数无效', 400);
    resourceId = parsedId.data;
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return jsonError('请求体不是有效 JSON', 400);
  }

  const parsed = commandSchema(command).safeParse(rawBody);
  if (!parsed.success) return jsonError('提交内容无效', 400);

  const supabase = await createClient();
  if (!supabase) return jsonError('数据库不可用', 500);

  const profileResult = await resolveCpcProfile(supabase);
  if (!profileResult.ok) {
    return jsonError(profileResult.message, profileResult.status);
  }

  let requestId = crypto.randomUUID();
  const body: any = parsed.data;
  let conversionSourceFollowUpEventId: string | null = null;
  let result: RpcResult;

  try {
    if (command === 'CREATE_PROJECT' && body.sourceFollowUpEventId) {
      const sourceResult = await supabase
        .from('cpc_project_events')
        .select('id,customer_reference_id,project_id,event_type,payload')
        .eq('org_id', profileResult.profile.orgId)
        .eq('id', body.sourceFollowUpEventId)
        .maybeSingle();

      if (sourceResult.error) throw new Error('conversion source read failed');

      const source = sourceResult.data as any;
      const sourcePayload = source?.payload
        && typeof source.payload === 'object'
        && !Array.isArray(source.payload)
        ? source.payload as Record<string, unknown>
        : {};
      const validSource = source
        && source.customer_reference_id === body.customerReferenceId
        && source.project_id === null
        && RELATIONSHIP_EVENT_TYPES.includes(source.event_type)
        && sourcePayload.relationship_follow_up === true;

      if (!validSource) {
        return NextResponse.json({
          ok: false,
          code: 'INVALID_CONVERSION_SOURCE',
          message: '项目转化的来源回访事实无效或不再可见。',
          data: null,
        }, { status: 422 });
      }

      conversionSourceFollowUpEventId = source.id;
      requestId = source.id;
    }

    if (command === 'GENERATE_DAILY_REPORT') {
      result = await supabase.rpc('cpc_generate_daily_report_draft', {
        p_business_date: body.businessDate,
        p_request_id: requestId,
      });
    } else if (command === 'CREATE_AI_WORK_ITEM_DRAFT') {
      result = await supabase.rpc('cpc_create_ai_work_item_draft', {
        p_customer_reference_id: body.customerReferenceId ?? null,
        p_project_id: body.projectId ?? null,
        p_work_item_type: body.workItemType,
        p_title: body.title,
        p_description: body.description ?? null,
        p_due_at: body.dueAt ?? null,
        p_priority: body.priority,
        p_raw_input: body.rawInput,
        p_expires_at: body.expiresAt ?? null,
        p_request_id: requestId,
      });
    } else if (command === 'CREATE_PROVISIONAL_CUSTOMER') {
      result = await supabase.rpc('cpc_create_provisional_customer_reference', {
        p_display_name_snapshot: body.displayNameSnapshot,
        p_provisional_source_reference: body.provisionalSourceReference,
        p_request_id: requestId,
      });
    } else if (command === 'CREATE_PROJECT') {
      if (conversionSourceFollowUpEventId) {
        const recovered = await findExistingTrustedProjectConversion(
          supabase,
          profileResult.profile.orgId,
          conversionSourceFollowUpEventId,
          body.customerReferenceId,
        );
        if (recovered) {
          return NextResponse.json({
            ok: true,
            code: 'OK',
            message: 'success',
            data: {
              ...recovered,
              conversionSourceEventId: conversionSourceFollowUpEventId,
              conversionProvenanceRecorded: true,
              recoveredExistingProject: true,
            },
          });
        }
      }

      result = await supabase.rpc('cpc_create_project', {
        p_customer_reference_id: body.customerReferenceId,
        p_title: body.title,
        p_objective_summary: body.objectiveSummary,
        p_project_type: body.projectType,
        p_stage: body.stage,
        p_priority: body.priority,
        p_owner_profile_id: body.ownerProfileId ?? null,
        p_initial_next_action_title: body.initialNextActionTitle ?? null,
        p_initial_next_action_due_at: body.initialNextActionDueAt ?? null,
        p_waiting_on: body.waitingOn,
        p_next_check_at: body.nextCheckAt ?? null,
        p_request_id: requestId,
      });

      if (conversionSourceFollowUpEventId) {
        if (result.error) {
          const recovered = await findExistingTrustedProjectConversion(
            supabase,
            profileResult.profile.orgId,
            conversionSourceFollowUpEventId,
            body.customerReferenceId,
          );
          if (recovered) {
            return NextResponse.json({
              ok: true,
              code: 'OK',
              message: 'success',
              data: {
                ...recovered,
                conversionSourceEventId: conversionSourceFollowUpEventId,
                conversionProvenanceRecorded: true,
                recoveredExistingProject: true,
              },
            });
          }
          const mapped = mapCpcRpcResult(command, result);
          return NextResponse.json(mapped.body, { status: mapped.status });
        }

        const createdProject = result.data?.ok === true
          ? sanitizeSuccess('CREATE_PROJECT', result.data?.data)
          : null;
        if (!createdProject) {
          const mapped = mapCpcRpcResult(command, result);
          return NextResponse.json(mapped.body, { status: mapped.status });
        }

        return NextResponse.json({
          ok: true,
          code: 'OK',
          message: 'success',
          data: {
            ...createdProject,
            conversionSourceEventId: conversionSourceFollowUpEventId,
            conversionProvenanceRecorded: true,
          },
        });
      }
    } else if (command === 'RECORD_PROGRESS') {
      result = await supabase.rpc('cpc_record_progress', {
        p_project_id: resourceId,
        p_expected_version: body.expectedVersion,
        p_event_type: body.eventType,
        p_raw_input: body.rawInput ?? null,
        p_payload: body.payload,
        p_occurred_at: body.occurredAt ?? null,
        p_new_stage: body.newStage ?? null,
        p_next_action_title: body.nextActionTitle ?? null,
        p_next_action_due_at: body.nextActionDueAt ?? null,
        p_waiting_on: body.waitingOn ?? null,
        p_next_check_at: body.nextCheckAt ?? null,
        p_request_id: requestId,
      });
    } else if (command === 'SET_WAITING') {
      result = await supabase.rpc('cpc_set_waiting_state', {
        p_project_id: resourceId,
        p_expected_version: body.expectedVersion,
        p_waiting_on: body.waitingOn,
        p_next_check_at: body.nextCheckAt,
        p_reason: body.reason,
        p_request_id: requestId,
      });
    } else if (command === 'TRANSITION_WORK_ITEM') {
      result = await supabase.rpc('cpc_transition_work_item', {
        p_work_item_id: resourceId,
        p_expected_version: body.expectedVersion,
        p_to_status: body.toStatus,
        p_reason: body.reason ?? null,
        p_request_id: requestId,
      });
    } else if (command === 'RESCHEDULE_WORK_ITEM') {
      result = await supabase.rpc('cpc_reschedule_work_item', {
        p_work_item_id: resourceId,
        p_expected_version: body.expectedVersion,
        p_to_due_at: body.toDueAt,
        p_reason: body.reason,
        p_request_id: requestId,
      });
    } else if (command === 'ACCEPT_AI_DRAFT') {
      result = await supabase.rpc('cpc_accept_ai_draft', {
        p_ai_draft_id: resourceId,
        p_expected_version: body.expectedVersion,
        p_request_id: requestId,
      });
    } else if (command === 'REJECT_AI_DRAFT') {
      result = await supabase.rpc('cpc_reject_ai_draft', {
        p_ai_draft_id: resourceId,
        p_expected_version: body.expectedVersion,
        p_reason: body.reason ?? null,
        p_request_id: requestId,
      });
    } else if (command === 'SUBMIT_REPORT') {
      result = await supabase.rpc('cpc_submit_report', {
        p_report_id: resourceId,
        p_expected_version: body.expectedVersion,
        p_request_id: requestId,
      });
    } else if (command === 'CREATE_REPORT_CORRECTION') {
      result = await supabase.rpc('cpc_create_report_correction', {
        p_report_id: resourceId,
        p_expected_version: body.expectedVersion,
        p_reason: body.reason,
        p_request_id: requestId,
      });
    } else if (command === 'RECORD_CUSTOMER_FOLLOW_UP') {
      result = await supabase.rpc('cpc_record_customer_follow_up', {
        p_customer_reference_id: resourceId,
        p_event_type: body.eventType,
        p_result_summary: body.resultSummary,
        p_occurred_at: body.occurredAt ?? null,
        p_current_follow_up_id: body.currentFollowUpId ?? null,
        p_next_follow_up_title: body.nextFollowUpTitle ?? null,
        p_next_follow_up_due_at: body.nextFollowUpDueAt ?? null,
        p_next_follow_up_priority: body.nextFollowUpPriority,
        p_request_id: requestId,
      });
    } else if (command === 'CREATE_CUSTOMER_RELATIONSHIP_FOLLOW_UP') {
      result = await supabase.rpc('cpc_create_work_item', {
        p_customer_reference_id: resourceId,
        p_project_id: null,
        p_work_item_type: 'FOLLOW_UP',
        p_title: body.title,
        p_description: null,
        p_due_at: body.dueAt,
        p_priority: body.priority,
        p_request_id: requestId,
      });
    } else {
      result = await supabase.rpc('cpc_transition_project', {
        p_project_id: resourceId,
        p_expected_version: body.expectedVersion,
        p_to_status: body.toStatus,
        p_reason: body.reason ?? null,
        p_pause_next_check_at: body.pauseNextCheckAt ?? null,
        p_reopen_next_action_title: body.reopenNextActionTitle ?? null,
        p_reopen_next_action_due_at: body.reopenNextActionDueAt ?? null,
        p_reopen_waiting_on: body.reopenWaitingOn ?? null,
        p_reopen_next_check_at: body.reopenNextCheckAt ?? null,
        p_request_id: requestId,
      });
    }
  } catch {
    const mapped = internalError();
    return NextResponse.json(mapped.body, { status: mapped.status });
  }

  const mapped = mapCpcRpcResult(command, result);
  return NextResponse.json(mapped.body, { status: mapped.status });
}
