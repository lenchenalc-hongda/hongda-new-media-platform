import assert from 'node:assert/strict';
import {
  calculatePotentialRating,
  customerSalesStrategy,
  publishedPotentialGrade,
  POTENTIAL_RATING_DIMENSIONS,
  POTENTIAL_RATING_WEIGHTS,
} from '../../src/lib/customer-projects/customer-potential-rating';

console.log('\n=== CPC Potential Rating / Sales Strategy ===');

assert.equal(Object.values(POTENTIAL_RATING_WEIGHTS).reduce((a, b) => a + b, 0), 100);
assert.equal(POTENTIAL_RATING_DIMENSIONS.length, 5);

function withScope(scope: number) {
  return { purchase_scope: scope, process_fit: 0, project_evidence: 0, decision_access: 0, repeat_value: 0 };
}
const perfect = { purchase_scope: 5, process_fit: 5, project_evidence: 5, decision_access: 5, repeat_value: 5 };
assert.deepEqual(calculatePotentialRating(perfect), { score: 100, grade: 'SS' });
assert.deepEqual(calculatePotentialRating(withScope(0)), { score: 0, grade: 'D' });
assert.equal(calculatePotentialRating({ ...perfect, repeat_value: 0 }).grade, 'SS');
assert.equal(calculatePotentialRating({ ...perfect, project_evidence: 0 }).grade, 'S');
assert.equal(calculatePotentialRating({ ...perfect, purchase_scope: 0 }).grade, 'A');
assert.equal(calculatePotentialRating({ ...perfect, process_fit: 0, repeat_value: 0 }).grade, 'B');
assert.equal(calculatePotentialRating({ purchase_scope: 5, process_fit: 0, project_evidence: 0, decision_access: 1, repeat_value: 1 }).grade, 'C');
assert.throws(() => calculatePotentialRating({ ...perfect, purchase_scope: 6 }), RangeError);
assert.throws(() => calculatePotentialRating({ ...perfect, process_fit: -1 }), RangeError);
assert.throws(() => calculatePotentialRating({ ...perfect, project_evidence: 2.5 }), RangeError);

assert.equal(publishedPotentialGrade(undefined), 'N');
assert.equal(publishedPotentialGrade({ publishedGrade: null }), 'N');
assert.equal(publishedPotentialGrade({ publishedGrade: 'SS' }), 'SS');
assert.equal(customerSalesStrategy('S', 'S').label, '核心战略客户');
assert.equal(customerSalesStrategy('C', 'S').label, '重点突破客户');
assert.equal(customerSalesStrategy('SS', 'D').label, '稳定维护客户');
assert.equal(customerSalesStrategy('D', 'D').label, '常规经营客户');
assert.equal(customerSalesStrategy('N', 'SS').label, '待补充评级证据');

console.log('PASS: weighted dimensions, grading, authorization-independent display rules');
