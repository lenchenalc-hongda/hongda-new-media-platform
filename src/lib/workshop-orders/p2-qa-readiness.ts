/**
 * WOS P2 read-only QA receipt/material evaluation.
 * Missing, stale and malformed rows always block; UI never authorizes start.
 * All inputs must originate from current-session RLS-filtered QA tables.
 */
export const WOS_P2_MATERIALS = [
  { code: 'FILM', title: '花膜', acceptedStatus: 'VERSION_VERIFIED' },
  { code: 'FIXTURE', title: '夹具', acceptedStatus: 'FIT_VERIFIED' },
  { code: 'INCOMING_MATERIAL', title: '来料及产品', acceptedStatus: 'QUANTITY_VERIFIED' },
  { code: 'SIGNED_SAMPLE', title: '客户确认样 / 大货签样', acceptedStatus: 'VERIFIED' },
] as const;

export interface WosP2ResourceRow {
  readonly resource_type: string;
  readonly status: string;
  readonly version_label: string | null;
  readonly quantity_expected: number | null;
  readonly quantity_arrived: number | null;
  readonly confirmed_by_profile_id: string | null;
  readonly confirmed_at: string | null;
  readonly note: string | null;
}

export interface WosP2BlockerRow {
  readonly blocker_code: string;
  readonly status: string;
  readonly description: string;
}

export interface WosP2BaselineRow {
  readonly version_label: string;
  readonly status: string;
  readonly office_confirmed_at: string | null;
  readonly workshop_confirmed_at: string | null;
}

export interface WosP2ReadinessInput {
  readonly versionLabel: string;
  readonly currentBatchQuantity: number;
  readonly resources: readonly WosP2ResourceRow[];
  readonly blockers: readonly WosP2BlockerRow[];
  readonly baselines: readonly WosP2BaselineRow[];
  readonly readVerified: boolean;
}
export interface WosP2MaterialAssessment {
  readonly code: string;
  readonly title: string;
  readonly status: string;
  readonly ready: boolean;
  readonly message: string;
}
export interface WosP2ReadinessResult {
  readonly materials: readonly WosP2MaterialAssessment[];
  readonly issues: readonly string[];
  readonly materialsVerified: boolean;
  readonly canStart: false;
  readonly source: 'QA_RLS_READ_ONLY';
}

export function evaluateWosP2Readiness(input: WosP2ReadinessInput): WosP2ReadinessResult {
  const issues: string[] = [];
  if (!input.readVerified) issues.push('真实 QA 查询未完整验证，禁止将任何项目视为齐套');
  const validVersion = typeof input.versionLabel === 'string' &&
    input.versionLabel.trim().length > 0;
  if (!validVersion) issues.push('订单版本缺失');
  const validQty = Number.isSafeInteger(input.currentBatchQuantity) && input.currentBatchQuantity > 0;
  if (!validQty) issues.push('本批数量无效');
  if (!Array.isArray(input.resources) || !Array.isArray(input.blockers) ||
      !Array.isArray(input.baselines)) {
    return {
      materials: WOS_P2_MATERIALS.map(row => ({
        code: row.code, title: row.title, status: 'UNKNOWN',
        ready: false, message: '未取得有效的真实 QA 数据',
      })),
      issues: ['齐套数据结构不完整，禁止开工'], materialsVerified: false,
      canStart: false, source: 'QA_RLS_READ_ONLY',
    };
  }
  const resources = input.resources;
  const materials = WOS_P2_MATERIALS.map(spec => {
    const rows = resources.filter(row => row?.resource_type === spec.code);
    if (rows.length !== 1) {
      return {
        code: spec.code, title: spec.title, status: 'NOT_VERIFIED',
        ready: false, message: rows.length === 0 ? '尚无车间物料登记' : '存在重复的物料记录',
      };
    }
    const row = rows[0];
    const confirms = typeof row.confirmed_by_profile_id === 'string' &&
      row.confirmed_by_profile_id.length > 0 &&
      typeof row.confirmed_at === 'string' && row.confirmed_at.length > 0;
    const correctVersion = validVersion && row.version_label === input.versionLabel;
    const quantityReady = spec.code !== 'INCOMING_MATERIAL' ||
      (validQty && Number.isSafeInteger(row.quantity_expected) &&
       Number.isSafeInteger(row.quantity_arrived) &&
       Number(row.quantity_expected) >= input.currentBatchQuantity &&
       Number(row.quantity_arrived) >= input.currentBatchQuantity);
    const ready = input.readVerified && correctVersion && confirms &&
      row.status === spec.acceptedStatus && quantityReady;
    let message = '状态已登记，但当前版本或操作人验证尚未通过';
    if (ready) message = '当前订单版本的到位记录与确认人已核实';
    else if (row.status !== spec.acceptedStatus) message = '未达到齐套确认状态';
    else if (!correctVersion) message = '物料与当前订单版本不一致';
    else if (!confirms) message = '缺少车间操作人和确认时间';
    else if (!quantityReady) message = '来料数量不足本批生产数量';
    return {
      code: spec.code, title: spec.title, status: row.status || 'UNKNOWN',
      ready, message,
    };
  });
  for (const blocker of input.blockers) {
    if (blocker?.status !== 'RESOLVED') {
      issues.push('未解除阻断：' + String(blocker?.description || blocker?.blocker_code || '未知原因'));
    }
  }
  const baseline = input.baselines.filter(row => row?.status === 'CURRENT');
  if (baseline.length !== 1 || baseline[0]?.version_label !== input.versionLabel ||
      !baseline[0]?.office_confirmed_at || !baseline[0]?.workshop_confirmed_at) {
    issues.push('缺少当前版本经办公室与车间共同确认的签样 / 视觉基准');
  }
  const materialsVerified = input.readVerified && validVersion && validQty &&
    materials.every(row => row.ready) && issues.length === 0;
  return { materials, issues, materialsVerified, canStart: false, source: 'QA_RLS_READ_ONLY' };
}
