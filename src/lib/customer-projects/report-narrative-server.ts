// @server-only
// This module performs application-authorized report narrative mutations.
// Browser components must use the /api/customer-projects/reports APIs instead.

import { getProvider } from '@/lib/ai/providers/factory';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import type { CpcProfile } from './api';
import { derivedReportSnapshotSchema } from './schemas';
import type { DailyReportListItem } from './reports';
import {
  REPORT_NARRATIVE_PROMPT_VERSION,
  REPORT_NARRATIVE_PROPOSAL_TYPE,
  REPORT_NARRATIVE_SCHEMA_VERSION,
  buildReportNarrativeBasis,
  buildReportNarrativeFactLines,
  buildReportNarrativePromptInput,
  evaluateReportNarrativeStaleness,
  parseReportNarrativeProposal,
  parseReportNarrativeStatus,
  validateReportNarrativeText,
  type ReportNarrativeProposal,
  type ReportNarrativeProposalView,
  type ReportNarrativeProviderMetadata,
  type ReportNarrativeProviderName,
  type ReportNarrativeState,
} from './report-narrative';

const REPORT_SELECT = [
  'id',
  'org_id',
  'subject_profile_id',
  'period_type',
  'period_start',
  'period_end',
  'revision_no',
  'status',
  'metrics_schema_version',
  'deterministic_metrics',
  'narrative',
  'unknowns',
  'source_event_seq',
  'source_audit_seq',
  'supersedes_report_id',
  'created_by_profile_id',
  'submitted_by_profile_id',
  'submitted_at',
  'version',
  'created_at',
  'updated_at',
].join(',');

const PROPOSAL_SELECT = [
  'id',
  'proposal_type',
  'structured_proposal',
  'status',
  'created_by_profile_id',
  'expires_at',
  'version',
  'created_at',
  'updated_at',
].join(',');

export class ReportNarrativeServiceError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ReportNarrativeServiceError';
  }
}

function fail(
  status: number,
  code: string,
  message: string,
): never {
  throw new ReportNarrativeServiceError(status, code, message);
}

function nowIso(): string {
  return new Date().toISOString();
}

function requestId(): string {
  return globalThis.crypto.randomUUID();
}

function toDailyReportListItem(row: unknown): DailyReportListItem | null {
  const parsed = derivedReportSnapshotSchema.safeParse(row);
  if (!parsed.success || parsed.data.period_type !== 'daily') return null;

  const report = parsed.data;
  return {
    id: report.id,
    periodType: 'daily',
    periodStart: report.period_start,
    periodEnd: report.period_end,
    revisionNo: report.revision_no,
    status: report.status,
    metricsSchemaVersion: report.metrics_schema_version,
    deterministicMetrics: report.deterministic_metrics,
    narrative: report.narrative,
    unknowns: report.unknowns,
    sourceEventSeq: report.source_event_seq,
    sourceAuditSeq: report.source_audit_seq,
    supersedesReportId: report.supersedes_report_id,
    submittedAt: report.submitted_at,
    version: report.version,
    createdAt: report.created_at,
    updatedAt: report.updated_at,
  };
}

async function loadOwnDailyReport(
  session: any,
  profile: CpcProfile,
  reportId: string,
): Promise<DailyReportListItem> {
  const result = await session
    .from('cpc_reports')
    .select(REPORT_SELECT)
    .eq('id', reportId)
    .eq('org_id', profile.orgId)
    .eq('subject_profile_id', profile.id)
    .eq('period_type', 'daily')
    .maybeSingle();

  if (result.error) {
    fail(500, 'INTERNAL_ERROR', '日报读取失败，请稍后重试。');
  }

  const report = result.data ? toDailyReportListItem(result.data) : null;
  if (!report) {
    fail(404, 'NOT_FOUND', '日报不存在或无权访问。');
  }
  return report;
}

