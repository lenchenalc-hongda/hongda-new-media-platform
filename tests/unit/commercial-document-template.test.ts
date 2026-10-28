import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ALIPAY_QR_METHOD_KEY,
  WECHAT_ALIPAY_LABEL,
  WECHAT_ALIPAY_METHOD_ID,
  WECHAT_QR_METHOD_KEY,
  PAYMENT_METHOD_SORT_ORDER,
  HONGDA_FOREIGN_ACCOUNT_LABELS,
  buildPaymentMethodChoices,
  methodLabel,
  qrCodeLabel,
  type CommercialPaymentMethod,
} from '../../src/lib/commercial-documents/payment-methods';
import {
  initialDraft, blankItem, moneyToMinor, quantityToMilli, itemAmountMinor, formatMoney,
  sectionAmount, documentAmount, validateForPrint, isDraftShape,
  FIXED_SELLER_NAME, PAYMENT_PRESETS, SHIPPING_PRESETS, paymentPresetText, shippingPresetText,
  formatDocumentNumber, isGeneratedDocumentNumber, normalizeImportedDraft,
} from '../../src/lib/commercial-documents/template';
import { canRoleAccessPage, getPageSlugFromRoute } from '../../src/lib/auth/roles';
import { activeNoticeTypes, documentProductNotices, inferNoticeType, sectionNoticeType, APPROVED_ZH_NOTICES } from '../../src/lib/commercial-documents/product-notices';
import { getPortalForPath, getVisiblePortalGroups } from '../../src/lib/constants/navigation';

assert.equal(moneyToMinor('3.60'), 3600);
assert.equal(moneyToMinor('0'), 0);
assert.equal(moneyToMinor('3.600'), 3600);
assert.equal(moneyToMinor('3.605'), 3605);
assert.equal(moneyToMinor('0.001'), 1);
assert.equal(moneyToMinor('0.000'), 0);
assert.equal(moneyToMinor('3.6000'), null, 'four decimal places are not allowed');
assert.equal(moneyToMinor('0.0009'), null);
assert.equal(moneyToMinor('100000000000.000'), null, 'eleven integer digits is the limit');
assert.equal(moneyToMinor('-1'), null);
assert.equal(moneyToMinor('1e6'), null);
assert.equal(moneyToMinor('abc'), null);
assert.equal(quantityToMilli('1.25'), 1250);
assert.equal(quantityToMilli('1.234'), 1234);
assert.equal(quantityToMilli('0'), null);
assert.equal(quantityToMilli('1.2345'), null);


// 0.001-price precision must survive multiplication, subtotal, total and localization.
const threeDecimal = initialDraft('Precision QA');
threeDecimal.documentNo = 'HD-Q-DECIMAL-3';
threeDecimal.buyerName = 'Precision test buyer';
threeDecimal.sections = [{
  id: 'precision', title: '3-decimal precision', items: [
    { ...blankItem('p1'), name: 'Item one', quantity: '2', unitPrice: '3.601' },
    { ...blankItem('p2'), name: 'Item two', quantity: '1', unitPrice: '0.001' },
    { ...blankItem('p3'), name: 'Catalog entry', mode: 'catalog', quantity: '', unitPrice: '0.125' },
  ],
}];
assert.equal(itemAmountMinor(threeDecimal.sections[0].items[0]), 7202);
assert.equal(itemAmountMinor(threeDecimal.sections[0].items[1]), 1);
assert.equal(sectionAmount(threeDecimal.sections[0]).amountMinor, 7203);
assert.equal(documentAmount(threeDecimal).amountMinor, 7203);
assert.equal(documentAmount(threeDecimal).catalogLines, 1);
assert.equal(formatMoney(7203, 'CNY').includes('7.203'), true);
assert.equal(formatMoney(7203, 'USD').includes('7.203'), true);
assert.equal(formatMoney(7203, 'EUR').includes('7.203'), true);
assert.equal(formatMoney(3600, 'CNY').includes('3.60'), true, 'old 2-decimal amounts must keep their display');
assert.equal(formatMoney(1, 'USD').includes('0.001'), true);
assert.equal(formatMoney(0, 'EUR').includes('0.00'), true);
assert.equal(itemAmountMinor({ ...blankItem('half'), name: 'Half', quantity: '0.5', unitPrice: '1.235' }), 618,
  'one half-thousandth rounds up at the line level');
