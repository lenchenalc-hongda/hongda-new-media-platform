import assert from 'node:assert/strict';
import {
  classifyCustomerActualGrade,
  CUSTOMER_ACTUAL_GRADE_CUTOFFS_CNY_FEN,
} from '../../src/lib/customer-projects/customer-actual-rating';

console.log('\n=== CPC Actual Customer Rating: owner-approved financial brackets ===');

const actual = (cents: number) =>
  classifyCustomerActualGrade({ financeDataState: 'verified', netReceiptsCnyFen: cents });

// N is an explicit ungraded state, NOT zero receipts.
assert.equal(classifyCustomerActualGrade({ financeDataState: 'ungraded' }), 'N');
assert.equal(actual(0), 'D');
assert.equal(actual(-1), 'D');

// Every threshold: exactly on the boundary and one cent on either side.
assert.equal(actual(1_000_000 - 1), 'D');
assert.equal(actual(1_000_000), 'C');
assert.equal(actual(1_000_000 + 1), 'C');

assert.equal(actual(10_000_000 - 1), 'C');
assert.equal(actual(10_000_000), 'B');
assert.equal(actual(10_000_000 + 1), 'B');

assert.equal(actual(50_000_000 - 1), 'B');
assert.equal(actual(50_000_000), 'A');
assert.equal(actual(50_000_000 + 1), 'A');

assert.equal(actual(100_000_000 - 1), 'A');
assert.equal(actual(100_000_000), 'A');
assert.equal(actual(100_000_000 + 1), 'S');

assert.equal(actual(300_000_000 - 1), 'S');
assert.equal(actual(300_000_000), 'S');
assert.equal(actual(300_000_000 + 1), 'SS');

assert.equal(actual(900_000_000), 'SS');
assert.throws(() => actual(Number.NaN), RangeError);
assert.throws(() => actual(Infinity), RangeError);
assert.throws(() => actual(1.5), RangeError);
assert.throws(() => actual(Number.MAX_SAFE_INTEGER + 1), RangeError);

assert.deepEqual(CUSTOMER_ACTUAL_GRADE_CUTOFFS_CNY_FEN, {
  SS_EXCLUSIVE: 300_000_000,
  S_EXCLUSIVE: 100_000_000,
  A_INCLUSIVE: 50_000_000,
  B_INCLUSIVE: 10_000_000,
  C_INCLUSIVE: 1_000_000,
});

console.log('PASS: SS/S/A/B/C/D/N, boundary conditions and ungraded safety');