function proposalView(
  row: any,
  report: DailyReportListItem,
): ReportNarrativeProposalView | null {
  if (
    !row
    || row.proposal_type !== REPORT_NARRATIVE_PROPOSAL_TYPE
    || typeof row.id !== 'string'
    || typeof row.version !== 'number'
    || !Number.isInteger(row.version)
    || row.version < 1
    || typeof row.created_at !== 'string'
    || typeof row.updated_at !== 'string'
  ) {
    return null;
  }

  const status = parseReportNarrativeStatus(row.status);
  const proposal = parseReportNarrativeProposal(row.structured_proposal);
  if (!status || !proposal || proposal.basis.reportId !== report.id) {
    return null;
  }

  const staleReasons = evaluateReportNarrativeStaleness(
    proposal,
    report,
    status,
  );

  const expiresAt =
    typeof row.expires_at === 'string' ? row.expires_at : null;
  const isExpired = expiresAt !== null
    && Number.isFinite(new Date(expiresAt).getTime())
    && new Date(expiresAt).getTime() <= Date.now();
  if (status === 'draft' && isExpired) {
    staleReasons.push('PROPOSAL_EXPIRED');
  }

  return {
    id: row.id,
    proposalType: 'REPORT_NARRATIVE',
    status,
    narrative: proposal.narrative,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    expiresAt,
    provider: proposal.provider,
    basis: proposal.basis,
    acceptance: proposal.acceptance,
    isStale: staleReasons.length > 0,
    staleReasons: Array.from(new Set(staleReasons)),
    canAccept:
      status === 'draft'
      && report.status === 'draft'
      && staleReasons.length === 0,
    canReject: status === 'draft',
  };
}

async function loadNarrativeProposalRows(
  session: any,
  profile: CpcProfile,
  reportId: string,
): Promise<any[]> {
  const result = await session
    .from('cpc_ai_drafts')
    .select(PROPOSAL_SELECT)
    .eq('org_id', profile.orgId)
    .eq('created_by_profile_id', profile.id)
    .eq('proposal_type', REPORT_NARRATIVE_PROPOSAL_TYPE)
    .contains('structured_proposal', { basis: { reportId } })
    .order('created_at', { ascending: false })
    .limit(20);

  if (result.error) {
    fail(500, 'INTERNAL_ERROR', 'AI 摘要建议读取失败，请稍后重试。');
  }
  return result.data ?? [];
}

async function loadNarrativeProposalRow(
  session: any,
  profile: CpcProfile,
  reportId: string,
  proposalId: string,
): Promise<any | null> {
  const result = await session
    .from('cpc_ai_drafts')
    .select(PROPOSAL_SELECT)
    .eq('id', proposalId)
    .eq('org_id', profile.orgId)
    .eq('created_by_profile_id', profile.id)
    .eq('proposal_type', REPORT_NARRATIVE_PROPOSAL_TYPE)
    .maybeSingle();

  if (result.error) {
    fail(500, 'INTERNAL_ERROR', 'AI 摘要建议读取失败，请稍后重试。');
  }
  if (!result.data) {
    fail(404, 'NOT_FOUND', 'AI 摘要建议不存在或无权访问。');
  }

  const proposal = parseReportNarrativeProposal(
    result.data.structured_proposal,
  );
  if (!proposal || proposal.basis.reportId !== reportId) {
    fail(404, 'NOT_FOUND', 'AI 摘要建议不存在或无权访问。');
  }
  return result.data;
}

function buildState(
  report: DailyReportListItem,
  rows: any[],
): ReportNarrativeState {
  const views = rows
    .map(row => proposalView(row, report))
    .filter((view): view is ReportNarrativeProposalView => view !== null)
    .sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt)
      || b.createdAt.localeCompare(a.createdAt),
    );

  const pendingProposal = views.find(view => view.status === 'draft') ?? null;
  const acceptedProposal = views.find(view => view.status === 'accepted') ?? null;

  return {
    reportId: report.id,
    reportVersion: report.version,
    reportStatus: report.status,
    formalNarrative: report.narrative,
    pendingProposal,
    acceptedProposal,
    acceptedNarrativeStale: acceptedProposal?.isStale ?? false,
  };
}

export async function readReportNarrativeState(
  session: any,
  profile: CpcProfile,
  reportId: string,
): Promise<ReportNarrativeState> {
  const report = await loadOwnDailyReport(session, profile, reportId);
  const rows = await loadNarrativeProposalRows(session, profile, reportId);
  return buildState(report, rows);
}

function providerModel(
  provider: ReportNarrativeProviderName,
): string | null {
  if (provider === 'deepseek') {
    return process.env.DEEPSEEK_MODEL || 'deepseek-chat';
  }
  if (provider === 'openai') {
    return process.env.OPENAI_MODEL || 'gpt-4o';
  }
  return 'mock';
}