assert.equal(itemAmountMinor({ ...blankItem('third'), name: 'Third', quantity: '1.5', unitPrice: '3.605' }), 5408);
assert.equal(itemAmountMinor({ ...blankItem('tiny'), name: 'Tiny', quantity: '0.001', unitPrice: '0.001' }), 0,
  'values below half a thousandth round down');
for (const language of ['zh', 'en'] as const) {
  threeDecimal.language = language;
  assert.deepEqual(validateForPrint(threeDecimal), [], 'three decimal quote in ' + language);
  assert.equal(isDraftShape(threeDecimal), true);
  const restored = normalizeImportedDraft(JSON.parse(JSON.stringify(threeDecimal)), 'Precision QA');
  assert.equal(restored.sections[0].items[0].unitPrice, '3.601', 'JSON must preserve third unit-price digit');
  assert.equal(documentAmount(restored).amountMinor, 7203, 'JSON round-trip must preserve exact 0.001 sums');
}
threeDecimal.taxStatement = 'vat13';
assert.equal(documentAmount(threeDecimal).amountMinor, 7203, 'Tax label cannot silently change entered prices');
threeDecimal.sections[0].items[0].unitPrice = '3.6015';
assert(validateForPrint(threeDecimal).some(error => error.includes('最多3位小数')));
threeDecimal.sections[0].items[0].unitPrice = '3.601';

const blankQuotation = initialDraft('业务员');
assert.deepEqual(blankQuotation.sections, [], 'Section 03 must start with no preselected plate fee');
assert.equal(documentAmount(blankQuotation).amountMinor, 0, 'Unselected sections cannot add phantom pricing');
assert(isDraftShape(blankQuotation), 'An empty-section quote must be a valid unfinished draft');
assert(validateForPrint(blankQuotation).some(message => message.includes('至少添加一个报价大项')),
  'Printing or confirming an unconfigured quote must remain blocked');
for (const language of ['zh', 'en'] as const) {
  const empty = { ...blankQuotation, language };
  assert.equal(isDraftShape(empty), true, 'Empty section shape must work in ' + language);
  assert.deepEqual(normalizeImportedDraft(empty, 'Sales').sections, [],
    'Bilingual draft import must preserve an unselected Section 03');
}
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
assert.equal(itemAmountMinor(draft.sections[0].items[0]), 1000000);
assert.equal(sectionAmount(draft.sections[1]).amountMinor, 3600000);
assert.equal(sectionAmount(draft.sections[1]).catalogLines, 1);
assert.equal(documentAmount(draft).amountMinor, 22600000);
assert.equal(documentAmount(draft).catalogLines, 1);
draft.machineWarrantyPeriod = '1年';
assert.deepEqual(validateForPrint(draft), []);

draft.taxStatement = 'vat13';
assert.equal(documentAmount(draft).amountMinor, 22600000, '13% tax flag must not alter entered prices');

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

