import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import DocumentPreview from '../../src/components/commercial-documents/DocumentPreview';
import { initialDraft, blankItem } from '../../src/lib/commercial-documents/template';
Object.assign(globalThis, { React });
mkdirSync('output/quotation-qa', { recursive: true });
const css = readFileSync('output/quotation-qa/styles.css', 'utf8');
for (const [name, counts] of Object.entries({ short: [2], medium: [4, 3, 3], long: [20, 20, 20] })) {
  const draft = initialDraft('测试业务员（非正式报价）');
  Object.assign(draft, { documentNo: 'HD-Q-QA-' + name, date: '2026-10-20', buyerName: '排版验收测试客户（虚构）', buyerContact: '测试联系人', projectName: '中文报价打印验收', validity: '30天', paymentTerms: '版费先付，花膜发货前付款。', shippingTerms: 'EXW（工厂交货）。', deliveryTerms: '确认后15天。', taxStatement: 'vat13' });
  draft.sections = counts.map((count, i) => ({ id: String(i), title: ['版费', '花膜', '机器'][i], items: Array.from({ length: count }, (_, j) => ({ ...blankItem(`${i}-${j}`), name: `${['版费', '花膜', '机器'][i]}测试产品 ${j + 1}`, specification: '验收样张 · 不用于商业交易', quantity: '10', unitPrice: '100', unit: '件' })) }));
  let html = renderToStaticMarkup(<DocumentPreview draft={draft} />);
  for (const path of ['/document-headers/hongda-quotation-header-zh.png', '/hongda-os-original-emblem.png']) html = html.replaceAll(path, 'data:image/png;base64,' + readFileSync('public' + path).toString('base64'));
  // Match the production print ancestors so its print-reset rules are exercised.
  writeFileSync(`output/quotation-qa/${name}.html`, `<!doctype html><html lang="zh"><meta charset="utf-8"><style>${css}</style><body><main><div class="commercial-root"><div class="commercial-workspace"><div class="commercial-preview-shell"><div class="commercial-preview-inner"><div class="commercial-preview-scroll">${html}</div></div></div></div></div></main></body></html>`);
}