function composeSafeMockNarrative(report: DailyReportListItem): string {
  const facts = buildReportNarrativeFactLines(report);
  const positive = facts
    .filter(fact => fact.state === 'known' && (fact.value ?? 0) > 0)
    .slice(0, 5)
    .map(fact => `${fact.label}${fact.value}项`);
  const unknown = facts
    .filter(fact => fact.state === 'unknown')
    .slice(0, 3)
    .map(fact => `${fact.label}尚未确认`);

  const progress = positive.length > 0
    ? `本日确定性日报记录：${positive.join('、')}。`
    : '本日未记录可重建的 CPC 有效推进事件，这不等同于没有工作，也不代表外部订单或回款为零。';
  const uncertainty = unknown.length > 0
    ? `另有${unknown.join('、')}。`
    : '';
  const next = report.status === 'draft'
    ? '请员工复核事实后再决定是否接受为正式日报摘要。'
    : '该摘要基于已提交的日报快照，不再修改正式报告。';

  return progress + uncertainty + next;
}

async function generateNarrativeText(
  report: DailyReportListItem,
): Promise<{
  narrative: string;
  provider: ReportNarrativeProviderMetadata;
}> {
  const promptInput = buildReportNarrativePromptInput(report);
  const provider = await getProvider();
  const response = await provider.generateStructured({
    systemPrompt: [
      '你是宏达印业的日报摘要助手。',
      '只允许依据输入 JSON 中明确给出的 CPC 确定事实和未知项写 2-4 句简洁中文。',
      '只围绕有效推进、项目阶段/状态/等待变化、下一步、客户承诺及日末逾期、',
      '内部协作与管理决策、老客户回访、已确认报价/样品/商务/订单事件、阻塞和未知项。',
      '不得推断缺失的外部订单、回款、收据、报价或客户归属数据。',
      '缺失集成或未知数据不得写成 0、没有订单、没有回款、没有工作或等价结论。',
      '不得排名员工、评价绩效或态度，不得把消息数、点击数、记录数当作绩效证据。',
      '只输出 JSON: {"narrative":"..."}，不要输出 Markdown。',
    ].join('\n'),
    userPrompt: JSON.stringify(promptInput),
    outputFormat: 'json',
    temperature: 0.2,
    maxTokens: 700,
  });

  const generatedProvider = response.provider;
  const narrative = response.mock
    ? composeSafeMockNarrative(report)
    : validateReportNarrativeText(response.parsed?.narrative);

  if (!narrative) {
    fail(502, 'AI_OUTPUT_INVALID', 'AI 摘要输出无效，未保存任何提案。');
  }

  return {
    narrative,
    provider: {
      provider: generatedProvider,
      model: providerModel(generatedProvider),
      generatedAt: nowIso(),
    },
  };
}

async function writeAudit(
  admin: any,
  input: {
    orgId: string;
    entityId: string;
    entityType?: 'AI_DRAFT' | 'REPORT';
    action: string;
    actorProfileId: string;
    beforeValues: Record<string, unknown> | null;
    afterValues: Record<string, unknown> | null;
    metadata: Record<string, unknown>;
    reason?: string | null;
  },
): Promise<void> {
  const result = await admin
    .from('cpc_audit_log')
    .insert({
      org_id: input.orgId,
      entity_type: input.entityType ?? 'AI_DRAFT',
      entity_id: input.entityId,
      action: input.action,
      actor_profile_id: input.actorProfileId,
      reason: input.reason ?? null,
      before_values: input.beforeValues,
      after_values: input.afterValues,
      metadata: input.metadata,
      request_id: requestId(),
    });

  if (result.error) {
    fail(500, 'INTERNAL_ERROR', 'AI 摘要审计写入失败，请稍后重试。');
  }
}

function requireAdminStore(): any {
  const admin = createAdminSupabaseClient();
  if (!admin) {
    fail(503, 'AI_DRAFT_STORE_UNAVAILABLE', 'AI 摘要存储暂不可用。');
  }
  return admin;
}

