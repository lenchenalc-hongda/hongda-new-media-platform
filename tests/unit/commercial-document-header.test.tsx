import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import DocumentPreview from '../../src/components/commercial-documents/DocumentPreview';
import { initialDraft, blankItem, documentAmount, formatMoney } from '../../src/lib/commercial-documents/template';

// The repository's tsx runner uses the classic JSX transform.
Object.assign(globalThis, { React });
const headerPath = '/document-headers/hongda-quotation-header-zh.png';
const png = readFileSync(new URL('../../public' + headerPath, import.meta.url));
assert.equal(png.readUInt32BE(16), 2047);
assert.equal(png.readUInt32BE(20), 515);
for (const kind of ['quotation', 'machine_contract'] as const) {
  for (const language of ['zh', 'en'] as const) {
    for (const counts of [[2], [4, 3, 3], [20, 20, 20]]) {
      const draft = initialDraft('业务员测试');
      Object.assign(draft, { kind, language, buyerName: '客户测试', buyerContact: '联系人测试', projectName: '项目测试' });
      draft.sections = counts.map((count, i) => ({
        id: String(i), title: ['版费', '花膜', '机器'][i],
        items: Array.from({ length: count }, (_, j) => ({
          ...blankItem(`${i}-${j}`), name: `产品-${i}-${j}`, quantity: '10', unitPrice: '100',
        })),
      }));
      const html = renderToStaticMarkup(React.createElement(DocumentPreview, { draft }));
      const imageHeader = kind === 'quotation' && language === 'zh';
      assert.equal(html.includes(headerPath), imageHeader && language === 'zh');
      assert.equal(html.includes('/document-headers/hongda-quotation-header-en.jpg'), false);
      assert.equal(html.includes('/hongda-os-original-emblem.png'), !imageHeader);
      assert.equal(html.includes(language === 'zh' ? '卖方 / 报价方' : 'Seller'), !imageHeader);
      for (const text of ['业务员测试', '客户测试', '联系人测试', '项目测试', formatMoney(documentAmount(draft).amountMinor, draft.currency)]) {
        assert(html.includes(text), `Missing ${text}`);
      }
      for (const section of draft.sections) for (const item of section.items) assert(html.includes(item.name));
      assert.equal(html.includes('Signature / Seal'), kind === 'machine_contract' && language === 'en');
    }
  }
}
console.log('commercial-document-header: PASS (12 template/length combinations)');
