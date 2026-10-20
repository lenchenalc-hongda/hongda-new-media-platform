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
      draft.machineWarrantyPeriod = '1年';
      draft.sections = counts.map((count, i) => ({
        id: String(i), title: ['版费', '花膜', '机器'][i],
        items: Array.from({ length: count }, (_, j) => ({
          ...blankItem(`${i}-${j}`), name: `产品-${i}-${j}`, quantity: '10', unitPrice: '100',
        })),
      }));
      const html = renderToStaticMarkup(React.createElement(DocumentPreview, { draft }));
      const imageHeader = kind === 'quotation' && language === 'zh';
      const clauseCount = (html.match(/class="document-product-note text-gray-800"/g) || []).length;
      assert.equal(clauseCount, counts.length === 1 ? 1 : 3, 'Terms must follow actual product categories without duplicates');
      assert(html.includes(language === 'zh' ? '产品及工艺说明' : 'PRODUCT / PROCESS NOTES'));
      assert(html.includes('document-product-note-label'), 'Category titles retain consistent typography');
      assert(html.includes('document-product-note-body'), 'Approved body text must use a preserved multiline layout');
      assert(html.includes('grid-template-columns: 120px minmax(0, 1fr)'), 'PDF categories should have consistent compact label widths');
      assert(html.includes(language === 'zh' ? '1.铜版自制版完成之日起享有18个月质量保证期' : '18-month quality guarantee'));
      if (counts.length === 1) {
        assert(!html.includes(language === 'zh' ? '设备电压、频率、气源及技术配置以双方最终确认的设备规格为准。' : 'Standard power:'));
        assert(!html.includes(language === 'zh' ? '烫印结合力应依据' : 'Transfer adhesion must'));
      } else {
        assert(html.includes(language === 'zh' ? '耐多轮洗碗机' : '±0.3 mm'));
        assert(html.includes(language === 'zh' ? '设备电压、频率、气源及技术配置以双方最终确认的设备规格为准。' : '220V / 60Hz'));
      }
      assert.equal(html.includes(headerPath), imageHeader && language === 'zh');
      assert.equal(html.includes('/document-headers/hongda-quotation-header-en.jpg'), false);
      assert.equal(html.includes('/hongda-os-original-emblem.png'), !imageHeader);
      // Compact styling is applied only to the Chinese quotation; machine contracts and English quotes
      // retain the exact previous density and header structure.
      assert.equal(html.includes('class="commercial-print compact-quotation bg-white'), imageHeader);
      // Keep the original PNG width/height; never stretch or crop brand artwork.
      if (imageHeader) {
        assert(html.includes('width="2047" height="515"'), 'Original artwork dimensions must be retained');
        assert(html.includes('width:100%;height:auto'), 'Artwork must retain aspect ratio');
        assert(html.includes('table .document-section-title { padding: 5px 9px; line-height: 16px; }'));
        assert(html.includes('margin-top: 8px;'), 'Group sections must use compact vertical spacing');
        assert(html.includes('.document-section + .document-section { margin-top: 8px; }'), 'Group spacing must use SSR-safe selectors');
        assert(!html.includes('.compact-quotation &gt;'), 'HTML-escaped CSS combinators must never break print styles');
        assert(html.includes('document-total-amount'), 'Subtotal and total must retain clear text hierarchy');
        assert(html.includes('display: flex !important; flex-direction: row !important; justify-content: space-between !important;'), 'PDF total must use flex even under print resets');
        assert(html.includes('margin-left: auto; text-align: right;'), 'Total amount must align to the right edge');
        assert(html.includes('white-space: nowrap;'), 'Total amount must never wrap');
        assert(html.includes('padding: 8px 12px !important; gap: 12px;'), 'Keep the approved compact red total band');
        assert(html.includes('tbody tr:last-child { break-after: avoid-page; page-break-after: avoid; }'), 'Last item should stay with group subtotal');
      }
      assert.equal(html.includes(language === 'zh' ? '卖方 / 报价方' : 'Seller'), !imageHeader);
      for (const text of ['业务员测试', '客户测试', '联系人测试', '项目测试', formatMoney(documentAmount(draft).amountMinor, draft.currency)]) {
        assert(html.includes(text), `Missing ${text}`);
      }
      for (const section of draft.sections) for (const item of section.items) assert(html.includes(item.name));
      assert.equal(html.includes('模板草稿') || html.includes('DRAFT TEMPLATE'), kind === 'machine_contract',
        'Quotation PDFs should not show the draft disclaimer, while unfinished machine contract templates retain it');
      assert.equal(html.includes('Signature / Seal'), kind === 'machine_contract' && language === 'en');
    }
  }
}
console.log('commercial-document-header: PASS (12 template/length combinations)');