export async function generateReportNarrative(
  session: any,
  profile: CpcProfile,
  reportId: string,
): Promise<ReportNarrativeState> {
  const report = await loadOwnDailyReport(session, profile, reportId);
  if (report.status !== 'draft') {
    fail(409, 'REPORT_NOT_DRAFT', '只有草稿日报可以生成或刷新 AI 摘要。');
  }

  const existingRows = await loadNarrativeProposalRows(
    session,
    profile,
    reportId,
  );
  const pendingRow = existingRows.find(row => row.status === 'draft') ?? null;
  const generated = await generateNarrativeText(report);
  const basis = buildReportNarrativeBasis(report);
  const proposal: ReportNarrativeProposal = {
    schemaVersion: REPORT_NARRATIVE_SCHEMA_VERSION,
    action: 'REPORT_NARRATIVE',
    narrative: generated.narrative,
    basis,
    generationRequest: {
      promptVersion: REPORT_NARRATIVE_PROMPT_VERSION,
      requestedAt: nowIso(),
      factSource: 'DETERMINISTIC_REPORT_SNAPSHOT',
      externalIntegrationPolicy: 'UNKNOWN_NOT_ZERO',
    },
    provider: generated.provider,
    acceptance: null,
  };

  const admin = requireAdminStore();
  const timestamp = nowIso();
  const rawInput =
    `日报 AI 摘要生成请求：${report.periodStart}，仅使用确定性日报快照。`;
  let aiDraftId: string;

  if (pendingRow) {
    const updated = await admin
      .from('cpc_ai_drafts')
      .update({
        raw_input: rawInput,
        structured_proposal: proposal,
        proposal_schema_version: REPORT_NARRATIVE_SCHEMA_VERSION,
        expires_at: null,
        version: pendingRow.version + 1,
        updated_at: timestamp,
      })
      .eq('id', pendingRow.id)
      .eq('org_id', profile.orgId)
      .eq('created_by_profile_id', profile.id)
      .eq('status', 'draft')
      .eq('version', pendingRow.version)
      .select('id')
      .maybeSingle();

    if (updated.error) {
      fail(500, 'INTERNAL_ERROR', 'AI 摘要提案更新失败，请稍后重试。');
    }
    if (!updated.data) {
      fail(409, 'VERSION_CONFLICT', 'AI 摘要提案已经变化，请刷新后重试。');
    }
    aiDraftId = updated.data.id;
  } else {
    const inserted = await admin
      .from('cpc_ai_drafts')
      .insert({
        org_id: profile.orgId,
        customer_reference_id: null,
        project_id: null,
        proposal_type: REPORT_NARRATIVE_PROPOSAL_TYPE,
        raw_input: rawInput,
        structured_proposal: proposal,
        proposal_schema_version: REPORT_NARRATIVE_SCHEMA_VERSION,
        status: 'draft',
        created_by_profile_id: profile.id,
        expires_at: null,
        version: 1,
        created_at: timestamp,
        updated_at: timestamp,
      })
      .select('id')
      .maybeSingle();

    if (inserted.error || !inserted.data?.id) {
      fail(500, 'INTERNAL_ERROR', 'AI 摘要提案创建失败，请稍后重试。');
    }
    aiDraftId = inserted.data.id;
  }

  await writeAudit(admin, {
    orgId: profile.orgId,
    entityId: aiDraftId,
    action: pendingRow
      ? 'REPORT_NARRATIVE_REGENERATED'
      : 'REPORT_NARRATIVE_GENERATED',
    actorProfileId: profile.id,
    beforeValues: pendingRow
      ? { status: 'draft', version: pendingRow.version }
      : null,
    afterValues: { status: 'draft', version: pendingRow ? pendingRow.version + 1 : 1 },
    metadata: {
      report_id: report.id,
      report_version: report.version,
      report_revision_no: report.revisionNo,
      metrics_schema_version: report.metricsSchemaVersion,
      deterministic_metrics_fingerprint: basis.deterministicMetricsFingerprint,
      source_event_seq: report.sourceEventSeq,
      source_audit_seq: report.sourceAuditSeq,
      provider: generated.provider.provider,
      model: generated.provider.model,
      prompt_version: REPORT_NARRATIVE_PROMPT_VERSION,
    },
  });

  return readReportNarrativeState(session, profile, reportId);
}

