'use strict';
// A real Chromium selector regression against local in-memory DOM only.
// No QA credentials, HTTP API, database writes, storage, or Gate activation.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium}=require('playwright');
const source=fs.readFileSync('tests/e2e/wos-p2-qa-browser.cjs','utf8');
assert(source.includes("office.page.locator('section[aria-label=\"隔离数据库真实下单验收\"]')"),
  'QA browser submit alert must be scoped to the dedicated component');
assert(source.includes("const failureAlert=qaSubmitRegion.locator('[role=\"alert\"]')"),
  'QA browser must not select page-global first alert');
assert(!source.includes("office.page.getByRole('alert').first()"),
  'page-global unrelated alert caused the real Run #44242557421 failure');
assert(source.includes("QA_SUBMISSION_ERROR_PRESENT_BEFORE_CLICK"),
  'reject stale QA submit alerts rather than ignoring them');
async function main(){
  const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  try{
    const page=await browser.newPage();
    const html='<main><section aria-label="办公室退回补资料任务">'+
      '<p role="alert">RETURNED_ORDERS_READ_FAILED</p></section>'+
      '<section aria-label="隔离数据库真实下单验收">'+
      '<button type="button" id="qa-submit">测试提交</button></section></main>';
    await page.setContent(html);
    const globalAlert=page.getByRole('alert').first();
    assert.equal(await globalAlert.textContent(),'RETURNED_ORDERS_READ_FAILED',
      'must reproduce unrelated pre-existing page alert');
    const qaSubmitRegion=page.locator('section[aria-label="隔离数据库真实下单验收"]');
    assert.equal(await qaSubmitRegion.count(),1);
    const scoped=qaSubmitRegion.locator('[role="alert"]');
    assert.equal(await scoped.count(),0,
      'unrelated alert must not trip submit-failure detection');
    await page.evaluate(()=>{
      const other=document.createElement('p');
      other.setAttribute('role','alert');
      other.textContent='FORM_VALIDATION_NOT_RELATED_TO_SUBMIT';
      document.querySelector('[aria-label="办公室退回补资料任务"]').appendChild(other);
    });
    assert.equal(await scoped.count(),0);
    await page.locator('#qa-submit').evaluate(button=>{
      button.addEventListener('click',()=>{
        const error=document.createElement('p');
        error.setAttribute('role','alert');
        error.textContent='QA_GATE_CLOSED';
        document.querySelector('[aria-label="隔离数据库真实下单验收"]').appendChild(error);
      });
    });
    const visible=scoped.waitFor({state:'visible',timeout:2500});
    await page.locator('#qa-submit').click();
    await visible;
    assert.equal(await scoped.textContent(),'QA_GATE_CLOSED',
      'component error must be caught despite unrelated page alerts');
    assert.equal(await globalAlert.textContent(),'RETURNED_ORDERS_READ_FAILED');
    console.log('WOS_P2_QA_UNRELATED_PAGE_ALERT_IGNORED=PASS');
    console.log('WOS_P2_QA_COMPONENT_SUBMIT_ERROR_DETECTED=PASS');
    console.log('WOS_P2_QA_BROWSER_SECRETLESS_ONLY=PASS');
  }finally{await browser.close();}
}
main().catch(err=>{
  console.error('WOS_P2_QA_ALERT_SELECTOR_REGRESSION=FAIL');
  process.exitCode=1;
});
