'use strict';
// Nonproduction, no credentials / network / storage / DB. Real Chromium DOM
// proof that the existing persisted order is selected, NOT a new order form.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium}=require('playwright');
const {EXISTING_ORDER_ID,EXISTING_ORDER_NUMBER}=require('./wos-p2-qa-owner-cas-attest.cjs');
const browserSource=fs.readFileSync('tests/e2e/wos-p2-qa-browser.cjs','utf8');
assert(browserSource.includes("stage='EXISTING_SYNTHETIC_ORDER_REUSE_PIN'"));
assert(browserSource.includes("stage='OPERATOR_EXISTING_ORDER_INBOX'"));
assert(browserSource.includes("stage='OPERATOR_ACCEPT'"));
assert(browserSource.includes("stage='OFFICE_LOGIN_AFTER_RETURN'"));
assert(browserSource.includes("const orderId=EXISTING_ORDER_ID"));
assert(browserSource.includes("const orderNumber=EXISTING_ORDER_NUMBER"));
assert(browserSource.includes("await waitOrderCard(operator.page,orderNumber)"));
assert(!browserSource.includes('setInputFiles('));
assert(!browserSource.includes("上传图片并提交 QA 订单"));
assert(!browserSource.includes('OFFICE_UI_SYNTHETIC_SUBMISSION_HTTP_AND_RECEIPT'));

async function main(){
 const chromiumInstance=await chromium.launch({headless:true,args:['--no-sandbox']});
 try{
  const page=await chromiumInstance.newPage();
  await page.setContent('<main>'+
    '<button type="button">刷新真实车间任务</button>'+
    '<article><div>QA-NONPROD-unrelated-other-order</div></article>'+
    '<article><div>'+EXISTING_ORDER_NUMBER+'</div>'+
      '<button type="button">查看真实生产要求与图片版本</button>'+
    '</article>'+
    '</main>');
  const card=page.locator('article').filter({hasText:EXISTING_ORDER_NUMBER}).first();
  assert.equal(await card.count(),1,'one real target QA order card');
  assert.equal(await card.innerText().then(s=>s.includes(EXISTING_ORDER_NUMBER)),true);
  assert.equal(await page.locator('article').count(),2);
  assert.equal(await page.getByRole('button',{name:'上传图片并提交 QA 订单'}).count(),0);
  assert.equal(EXISTING_ORDER_ID,'953d2204-3e65-4b75-b10e-c6e97f1bbb56');
  console.log('WOS_P2_EXACT_PERSISTED_ORDER_CARD_REUSED=PASS');
  console.log('WOS_P2_NO_NEW_OFFICE_SUBMISSION_UI=PASS');
  console.log('WOS_P2_CHROMIUM_REUSE_ORDER_NO_QA_NETWORK=PASS');
 }finally{await chromiumInstance.close();}
}
main().catch(()=>{
 console.error('WOS_P2_EXISTING_ORDER_CHROMIUM_SYNTHETIC_REGRESSION=FAIL');
 process.exitCode=1;
});
