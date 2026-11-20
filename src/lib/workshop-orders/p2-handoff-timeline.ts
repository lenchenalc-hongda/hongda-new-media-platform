/**
 * WOS P2 nonproduction-only, pure/read-only office ↔ workshop handoff timeline.
 *
 * Reconstructs strictly ordered status-history evidence. It is NOT a receipt
 * verifier, role authorization, materials clearance or a production-start gate.
 * Ambiguous/missing/stale evidence always remains incomplete.
 */
/**
 * The six-step state-history sequence has been independently witnessed for one
 * fixed nonproduction QA order at numeric revision v7 only. No history row in
 * this contract carries a trustworthy per-revision receipt. Consequently a
 * later v8+ order must NEVER inherit historical v7 completion.
 *
 * A future generic multi-version implementation requires version-bound,
 * independently verified receipts; it must not loosen this guard.
 */
export const WOS_P2_QA_PROVEN_HANDOFF_VERSION = 7 as const;

export const WOS_P2_HANDOFF_STEPS = [
  { code: 'SUBMIT', label: '办公室提交', from: 'DRAFT', to: 'SUBMITTED',
    reason: 'OFFICE_SUBMISSION_COMMITTED', roles: ['admin', 'manager', 'sales'] },
  { code: 'ACCEPT', label: '车间接单', from: 'SUBMITTED', to: 'WORKSHOP_REVIEW',
    reason: 'QA_P2_ACCEPT', roles: ['operator', 'admin', 'manager'] },
  { code: 'RETURN', label: '车间退回补资料', from: 'WORKSHOP_REVIEW', to: 'NEEDS_INFORMATION',
    reason: 'QA_P2_RETURN_FOR_INFORMATION', roles: ['operator', 'admin', 'manager'] },
  { code: 'CORRECT', label: '办公室保存六字段修订', from: 'NEEDS_INFORMATION', to: 'NEEDS_INFORMATION',
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
  readonly source: 'QA_RLS_STATUS_HISTORY_ONLY';
  readonly canStart: false;
}

const missing = (msg: string): WosP2HandoffResult => ({
  steps: WOS_P2_HANDOFF_STEPS.map(step => ({
    code: step.code, label: step.label,
    verifiedByHistory: false, recordedAt: null,
  })),
  historySequenceVerified: false,
  nextAction: msg,
  source: 'QA_RLS_STATUS_HISTORY_ONLY',
  canStart: false,
});

export function evaluateWosP2HandoffTimeline(input: WosP2HandoffInput): WosP2HandoffResult {
  if (!input || input.readVerified !== true ||
      !Array.isArray(input.history) || input.history.length === 0 ||
      input.history.length >= 100 ||
      !Number.isSafeInteger(input.currentVersion) ||
      input.currentVersion !== WOS_P2_QA_PROVEN_HANDOFF_VERSION) {
    return missing('缺少本订单当前版本的可信交接证明；只核验既有 QA v7，v8+ 不得沿用旧六步历史或据此开工。');
  }

  const rows = input.history.map(row => ({
    row,
    time: row && typeof row.created_at === 'string'
      ? Date.parse(row.created_at) : Number.NaN,
  }));
  if (rows.some(({ row, time }) => !row ||
      !Number.isFinite(time) ||
      typeof row.previous_status !== 'string' ||
      typeof row.next_status !== 'string' ||
      typeof row.reason_code !== 'string' ||
      typeof row.actor_role !== 'string')) {
    return missing('订单历史包含格式错误或不可验证的时间，不能推断业务闭环。');
  }
  // Status history is fetched newest-first, but the business sequence must be
  // reassembled from the exact transition reason, role, and a strict timestamp.
  const chronological = rows.slice().sort((a, b) => a.time - b.time);
  const stages: WosP2HandoffStageResult[] = [];
  let lastTime = Number.NEGATIVE_INFINITY;
  let lastMatchedIndex = -1;
  let evidenceIncomplete = false;

  for (const step of WOS_P2_HANDOFF_STEPS) {
    const matches = chronological
      .map((event, idx) => ({ ...event, idx }))
      .filter(({row}) => row.reason_code === step.reason);
    if (matches.length !== 1) {
      evidenceIncomplete = true;
    }
    const hit = matches.length === 1 ? matches[0] : null;
    const verified = !evidenceIncomplete && !!hit &&
      hit.idx > lastMatchedIndex &&
      hit.time > lastTime &&
      hit.row.previous_status === step.from &&
      hit.row.next_status === step.to &&
      (step.roles as readonly string[]).includes(hit.row.actor_role);
    if (!verified) evidenceIncomplete = true;
    if (verified && hit) {
      lastTime = hit.time;
      lastMatchedIndex = hit.idx;
    }
    stages.push({
      code: step.code, label: step.label,
      verifiedByHistory: verified,
      recordedAt: verified && hit ? hit.row.created_at : null,
    });
  }

  const newest = chronological[chronological.length - 1].row.next_status;
  const consistentNow = input.currentStatus === 'WAITING_MATERIAL' &&
    newest === input.currentStatus &&
    input.currentVersion === WOS_P2_QA_PROVEN_HANDOFF_VERSION &&
    stages.every(stage => stage.verifiedByHistory);
  // This verifies only the fixed QA v7 history, not a reusable proof for any
  // future order version. Extra or later transitions must still fail closed.
  const historySequenceVerified = !evidenceIncomplete && consistentNow;
  return {
    steps: stages,
    historySequenceVerified,
    nextAction: historySequenceVerified
      ? '交接历史已匹配至车间复核，当前等待核实花膜、夹具、来料及签样；仍需核对当前图片基准，严禁直接开工。'
      : '历史链路或当前订单状态未完整匹配。请刷新真实订单并核对操作回执，不得据此放行物料或开工。',
    source: 'QA_RLS_STATUS_HISTORY_ONLY',
    canStart: false,
  };
}
