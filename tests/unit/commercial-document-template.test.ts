import assert from 'node:assert/strict';
import {
  initialDraft, blankItem, moneyToMinor, quantityToMilli, itemAmountMinor,
  sectionAmount, documentAmount, validateForPrint, isDraftShape,
  FIXED_SELLER_NAME, PAYMENT_PRESETS, SHIPPING_PRESETS, paymentPresetText, shippingPresetText,
  formatDocumentNumber, isGeneratedDocumentNumber, normalizeImportedDraft,
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

const draft = initialDraft('测试业务员');
assert.equal(draft.sellerName, FIXED_SELLER_NAME);
assert.equal(draft.salespersonName, '测试业务员');
assert.equal(draft.sellerAddress, '');
assert.equal(draft.sellerContact, '');
draft.documentNo = 'HD-TEST-001';
draft.sellerName = FIXED_SELLER_NAME;
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

assert.equal(PAYMENT_PRESETS.length, 6);
assert.equal(SHIPPING_PRESETS.length, 6);
assert.equal(paymentPresetText('film_monthly', ''), '版费先付，花膜月结。');
assert.equal(paymentPresetText('film_before_shipping', ''), '版费先付，花膜发货前付款。');
assert.equal(paymentPresetText('monthly', ''), '月结。');
assert.equal(paymentPresetText('machine_deposit', ''), '机器定金50%，发货前付清剩余50%尾款。');
assert.equal(paymentPresetText('credit_days', '30'), '账期30天，具体起算时间以双方约定为准。');
for (const wrongDays of ['', '0', '366', '1.5', '-5', 'x']) {
  assert.equal(paymentPresetText('credit_days', wrongDays), '', 'invalid credit period: ' + wrongDays);
}
assert.equal(shippingPresetText('exw'), 'EXW（工厂交货），具体交货地点以双方约定为准。');
assert.equal(shippingPresetText('ddp'), 'DDP（完税后交货），具体目的地以双方约定为准。');
assert.equal(shippingPresetText('included'), '含运费。');
assert.equal(shippingPresetText('excluded'), '不含运费。');
assert.equal(paymentPresetText('monthly', '', 'en'), 'Monthly settlement.');
assert.equal(paymentPresetText('credit_days', '30', 'en'), 'Payment term: 30 days; start date subject to mutual agreement.');
assert.equal(paymentPresetText('machine_deposit', '', 'en'), '50% deposit for the machine; remaining 50% balance payable before shipment.');
assert.equal(shippingPresetText('exw', 'en'), 'EXW (Ex Works), named place to be agreed.');
assert.equal(shippingPresetText('included', 'en'), 'Freight included.');

const opaque = formatDocumentNumber('quotation', '2026-10-19', 'K7M4X8R2P5LF');
const machineOpaque = formatDocumentNumber('machine_contract', '2026-10-19', 'K7M4X8R2P5LF');
assert.equal(opaque, 'HD-Q-2610-K7M4X8R2P5LF');
assert.equal(machineOpaque, 'HD-C-2610-K7M4X8R2P5LF');
assert(isGeneratedDocumentNumber(opaque));
assert(isGeneratedDocumentNumber(machineOpaque));
assert(!isGeneratedDocumentNumber('HD-Q-00001'));
assert(!isGeneratedDocumentNumber('CUSTOM-2026-01'));

const unsafeImported = {
  ...draft,
  sellerName: '被错误填写的公司名称',
  sellerAddress: '不应显示的卖方地址',
  sellerContact: '不应显示的电话',
  buyerAddress: '不应显示的客户地址',
  salespersonName: '其他员工',
  accountLabel: '未经确认的账户',
  accountDetails: '123456789',
  buyerCustomerReferenceId: 'unsafe-reference',
  paymentPreset: 'credit_days' as const,
  paymentDays: '30',
};
const cleaned = normalizeImportedDraft(unsafeImported, '当前登录业务员');
assert.equal(cleaned.sellerName, FIXED_SELLER_NAME);
assert.equal(cleaned.salespersonName, '当前登录业务员');
assert.equal(cleaned.sellerAddress, '');
assert.equal(cleaned.sellerContact, '');
assert.equal(cleaned.buyerAddress, '');
assert.equal(cleaned.accountDetails, '');
assert.equal(cleaned.buyerCustomerReferenceId, '');
assert.equal(cleaned.documentNo, draft.documentNo);
assert.equal(cleaned.paymentPreset, 'credit_days');
assert.deepEqual(validateForPrint(cleaned), []);
cleaned.paymentDays = '400';
assert(validateForPrint(cleaned).some(x => x.includes('账期天数')));

const oldDraft = { ...draft } as Record<string, unknown>;
delete oldDraft.salespersonName;
delete oldDraft.buyerCustomerReferenceId;
delete oldDraft.paymentPreset;
delete oldDraft.paymentDays;
delete oldDraft.shippingPreset;
assert(isDraftShape(oldDraft), 'legacy JSON drafts should remain importable');
const restored = normalizeImportedDraft(oldDraft as unknown as typeof draft, '当前账号');
assert.equal(restored.salespersonName, '当前账号');
assert.equal(restored.paymentPreset, 'other');
assert.equal(restored.shippingPreset, draft.shippingTerms ? 'other' : '');
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
