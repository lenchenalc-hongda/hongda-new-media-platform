import type { AIDraftStatus, MetricValue } from './domain';
import {
  knownMetricValue,
  reportMetricLabels,
  reportMetricOrder,
  type DerivedReportListItem,
  type DerivedReportPeriod,
} from './reports';

export const REPORT_NARRATIVE_PROPOSAL_TYPE = 'REPORT_NARRATIVE';
export const REPORT_NARRATIVE_SCHEMA_VERSION = 1;
export const REPORT_NARRATIVE_PROMPT_VERSION = 'cpc-daily-report-narrative-v1';
export const WEEKLY_REPORT_NARRATIVE_PROMPT_VERSION =
  'cpc-weekly-report-narrative-v1';

export function reportNarrativePromptVersion(
  periodType: DerivedReportPeriod,
): string {
  return periodType === 'weekly'
    ? WEEKLY_REPORT_NARRATIVE_PROMPT_VERSION
    : REPORT_NARRATIVE_PROMPT_VERSION;
}

export type ReportNarrativeProviderName = 'deepseek' | 'openai' | 'mock';

export type ReportNarrativeStaleReason =
  | 'REPORT_NOT_DRAFT'
  | 'PROPOSAL_EXPIRED'
  | 'REPORT_ID_CHANGED'
  | 'REPORT_REVISION_CHANGED'
  | 'REPORT_VERSION_CHANGED'
  | 'METRICS_SCHEMA_CHANGED'
  | 'SOURCE_EVENT_CURSOR_CHANGED'
  | 'SOURCE_AUDIT_CURSOR_CHANGED'
  | 'REPORT_BASIS_FINGERPRINT_CHANGED'
  | 'FORMAL_NARRATIVE_CHANGED';

export interface ReportNarrativeBasis {
  reportId: string;
  reportVersion: number;
  reportRevisionNo: number;
  periodType: DerivedReportPeriod;
  periodStart: string;
  periodEnd: string;
  metricsSchemaVersion: number;
  deterministicMetricsFingerprint: string;
  sourceEventSeq: number | null;
  sourceAuditSeq: number | null;
}

export interface ReportNarrativeGenerationRequest {
  promptVersion: string;
  requestedAt: string;
  factSource: 'DETERMINISTIC_REPORT_SNAPSHOT';
  externalIntegrationPolicy: 'UNKNOWN_NOT_ZERO';
}

export interface ReportNarrativeProviderMetadata {
  provider: ReportNarrativeProviderName;
  model: string | null;
  generatedAt: string;
}

export interface ReportNarrativeAcceptanceMetadata {
  acceptedReportVersion: number;
  acceptedAt: string;
}

export interface ReportNarrativeProposal {
  schemaVersion: 1;
  action: 'REPORT_NARRATIVE';
  narrative: string;
  basis: ReportNarrativeBasis;
  generationRequest: ReportNarrativeGenerationRequest;
  provider: ReportNarrativeProviderMetadata;
  acceptance: ReportNarrativeAcceptanceMetadata | null;
}

export interface ReportNarrativeProposalView {
  id: string;
  proposalType: 'REPORT_NARRATIVE';
  status: AIDraftStatus;
  narrative: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  expiresAt: string | null;
  provider: ReportNarrativeProviderMetadata;
  basis: ReportNarrativeBasis;
  acceptance: ReportNarrativeAcceptanceMetadata | null;
  isStale: boolean;
  staleReasons: ReportNarrativeStaleReason[];
  canAccept: boolean;
  canReject: boolean;
}

export interface ReportNarrativeState {
  reportId: string;
  reportVersion: number;
  reportStatus: DerivedReportListItem['status'];
  formalNarrative: string | null;
  pendingProposal: ReportNarrativeProposalView | null;
  acceptedProposal: ReportNarrativeProposalView | null;
  acceptedNarrativeStale: boolean;
}

export interface ReportNarrativeFact {
  key: string;
  label: string;
  state: 'known' | 'unknown';
  value: number | null;
  reason: string | null;
}

