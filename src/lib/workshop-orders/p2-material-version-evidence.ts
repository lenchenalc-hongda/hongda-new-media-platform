/**
 * Nonproduction WOS P2: material-transaction version lineage inspection.
 *
 * Database `wos_production_orders.version` is an optimistic-lock counter.
 * `version_label` identifies the production specification. They are NOT
 * interchangeable. Existing immutable action receipts do not contain a
 * signed snapshot digest or production-revision binding.
 *
 * A consistent sequence below is only a CANDIDATE, never a renewed handoff
 * proof or an authorization for scheduling/production.
 */
export interface WosP2MaterialReceiptCandidate {
  readonly request_id: string;
  readonly organization_id: string;
  readonly order_id: string;
  readonly action: string;
  readonly expected_version: number;
  readonly payload_fingerprint: string;
  readonly response_json: unknown;
}

export interface WosP2MaterialVersionInput {
  readonly orderId: string;
  readonly organizationId: string;
  readonly currentTransactionVersion: number;
  readonly productionVersionLabel: string;
  readonly witnessedTransactionVersion: number;
  readonly witnessedProductionVersionLabel: string;
  readonly historicalV7HandoffMatched: boolean;
  readonly receipts: readonly WosP2MaterialReceiptCandidate[];
}

export interface WosP2MaterialVersionAssessment {
  readonly sameProductionVersionLabel: boolean;
  readonly candidateReceiptChainConsistent: boolean;
  readonly currentRevisionHandoffProven: boolean;
  readonly proofState: 'UNVERIFIED' | 'V7_HISTORY_SCOPE_ONLY' | 'CANDIDATE_REQUIRES_SIGNED_SNAPSHOT';
  readonly issues: readonly string[];
  readonly canStart: false;
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const sha256 = /^[0-9a-f]{64}$/;

export function assessWosP2MaterialVersionLineage(
  input: WosP2MaterialVersionInput,
): WosP2MaterialVersionAssessment {
  const issues: string[] = [];
  const labelOk = typeof input?.productionVersionLabel === 'string'
    && input.productionVersionLabel.trim().length > 0
    && input.productionVersionLabel === input.witnessedProductionVersionLabel;
  if (!labelOk) issues.push('生产资料版本与已见证的办公室交接资料不一致，旧签样和视觉确认不能沿用');
  const validOrder = uuid.test(input?.orderId ?? '') && uuid.test(input?.organizationId ?? '');
  const revisionsOk = Number.isSafeInteger(input?.currentTransactionVersion)
    && Number.isSafeInteger(input?.witnessedTransactionVersion)
    && input.witnessedTransactionVersion === 7
    && input.currentTransactionVersion >= input.witnessedTransactionVersion;
  if (!validOrder || !revisionsOk || input.historicalV7HandoffMatched !== true) {
    issues.push('缺少同组织固定 v7 交接证明，或事务版本无效');
  }
  const rows = Array.isArray(input?.receipts) ? input.receipts : [];
  const delta = revisionsOk ? input.currentTransactionVersion - input.witnessedTransactionVersion : -1;
  if (delta < 0 || delta > 100 || rows.length !== delta) {
    issues.push('物料操作回执数量与事务版本增量不一致');
  }
  const ids = new Set<string>();
  let chainValid = validOrder && revisionsOk && labelOk
    && input.historicalV7HandoffMatched === true
    && delta >= 0 && delta <= 100 && rows.length === delta;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const reply = r?.response_json;
    const data = reply && typeof reply === 'object' && !Array.isArray(reply)
      ? reply as Record<string, unknown> : null;
    const id = r?.request_id;
    const version = input.witnessedTransactionVersion + i;
    const valid = !!r && typeof id === 'string' && uuid.test(id) && !ids.has(id)
      && r.organization_id === input.organizationId && r.order_id === input.orderId
      && r.action === 'CONFIRM_MATERIAL'
      && r.expected_version === version
      && typeof r.payload_fingerprint === 'string' && sha256.test(r.payload_fingerprint)
      && data !== null && data.requestId === id && data.orderId === input.orderId
      && data.version === version + 1
      && (data.status === 'APPLIED' || data.status === 'REPLAYED')
      && (data.workflowStatus === 'WAITING_MATERIAL' || data.workflowStatus === 'READINESS_CHECK');
    if (!valid) chainValid = false;
    if (typeof id === 'string') ids.add(id);
  }
  if (!chainValid) issues.push('物料事务回执不连续、重复、越权、缺失或版本冲突');
  // No existing receipt proves the invariant that production-critical fields
  // were unchanged between each numeric transaction version. Explicitly avoid
  // treating a perfect candidate chain as independently verified approval.
  const future = input.currentTransactionVersion > input.witnessedTransactionVersion;
  if (future) {
    issues.push('当前回执未绑定不可变生产资料摘要及独立复核；后续版本仍需可信证明');
  }
  const scopedV7 = chainValid && !future && input.currentTransactionVersion === 7;
  return {
    sameProductionVersionLabel: labelOk,
    candidateReceiptChainConsistent: chainValid,
    currentRevisionHandoffProven: false,
    proofState: scopedV7 ? 'V7_HISTORY_SCOPE_ONLY'
      : chainValid && future ? 'CANDIDATE_REQUIRES_SIGNED_SNAPSHOT' : 'UNVERIFIED',
    issues,
    canStart: false,
  };
}
