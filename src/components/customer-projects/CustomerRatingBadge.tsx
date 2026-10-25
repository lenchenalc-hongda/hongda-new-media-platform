import {
  CUSTOMER_RATING_COLORS,
  CUSTOMER_RATING_GRADES,
  getCustomerRatingAccessibilityLabel,
  getCustomerRatingBadgeClasses,
  type CustomerRatingAxis,
  type CustomerRatingGrade,
} from './customer-rating-colors';

/**
 * Shared for customer list, detail and self-rating calculation preview.
 * A grade never appears as just a colored dot: R/P, grade, and N status are
 * always readable without distinguishing colors.
 */
export function CustomerRatingBadge({
  axis,
  grade,
  preview = false,
}: {
  axis: CustomerRatingAxis;
  grade: CustomerRatingGrade;
  preview?: boolean;
}) {
  const axisName = axis === 'actual' ? '实际' : '潜力';
  const prefix = axis === 'actual' ? 'R' : 'P';
  const accessibleName = getCustomerRatingAccessibilityLabel(axis, grade, preview);

  return (
    <span
      aria-label={accessibleName}
      title={accessibleName + ' · ' + CUSTOMER_RATING_COLORS[grade].hue}
      data-rating-axis={axis}
      data-rating-grade={grade}
      data-rating-preview={preview ? 'true' : 'false'}
      className={getCustomerRatingBadgeClasses(axis, grade, preview)}
    >
      <span className="text-[10px] font-medium opacity-90">{axisName}</span>
      <span className="font-extrabold tracking-wide">{prefix}-{grade}</span>
      {grade === 'N' && (
        <span className="text-[10px] font-medium opacity-90">未归类</span>
      )}
      {preview && (
        <span className="text-[10px] font-medium opacity-90">试算·未生效</span>
      )}
    </span>
  );
}

/**
 * Low-noise, opt-in explanation. Both axes are shown for every grade so staff
 * learn one color per tier and one shape/fill convention per value dimension.
 */
export function CustomerRatingLegend() {
  return (
    <details className="rounded-lg border border-slate-200 bg-white">
      <summary className="cursor-pointer px-3 py-2.5 text-xs text-slate-600 marker:text-slate-400 sm:text-sm">
        <span className="font-semibold text-slate-800">评级颜色说明</span>
        <span className="ml-2 text-slate-500">
          实际 R：实心方牌 · 潜力 P：浅底圆牌 · N：灰色未归类
        </span>
      </summary>
      <div className="space-y-2 border-t border-slate-100 px-3 py-3">
        <p className="text-xs leading-5 text-slate-500">
          相同等级使用相同色系：SS金、S紫、A蓝、B绿、C橙、D红；N灰。
          实际R仅以财务核实数据为准；潜力P由客户或项目负责人保存后立即生效。试算评级标记“未生效”。
        </p>
        <div className="space-y-1.5">
          {CUSTOMER_RATING_GRADES.map(grade => (
            <div key={grade} className="flex flex-wrap items-center gap-2">
              <span className="w-9 text-xs font-bold text-slate-500">{grade}</span>
              <CustomerRatingBadge axis="actual" grade={grade} />
              <CustomerRatingBadge axis="potential" grade={grade} />
            </div>
          ))}
        </div>
        <p className="text-xs text-slate-500">
          原A/B/C老客户关系回访分类属于另一套规则，不改变、不混用。
        </p>
      </div>
    </details>
  );
}