export interface ReportNarrativePromptInput {
  period: {
    type: DerivedReportPeriod;
    start: string;
    end: string;
    revisionNo: number;
  };
  provenance: {
    sourceEventSeq: number | null;
    sourceAuditSeq: number | null;
  };
  deterministicFacts: ReportNarrativeFact[];
  unknowns: string[];
}

const PROVIDERS = new Set<ReportNarrativeProviderName>([
  'deepseek',
  'openai',
  'mock',
]);

const DRAFT_STATUSES = new Set<AIDraftStatus>([
  'draft',
  'accepted',
  'rejected',
  'expired',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function stringValue(value: unknown, max = 500): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max) return null;
  return trimmed;
}

function nullableString(value: unknown, max = 500): string | null | undefined {
  if (value === null) return null;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (trimmed.length > max) return undefined;
  return trimmed || null;
}

function positiveInteger(value: unknown): number | null {
  return typeof value === 'number'
    && Number.isInteger(value)
    && value >= 1
    ? value
    : null;
}

function nullableNonNegativeInteger(value: unknown): number | null | undefined {
  if (value === null) return null;
  if (
    typeof value !== 'number'
    || !Number.isInteger(value)
    || value < 0
  ) {
    return undefined;
  }
  return value;
}

function validDate(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  const parsed = new Date(value + 'T00:00:00.000Z');
  return Number.isFinite(parsed.getTime()) ? value : null;
}

function validIsoDateTime(value: unknown): string | null {
  if (typeof value !== 'string' || !Number.isFinite(new Date(value).getTime())) {
    return null;
  }
  return value;
}

function stableStringify(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : 'null';
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (Array.isArray(value)) {
    return '[' + value.map(stableStringify).join(',') + ']';
  }
  if (isRecord(value)) {
    return '{' + Object.keys(value)
      .sort()
      .map(key => JSON.stringify(key) + ':' + stableStringify(value[key]))
      .join(',') + '}';
  }
  return 'null';
}

