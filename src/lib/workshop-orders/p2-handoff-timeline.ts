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
      !Array.isArray(input.history) ||
      input.history.length !== WOS_P2_HANDOFF_STEPS.length ||
      !Number.isSafeInteger(input.currentVersion) ||
      input.currentVersion !== WOS_P2_QA_PROVEN_HANDOFF_VERSION) {
    return missing('缺少当前版本可信交接证明；旧 QA v7 六步不能由 v8+ 或多余历史复用。');
  }
  const chronological = input.history.map(row => ({
    row,
    time: row && typeof row.created_at === 'string'
      ? Date.parse(row.created_at) : Number.NaN,
  })).sort((a,b)=>a.time-b.time);
  let priorTime = Number.NEGATIVE_INFINITY;
  for (let i=0; i<WOS_P2_HANDOFF_STEPS.length; i++) {
    const expected=WOS_P2_HANDOFF_STEPS[i];
    const {row,time}=chronological[i];
    if (!row || !Number.isFinite(time) || time<=priorTime ||
        row.previous_status!==expected.from ||
        row.next_status!==expected.to ||
        row.reason_code!==expected.reason ||
        !(expected.roles as readonly string[]).includes(row.actor_role)) {
      return missing('交接历史不是连续的六条合法状态变更，所有历史证明均无效。');
    }
    priorTime=time;
  }
  if (input.currentStatus!=='WAITING_MATERIAL' ||
      chronological[chronological.length-1].row.next_status!==input.currentStatus) {
    return missing('当前状态与最后的已验证交接事实不一致。');
  }
  return {
    steps: WOS_P2_HANDOFF_STEPS.map((step,i)=>({
      code:step.code,label:step.label,verifiedByHistory:true,
      recordedAt:chronological[i].row.created_at,
    })),
    historySequenceVerified:true,
    nextAction:'六步交接仅限已核实的 QA v7；仍须核验花膜、夹具、签样和当前图片版本，不允许据此开工。',
    source:'QA_RLS_STATUS_HISTORY_ONLY',
    canStart:false,
  };
}