const notices = initialDraft('业务员');
notices.documentNo = 'HD-Q-TEST-NOTES';
notices.buyerName = '客户';
notices.sections = [
  { id: 'machine', title: '机器设备', items: [{ ...blankItem('m1'), name: '热转印机', unitPrice: '50000' }] },
];
assert.deepEqual(activeNoticeTypes(notices.sections), ['machine']);
assert.deepEqual(documentProductNotices(notices).map(n => n.type), ['machine']);
assert.equal(documentProductNotices(notices)[0].text, APPROVED_ZH_NOTICES.machine);
assert.deepEqual(validateForPrint(notices), [], 'Fixed machine wording must not require unused quote-only voltage or warranty fields');
notices.machineWarrantyPeriod = '18个月';
assert.equal(documentProductNotices(notices)[0].text, APPROVED_ZH_NOTICES.machine, 'Machine details cannot be injected into approved fixed notice');
assert.deepEqual(validateForPrint(notices), []);
notices.sections.push(
  { id: 'plate', title: '开版费', items: [{ ...blankItem('p1'), name: '铜版', unitPrice: '500' }] },
  { id: 'film', title: '凹版热转印花膜', items: [{ ...blankItem('g1'), name: 'PP花膜', unitPrice: '5' }] },
  { id: 'plate2', title: '制版费', items: [{ ...blankItem('p2'), name: '第二个铜版', unitPrice: '500' }] },
);
assert.deepEqual(activeNoticeTypes(notices.sections), ['machine', 'plate', 'gravure_film']);
assert.equal(documentProductNotices(notices).length, 3, 'Repeated sections get one clause per type');
assert(documentProductNotices(notices).find(n => n.type === 'plate')?.text.includes('18个月'));
assert(documentProductNotices(notices).find(n => n.type === 'gravure_film')?.text.includes('耐多轮洗碗机'));
notices.sections.shift();
assert.deepEqual(activeNoticeTypes(notices.sections), ['plate', 'gravure_film'], 'Remove machine group removes its notice');
notices.sections.push(
  { id: 'digital', title: '数码热转印花膜', items: [{ ...blankItem('d1'), name: '数码膜', unitPrice: '10' }] },
  { id: 'process', title: '加工费用', items: [{ ...blankItem('w1'), name: '转印加工', unitPrice: '2' }] },
  { id: 'other', title: '运费', items: [{ ...blankItem('o1'), name: '运输费', unitPrice: '100' }] },
);
assert.deepEqual(activeNoticeTypes(notices.sections), ['plate', 'gravure_film', 'digital_film', 'processing']);
assert.equal(inferNoticeType('数码花膜'), 'digital_film');
assert.equal(inferNoticeType('凹版花膜'), 'gravure_film');
assert.equal(inferNoticeType('热转印花膜'), 'gravure_film');
assert.equal(inferNoticeType('UV打印'), null);
assert.equal(inferNoticeType('机器'), 'machine');
assert.equal(inferNoticeType('加工'), 'processing');
const other = notices.sections.find(s => s.id === 'other')!;
assert.equal(sectionNoticeType(other), null);
other.noticeType = 'machine';
assert.equal(sectionNoticeType(other), 'machine');
other.noticeType = 'none';
assert.equal(sectionNoticeType(other), null);
notices.noticeOverrides = { plate: { zh: '定制铜版说明' } };
assert.equal(documentProductNotices(notices).find(n => n.type === 'plate')?.text, '定制铜版说明');
assert.equal(documentProductNotices(notices).find(n => n.type === 'plate')?.isCustomized, true);
notices.language = 'en';
assert(documentProductNotices(notices).find(n => n.type === 'plate')?.text.includes('18-month'));
assert(documentProductNotices(notices).find(n => n.type === 'processing')?.text.includes('3%'));
notices.language = 'zh';
notices.sections.find(s => s.id === 'process')!.items = [blankItem('empty')];
assert(!activeNoticeTypes(notices.sections).includes('processing'), 'Empty sections do not trigger clauses');
assert(isDraftShape(notices));
const restoredWithNotices = normalizeImportedDraft(notices, '当前登录业务员');
assert.equal(restoredWithNotices.noticeOverrides?.plate?.zh, '定制铜版说明');
assert.equal(restoredWithNotices.machineWarrantyPeriod, '18个月');
const older = { ...notices };
delete older.noticeOverrides;
delete older.machineVoltage;
delete older.machineFrequency;
delete older.machineWarrantyPeriod;
for (const group of older.sections) delete group.noticeType;
assert(isDraftShape(older), 'Legacy draft without notice fields must remain valid');
const oldRestored = normalizeImportedDraft(older, '当前账号');
assert.equal(oldRestored.machineVoltage, '220V');
assert.equal(oldRestored.machineFrequency, '60Hz');
assert.deepEqual(oldRestored.noticeOverrides, {});


