// @server-only
// Weekly suggestions are non-authoritative AI drafts. Acceptance always goes
// through the existing cpc_accept_ai_draft controlled mutation.

import { getProvider } from '@/lib/ai/providers/factory';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import type { CpcProfile } from './api';
import {
  parseAiWorkItemProposal,
  type AiWorkItemProposal,
} from './ai-drafts';
import type { WorkItemPriority } from './domain';
import {
  WEEKLY_SUGGESTION_PROMPT_VERSION,
  WEEKLY_SUGGESTION_SCHEMA_VERSION,
  buildWeeklySuggestionBasis,
  buildWeeklySuggestionCandidates,
  evaluateWeeklySuggestionStaleness,
  fallbackWeeklySuggestions,
  validateWeeklySuggestionModelOutput,
  type WeeklySuggestionCandidate,
  type WeeklySuggestionModelItem,
  type WeeklySuggestionProposalView,
  type WeeklySuggestionProjectFact,
  type WeeklySuggestionWorkItemFact,
} from './weekly-report-suggestions';
import { readOwnWeeklyReport } from './weekly-reports-server';

export class WeeklySuggestionServiceError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'WeeklySuggestionServiceError';
  }
}

function fail(
  status: number,
  code: string,
  message: string,
): never {
  throw new WeeklySuggestionServiceError(status, code, message);
}

function nowIso(): string {
  return new Date().toISOString();
}

function requestId(): string {
  return globalThis.crypto.randomUUID();
}

function providerModel(provider: string): string | null {
  if (provider === 'deepseek') {
    return process.env.DEEPSEEK_MODEL || 'deepseek-chat';
  }
  if (provider === 'openai') {
    return process.env.OPENAI_MODEL || 'gpt-4o';
  }
  return 'mock';
}

function requireAdminStore(): any {
  const admin = createAdminSupabaseClient();
  if (!admin) {
    fail(503, 'AI_DRAFT_STORE_UNAVAILABLE', 'AI 建议存储暂不可用。');
  }
  return admin;
}

async function writeAudit(
  admin: any,
  input: {
    orgId: string;
    draftId: string;
    action: string;
    actorProfileId: string;
    beforeValues: Record<string, unknown> | null;
    afterValues: Record<string, unknown> | null;
    metadata: Record<string, unknown>;
  },
): Promise<void> {
  const result = await admin
    .from('cpc_audit_log')
    .insert({
      org_id: input.orgId,
      entity_type: 'AI_DRAFT',
      entity_id: input.draftId,
      action: input.action,
      actor_profile_id: input.actorProfileId,
      before_values: input.beforeValues,
      after_values: input.afterValues,
      metadata: input.metadata,
      request_id: requestId(),
    });
  if (result.error) {
    fail(500, 'INTERNAL_ERROR', '周报建议审计写入失败，请稍后重试。');
  }
}

async function loadCandidateFacts(
  session: any,
  profile: CpcProfile,
): Promise<{
  projects: WeeklySuggestionProjectFact[];
  workItems: WeeklySuggestionWorkItemFact[];
}> {
  const projectResult = await session
    .from('cpc_projects')
    .select('id,title,customer_reference_id,owner_profile_id,status,waiting_on,next_check_at,priority')
    .eq('org_id', profile.orgId)
    .eq('owner_profile_id', profile.id)
    .eq('status', 'active')
    .order('priority', { ascending: false })
    .limit(100);
  if (projectResult.error) {
    fail(500, 'INTERNAL_ERROR', '周报项目依据读取失败，请稍后重试。');
  }

  const projectRows = projectResult.data ?? [];
  const projectCustomerMap = new Map<string, string>();
  const ownedProjectIds = new Set(
    projectRows
      .map((row: any) => row.id)
      .filter((value: unknown): value is string => typeof value === 'string'),
  );
  for (const row of projectRows) {
    if (
      typeof row.id === 'string'
      && typeof row.customer_reference_id === 'string'
    ) {
      projectCustomerMap.set(row.id, row.customer_reference_id);
    }
  }
  const workItemResult = await session
    .from('cpc_work_items')
    .select('id,customer_reference_id,project_id,work_item_type,title,due_at,status,priority,blocked_reason,assignee_profile_id,created_by_profile_id')
    .eq('org_id', profile.orgId)
    .or(`assignee_profile_id.eq.${profile.id},created_by_profile_id.eq.${profile.id}`)
    .order('due_at', { ascending: true, nullsFirst: false })
    .limit(200);
  if (workItemResult.error) {
    fail(500, 'INTERNAL_ERROR', '周报任务依据读取失败，请稍后重试。');
  }

  const workItems: WeeklySuggestionWorkItemFact[] = [];
  const openNextActionProjectIds = new Set<string>();
  for (const row of workItemResult.data ?? []) {
    const projectId = typeof row.project_id === 'string' ? row.project_id : null;
    if (projectId && !ownedProjectIds.has(projectId)) continue;
    const fact: WeeklySuggestionWorkItemFact = {
      id: row.id,
      customerReferenceId:
        typeof row.customer_reference_id === 'string'
          ? row.customer_reference_id
          : projectId
            ? projectCustomerMap.get(projectId) ?? null
            : null,
      projectId,
      workItemType: row.work_item_type,
      title: row.title,
      dueAt: typeof row.due_at === 'string' ? row.due_at : null,
      status: row.status,
      priority: row.priority,
      blockedReason:
        typeof row.blocked_reason === 'string' ? row.blocked_reason : null,
    };
    workItems.push(fact);
    if (
      fact.workItemType === 'NEXT_ACTION'
      && ['pending', 'in_progress', 'blocked'].includes(fact.status)
      && fact.projectId
    ) {
      openNextActionProjectIds.add(fact.projectId);
    }
  }

  return {
    projects: projectRows.map((row: any): WeeklySuggestionProjectFact => ({
      id: row.id,
      title: row.title,
      customerReferenceId: row.customer_reference_id,
      waitingOn: row.waiting_on,
      nextCheckAt: typeof row.next_check_at === 'string' ? row.next_check_at : null,
      priority: row.priority as WorkItemPriority,
      hasOpenNextAction: openNextActionProjectIds.has(row.id),
    })),
    workItems,
  };
}

