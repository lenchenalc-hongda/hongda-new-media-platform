/**
 * CPC dual-rating presentation tokens.
 *
 * 1. The grade hue is consistent across actual R and potential P.
 * 2. The rating axis is encoded separately:
 *    R = solid, squared badge (finance-confirmed actual value)
 *    P = light fill, outlined, rounded badge (manager-approved potential)
 * 3. N always has the same neutral-grey treatment, never a risk color.
 * 4. The exact grade and axis MUST stay visible as text; color is supportive.
 *
 * Keep literal Tailwind utility names in src/components: Tailwind's content
 * scanner includes components but not src/lib. Do not build color names with
 * template interpolations or the production stylesheet may omit them.
 */
export const CUSTOMER_RATING_GRADES = [
  'SS', 'S', 'A', 'B', 'C', 'D', 'N',
] as const;

export type CustomerRatingGrade = typeof CUSTOMER_RATING_GRADES[number];
export type CustomerRatingAxis = 'actual' | 'potential';

export interface CustomerRatingColorSpec {
  hue: string;
  actual: string;
  potential: string;
}

export const CUSTOMER_RATING_COLORS: Record<
  CustomerRatingGrade, CustomerRatingColorSpec
> = {
  SS: {
    hue: '金色',
    actual: 'border-yellow-800 bg-yellow-700 text-white',
    potential: 'border-yellow-500 bg-yellow-50 text-yellow-900',
  },
  S: {
    hue: '紫色',
    actual: 'border-violet-800 bg-violet-700 text-white',
    potential: 'border-violet-500 bg-violet-50 text-violet-900',
  },
  A: {
    hue: '蓝色',
    actual: 'border-blue-800 bg-blue-700 text-white',
    potential: 'border-blue-500 bg-blue-50 text-blue-900',
  },
  B: {
    hue: '绿色',
    actual: 'border-emerald-800 bg-emerald-700 text-white',
    potential: 'border-emerald-500 bg-emerald-50 text-emerald-900',
  },
  C: {
    hue: '橙色',
    actual: 'border-orange-800 bg-orange-700 text-white',
    potential: 'border-orange-500 bg-orange-50 text-orange-900',
  },
  D: {
    hue: '红色',
    actual: 'border-rose-800 bg-rose-700 text-white',
    potential: 'border-rose-500 bg-rose-50 text-rose-900',
  },
  N: {
    hue: '中性灰',
    actual: 'border-slate-300 bg-slate-100 text-slate-600',
    potential: 'border-slate-300 bg-slate-100 text-slate-600',
  },
};

export function isCustomerRatingGrade(
  value: unknown,
): value is CustomerRatingGrade {
  return typeof value === 'string'
    && CUSTOMER_RATING_GRADES.some(grade => grade === value);
}

export function getCustomerRatingBadgeClasses(
  axis: CustomerRatingAxis,
  grade: CustomerRatingGrade,
  isPreview = false,
): string {
  const common = 'inline-flex shrink-0 items-center gap-1 whitespace-nowrap font-semibold leading-5';
  const shape = axis === 'actual'
    ? 'rounded-md border px-2.5 py-0.5 text-xs shadow-sm'
    : 'rounded-full border-2 px-2.5 py-0.5 text-xs';

  return [
    common,
    shape,
    CUSTOMER_RATING_COLORS[grade][axis],
    isPreview ? 'border-dashed' : '',
  ].filter(Boolean).join(' ');
}

export function getCustomerRatingAccessibilityLabel(
  axis: CustomerRatingAxis,
  grade: CustomerRatingGrade,
  isPreview = false,
): string {
  const axisName = axis === 'actual' ? '实际回款评级 R' : '内部潜力评级 P';
  const level = grade === 'N' ? 'N，未归类' : grade + '级';
  return (isPreview ? '未生效试算，' : '') + axisName + '-' + level;
}
