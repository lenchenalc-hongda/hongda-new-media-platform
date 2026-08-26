// ===== Review Center Dashboard UI Presentation Helper Tests =====
import {
  DASHBOARD_ATTENTION_REASON_LABELS,
  DASHBOARD_RANGE_LABELS,
  DASHBOARD_REVIEW_STATUS_LABELS,
  DASHBOARD_RISK_LABELS,
  DASHBOARD_TYPE_LABELS,
  canViewManagementDashboard,
  dashboardDistributionPercentage,
  formatDashboardAttentionReasonLabel,
  formatDashboardOwnerDisplayName,
  formatDashboardRangeLabel,
  formatDashboardRefreshTime,
  formatDashboardRiskLabel,
  formatDashboardStatusLabel,
  formatDashboardTypeLabel,
  getAttentionCountLabels,
  getDashboardMetricDefinition,
  getPeriodKpiLabels,
} from '../../src/lib/review-center/dashboard-presentation';

let passed = 0;
let failed = 0;

function assert(cond: boolean, msg: string) {
  if (cond) {
    passed++;
  } else {
    failed++;
    console.error('FAIL: ' + msg);
  }
}

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

console.log('\n=== Review Center Dashboard Presentation Helpers ===');

assert(canViewManagementDashboard('admin') === true, 'admin can view dashboard');
assert(canViewManagementDashboard('manager') === true, 'manager can view dashboard');
for (const role of ['operator', 'sales', 'viewer', 'unknown', '', null, undefined]) {
  assert(canViewManagementDashboard(role) === false, 'non-management role blocked: ' + String(role));
}

assert(formatDashboardRangeLabel('THIS_MONTH') === '本月', 'THIS_MONTH label');
assert(formatDashboardRangeLabel('LAST_30_DAYS') === '近30天', 'LAST_30_DAYS label');
assert(formatDashboardRangeLabel('ALL') === '全部', 'ALL label');
assert(formatDashboardRangeLabel('YEAR') === '未知', 'unknown range falls back');
assert(!formatDashboardRangeLabel('THIS_MONTH').includes('THIS_MONTH'), 'raw range enum not visible');

assert(deepEqual(getPeriodKpiLabels('THIS_MONTH'), {
  created: '本月新建复盘',
  closed: '本月关闭复盘',
  verified: '本月已验证改善行动',
}), 'THIS_MONTH period labels');
assert(deepEqual(getPeriodKpiLabels('LAST_30_DAYS'), {
  created: '近30天新建复盘',
  closed: '近30天关闭复盘',
  verified: '近30天已验证改善行动',
}), 'LAST_30_DAYS period labels');
assert(deepEqual(getPeriodKpiLabels('ALL'), {
  created: '累计新建复盘',
  closed: '累计关闭过的复盘',
  verified: '累计已验证改善行动',
}), 'ALL period labels');

assert(formatDashboardStatusLabel('draft') === '草稿', 'draft status label');
assert(formatDashboardStatusLabel('submitted') === '已提交', 'submitted status label');
assert(formatDashboardStatusLabel('in_review') === '审核中（未启用）', 'in_review status label');
assert(formatDashboardStatusLabel('action_required') === '待改善（未启用）', 'action_required status label');
assert(formatDashboardStatusLabel('verifying') === '验证中（未启用）', 'verifying status label');
assert(formatDashboardStatusLabel('closed') === '已关闭', 'closed status label');
assert(formatDashboardStatusLabel('archived') === '已归档（未启用）', 'archived status label');
assert(formatDashboardStatusLabel('rejected') === '已驳回（未启用）', 'rejected status label');
assert(formatDashboardStatusLabel('cancelled') === '已取消（未启用）', 'cancelled status label');
assert(formatDashboardStatusLabel('UNKNOWN') === '未知', 'UNKNOWN status label');
assert(formatDashboardStatusLabel('FUTURE') === '未知', 'future status falls back');
assert(!formatDashboardStatusLabel('draft').includes('draft'), 'raw status enum not visible');

assert(formatDashboardRiskLabel('RED') === '红色风险', 'RED risk label');
assert(formatDashboardRiskLabel('YELLOW') === '黄色风险', 'YELLOW risk label');
assert(formatDashboardRiskLabel('GREEN') === '绿色风险', 'GREEN risk label');
assert(formatDashboardRiskLabel('UNSET') === '未设置', 'UNSET risk label');
assert(formatDashboardRiskLabel('UNKNOWN') === '未知', 'UNKNOWN risk label');
assert(formatDashboardRiskLabel(null) === '未设置', 'null risk label');
assert(formatDashboardRiskLabel('FUTURE') === '未知', 'future risk falls back');
assert(!formatDashboardRiskLabel('RED').includes('RED'), 'raw risk enum not visible');