function candidatePromptPayload(candidates: WeeklySuggestionCandidate[]) {
  return candidates.map(candidate => ({
    candidateId: candidate.candidateId,
    action: candidate.action,
    workItemType: candidate.workItemType,
    target: candidate.projectId ? 'PROJECT' : 'CUSTOMER',
    suggestedTitle: candidate.title,
    confirmedRationale: candidate.rationale,
    evidence: candidate.evidence,
  }));
}

async function generateSuggestionItems(
  candidates: WeeklySuggestionCandidate[],
  reportId: string,
  deterministicMetrics: Record<string, unknown>,
): Promise<{
  items: WeeklySuggestionModelItem[];
  provider: string;
  model: string | null;
  generatedAt: string;
}> {
  if (candidates.length === 0) {
    return {
      items: [],
      provider: 'none',
      model: null,
      generatedAt: nowIso(),
    };
  }

  const provider = await getProvider();
  const response = await provider.generateStructured({
    systemPrompt: [
      '你是宏达印业客户项目中心的周度下一步建议助手。',
      '只能从用户 JSON 给出的候选 ID 中选择，不得新增项目、客户、金额、回款、收据或订单事实。',
      '每条建议必须具体、可执行，并保留 confirmedRationale 中的业务依据。',
      '不得排名员工、评价绩效、态度或积极性，不得使用消息数、记录数、点击量作为依据。',
      '不得直接修改客户、项目、归属、阶段、生命周期、金额或到期日。',
      '只输出 JSON: {"suggestions":[{"candidateId":"...","title":"...","description":"...","rationale":"...","priority":"low|medium|high|critical"}]}。',
    ].join('\n'),
    userPrompt: JSON.stringify({
      reportId,
      deterministicMetrics,
      candidates: candidatePromptPayload(candidates),
    }),
    outputFormat: 'json',
    temperature: 0.2,
    maxTokens: 900,
  });

  const items = response.mock
    ? fallbackWeeklySuggestions(candidates)
    : validateWeeklySuggestionModelOutput(response.parsed, candidates);
  if (!response.mock && items.length === 0) {
    fail(502, 'AI_OUTPUT_INVALID', 'AI 周报建议输出无效，未保存任何提案。');
  }

  return {
    items,
    provider: response.provider,
    model: providerModel(response.provider),
    generatedAt: nowIso(),
  };
}

async function expirePriorWeeklySuggestions(
  admin: any,
  profile: CpcProfile,
  reportId: string,
): Promise<void> {
  const result = await admin
    .from('cpc_ai_drafts')
    .select('id,version')
    .eq('org_id', profile.orgId)
    .eq('created_by_profile_id', profile.id)
    .eq('proposal_type', 'WORK_ITEM')
    .eq('status', 'draft')
    .contains('structured_proposal', { weeklyBasis: { reportId } });
  if (result.error) {
    fail(500, 'INTERNAL_ERROR', '旧周报建议读取失败，请稍后重试。');
  }

  for (const row of result.data ?? []) {
    const updated = await admin
      .from('cpc_ai_drafts')
      .update({
        status: 'expired',
        version: row.version + 1,
        updated_at: nowIso(),
      })
      .eq('id', row.id)
      .eq('org_id', profile.orgId)
      .eq('created_by_profile_id', profile.id)
      .eq('status', 'draft')
      .eq('version', row.version)
      .select('id')
      .maybeSingle();
    if (updated.error) {
      fail(500, 'INTERNAL_ERROR', '旧周报建议过期失败，请稍后重试。');
    }
  }
}

