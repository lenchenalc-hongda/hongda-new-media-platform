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
    await page.pdf({ path: `output/quotation-qa/${name}.pdf`, preferCSSPageSize: true, printBackground: true, displayHeaderFooter: false });
    results.push({ name, image });
    await page.close();
  }
} finally { await browser.close(); }
writeFileSync('output/quotation-qa/browser-results.json', JSON.stringify({ engine: 'Chromium', results }, null, 2));