assert(formatDashboardTypeLabel('A') === 'A类', 'A type label');
assert(formatDashboardTypeLabel('B') === 'B类', 'B type label');
assert(formatDashboardTypeLabel('C') === 'C类', 'C type label');
assert(formatDashboardTypeLabel('UNKNOWN') === '未知', 'UNKNOWN type label');
assert(formatDashboardTypeLabel('X') === '未知', 'future type falls back');

assert(formatDashboardAttentionReasonLabel('OVERDUE_ACTION') === '有逾期行动', 'OVERDUE_ACTION label');
assert(formatDashboardAttentionReasonLabel('HIGH_RISK') === '红色风险', 'HIGH_RISK label');
assert(formatDashboardAttentionReasonLabel('PENDING_VERIFICATION') === '有待验证行动', 'PENDING_VERIFICATION label');
assert(formatDashboardAttentionReasonLabel('SUBMITTED_WITH_OPEN_ACTION') === '已提交但行动未闭环', 'SUBMITTED_WITH_OPEN_ACTION label');
assert(formatDashboardAttentionReasonLabel('FUTURE') === '未知', 'future attention reason falls back');
assert(!formatDashboardAttentionReasonLabel('OVERDUE_ACTION').includes('OVERDUE_ACTION'), 'raw reason enum not visible');

const metricKeys = [
  'openReviews',
  'highRiskReviews',
  'openActions',
  'overdueActions',
  'pendingVerificationActions',
  'reviewsCreated',
  'reviewsClosedUnique',
  'actionsVerified',
] as const;
for (const key of metricKeys) {
  const definition = getDashboardMetricDefinition(key);
  assert(typeof definition === 'string' && definition.trim().length > 0, 'metric definition exists: ' + key);
}
assert(
  getDashboardMetricDefinition('highRiskReviews').includes('红色')
    && getDashboardMetricDefinition('overdueActions').includes('截止日期'),
  'required metric definition text present',
);
assert(
  getDashboardMetricDefinition('reviewsClosedUnique').includes('去重')
    && getDashboardMetricDefinition('actionsVerified').includes('已验证'),
  'closed/verified definition text present',
);

assert(dashboardDistributionPercentage(0, 0) === 0, 'percentage total zero safe');
assert(dashboardDistributionPercentage(1, 0) === 0, 'percentage zero total safe');
assert(dashboardDistributionPercentage(5, 10) === 50, 'percentage 50');
assert(dashboardDistributionPercentage(11, 10) === 100, 'percentage clamped to 100');
assert(dashboardDistributionPercentage(-1, 10) === 0, 'percentage negative safe');

assert(formatDashboardOwnerDisplayName('张三') === '张三', 'owner display name preserved');
assert(formatDashboardOwnerDisplayName(null) === '—', 'null owner dash');
assert(formatDashboardOwnerDisplayName(undefined) === '—', 'undefined owner dash');
assert(formatDashboardOwnerDisplayName('  ') === '—', 'blank owner dash');

const countLabels = getAttentionCountLabels({
  openActionCount: 2,
  overdueActionCount: 1,
  pendingVerificationActionCount: 0,
});
assert(deepEqual(countLabels, ['未闭环 2', '逾期 1']), 'attention count labels nonzero only');

const refreshText = formatDashboardRefreshTime(new Date('2026-08-26T10:30:00+08:00'));
assert(refreshText.startsWith('最后刷新 '), 'refresh time text');
assert(formatDashboardRefreshTime(new Date('invalid')) === '', 'invalid refresh time empty');

assert(
  Object.values(DASHBOARD_RANGE_LABELS).every(label => !label.includes('THIS_MONTH') && !label.includes('LAST_30_DAYS')),
  'range label map never exposes raw enum',
);
assert(
  Object.values(DASHBOARD_REVIEW_STATUS_LABELS).every(label => !label.includes('draft') && !label.includes('UNKNOWN')),
  'status label map never exposes raw enum',
);
assert(
  Object.values(DASHBOARD_RISK_LABELS).every(label => !label.includes('RED') && !label.includes('UNSET')),
  'risk label map never exposes raw enum',
);
assert(
  Object.values(DASHBOARD_TYPE_LABELS).every(label => !label.includes('UNKNOWN')),
  'type label map never exposes raw enum',
);
assert(
  Object.values(DASHBOARD_ATTENTION_REASON_LABELS).every(label => !label.includes('OVERDUE_ACTION')),
  'attention reason label map never exposes raw enum',
);

console.log('\nPassed: ' + passed + ', Failed: ' + failed + ' / ' + (passed + failed));
if (failed > 0) process.exitCode = 1;
