/**
 * Version-bound, read-only handoff evidence for the WOS QA lifecycle.
 *
 * A row is trusted only when its status transition and immutable request/version
 * metadata form one continuous chain ending at the current order version.
 * Historical v7 rows without metadata cannot authorize a current version.
 */
// Legacy read-only preview witness. This constant is only used to pin the old
// v7 preview page to the exact version it witnessed; it never authorizes a
// newer order version and is not consulted by evaluateWosP2HandoffTimeline.
export const WOS_P2_QA_PROVEN_HANDOFF_VERSION = 7;

export const WOS_P2_HANDOFF_STEPS = [
  { code: 'SUBMIT', label: '办公室提交', from: 'DRAFT', to: 'SUBMITTED',
    reason: 'OFFICE_SUBMISSION_COMMITTED', roles: ['admin', 'manager', 'sales'] },
  { code: 'ACCEPT', label: '车间接单', from: 'SUBMITTED', to: 'WORKSHOP_REVIEW',
    reason: 'QA_P2_ACCEPT', roles: ['operator', 'admin', 'manager'] },
  { code: 'RETURN', label: '车间退回补资料', from: 'WORKSHOP_REVIEW', to: 'NEEDS_INFORMATION',
    reason: 'QA_P2_RETURN_FOR_INFORMATION', roles: ['operator', 'admin', 'manager'] },
  { code: 'CORRECT', label: '办公室保存修订', from: 'NEEDS_INFORMATION', to: 'NEEDS_INFORMATION',
    reason: 'QA_P2_OFFICE_SAVE_CORRECTION', roles: ['admin', 'manager', 'sales'] },
  { code: 'RESUBMIT', label: '办公室重新提交', from: 'NEEDS_INFORMATION', to: 'WORKSHOP_REVIEW',
    reason: 'QA_P2_OFFICE_RESUBMIT_CORRECTION', roles: ['admin', 'manager', 'sales'] },
  { code: 'REVIEW', label: '车间复核修订', from: 'WORKSHOP_REVIEW', to: 'WAITING_MATERIAL',
    reason: 'QA_P2_REVIEW_CORRECTION', roles: ['operator', 'admin', 'manager'] },
] as const;

export interface WosP2HandoffHistory {
  readonly previous_status: string | null;
  readonly next_status: string;
  readonly actor_role: string;
  readonly reason_code: string;
  readonly created_at: string;
  readonly metadata?: Record<string, unknown> | null;
}

export interface WosP2HandoffInput {
  readonly history: readonly WosP2HandoffHistory[];
  readonly currentStatus: string;
  readonly currentVersion: number;
  readonly readVerified: boolean;
}

export interface WosP2HandoffStageResult {
  readonly code: (typeof WOS_P2_HANDOFF_STEPS)[number]['code'];
  readonly label: string;
  readonly verifiedByHistory: boolean;
  readonly recordedAt: string | null;
}

export interface WosP2HandoffResult {
  readonly steps: readonly WosP2HandoffStageResult[];
  readonly historySequenceVerified: boolean;
  readonly nextAction: string;
  readonly source: 'QA_RLS_STATUS_HISTORY_VERSION_BOUND';
  readonly canStart: false;
}

const missing = (msg: string): WosP2HandoffResult => ({
  steps: WOS_P2_HANDOFF_STEPS.map(step => ({
    code: step.code, label: step.label,
    verifiedByHistory: false, recordedAt: null,
  })),
  historySequenceVerified: false,
  nextAction: msg,
  source: 'QA_RLS_STATUS_HISTORY_VERSION_BOUND',
  canStart: false,
});

function integerField(metadata: Record<string, unknown> | null | undefined, key: string): number | null {
  const value = metadata?.[key];
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
    ? value : null;
}

function requestIdentity(metadata: Record<string, unknown> | null | undefined): string | null {
  const value = metadata?.requestId ?? metadata?.idempotencyKey;
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value : null;
}

function eventVersions(row: WosP2HandoffHistory): { from: number; to: number } | null {
  const expected = integerField(row.metadata, 'expectedVersion')
    ?? integerField(row.metadata, 'sourceRevision');
  const next = integerField(row.metadata, 'newVersion')
    ?? (expected === null ? null : expected + 1);
  return expected !== null && next === expected + 1 ? { from: expected, to: next } : null;
}