export async function acceptReportNarrative(
  session: any,
  profile: CpcProfile,
  reportId: string,
  proposalId: string,
  expectedProposalVersion: number,
  expectedReportVersion: number,
): Promise<ReportNarrativeState> {
  const report = await loadOwnDailyReport(session, profile, reportId);
  if (report.status !== 'draft') {
    fail(409, 'REPORT_NOT_DRAFT', '已提交日报不可修改。');
  }

  const row = await loadNarrativeProposalRow(
    session,
    profile,
    reportId,
    proposalId,
  );
  if (!row || row.version !== expectedProposalVersion) {
    fail(409, 'VERSION_CONFLICT', 'AI 摘要版本已经变化，请刷新后重试。');
  }
  if (row.status !== 'draft') {
    fail(409, 'INVALID_TRANSITION', 'AI 摘要已经处理，不能重复接受。');
  }
  if (
    row.expires_at
    && Number.isFinite(new Date(row.expires_at).getTime())
    && new Date(row.expires_at).getTime() <= Date.now()
  ) {
    const admin = requireAdminStore();
    const expiredVersion = expectedProposalVersion + 1;
    const expiredAt = nowIso();
    const expired = await admin
      .from('cpc_ai_drafts')
      .update({
        status: 'expired',
        version: expiredVersion,
        updated_at: expiredAt,
      })
      .eq('id', proposalId)
      .eq('org_id', profile.orgId)
      .eq('created_by_profile_id', profile.id)
      .eq('status', 'draft')
      .eq('version', expectedProposalVersion)
      .select('id')
      .maybeSingle();

    if (expired.error) {
      fail(500, 'INTERNAL_ERROR', 'AI 摘要过期状态写入失败，请稍后重试。');
    }
    if (!expired.data) {
      fail(409, 'VERSION_CONFLICT', 'AI 摘要版本已经变化，请刷新后重试。');
    }
    await writeAudit(admin, {
      orgId: profile.orgId,
      entityId: proposalId,
      action: 'REPORT_NARRATIVE_EXPIRED',
      actorProfileId: profile.id,
      beforeValues: {
        status: 'draft',
        version: expectedProposalVersion,
      },
      afterValues: {
        status: 'expired',
        version: expiredVersion,
      },
      metadata: {
        report_id: report.id,
        formal_report_changed: false,
      },
    });
    fail(409, 'DRAFT_EXPIRED', 'AI 摘要已过期，请重新生成。');
  }
  if (report.version !== expectedReportVersion) {
    fail(409, 'VERSION_CONFLICT', '日报版本已经变化，请刷新后重试。');
  }

  const proposal = parseReportNarrativeProposal(row.structured_proposal);
  if (!proposal || proposal.basis.reportId !== report.id) {
    fail(422, 'INVALID_INPUT', 'AI 摘要提案无效。');
  }

  const staleReasons = evaluateReportNarrativeStaleness(
    proposal,
    report,
    'draft',
  );
  if (staleReasons.length > 0) {
    fail(409, 'NARRATIVE_STALE', '日报事实已变化，请重新生成后再审核。');
  }

  const admin = requireAdminStore();
  const timestamp = nowIso();
  const acceptedReportVersion = report.version + 1;
  const acceptedProposal: ReportNarrativeProposal = {
    ...proposal,
    acceptance: {
      acceptedReportVersion,
      acceptedAt: timestamp,
    },
  };
  const proposedAiVersion = expectedProposalVersion + 1;

  const proposalUpdate = await admin
    .from('cpc_ai_drafts')
    .update({
      status: 'accepted',
      accepted_by_profile_id: profile.id,
      accepted_at: timestamp,
      structured_proposal: acceptedProposal,
      version: proposedAiVersion,
      updated_at: timestamp,
    })
    .eq('id', proposalId)
    .eq('org_id', profile.orgId)
    .eq('created_by_profile_id', profile.id)
    .eq('status', 'draft')
    .eq('version', expectedProposalVersion)
    .select('id')
    .maybeSingle();

  if (proposalUpdate.error) {
    fail(500, 'INTERNAL_ERROR', 'AI 摘要接受失败，请稍后重试。');
  }
  if (!proposalUpdate.data) {
    fail(409, 'VERSION_CONFLICT', 'AI 摘要版本已经变化，请刷新后重试。');
  }

  const reportUpdate = await admin
    .from('cpc_reports')
    .update({
      narrative: proposal.narrative,
      version: acceptedReportVersion,
      updated_at: timestamp,
    })
    .eq('id', report.id)
    .eq('org_id', profile.orgId)
    .eq('subject_profile_id', profile.id)
    .eq('status', 'draft')
    .eq('version', expectedReportVersion)
    .select('id,version')
    .maybeSingle();

  if (reportUpdate.error || !reportUpdate.data) {
    await admin
      .from('cpc_ai_drafts')
      .update({
        status: 'draft',
        accepted_by_profile_id: null,
        accepted_at: null,
        structured_proposal: proposal,
        version: proposedAiVersion + 1,
        updated_at: nowIso(),
      })
      .eq('id', proposalId)
      .eq('org_id', profile.orgId)
      .eq('created_by_profile_id', profile.id)
      .eq('status', 'accepted')
      .eq('version', proposedAiVersion);

    fail(409, 'VERSION_CONFLICT', '日报版本已经变化，请刷新后重试。');
  }

  await writeAudit(admin, {
    orgId: profile.orgId,
    entityId: proposalId,
    action: 'REPORT_NARRATIVE_ACCEPTED',
    actorProfileId: profile.id,
    beforeValues: {
      status: 'draft',
      version: expectedProposalVersion,
      report_version: expectedReportVersion,
    },
    afterValues: {
      status: 'accepted',
      version: proposedAiVersion,
      report_version: acceptedReportVersion,
    },
    metadata: {
      report_id: report.id,
      deterministic_metrics_fingerprint:
        proposal.basis.deterministicMetricsFingerprint,
      formal_metrics_changed: false,
    },
  });

  await writeAudit(admin, {
    orgId: profile.orgId,
    entityId: report.id,
    entityType: 'REPORT',
    action: 'REPORT_NARRATIVE_APPLIED',
    actorProfileId: profile.id,
    beforeValues: {
      version: expectedReportVersion,
      narrative_present: report.narrative !== null,
    },
    afterValues: {
      version: acceptedReportVersion,
      narrative_present: true,
    },
    metadata: {
      ai_draft_id: proposalId,
      deterministic_metrics_fingerprint:
        proposal.basis.deterministicMetricsFingerprint,
      changed_field: 'narrative',
    },
  });

  return readReportNarrativeState(session, profile, reportId);
}