export async function generateWeeklySuggestions(
  session: any,
  profile: CpcProfile,
  reportId: string,
): Promise<WeeklySuggestionProposalView[]> {
  const report = await readOwnWeeklyReport(session, profile, reportId);
  if (report.status !== 'draft') {
    fail(409, 'REPORT_NOT_DRAFT', '只有草稿周报可以生成下一步建议。');
  }

  const facts = await loadCandidateFacts(session, profile);
  const candidates = buildWeeklySuggestionCandidates({
    projects: facts.projects,
    workItems: facts.workItems,
    periodEnd: report.periodEnd,
  });
  const generated = await generateSuggestionItems(
    candidates,
    report.id,
    report.deterministicMetrics,
  );
  const candidateMap = new Map(
    candidates.map(candidate => [candidate.candidateId, candidate]),
  );
  const basis = buildWeeklySuggestionBasis(report);
  const admin = requireAdminStore();

  await expirePriorWeeklySuggestions(admin, profile, report.id);

  for (const item of generated.items) {
    const candidate = candidateMap.get(item.candidateId);
    if (!candidate) continue;

    const rawInput = JSON.stringify({
      reportId: report.id,
      reportVersion: report.version,
      reportRevisionNo: report.revisionNo,
      promptVersion: WEEKLY_SUGGESTION_PROMPT_VERSION,
      candidateId: candidate.candidateId,
      rationale: item.rationale,
      evidence: candidate.evidence,
      provider: generated.provider,
      model: generated.model,
      generatedAt: generated.generatedAt,
    });
    const created = await session.rpc('cpc_create_ai_work_item_draft', {
      p_customer_reference_id: candidate.customerReferenceId,
      p_project_id: candidate.projectId,
      p_work_item_type: candidate.workItemType,
      p_title: item.title,
      p_description: item.description,
      p_due_at: candidate.dueAt,
      p_priority: item.priority,
      p_raw_input: rawInput,
      p_expires_at: null,
      p_request_id: requestId(),
    });
    if (created.error) {
      fail(500, 'INTERNAL_ERROR', '周报建议创建失败，请稍后重试。');
    }
    const envelope = created.data;
    if (!envelope || envelope.ok !== true || envelope.code !== 'OK') {
      const code = typeof envelope?.code === 'string'
        ? envelope.code
        : 'INTERNAL_ERROR';
      fail(
        code === 'FORBIDDEN' ? 403 : 422,
        code,
        code === 'FORBIDDEN'
          ? '无权为该项目或客户创建建议。'
          : '周报建议内容无效。',
      );
    }
    const draftId = envelope.data?.ai_draft_id;
    if (typeof draftId !== 'string') {
      fail(500, 'INTERNAL_ERROR', '周报建议创建结果无效。');
    }

    const proposal: AiWorkItemProposal = {
      schemaVersion: 1,
      action: 'CREATE_WORK_ITEM',
      workItemType: candidate.workItemType,
      title: item.title,
      description: item.description,
      dueAt: candidate.dueAt,
      priority: item.priority,
      weeklyBasis: basis,
      rationale: item.rationale,
      candidateId: candidate.candidateId,
    };
    const updated = await admin
      .from('cpc_ai_drafts')
      .update({
        structured_proposal: proposal,
        proposal_schema_version: WEEKLY_SUGGESTION_SCHEMA_VERSION,
        updated_at: nowIso(),
      })
      .eq('id', draftId)
      .eq('org_id', profile.orgId)
      .eq('created_by_profile_id', profile.id)
      .eq('status', 'draft')
      .eq('version', 1)
      .select('id')
      .maybeSingle();
    if (updated.error || !updated.data) {
      fail(500, 'INTERNAL_ERROR', '周报建议依据保存失败，请稍后重试。');
    }

    await writeAudit(admin, {
      orgId: profile.orgId,
      draftId,
      action: 'WEEKLY_REPORT_SUGGESTION_GENERATED',
      actorProfileId: profile.id,
      beforeValues: null,
      afterValues: {
        status: 'draft',
        version: 1,
      },
      metadata: {
        report_id: report.id,
        report_version: report.version,
        report_revision_no: report.revisionNo,
        deterministic_metrics_fingerprint:
          basis.deterministicMetricsFingerprint,
        source_event_seq: basis.sourceEventSeq,
        source_audit_seq: basis.sourceAuditSeq,
        candidate_id: candidate.candidateId,
        provider: generated.provider,
        model: generated.model,
        prompt_version: WEEKLY_SUGGESTION_PROMPT_VERSION,
      },
    });
  }

  return listWeeklySuggestions(session, profile, reportId);
}

