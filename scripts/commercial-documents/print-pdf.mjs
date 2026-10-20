import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { writeFileSync } from 'node:fs';
const require = createRequire('/tmp/quotation-browser/package.json');
const { chromium } = require('playwright');
const browser = await chromium.launch({ headless: true });
const results = [];
try {
  for (const name of ['short', 'medium', 'long']) {
    const page = await browser.newPage({ viewport: { width: 900, height: 1200 } });
    await page.goto('file://' + resolve(`output/quotation-qa/${name}.html`));
    await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map(img => img.decode())); });
    const image = await page.locator('header img').evaluate(img => ({ width: img.naturalWidth, height: img.naturalHeight, renderedWidth: img.width, renderedHeight: img.height }));
    if (image.width !== 2047 || image.height !== 515) throw new Error('Header did not decode');
    await page.screenshot({ path: `output/quotation-qa/${name}-preview.png`, fullPage: true });
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
    await page.pdf({ path: `output/quotation-qa/${name}.pdf`, preferCSSPageSize: true, printBackground: true, displayHeaderFooter: false });
    results.push({ name, image, totalLayout });
    await page.close();
  }
} finally { await browser.close(); }
writeFileSync('output/quotation-qa/browser-results.json', JSON.stringify({ engine: 'Chromium', results }, null, 2));