function hash32(input: string, seed: number): string {
  let hash = seed >>> 0;
  for (const character of input) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

export function computeReportNarrativeBasisFingerprint(input: {
  periodType: DerivedReportPeriod;
  periodStart: string;
  periodEnd: string;
  revisionNo: number;
  metricsSchemaVersion: number;
  deterministicMetrics: Record<string, MetricValue<number>>;
  unknowns: unknown[];
  sourceEventSeq: number | null;
  sourceAuditSeq: number | null;
}): string {
  const canonical = stableStringify({
    periodType: input.periodType,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    revisionNo: input.revisionNo,
    metricsSchemaVersion: input.metricsSchemaVersion,
    deterministicMetrics: input.deterministicMetrics,
    unknowns: input.unknowns,
    sourceEventSeq: input.sourceEventSeq,
    sourceAuditSeq: input.sourceAuditSeq,
  });

  return [
    'fnv1a32x2',
    hash32(canonical, 2166136261),
    hash32(canonical, 2166136261 ^ 0x9e3779b9),
    canonical.length.toString(16),
  ].join(':');
}

export function buildReportNarrativeBasis(
  report: DerivedReportListItem,
): ReportNarrativeBasis {
  return {
    reportId: report.id,
    reportVersion: report.version,
    reportRevisionNo: report.revisionNo,
    periodType: report.periodType,
    periodStart: report.periodStart,
    periodEnd: report.periodEnd,
    metricsSchemaVersion: report.metricsSchemaVersion,
    deterministicMetricsFingerprint: computeReportNarrativeBasisFingerprint({
      periodType: report.periodType,
      periodStart: report.periodStart,
      periodEnd: report.periodEnd,
      revisionNo: report.revisionNo,
      metricsSchemaVersion: report.metricsSchemaVersion,
      deterministicMetrics: report.deterministicMetrics,
      unknowns: report.unknowns,
      sourceEventSeq: report.sourceEventSeq,
      sourceAuditSeq: report.sourceAuditSeq,
    }),
    sourceEventSeq: report.sourceEventSeq,
    sourceAuditSeq: report.sourceAuditSeq,
  };
}

function parseBasis(value: unknown): ReportNarrativeBasis | null {
  if (!isRecord(value)) return null;

  const reportId = stringValue(value.reportId, 100);
  const reportVersion = positiveInteger(value.reportVersion);
  const reportRevisionNo = positiveInteger(value.reportRevisionNo);
  const periodStart = validDate(value.periodStart);
  const periodEnd = validDate(value.periodEnd);
  const metricsSchemaVersion = positiveInteger(value.metricsSchemaVersion);
  const deterministicMetricsFingerprint =
    stringValue(value.deterministicMetricsFingerprint, 200);
  const sourceEventSeq = nullableNonNegativeInteger(value.sourceEventSeq);
  const sourceAuditSeq = nullableNonNegativeInteger(value.sourceAuditSeq);

  if (
    !reportId
    || !reportVersion
    || !reportRevisionNo
    || (value.periodType !== 'daily' && value.periodType !== 'weekly')
    || !periodStart
    || !periodEnd
    || periodStart > periodEnd
    || !metricsSchemaVersion
    || !deterministicMetricsFingerprint
    || sourceEventSeq === undefined
    || sourceAuditSeq === undefined
  ) {
    return null;
  }

  return {
    reportId,
    reportVersion,
    reportRevisionNo,
    periodType: value.periodType,
    periodStart,
    periodEnd,
    metricsSchemaVersion,
    deterministicMetricsFingerprint,
    sourceEventSeq,
    sourceAuditSeq,
  };
}

export function parseReportNarrativeProposal(
  value: unknown,
): ReportNarrativeProposal | null {
  if (!isRecord(value)) return null;
  if (value.schemaVersion !== REPORT_NARRATIVE_SCHEMA_VERSION) return null;
  if (value.action !== 'REPORT_NARRATIVE') return null;

  const narrative = stringValue(value.narrative, 5000);
  const basis = parseBasis(value.basis);
  if (!narrative || !basis) return null;

  const generationRequest = value.generationRequest;
  if (
    !isRecord(generationRequest)
    || generationRequest.factSource !== 'DETERMINISTIC_REPORT_SNAPSHOT'
    || generationRequest.externalIntegrationPolicy !== 'UNKNOWN_NOT_ZERO'
  ) {
    return null;
  }
  const promptVersion = stringValue(generationRequest.promptVersion, 100);
  const requestedAt = validIsoDateTime(generationRequest.requestedAt);
  if (!promptVersion || !requestedAt) return null;

  const providerValue = value.provider;
  if (!isRecord(providerValue)) return null;
  if (
    typeof providerValue.provider !== 'string'
    || !PROVIDERS.has(providerValue.provider as ReportNarrativeProviderName)
  ) {
    return null;
  }
  const model = nullableString(providerValue.model, 200);
  const generatedAt = validIsoDateTime(providerValue.generatedAt);
  if (model === undefined || !generatedAt) return null;

  let acceptance: ReportNarrativeAcceptanceMetadata | null = null;
  if (value.acceptance !== null && value.acceptance !== undefined) {
    if (!isRecord(value.acceptance)) return null;
    const acceptedReportVersion = positiveInteger(
      value.acceptance.acceptedReportVersion,
    );
    const acceptedAt = validIsoDateTime(value.acceptance.acceptedAt);
    if (!acceptedReportVersion || !acceptedAt) return null;
    acceptance = { acceptedReportVersion, acceptedAt };
  }

  return {
    schemaVersion: 1,
    action: 'REPORT_NARRATIVE',
    narrative,
    basis,
    generationRequest: {
      promptVersion,
      requestedAt,
      factSource: 'DETERMINISTIC_REPORT_SNAPSHOT',
      externalIntegrationPolicy: 'UNKNOWN_NOT_ZERO',
    },
    provider: {
      provider: providerValue.provider as ReportNarrativeProviderName,
      model,
      generatedAt,
    },
    acceptance,
  };
}

export function parseReportNarrativeStatus(
  value: unknown,
): AIDraftStatus | null {
  return typeof value === 'string' && DRAFT_STATUSES.has(value as AIDraftStatus)
    ? value as AIDraftStatus
    : null;
}

export function evaluateReportNarrativeStaleness(
  proposal: ReportNarrativeProposal,
  report: DerivedReportListItem,
  proposalStatus: AIDraftStatus,
): ReportNarrativeStaleReason[] {
  const reasons: ReportNarrativeStaleReason[] = [];
  const basis = proposal.basis;

  if (report.status !== 'draft' && proposalStatus !== 'accepted') {
    reasons.push('REPORT_NOT_DRAFT');
  }
  if (report.id !== basis.reportId) reasons.push('REPORT_ID_CHANGED');
  if (report.revisionNo !== basis.reportRevisionNo) {
    reasons.push('REPORT_REVISION_CHANGED');
  }
  if (report.metricsSchemaVersion !== basis.metricsSchemaVersion) {
    reasons.push('METRICS_SCHEMA_CHANGED');
  }
  if (report.sourceEventSeq !== basis.sourceEventSeq) {
    reasons.push('SOURCE_EVENT_CURSOR_CHANGED');
  }
  if (report.sourceAuditSeq !== basis.sourceAuditSeq) {
    reasons.push('SOURCE_AUDIT_CURSOR_CHANGED');
  }

  const currentFingerprint = buildReportNarrativeBasis(report)
    .deterministicMetricsFingerprint;
  if (
    currentFingerprint !== basis.deterministicMetricsFingerprint
  ) {
    reasons.push('REPORT_BASIS_FINGERPRINT_CHANGED');
  }

  const expectedReportVersion = proposalStatus === 'accepted'
    ? proposal.acceptance?.acceptedReportVersion ?? basis.reportVersion + 1
    : basis.reportVersion;
  if (report.version !== expectedReportVersion) {
    reasons.push('REPORT_VERSION_CHANGED');
  }

  if (
    proposalStatus === 'accepted'
    && report.narrative !== proposal.narrative
  ) {
    reasons.push('FORMAL_NARRATIVE_CHANGED');
  }

  return Array.from(new Set(reasons));
}

function summarizeUnknown(value: unknown): string {
  if (typeof value === 'string') return value.slice(0, 300);
  try {
    const serialized = JSON.stringify(value);
    return typeof serialized === 'string'
      ? serialized.slice(0, 300)
      : '无法序列化的未知信息';
  } catch {
    return '无法序列化的未知信息';
  }
}

export function buildReportNarrativeFactLines(
  report: DerivedReportListItem,
): ReportNarrativeFact[] {
  const labels = reportMetricLabels(report.periodType);
  return reportMetricOrder(report.periodType).map(key => {
    const metric = report.deterministicMetrics[key];
    const value = knownMetricValue(report.deterministicMetrics, key);
    return {
      key,
      label: labels[key] ?? key,
      state: metric?.state === 'unknown' ? 'unknown' : 'known',
      value,
      reason: metric?.state === 'unknown' ? metric.reason : null,
    };
  });
}

export function buildReportNarrativePromptInput(
  report: DerivedReportListItem,
): ReportNarrativePromptInput {
  return {
    period: {
      type: report.periodType,
      start: report.periodStart,
      end: report.periodEnd,
      revisionNo: report.revisionNo,
    },
    provenance: {
      sourceEventSeq: report.sourceEventSeq,
      sourceAuditSeq: report.sourceAuditSeq,
    },
    deterministicFacts: buildReportNarrativeFactLines(report),
    unknowns: report.unknowns.slice(0, 30).map(summarizeUnknown),
  };
}

const FORBIDDEN_NARRATIVE_PATTERNS = [
  /员工排名/,
  /业绩排名/,
  /绩效评分/,
  /态度评价/,
  /积极性/,
  /点击量/,
  /点击率/,
  /消息数/,
  /记录数/,
  /没有订单/,
  /无订单/,
  /零订单/,
  /订单为零/,
  /没有回款/,
  /无回款/,
  /零回款/,
  /回款为零/,
  /没有工作/,
];

export function validateReportNarrativeText(value: unknown): string | null {
  const text = stringValue(value, 5000);
  if (!text || text.length < 20) return null;
  if (FORBIDDEN_NARRATIVE_PATTERNS.some(pattern => pattern.test(text))) {
    return null;
  }
  return text;
}

export function isCurrentReportNarrativeProposal(
  proposal: ReportNarrativeProposalView,
  report: DerivedReportListItem,
): boolean {
  return !proposal.isStale && report.status === 'draft';
}
