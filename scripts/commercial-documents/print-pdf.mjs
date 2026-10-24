import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { writeFileSync } from 'node:fs';
const require = createRequire('/tmp/quotation-browser/package.json');
const { chromium } = require('playwright');
const browser = await chromium.launch({ headless: true });
const results = [];
try {
  for (const name of [
    'short', 'medium', 'long', 'all_types', 'qr_pair',
    'en-short', 'en-medium', 'en-long', 'en-all_types', 'en-qr_pair',
  ]) {
    const english = name.startsWith('en-');
    const baseName = name.replace(/^en-/, '');
    const page = await browser.newPage({ viewport: { width: 900, height: 1200 } });
    await page.goto('file://' + resolve(`output/quotation-qa/${name}.html`));
    await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map(img => img.decode())); });
    const image = await page.locator('header img').evaluate(img => ({ width: img.naturalWidth, height: img.naturalHeight, renderedWidth: img.width, renderedHeight: img.height }));
    if (image.width !== (english ? 2048 : 2047) || image.height !== (english ? 464 : 515)) throw new Error('Header did not decode');
    await page.screenshot({ path: `output/quotation-qa/${name}-preview.png`, fullPage: true });
    const noticeTitles = await page.locator('.document-product-note strong').allTextContents();
    const expectedTypes = baseName === 'short' || baseName === 'qr_pair'
      ? 1 : baseName === 'all_types' ? 5 : 3;
    if (noticeTitles.length !== expectedTypes) {
      throw new Error('Unexpected product notice count: ' + JSON.stringify({ name, noticeTitles, expectedTypes }));
    }
    if (!english && baseName === 'all_types' && !['版费：', '凹版热转印花膜：', '数码热转印花膜：', '机器设备：', '热转印加工：']
      .every(title => noticeTitles.includes(title))) {
      throw new Error('The five product note categories are not all present: ' + noticeTitles.join('; '));
    }
    const noticeBodies = await page.locator('.document-product-note-body').allTextContents();
    if (!english && baseName === 'all_types') {
      const requiredVerbatimParts = [
        '铜版自制版完成之日起享有18个月质量保证期',
        '超过质保期且连续12个月未下单的印版',
        '耐多轮洗碗机',
        '数码热转印花膜依据客户最终确认的电子图稿',
        '设备电压、频率、气源及技术配置以双方最终确认的设备规格为准',
        '常规加工建议额外预留订单数量3%的产品',
      ];
      const combined = noticeBodies.join(' ');
      for (const phrase of requiredVerbatimParts) {
        if (!combined.includes(phrase)) throw new Error('Approved process note absent from printed layout: ' + phrase);
      }
      if (combined.includes('设备默认供电：') || combined.includes('半个PANTONE色卡号')) {
        throw new Error('Obsolete notice wording leaked into the new PDF');
      }
    }
    // Verify actual print-media geometry, not just the desktop preview. The
    // print reset overrides Tailwind's .flex on direct <main> children.
    await page.emulateMedia({ media: 'print' });
    const totalLayout = await page.evaluate(() => {
      const wrap = document.querySelector('#commercial-print .document-total');
      const label = wrap?.querySelector('.document-total-label');
      const amount = wrap?.querySelector('.document-total-amount');
      if (!wrap || !label || !amount) throw new Error('Missing total label or amount');
      const w = wrap.getBoundingClientRect();
      const a = label.getBoundingClientRect();
      const b = amount.getBoundingClientRect();
      return {
        display: getComputedStyle(wrap).display,
        lineOffset: Math.abs((a.top + a.bottom) / 2 - (b.top + b.bottom) / 2),
        horizontalGap: b.left - a.right,
        leftInset: a.left - w.left,
        rightInset: w.right - b.right,
        disclaimerPresent: Boolean(document.querySelector('#commercial-print .document-draft-notice')),
      };
    });
    if (totalLayout.display !== 'flex' || totalLayout.lineOffset > 8 ||
        totalLayout.horizontalGap < 8 || totalLayout.leftInset < 8 ||
        totalLayout.rightInset < 8 || totalLayout.disclaimerPresent) {
      throw new Error('Invalid PDF total layout: ' + JSON.stringify({ name, ...totalLayout }));
    }
    if (baseName === 'qr_pair') {
      const qrLayout = await page.evaluate(() => {
        const payment = document.querySelector('#commercial-print .document-payment');
        const grid = payment?.querySelector('.document-payment-qr-grid');
        const images = Array.from(payment?.querySelectorAll('[data-payment-qr]') ?? []);
        if (!payment || !grid || images.length !== 2) {
          throw new Error('Expected exactly two payment QR images');
        }
        const gridBox = grid.getBoundingClientRect();
        const boxes = images.map(image => image.getBoundingClientRect());
        return {
          display: getComputedStyle(grid).display,
          gridInsidePayment: gridBox.left >= payment.getBoundingClientRect().left
            && gridBox.right <= payment.getBoundingClientRect().right,
          sideBySide: boxes[0].right <= boxes[1].left,
          ratios: boxes.map((box, index) => box.height / box.width),
          naturalSizes: images.map(image => ({ width: image.naturalWidth, height: image.naturalHeight })),
        };
      });
      if (qrLayout.display !== 'grid' || !qrLayout.gridInsidePayment || !qrLayout.sideBySide
          || qrLayout.ratios.some(ratio => Math.abs(ratio - (1402 / 1122)) > 0.03)
          || qrLayout.naturalSizes.some(size => size.width !== 1122 || size.height !== 1402)) {
        throw new Error('Invalid QR-pair print layout: ' + JSON.stringify({ name, ...qrLayout }));
      }
    }
    await page.pdf({ path: `output/quotation-qa/${name}.pdf`, preferCSSPageSize: true, printBackground: true, displayHeaderFooter: false });
    results.push({ name, image, totalLayout, noticeTitles });
    await page.close();
  }
} finally { await browser.close(); }
writeFileSync('output/quotation-qa/browser-results.json', JSON.stringify({ engine: 'Chromium', results }, null, 2));