// Contractual words below are the user-approved canonical Chinese terms.
// Deliberately strict about the unusual "1。" punctuation; do not autocorrect wording.
const expectedApprovedZh = {
  plate: [
    '1。 铜版自制版完成之日起享有18个月质量保证期。正常保管及使用情况下，因制版质量产生的问题由我司负责免费修补；客户修改图稿、尺寸或工艺要求所产生的费用另行计算。',
    '2. 超过质保期且连续12个月未下单的印版，期满后进行报废处理。印版实物归属及特殊保管要求以双方约定为准。',
  ].join('\n'),
  gravure_film: [
    '1. 印刷颜色、图案尺寸及套印效果以双方确认的实物样品为准。正常生产过程中可能存在合理批次差异；有特殊色差、套印精度要求的，须于打样前确认具体验收标准。',
    '2. 花膜的烫印结合力应依据客户实际产品材质、表面处理方式及烫印条件进行打样验证，并以双方确认的测试结果为准。',
    '3. 如产品涉及耐磨、耐酒精、耐水、耐高温、耐多轮洗碗机等特殊性能要求，应在生产前提出并另行确认测试条件及验收标准。',
  ].join('\n'),
  digital_film: [
    '数码热转印花膜依据客户最终确认的电子图稿及工艺要求生产。由于显示设备、印刷工艺及承印材料不同，实际印刷效果可能与屏幕显示存在一定差异；特殊色彩要求应通过实物打样确认。',
    '产品附着力及耐磨、耐水、耐高温等特殊性能须根据实际材质及使用条件另行验证。未经双方确认的特殊性能，不视为默认产品验收要求。',
  ].join('\n\n'),
  machine: [
    '设备电压、频率、气源及技术配置以双方最终确认的设备规格为准。设备生产能力应依据约定产品、花膜、夹具及测试条件进行验收。',
    '设备在正常使用及维护条件下，因制造质量产生的零部件故障，按双方约定的保修期限和范围提供售后服务。易损件、安装培训及其他服务事项以合同约定为准。',
  ].join('\n\n'),
  processing: [
    '客户提供的产品应符合双方确认的材质、尺寸及表面质量要求。我司在入库后进行约定的印前抽检；发现来料脏污、损伤或其他异常时，双方协商退回、清洁或另行处理。',
    '常规加工建议额外预留订单数量3%的产品作为试产及工艺损耗备品，具体损耗责任按实际原因及双方约定处理。高难度或特殊工艺产品的备品比例应在生产前另行确认。',
  ].join('\n\n'),
};
assert.deepEqual(APPROVED_ZH_NOTICES, expectedApprovedZh, 'Approved Chinese text must stay verbatim');
for (const type of Object.keys(expectedApprovedZh) as Array<keyof typeof expectedApprovedZh>) {
  const single = initialDraft('业务员');
  single.sections = [{ id: type, title: type, noticeType: type, items: [{ ...blankItem('one'), name: '测试', unitPrice: '10' }] }];
  assert.equal(documentProductNotices(single)[0].text, expectedApprovedZh[type], type + ' auto output must use approved text');
  single.kind = 'machine_contract';
  assert.equal(documentProductNotices(single)[0].text, expectedApprovedZh[type], type + ' machine contract output must use same approved text');
  single.machineVoltage = '380V';
  single.machineFrequency = '50Hz';
  single.machineWarrantyPeriod = '3年';
  assert.equal(documentProductNotices(single)[0].text, expectedApprovedZh[type], 'Old editable machine data must not alter the fixed final Chinese text');
}

// Direct account selection regression: no Excel upload surface, no financial data in source.
assert.deepEqual(PAYMENT_METHOD_SORT_ORDER.slice(0, 7), [
  'abc_corporate', 'ccb_personal', 'abc_personal', 'hsbc_hk',
  'jpmorgan_hk', 'bocom_usd_cn', 'bocom_hkd_cn',
], 'Original two overseas choices must become three separate bank options');
assert.deepEqual(PAYMENT_METHOD_SORT_ORDER.slice(7), [WECHAT_ALIPAY_METHOD_ID],
  'Seven bank options plus one combined WeChat / Alipay option');
