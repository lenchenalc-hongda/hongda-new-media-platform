import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import DocumentPreview from '../../src/components/commercial-documents/DocumentPreview';
import { initialDraft, blankItem } from '../../src/lib/commercial-documents/template';
import {
  ALIPAY_QR_METHOD_KEY,
  WECHAT_ALIPAY_LABEL,
  WECHAT_ALIPAY_METHOD_ID,
  WECHAT_QR_METHOD_KEY,
  type CommercialPaymentMethod,
} from '../../src/lib/commercial-documents/payment-methods';
Object.assign(globalThis, { React });
mkdirSync('output/quotation-qa', { recursive: true });
const css = readFileSync('output/quotation-qa/styles.css', 'utf8');

function qaQrImage(seed: number): string {
  const modules = Array.from({ length: 29 }, (_, y) => Array.from({ length: 29 }, (_, x) => {
    const finder = (x < 7 && y < 7) || (x > 21 && y < 7) || (x < 7 && y > 21);
    const border = x === 0 || y === 0 || x === 28 || y === 28;
    const pattern = ((x * 13 + y * 17 + seed * 11) % 5) < 2;
    return finder || border || pattern ? `<rect x="${x * 28}" y="${y * 28}" width="28" height="28"/>` : '';
  }).join('')).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1122" height="1402" viewBox="0 0 1122 1402"><rect width="1122" height="1402" fill="#fff"/><rect x="175" y="175" width="812" height="812" fill="#fff" stroke="#111" stroke-width="12"/><g fill="#111" transform="translate(189 189)">${modules}</g></svg>`;
  return 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
}

const qaQrPair: CommercialPaymentMethod = {
  id: WECHAT_ALIPAY_METHOD_ID,
  methodKey: WECHAT_ALIPAY_METHOD_ID,
  kind: 'qr_pair',
  labelZh: WECHAT_ALIPAY_LABEL,
  labelEn: WECHAT_ALIPAY_LABEL,
  beneficiary: '',
  bankName: '',
  accountNo: '',
  notes: '',
  sourceCell: 'qa_fixture',
  sourceNumeric: false,
  approved: false,
  qrSha256: null,
  qrUrl: null,
  qrCodes: [
    {
      id: '00000000-0000-4000-8000-000000000021',
      methodKey: WECHAT_QR_METHOD_KEY,
      qrSha256: 'c'.repeat(64),
      qrUrl: qaQrImage(1),
    },
    {
      id: '00000000-0000-4000-8000-000000000022',
      methodKey: ALIPAY_QR_METHOD_KEY,
      qrSha256: 'd'.repeat(64),
      qrUrl: qaQrImage(2),
    },
  ],
};

for (const language of ['zh', 'en'] as const) {
for (const [baseName, counts] of Object.entries({ short: [2], medium: [4, 3, 3], long: [20, 20, 20], all_types: [2, 2, 2, 2, 2], qr_pair: [2] })) {
  const name = language === 'en' ? `en-${baseName}` : baseName;
  const draft = initialDraft('测试业务员（非正式报价）');
  Object.assign(draft, { language, documentNo: 'HD-Q-QA-' + name, date: '2026-10-20', buyerName: '排版验收测试客户（虚构）', buyerContact: '测试联系人', projectName: '中文报价打印验收', validity: '30天', machineWarrantyPeriod: '1年', paymentTerms: '版费先付，花膜发货前付款。', shippingTerms: 'EXW（工厂交货）。', deliveryTerms: '确认后15天。', taxStatement: 'vat13' });
  draft.sections = counts.map((count, i) => ({ id: String(i), title: ['版费', '花膜', '机器', '数码热转印花膜', '加工费用'][i], items: Array.from({ length: count }, (_, j) => ({ ...blankItem(`${i}-${j}`), name: `${['版费', '花膜', '机器', '数码膜', '加工'][i]}测试产品 ${j + 1}`, specification: '验收样张 · 不用于商业交易', quantity: '10', unitPrice: '100', unit: '件' })) }));
  if (language === 'en') {
    Object.assign(draft, { salespersonName: 'QA Sales', buyerName: 'Sample Buyer (fictional)', buyerContact: 'QA Contact', projectName: 'English quotation print QA', validity: '30 days', paymentTerms: 'Plate charges payable in advance; film balance before shipment.', shippingTerms: 'EXW', deliveryTerms: '15 days after confirmation.' });
    draft.sections.forEach((section, i) => {
      section.items.forEach((item, j) => Object.assign(item, { name: `Sample product ${i + 1}-${j + 1}`, specification: 'Print QA sample - not for commercial use', unit: 'pcs' }));
    });
  }
  let html = renderToStaticMarkup(<DocumentPreview
    draft={draft}
    selectedMethod={baseName === 'qr_pair' ? qaQrPair : null}
  />);
  for (const path of ['/document-headers/hongda-quotation-header-zh.png', '/hongda-os-original-emblem.png', '/document-headers/hongda-quotation-header-en.jpg']) html = html.replaceAll(path, (path.endsWith('.jpg') ? 'data:image/jpeg;base64,' : 'data:image/png;base64,') + readFileSync('public' + path).toString('base64'));
  // Match the production print ancestors so its print-reset rules are exercised.
  writeFileSync(`output/quotation-qa/${name}.html`, `<!doctype html><html lang="${language}"><meta charset="utf-8"><style>${css}</style><body><main><div class="commercial-root"><div class="commercial-workspace"><div class="commercial-preview-shell"><div class="commercial-preview-inner"><div class="commercial-preview-scroll">${html}</div></div></div></div></div></main></body></html>`);
}

}
