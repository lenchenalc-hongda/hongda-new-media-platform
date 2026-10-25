/**
 * CPC dual-rating presentation tokens.
 *
 * 1. The grade hue is consistent across actual R and potential P.
 * 2. The rating axis is encoded separately:
 *    R = solid, squared badge (finance-confirmed actual value)
 *    P = light fill, outlined, rounded badge (owner-published potential)
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
    hue: '亮金色',
    // Bright gold has better label contrast with dark lettering than with white.
    actual: 'border-[#B8860B] bg-[#F7C948] text-[#3B2800]',
    potential: 'border-[#D4A017] bg-[#FFF8DB] text-[#775100]',
  },
  S: {
    hue: '红色',
    actual: 'border-red-800 bg-red-600 text-white',
    potential: 'border-red-500 bg-red-50 text-red-900',
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
    hue: '紫色',
    actual: 'border-violet-800 bg-violet-700 text-white',
    potential: 'border-violet-500 bg-violet-50 text-violet-900',
  },
  D: {
    hue: '浅棕色',
    // Light brown also needs dark text, not white, to stay legible.
    actual: 'border-[#B28A68] bg-[#D8B99B] text-[#4B2E1F]',
    potential: 'border-[#B28A68] bg-[#F8F0E8] text-[#6B4228]',
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
