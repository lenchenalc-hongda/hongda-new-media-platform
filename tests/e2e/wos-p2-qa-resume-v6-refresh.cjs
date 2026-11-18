// QA-only: await the authoritative v6 API response AND the matching rendered Operator card.
// This fixes the original browser-test race: click refresh -> immediately reuse stale article.
// No credentials, local storage, synthetic uploads, or write requests.
'use strict';
const assert=require('node:assert/strict');
const ORIGIN='http://localhost:3000';
const ID='953d2204-3e65-4b75-b10e-c6e97f1bbb56';
const ORDER='QA-NONPROD-d2f91453-fe42-42e9-98d4-a6a902645ded';
const ORG='0ff53d93-2b9e-48b9-8113-a4768c39cdd2';
const VERSION=6;
const LABEL='QA-R6';
const STATUS='WORKSHOP_REVIEW';

function verifyFreshInboxPayload(payload){
  assert.equal(payload?.ok,true,'QA_V6_INBOX_REQUEST_NOT_OK');
  assert.equal(payload?.code,'OK','QA_V6_INBOX_UNVERIFIED_RESULT');
  assert.equal(payload?.data?.source,'SUPABASE_RLS','QA_V6_INBOX_MUST_BE_RLS_READ');
  assert(Array.isArray(payload?.data?.items),'QA_V6_INBOX_ITEMS_MISSING');
  assert.equal(payload.data.count,payload.data.items.length,'QA_V6_INBOX_COUNT_MISMATCH');
  const matches=payload.data.items.filter(x=>x?.id===ID);
  assert.equal(matches.length,1,'QA_V6_ORDER_NOT_UNIQUELY_VISIBLE');
  const row=matches[0];
  assert.equal(row.organizationId,ORG,'QA_V6_INBOX_ORGANIZATION_DRIFT');
  assert.equal(row.orderNumber,ORDER,'QA_V6_INBOX_ORDER_NUMBER_DRIFT');
  assert.equal(row.entityType,'PRODUCTION_ORDER','QA_V6_INBOX_WRONG_ENTITY');
  assert.equal(row.version,VERSION,'QA_V6_INBOX_MUST_BE_EXACT_VERSION_6');
  assert.equal(row.versionLabel,LABEL,'QA_V6_INBOX_MUST_BE_EXACT_LABEL');
  assert.equal(row.workflowStatus,STATUS,'QA_V6_INBOX_MUST_BE_WORKSHOP_REVIEW');
  return true;
}
async function refreshOperatorToV6(page){
  const refresh=page.getByRole('button',{name:'刷新真实车间任务'});
  await refresh.waitFor({state:'visible',timeout:20000});
  const responsePromise=page.waitForResponse(response=>
    response.url().split('?')[0]===ORIGIN+'/api/workshop-orders/inbox'
    &&response.request().method()==='GET',{timeout:30000});
  await refresh.click();
  const response=await responsePromise;
  assert.equal(response.status(),200,'QA_V6_INBOX_HTTP_NON_200');
  const payload=await response.json().catch(()=>null);
  verifyFreshInboxPayload(payload);
  // A successful network fetch does NOT prove React has replaced a stale v5 card.
  // Wait for BOTH the order's version+status in the rendered card before details click.
  await page.waitForFunction(({order,versionLabel,status})=>{
    const card=Array.from(document.querySelectorAll('article'))
      .find(e=>e.textContent?.includes(order));
    return Boolean(card && card.textContent?.includes(versionLabel)
      && card.textContent?.includes(status));
  },{order:ORDER,versionLabel:LABEL,status:STATUS},{timeout:30000});
  const card=page.locator('article').filter({hasText:ORDER}).first();
  await card.waitFor({state:'visible',timeout:10000});
  return card;
}
module.exports={verifyFreshInboxPayload,refreshOperatorToV6,ID,ORDER,ORG,VERSION,LABEL,STATUS,ORIGIN};
