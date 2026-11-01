import {createHmac, timingSafeEqual, createHash} from 'node:crypto';

const deliveryRe=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const events=new Set(['workflow_run','pull_request','check_run','deployment_status','push']);

/** Raw bytes and the independent webhook secret are required. */
export function verifyGithubDelivery({raw,headers,secret}) {
  if(!Buffer.isBuffer(raw) || !secret || typeof secret!=='string' || secret.length<16)
    return {ok:false,reason:'MISSING_RAW_OR_SECRET'};
  const signature=headers?.['x-hub-signature-256'];
  const deliveryId=headers?.['x-github-delivery'];
  const eventType=headers?.['x-github-event'];
  if(!deliveryRe.test(String(deliveryId||'')))return {ok:false,reason:'BAD_DELIVERY_ID'};
  if(!events.has(eventType))return {ok:false,reason:'EVENT_NOT_ALLOWLISTED'};
  if(!/^sha256=[a-f0-9]{64}$/.test(String(signature||'')))
    return {ok:false,reason:'MISSING_SIGNATURE'};
  const want=createHmac('sha256',secret).update(raw).digest();
  const got=Buffer.from(signature.slice(7),'hex');
  if(!timingSafeEqual(want,got))return {ok:false,reason:'SIGNATURE_MISMATCH'};
  try {
    const payload=JSON.parse(raw.toString('utf8'));
    if(!payload || typeof payload!=='object' || Array.isArray(payload))
      return {ok:false,reason:'INVALID_PAYLOAD'};
    return {ok:true,deliveryId:deliveryId.toLowerCase(),eventType,
      digest:createHash('sha256').update(raw).digest('hex'),payload};
  } catch {return {ok:false,reason:'INVALID_JSON'};}
}

export async function ingestGithubDelivery(store,verified) {
  if(verified?.ok!==true)return {accepted:false,reason:'UNVERIFIED_DELIVERY'};
  const x=await store.ingestDelivery(verified.deliveryId,verified.eventType,verified.digest,verified.payload);
  return {accepted:true,duplicate:x.duplicate};
}