export async function listWeeklySuggestions(
  session: any,
  profile: CpcProfile,
  reportId: string,
): Promise<WeeklySuggestionProposalView[]> {
  const report = await readOwnWeeklyReport(session, profile, reportId);
  const result = await session
    .from('cpc_ai_drafts')
    .select('id,structured_proposal,status,version,created_at,updated_at,expires_at')
    .eq('org_id', profile.orgId)
    .eq('created_by_profile_id', profile.id)
    .eq('proposal_type', 'WORK_ITEM')
    .contains('structured_proposal', { weeklyBasis: { reportId } })
    .order('created_at', { ascending: false })
    .limit(50);
  if (result.error) {
    fail(500, 'INTERNAL_ERROR', '周报建议读取失败，请稍后重试。');
  }

  const suggestions: WeeklySuggestionProposalView[] = [];
  for (const row of result.data ?? []) {
    const proposal = parseAiWorkItemProposal(row.structured_proposal);
    if (!proposal?.weeklyBasis || !proposal.rationale || !proposal.candidateId) {
      continue;
    }
    const traceableProposal = proposal as WeeklySuggestionProposalView['proposal'];
    if (
      row.status !== 'draft'
      && row.status !== 'accepted'
      && row.status !== 'rejected'
      && row.status !== 'expired'
    ) {
      continue;
    }

    const staleReasons = evaluateWeeklySuggestionStaleness(
      traceableProposal,
      report,
      row.status,
    );
    const expiresAt =
      typeof row.expires_at === 'string' ? row.expires_at : null;
    const isExpired = expiresAt !== null
      && Number.isFinite(new Date(expiresAt).getTime())
      && new Date(expiresAt).getTime() <= Date.now();
    if (row.status === 'draft' && isExpired) {
      staleReasons.push('PROPOSAL_EXPIRED');
    }

    suggestions.push({
      id: row.id,
      status: row.status,
      proposal: traceableProposal,
      version: row.version,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      expiresAt,
      isStale: staleReasons.length > 0,
      staleReasons: Array.from(new Set(staleReasons)),
      canAccept:
        row.status === 'draft'
        && report.status === 'draft'
        && staleReasons.length === 0,
      canReject: row.status === 'draft',
    });
  }
  return suggestions;
}

export async function assertWeeklySuggestionAcceptable(
  session: any,
  profile: CpcProfile,
  draftId: string,
): Promise<void> {
  const proposal = await assertWeeklySuggestionOwned(session, profile, draftId);
  if (!proposal?.weeklyBasis) return;

  const report = await readOwnWeeklyReport(
    session,
    profile,
    proposal.weeklyBasis.reportId,
  );
  if (report.status !== 'draft') {
    fail(409, 'REPORT_NOT_DRAFT', '周报已提交，旧建议不能继续接受。');
  }
  const staleReasons = evaluateWeeklySuggestionStaleness(
    proposal,
    report,
    'draft',
  );
  if (staleReasons.length > 0) {
    fail(409, 'WEEKLY_SUGGESTION_STALE', '周报事实已变化，请重新生成建议。');
  }
}

export async function assertWeeklySuggestionOwned(
  session: any,
  profile: CpcProfile,
  draftId: string,
): Promise<AiWorkItemProposal | null> {
  const result = await session
    .from('cpc_ai_drafts')
    .select('id,structured_proposal,status,version,created_by_profile_id')
    .eq('id', draftId)
    .eq('org_id', profile.orgId)
    .eq('proposal_type', 'WORK_ITEM')
    .maybeSingle();
  if (result.error) {
    fail(500, 'INTERNAL_ERROR', '周报建议读取失败，请稍后重试。');
  }
  if (!result.data) return null;

  const proposal = parseAiWorkItemProposal(result.data.structured_proposal);
  if (!proposal?.weeklyBasis) return proposal;
  if (result.data.created_by_profile_id !== profile.id) {
    fail(403, 'FORBIDDEN', '只有员工本人可以处理自己的周报建议。');
  }
  return proposal;
}