assert.equal(PAYMENT_METHOD_SORT_ORDER.length, 8, 'The QR pair must be one selection, not two');
assert(!PAYMENT_METHOD_SORT_ORDER.join(',').includes('bocom_foreign'), 'No obsolete combined USD/HKD bank option');
assert.deepEqual(HONGDA_FOREIGN_ACCOUNT_LABELS, {
  jpmorgan_hk: 'Hongda USD Account HK',
  bocom_usd_cn: 'Hongda USD Account CN (Default)',
  bocom_hkd_cn: 'Hongda HKD Account CN',
}, 'Overseas option English labels must match approved wording exactly');
const selector = initialDraft('业务员');
assert.equal(selector.paymentMethodId, '');
const sampleMethod: CommercialPaymentMethod = {
  id: '00000000-0000-4000-8000-000000000001',
  methodKey: 'abc_corporate', kind: 'bank',
  labelZh: '对公账户', labelEn: 'Corporate Account',
  beneficiary: 'Sample beneficiary (not a real account)',
  bankName: 'Sample bank (not a real account)', accountNo: 'PLACEHOLDER_ONLY',
  notes: '', sourceCell: 'test', sourceNumeric: false, approved: false,
  qrSha256: null, qrUrl: null,
};
assert.equal(methodLabel(sampleMethod, 'zh'), '对公账户');
assert.equal(methodLabel(sampleMethod, 'en'), 'Corporate Account');
for (const [methodKey, expectedEnglish] of Object.entries(HONGDA_FOREIGN_ACCOUNT_LABELS)) {
  const foreign = { ...sampleMethod, methodKey, labelZh: '不应该显示此中文户名', labelEn: 'Database editable label' };
  assert.equal(methodLabel(foreign, 'zh'), expectedEnglish, 'Chinese quote must preserve approved English method name');
  assert.equal(methodLabel(foreign, 'en'), expectedEnglish, 'English quote must preserve approved English method name');
}
selector.paymentMethodId = sampleMethod.id;
assert(isDraftShape(selector), 'UUID selection must be compatible with local JSON drafts');
assert(!isDraftShape({ ...selector, paymentMethodId: 'spoofed-payment-account' }), 'Invalid IDs cannot be imported');
assert.equal(normalizeImportedDraft(selector, 'owner').paymentMethodId, sampleMethod.id);
assert.deepEqual(validateForPrint(selector).filter(problem => problem.includes('账号')), []);

const sampleWechatQr: CommercialPaymentMethod = {
  ...sampleMethod,
  id: '00000000-0000-4000-8000-000000000002',
  methodKey: WECHAT_QR_METHOD_KEY,
  kind: 'qr',
  labelZh: '微信收款',
  labelEn: 'WeChat Pay',
  beneficiary: '',
  bankName: '',
  accountNo: '',
  qrSha256: 'a'.repeat(64),
  qrUrl: '/api/commercial-documents/payment-methods/00000000-0000-4000-8000-000000000002/image',
};
const sampleAlipayQr: CommercialPaymentMethod = {
  ...sampleWechatQr,
  id: '00000000-0000-4000-8000-000000000003',
  methodKey: ALIPAY_QR_METHOD_KEY,
  labelZh: '支付宝收款',
  labelEn: 'Alipay',
  qrSha256: 'b'.repeat(64),
  qrUrl: '/api/commercial-documents/payment-methods/00000000-0000-4000-8000-000000000003/image',
};
const combinedMethods = buildPaymentMethodChoices([sampleMethod, sampleWechatQr, sampleAlipayQr]);
assert.equal(combinedMethods.length, 2, 'One bank plus one combined QR option');
const combinedQr = combinedMethods.find(method => method.kind === 'qr_pair');
assert(combinedQr, 'Complete same-status QR records must produce the combined option');
assert.equal(combinedQr.id, WECHAT_ALIPAY_METHOD_ID);
assert.equal(methodLabel(combinedQr, 'zh'), WECHAT_ALIPAY_LABEL);
assert.equal(methodLabel(combinedQr, 'en'), WECHAT_ALIPAY_LABEL);
assert.deepEqual(combinedQr.qrCodes?.map(code => code.methodKey), [WECHAT_QR_METHOD_KEY, ALIPAY_QR_METHOD_KEY],
  'WeChat must display before Alipay');
assert.equal(qrCodeLabel(combinedQr.qrCodes![0], 'zh'), '微信收款');
assert.equal(qrCodeLabel(combinedQr.qrCodes![1], 'zh'), '支付宝收款');
assert.equal(qrCodeLabel(combinedQr.qrCodes![0], 'en'), 'WeChat Pay');
assert.equal(qrCodeLabel(combinedQr.qrCodes![1], 'en'), 'Alipay');
assert.equal(buildPaymentMethodChoices([sampleMethod, sampleWechatQr]).length, 1,
  'A single QR member must fail the whole combination closed');
