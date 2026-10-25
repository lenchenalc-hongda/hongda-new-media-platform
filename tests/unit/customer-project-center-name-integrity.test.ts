import assert from 'node:assert/strict';
import {
  findInvalidCustomerNameRows,
  hasCustomerNameEncodingDamage,
  isUsableCustomerName,
} from '../../src/lib/customer-projects/customer-name-integrity';

console.log('\n=== Customer Project Center Customer Name Integrity ===');

assert.equal(hasCustomerNameEncodingDamage('正常的中文客户有限公司'), false);
assert.equal(hasCustomerNameEncodingDamage('Example Customer GmbH'), false);
assert.equal(hasCustomerNameEncodingDamage('客户\uFFFD名称'), true);
assert.equal(hasCustomerNameEncodingDamage('一个含?的合法商号'), false);
assert.equal(isUsableCustomerName(' 深圳客户有限公司 '), true);
assert.equal(isUsableCustomerName(''), false);
assert.equal(isUsableCustomerName('  '), false);
assert.equal(isUsableCustomerName(null), false);
assert.equal(isUsableCustomerName('客户\uFFFD名称'), false);

assert.deepEqual(findInvalidCustomerNameRows([
  { displayNameSnapshot: '正常客户 A' },
  { displayNameSnapshot: '名称\uFFFD损坏' },
  { displayNameSnapshot: '   ' },
  { displayNameSnapshot: '正常客户 B' },
]), [1, 2]);

console.log('PASS: damaged names fail preflight without changing existing customer reads.');
