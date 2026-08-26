// ===== Review Center Analytics UI Presentation Helper Tests =====
import {
  ANALYTICS_RANGE_LABELS,
  analyticsBarPercent,
  canViewManagementAnalytics,
  formatAnalyticsCycleSampleCount,
  formatAnalyticsDays,
  formatAnalyticsInvalidCycleDisclosure,
  formatAnalyticsMonthLabel,
  formatAnalyticsRangeLabel,
  getActionFlowModuleCopy,
  getAnalyticsDataCompletenessCopy,
  getCycleModuleCopy,
  getReviewFlowModuleCopy,
  hasAnalyticsData,
} from '../../src/lib/review-center/analytics-presentation';

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

function snapshot(overrides: Record<string, unknown> = {}): any {
  return {
    range: 'LAST_6_MONTHS',
    timezone: 'Asia/Shanghai',
    buckets: [],
    summary: {
      reviewsCreatedTotal: 0,
      reviewsClosedUniqueInRange: 0,
      reviewsReopenedUniqueInRange: 0,
      actionsCreatedTotal: 0,
      actionsVerifiedTotal: 0,
      actionsCancelledTotal: 0,
      verificationCycleSampleCount: 0,
      verificationMedianDays: null,
      invalidCycleRowsExcluded: 0,
      ...(overrides.summary as Record<string, unknown> | undefined),
    },
    dataCompleteness: { lifecycleHistory: 'PARTIAL_LEGACY' },
  };
}

console.log('\n=== Review Center Analytics UI Presentation Helpers ===');

assert(canViewManagementAnalytics('admin') === true, 'admin can view analytics');
assert(canViewManagementAnalytics('manager') === true, 'manager can view analytics');
for (const role of ['operator', 'sales', 'viewer', 'unknown', '', null, undefined]) {
  assert(canViewManagementAnalytics(role) === false, 'non-management analytics blocked: ' + String(role));
}

assert(formatAnalyticsRangeLabel('LAST_6_MONTHS') === '近6个月', 'LAST_6_MONTHS label');
assert(formatAnalyticsRangeLabel('LAST_12_MONTHS') === '近12个月', 'LAST_12_MONTHS label');
assert(formatAnalyticsRangeLabel('THIS_YEAR') === '本年', 'THIS_YEAR label');
assert(formatAnalyticsRangeLabel('FUTURE') === '未知', 'unknown range label');
assert(!formatAnalyticsRangeLabel('LAST_6_MONTHS').includes('LAST_6_MONTHS'), 'raw range enum hidden');

assert(formatAnalyticsMonthLabel('2026-03') === '2026年3月', 'month label');
assert(formatAnalyticsMonthLabel('2026-12') === '2026年12月', 'month label December');
assert(formatAnalyticsMonthLabel('2026-13') === '未知', 'invalid month label');
assert(formatAnalyticsMonthLabel('bad') === '未知', 'malformed month label');

assert(formatAnalyticsDays(null) === '—', 'null median dash');
assert(formatAnalyticsDays(undefined) === '—', 'undefined median dash');
assert(formatAnalyticsDays(0) === '0天', 'zero days');
assert(formatAnalyticsDays(2) === '2天', 'integer days');
assert(formatAnalyticsDays(2.5) === '2.5天', 'decimal days');
assert(formatAnalyticsDays(0.1) === '0.1天', 'fraction days');

assert(analyticsBarPercent(0, 0) === 0, 'bar max zero safe');
assert(analyticsBarPercent(1, 0) === 0, 'bar zero max safe');
assert(analyticsBarPercent(5, 10) === 50, 'bar percent 50');
assert(analyticsBarPercent(12, 10) === 100, 'bar percent clamped');

const reviewCopy = getReviewFlowModuleCopy();
assert(reviewCopy.title === '复盘流转趋势', 'review module title');
assert(reviewCopy.closeDefinition.includes('至少关闭过一次的复盘') && reviewCopy.closeDefinition.includes('去重'), 'close definition');
assert(reviewCopy.crossBucketNote.includes('期间总数按整个区间再次去重'), 'cross-bucket explanation');

const actionCopy = getActionFlowModuleCopy();
assert(actionCopy.title === '改善行动趋势', 'action module title');
assert(actionCopy.verifiedLabel === '验证通过改善行动', 'verified label');
assert(actionCopy.verifiedDefinition.includes('最终状态已验证'), 'verified definition');

const cycleCopy = getCycleModuleCopy();
assert(cycleCopy.title === '验证周期', 'cycle module title');
assert(cycleCopy.medianLabel === '月度验证周期中位数', 'median label');
assert(cycleCopy.elapsedDefinition.includes('24小时=1天'), 'elapsed definition');

assert(
  getAnalyticsDataCompletenessCopy().includes('早期历史数据可能不完整'),
  'data completeness text',
);
assert(formatAnalyticsCycleSampleCount(3) === '有效样本 3 项', 'sample count text');
assert(
  formatAnalyticsInvalidCycleDisclosure(2) === '有 2 条历史记录因时间数据异常未纳入周期计算。',
  'invalid cycle disclosure',
);

assert(hasAnalyticsData(snapshot()) === false, 'empty snapshot no data');
assert(
  hasAnalyticsData(snapshot({ summary: { actionsVerifiedTotal: 3 } })) === true,
  'verified data detected',
);
assert(
  hasAnalyticsData(snapshot({ summary: { verificationCycleSampleCount: 1 } })) === true,
  'cycle sample data detected',
);

assert(
  Object.values(ANALYTICS_RANGE_LABELS).every(label => !label.includes('LAST_6_MONTHS')),
  'range label map hides raw enums',
);

console.log('\nPassed: ' + passed + ', Failed: ' + failed + ' / ' + (passed + failed));
if (failed > 0) process.exitCode = 1;