assert.equal(buildPaymentMethodChoices([
  sampleMethod, { ...sampleWechatQr, approved: true }, sampleAlipayQr,
]).length, 1, 'Mismatched approval states must fail the whole combination closed');
assert.equal(buildPaymentMethodChoices([
  sampleMethod, { ...sampleWechatQr, qrUrl: null }, sampleAlipayQr,
]).length, 1, 'A missing QR URL must hide the combination');

selector.paymentMethodId = WECHAT_ALIPAY_METHOD_ID;
assert(isDraftShape(selector), 'The stable combined selection ID must survive JSON import');
assert.equal(JSON.stringify(selector).includes('qrUrl'), false, 'Draft JSON must not persist QR URLs');
assert.equal(JSON.stringify(selector).includes('qrSha256'), false, 'Draft JSON must not persist QR bytes or hashes');
assert.equal(isDraftShape({ ...selector, paymentMethodId: 'wechat_qr' }), false,
  'Low-level QR row keys cannot be persisted as a selection');

const editorCode = readFileSync(new URL('../../src/components/commercial-documents/DocumentWorkbench.tsx', import.meta.url), 'utf8');
assert(editorCode.includes('Select a quotation section to add') && editorCode.includes('选择要添加的报价大项'),
  'Section 03 selector must be available in both languages');
assert(editorCode.includes('SECTION_PRESETS.map(preset => (') && editorCode.includes('addSection(value)'),
  'Selecting a category must create its first details block on demand');
assert(editorCode.includes('value="__custom__"') && editorCode.includes("addSection('')"),
  'Custom category must remain available without a prefilled name');
assert(editorCode.includes('draft.sections.length > 0 && ('),
  'Totals should only be visible after a pricing category is chosen');
const apiCode = readFileSync(new URL('../../src/app/api/commercial-documents/payment-methods/route.ts', import.meta.url), 'utf8');
const previewCode = readFileSync(new URL('../../src/components/commercial-documents/DocumentPreview.tsx', import.meta.url), 'utf8');
const imageApiCode = readFileSync(new URL('../../src/app/api/commercial-documents/payment-methods/[id]/image/route.ts', import.meta.url), 'utf8');
assert(editorCode.includes('选择收款账户'), 'Section 06 must contain a direct selector');
assert(!editorCode.includes('importPaymentWorkbook'), 'The editor must not request XLSX uploads');
assert(!editorCode.includes('导入《收款账号.xlsx》'), 'No account Excel import UI');
assert(!apiCode.includes('export async function POST'), 'Client must not import or modify payment catalogs');
assert(apiCode.includes("Cache-Control"), 'Sensitive account reads must not be cached publicly');
assert(apiCode.includes(".eq('org_id'"), 'Payment catalog must scope to organization');
assert(previewCode.includes('selectedMethod.accountNo'), 'Bilingual PDF must show the source account text');
assert(previewCode.includes('Bank address / SWIFT'), 'Overseas wire instructions must include address and SWIFT');
assert(editorCode.includes('Bank address / SWIFT'), 'Editor must show overseas SWIFT and bank address');
assert(apiCode.includes('order.includes(method.methodKey)'), 'Retired account option must not be returned by API');
assert(previewCode.includes('selectedMethod.qrUrl'), 'Payment QR must use the original authenticated image');
assert(apiCode.includes('buildPaymentMethodChoices'), 'API must aggregate the QR pair through the shared fail-closed helper');
assert(apiCode.includes('isCompleteQrPng'), 'API must verify both private QR byte streams before exposing the pair');
assert(editorCode.includes('expectedQrCount !== 2'), 'Editor must block incomplete QR-pair PDF output');
assert(editorCode.includes('data-payment-qr'), 'Print readiness must identify payment QR images explicitly');
assert(previewCode.includes('document-payment-qr-grid'), 'PDF preview must provide a two-image QR layout');
assert(previewCode.includes('data-payment-qr'), 'Preview QR images must participate in print readiness');
assert(imageApiCode.includes('privateResponse'), 'QR image errors must also use private no-store headers');

console.log('commercial-document-template.test.ts: PASS');
