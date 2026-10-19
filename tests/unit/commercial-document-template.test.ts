import assert from 'node:assert/strict';
import {
  initialDraft, blankItem, moneyToMinor, quantityToMilli, itemAmountMinor,
  sectionAmount, documentAmount, validateForPrint, isDraftShape,
} from '../../src/lib/commercial-documents/template';
import { canRoleAccessPage, getPageSlugFromRoute } from '../../src/lib/auth/roles';
import { getPortalForPath, getVisiblePortalGroups } from '../../src/lib/constants/navigation';

assert.equal(moneyToMinor('3.60'), 360);
assert.equal(moneyToMinor('0'), 0);
assert.equal(moneyToMinor('3.600'), null);
assert.equal(moneyToMinor('-1'), null);
assert.equal(moneyToMinor('1e6'), null);
assert.equal(moneyToMinor('abc'), null);
assert.equal(quantityToMilli('1.25'), 1250);
assert.equal(quantityToMilli('0'), null);
assert.equal(quantityToMilli('1.2345'), null);

const draft = initialDraft();
draft.documentNo = 'HD-TEST-001';
draft.sellerName = '经确认的报价主体';
draft.buyerName = '测试客户';
draft.sections = [
  {
    id: 'a', title: '版费', items: [
      { ...blankItem('1'), name: '制版', quantity: '2', unitPrice: '500.00' },
    ],
  },
  {
    id: 'b', title: '花膜', items: [
      { ...blankItem('2'), name: '常规花膜', quantity: '1000', unit: '㎡', unitPrice: '3.60' },
      { ...blankItem('3'), name: '仅供选择的单价', mode: 'catalog', quantity: '', unitPrice: '7.50' },
    ],
  },
  {
    id: 'c', title: '机器', items: [
      { ...blankItem('4'), name: '半自动热转印机', quantity: '1', unit: '台', unitPrice: '18000.00' },
    ],
  },
];
assert.equal(itemAmountMinor(draft.sections[0].items[0]), 100000);
assert.equal(sectionAmount(draft.sections[1]).amountMinor, 360000);
assert.equal(sectionAmount(draft.sections[1]).catalogLines, 1);
assert.equal(documentAmount(draft).amountMinor, 2260000);
assert.equal(documentAmount(draft).catalogLines, 1);
assert.deepEqual(validateForPrint(draft), []);

draft.taxStatement = 'vat13';
assert.equal(documentAmount(draft).amountMinor, 2260000, '13% tax flag must not alter entered prices');

draft.kind = 'machine_contract';
assert(validateForPrint(draft).some(x => x.includes('合同不能包含')));
assert(validateForPrint(draft).some(x => x.includes('付款条款')));
draft.sections[1].items[1].mode = 'amount';
draft.sections[1].items[1].quantity = '1';
draft.paymentTerms = '经确认的付款条件';
draft.deliveryTerms = '经确认的交付条件';
draft.acceptanceTerms = '经确认的验收条件';
draft.warrantyTerms = '经确认的保修条件';
assert.deepEqual(validateForPrint(draft), []);

assert(isDraftShape(draft));
assert(!isDraftShape({ ...draft, sections: [{ id: 'x', title: 'x', items: [null] }] }));
assert.equal(getPortalForPath('/commercial-documents'), 'commercial');
assert.equal(getPageSlugFromRoute('/commercial-documents'), 'commercial_documents');

for (const role of ['admin', 'manager', 'operator', 'sales', 'viewer'] as const) {
  assert(canRoleAccessPage(role, 'commercial_documents'), role + ' must be allowed');
  const visible = getVisiblePortalGroups({
    projectReviewCenterEnabled: true,
    customerProjectCenterEnabled: true,
    canAccessCustomerProjectCenter: role === 'admin' || role === 'manager' || role === 'sales',
    currentRole: role,
  });
  assert(visible.some(group => group.id === 'commercial' && group.items.some(item => item.path === '/commercial-documents')),
    role + ' must see commercial documents nav');
}
console.log('commercial-document-template.test.ts: PASS');