const materialEvents = new Map<string, {
  readonly from: string;
  readonly to: string;
  readonly roles: readonly string[];
}>([
  ['QA_M2_MATERIAL_RECORD', { from: 'WAITING_MATERIAL', to: 'WAITING_MATERIAL',
    roles: ['operator', 'admin', 'manager'] }],
  ['QA_M2_BASELINE_SELECT', { from: 'WAITING_MATERIAL', to: 'WAITING_MATERIAL',
    roles: ['sales', 'admin', 'manager'] }],
  ['QA_M2_BASELINE_OFFICE_CONFIRM', { from: 'WAITING_MATERIAL', to: 'WAITING_MATERIAL',
    roles: ['sales', 'admin', 'manager'] }],
  ['QA_M2_BASELINE_WORKSHOP_CONFIRM', { from: 'WAITING_MATERIAL', to: 'WAITING_MATERIAL',
    roles: ['operator', 'admin', 'manager'] }],
  ['QA_M2_FINAL_READINESS_CONFIRM', { from: 'WAITING_MATERIAL', to: 'READINESS_CHECK',
    roles: ['operator', 'admin', 'manager'] }],
  ['QA_M2_EVIDENCE_INVALIDATED', { from: 'READINESS_CHECK', to: 'WAITING_MATERIAL',
    roles: ['sales', 'admin', 'manager', 'operator'] }],
]);

export function evaluateWosP2HandoffTimeline(input: WosP2HandoffInput): WosP2HandoffResult {
  if (!input || input.readVerified !== true || !Array.isArray(input.history)
      || !Number.isSafeInteger(input.currentVersion) || input.currentVersion < 2) {
    return missing('缺少当前版本可信交接证明；无元数据的旧历史不能用于当前版本。');
  }
  const chronological = input.history.map(row => ({
    row,
    time: row && typeof row.created_at === 'string' ? Date.parse(row.created_at) : Number.NaN,
  })).sort((a, b) => a.time - b.time);
  if (chronological.length < WOS_P2_HANDOFF_STEPS.length
    || chronological.some(item => !Number.isFinite(item.time))) {
    return missing('交接历史不完整或包含无法验证的时间。');
  }

  let expectedVersion = 1;
  for (let index = 0; index < WOS_P2_HANDOFF_STEPS.length; index++) {
    const expected = WOS_P2_HANDOFF_STEPS[index];
    const item = chronological[index];
    const versions = item ? eventVersions(item.row) : null;
    if (!item || !versions || versions.from !== expectedVersion || versions.to !== expectedVersion + 1
      || item.row.previous_status !== expected.from || item.row.next_status !== expected.to
      || item.row.reason_code !== expected.reason
      || !(expected.roles as readonly string[]).includes(item.row.actor_role)
      || requestIdentity(item.row.metadata) === null) {
      return missing('交接历史不是连续、版本绑定的六步合法状态变更。');
    }
    expectedVersion = versions.to;
  }

  for (let index = WOS_P2_HANDOFF_STEPS.length; index < chronological.length; index++) {
    const row = chronological[index].row;
    const event = materialEvents.get(row.reason_code);
    const versions = eventVersions(row);
    if (!event || !versions || versions.from !== expectedVersion || versions.to !== expectedVersion + 1
      || row.previous_status !== event.from || row.next_status !== event.to
      || !event.roles.includes(row.actor_role)
      || requestIdentity(row.metadata) === null) {
      return missing('后续物料或签认历史不是连续的当前版本事务链。');
    }
    expectedVersion = versions.to;
  }

  const last = chronological[chronological.length - 1].row;
  if (expectedVersion !== input.currentVersion || last.next_status !== input.currentStatus
    || !['WAITING_MATERIAL', 'READINESS_CHECK'].includes(input.currentStatus)) {
    return missing('当前订单版本或状态与最后一条版本绑定交接事实不一致。');
  }

  return {
    steps: WOS_P2_HANDOFF_STEPS.map((step, index) => ({
      code: step.code,
      label: step.label,
      verifiedByHistory: true,
      recordedAt: chronological[index].row.created_at,
    })),
    historySequenceVerified: true,
    nextAction: input.currentStatus === 'READINESS_CHECK'
      ? '当前版本的交接与四类物料事务已匹配；仍禁止自动开工，必须另行人工放行。'
      : '当前版本六步交接与后续事务链已匹配；仍须完成四类图片、双签和最终齐套。',
    source: 'QA_RLS_STATUS_HISTORY_VERSION_BOUND',
    canStart: false,
  };
}
