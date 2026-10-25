import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  CUSTOMER_RATING_COLORS,
  CUSTOMER_RATING_GRADES,
  getCustomerRatingAccessibilityLabel,
  getCustomerRatingBadgeClasses,
  isCustomerRatingGrade,
} from '../../src/components/customer-projects/customer-rating-colors';

console.log('\n=== CPC Customer R/P Dual-Rating Accessible Color Contract ===');

assert.deepEqual(CUSTOMER_RATING_GRADES, ['SS', 'S', 'A', 'B', 'C', 'D', 'N']);
const expectedHues = ['亮金色', '红色', '蓝色', '绿色', '紫色', '浅棕色', '中性灰'];

const actualClassNames = new Set<string>();
const potentialClassNames = new Set<string>();
for (const [index, grade] of CUSTOMER_RATING_GRADES.entries()) {
  const style = CUSTOMER_RATING_COLORS[grade];
  assert.equal(style.hue, expectedHues[index], grade + ': wrong semantic grade color');
  const real = getCustomerRatingBadgeClasses('actual', grade);
  const potential = getCustomerRatingBadgeClasses('potential', grade);

  assert.ok(real.includes('rounded-md border'), grade + ': R must be solid and rectangular');
  assert.ok(potential.includes('rounded-full border-2'), grade + ': P must be outlined and round');
  assert.ok(real.includes('bg-') && real.includes('text-'), grade + ': R has legible colored fill');
  assert.ok(potential.includes('bg-') && potential.includes('text-'), grade + ': P has legible tinted fill');
  assert.ok(real.includes(style.actual), grade + ': R theme is sourced from common palette');
  assert.ok(potential.includes(style.potential), grade + ': P theme is sourced from common palette');

  if (grade === 'N') {
    assert.match(real, /bg-slate-100/);
    assert.match(potential, /bg-slate-100/);
    assert.match(real, /text-slate-600/);
    assert.match(potential, /text-slate-600/);
    assert.equal(style.actual, style.potential, 'N is always the same neutral grey');
    assert.match(getCustomerRatingAccessibilityLabel('actual', grade), /未归类/);
    assert.match(getCustomerRatingAccessibilityLabel('potential', grade), /未归类/);
  } else {
    if (grade === 'SS' || grade === 'D') {
      // Bright gold and light tan require dark type to remain legible.
      assert.match(real, /text-\[#(?:3B2800|4B2E1F)\]/, grade + ': light badge must use dark text');
      assert.doesNotMatch(real, /text-white/, grade + ': avoid white type on pale fills');
    } else {
      assert.match(real, /text-white/, grade + ': solid saturated R badge needs high-contrast white text');
    }
    assert.ok(!real.includes('bg-slate-100'), grade + ': N-only grey must not imply graded customer');
    assert.ok(!potential.includes('bg-slate-100'), grade + ': N-only grey must not imply graded customer');
  }
  assert.ok(real !== potential, grade + ': R/P have distinct shapes/styles');
  actualClassNames.add(style.actual);
  potentialClassNames.add(style.potential);
}
// Explicit business-owner color contract, preventing accidental reversion to the old palette.
assert.match(CUSTOMER_RATING_COLORS.SS.actual, /bg-\[#F7C948\]/, 'SS uses bright gold, not dark ochre');
assert.match(CUSTOMER_RATING_COLORS.SS.potential, /bg-\[#FFF8DB\]/, 'SS-P is warm gold tint');
assert.match(CUSTOMER_RATING_COLORS.S.actual, /bg-red-600/, 'S must be red');
assert.match(CUSTOMER_RATING_COLORS.S.potential, /bg-red-50/, 'S-P must be red tint');
assert.match(CUSTOMER_RATING_COLORS.A.actual, /bg-blue-700/, 'A must be blue');
assert.match(CUSTOMER_RATING_COLORS.B.actual, /bg-emerald-700/, 'B must be green');
assert.match(CUSTOMER_RATING_COLORS.C.actual, /bg-violet-700/, 'C must be purple');
assert.match(CUSTOMER_RATING_COLORS.D.actual, /bg-\[#D8B99B\]/, 'D must be light brown');
assert.match(CUSTOMER_RATING_COLORS.D.potential, /bg-\[#F8F0E8\]/, 'D-P is light brown tint');
assert.match(CUSTOMER_RATING_COLORS.N.actual, /bg-slate-100/, 'N must stay grey');
assert.equal(actualClassNames.size, CUSTOMER_RATING_GRADES.length, 'each grade R has distinct treatment');
assert.equal(potentialClassNames.size, CUSTOMER_RATING_GRADES.length, 'each grade P has distinct treatment');

assert.equal(isCustomerRatingGrade('SS'), true);
assert.equal(isCustomerRatingGrade('N'), true);
assert.equal(isCustomerRatingGrade('unknown'), false);
assert.equal(isCustomerRatingGrade(null), false);
assert.match(getCustomerRatingAccessibilityLabel('actual', 'SS'), /实际回款评级 R/);
assert.match(getCustomerRatingAccessibilityLabel('potential', 'S'), /内部潜力评级 P/);
assert.match(getCustomerRatingAccessibilityLabel('potential', 'A', true), /未生效试算/);
assert.match(getCustomerRatingBadgeClasses('potential', 'A', true), /border-dashed/);
assert.doesNotMatch(getCustomerRatingBadgeClasses('potential', 'A', false), /border-dashed/);

const badgeComponent = fs.readFileSync('src/components/customer-projects/CustomerRatingBadge.tsx', 'utf8');
const detail = fs.readFileSync('src/components/customer-projects/CustomerRatingPanel.tsx', 'utf8');
const list = fs.readFileSync('src/app/customer-projects/customers/CustomersClient.tsx', 'utf8');
const css = fs.readFileSync('tailwind.config.js', 'utf8');

assert.ok(css.includes('./src/components/**/*.'), 'Tailwind must scan shared color definitions');
assert.ok(badgeComponent.includes('CUSTOMER_RATING_COLORS'));
assert.ok(badgeComponent.includes('aria-label={accessibleName}'), 'badges must not rely on color alone');
assert.ok(badgeComponent.includes('data-rating-axis={axis}'));
assert.ok(badgeComponent.includes('data-rating-grade={grade}'));
assert.ok(badgeComponent.includes('grade === \'N\''), 'N must carry explicit unclassified label');
assert.ok(badgeComponent.includes('未归类'));
assert.ok(badgeComponent.includes('CustomerRatingLegend'));
assert.ok(badgeComponent.includes('SS亮金、S红、A蓝、B绿、C紫、D浅棕；N灰。'), 'legend matches the owner-approved palette');
assert.ok(badgeComponent.includes('原A/B/C老客户关系回访分类'));

for (const source of [detail, list]) {
  assert.ok(source.includes('CustomerRatingBadge'), 'the list/detail should reuse one rendering component');
  assert.ok(source.includes('CustomerRatingLegend'), 'the list/detail should explain the meanings');
  assert.ok(source.includes('axis="actual"'));
  assert.ok(source.includes('axis="potential"'));
}
assert.ok(detail.includes('grade={preview.grade} preview'), 'scoring preview must be visibly provisional');
assert.ok(detail.includes("data.detail.status !== 'approved'"), 'legacy unapproved draft should be visually provisional');
assert.ok(detail.includes('grade={summary.potentialGrade}'), 'published grade never replaced by draft');
assert.ok(!list.includes('potentialStatus === \'pending_review\''), 'client must not keep obsolete manager approval queues');
assert.ok(list.includes('潜力未评级'), 'unclassified potential customers remain easy to find');

console.log('PASS: bright-gold/red/blue/green/purple/tan/gray tiers, R/P distinction and shared surfaces');