export async function rejectReportNarrative(
  session: any,
  profile: CpcProfile,
  reportId: string,
  proposalId: string,
  expectedProposalVersion: number,
  reason: string | null,
): Promise<ReportNarrativeState> {
  await loadOwnDailyReport(session, profile, reportId);
  const row = await loadNarrativeProposalRow(
    session,
    profile,
    reportId,
    proposalId,
  );

  if (!row || row.version !== expectedProposalVersion) {
    fail(409, 'VERSION_CONFLICT', 'AI 摘要版本已经变化，请刷新后重试。');
  }
  if (row.status !== 'draft') {
    fail(409, 'INVALID_TRANSITION', 'AI 摘要已经处理，不能重复拒绝。');
  }

  const admin = requireAdminStore();
  const timestamp = nowIso();
  const expired = row.expires_at
    && Number.isFinite(new Date(row.expires_at).getTime())
    && new Date(row.expires_at).getTime() <= Date.now();
  const nextStatus = expired ? 'expired' : 'rejected';
  const nextVersion = expectedProposalVersion + 1;

  const updated = await admin
    .from('cpc_ai_drafts')
    .update(
      expired
        ? {
            status: 'expired',
            version: nextVersion,
            updated_at: timestamp,
          }
        : {
            status: 'rejected',
            rejected_by_profile_id: profile.id,
            rejected_at: timestamp,
            version: nextVersion,
            updated_at: timestamp,
          },
    )
    .eq('id', proposalId)
    .eq('org_id', profile.orgId)
    .eq('created_by_profile_id', profile.id)
    .eq('status', 'draft')
    .eq('version', expectedProposalVersion)
    .select('id')
    .maybeSingle();

  if (updated.error) {
    fail(500, 'INTERNAL_ERROR', 'AI 摘要拒绝失败，请稍后重试。');
  }
  if (!updated.data) {
    fail(409, 'VERSION_CONFLICT', 'AI 摘要版本已经变化，请刷新后重试。');
  }

  await writeAudit(admin, {
    orgId: profile.orgId,
    entityId: proposalId,
    action: expired
      ? 'REPORT_NARRATIVE_EXPIRED'
      : 'REPORT_NARRATIVE_REJECTED',
    actorProfileId: profile.id,
    reason,
    beforeValues: {
      status: 'draft',
      version: expectedProposalVersion,
    },
    afterValues: {
      status: nextStatus,
      version: nextVersion,
    },
    metadata: {
      report_id: reportId,
      formal_report_changed: false,
    },
  });

  return readReportNarrativeState(session, profile, reportId);
}
