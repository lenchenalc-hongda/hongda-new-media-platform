import { z } from 'zod';

/**
 * M2 is a separate opt-in: legacy P2 and P7 flags must not enable this route.
 * A database gate and a reviewed QA-only RPC are additionally required.
 */
export const WOS_P2_M2_QA_URL = 'https://xulmpqaknlwqqculbsek.supabase.co';
export const M2_MATERIAL_STATES = {
  FILM:['NOT_ARRIVED','PARTIALLY_ARRIVED','ARRIVED','VERSION_VERIFIED'],
  FIXTURE:['NOT_AVAILABLE','IN_PRODUCTION','ARRIVED','FIT_VERIFIED'],
  INCOMING_MATERIAL:['NOT_ARRIVED','PARTIALLY_ARRIVED','ARRIVED','QUANTITY_VERIFIED'],
  SIGNED_SAMPLE:['MISSING','UPLOADED','PHYSICAL_SAMPLE_RECEIVED','VERIFIED'],
} as const;
const actor = {
  orderId:z.string().uuid(),
  requestId:z.string().uuid(),
  expectedVersion:z.number().int().min(1).max(2147483646),
  productionVersionLabel:z.string().trim().min(1).max(80),
  note:z.string().trim().min(10).max(500),
};
const iso = z.string().datetime({offset:true}).nullable();
const material = z.object({
  ...actor,
  action:z.literal('MATERIAL_RECORD'),
  resourceType:z.enum(['FILM','FIXTURE','INCOMING_MATERIAL','SIGNED_SAMPLE']),
  resourceStatus:z.string().min(1),
  expectedAt:iso,
  arrivedAt:iso,
  quantityExpected:z.number().int().min(0).max(2147483647).nullable(),
  quantityArrived:z.number().int().min(0).max(2147483647).nullable(),
  physicalCheckAttested:z.boolean(),
}).strict().superRefine((v,c) => {
  const allowed=M2_MATERIAL_STATES[v.resourceType] as readonly string[];
  if(!allowed.includes(v.resourceStatus)) c.addIssue({code:'custom',path:['resourceStatus'],message:'INVALID_STATE'});
  const final={
    FILM:'VERSION_VERIFIED',FIXTURE:'FIT_VERIFIED',
    INCOMING_MATERIAL:'QUANTITY_VERIFIED',SIGNED_SAMPLE:'VERIFIED',
  }[v.resourceType]===v.resourceStatus;
  if(final && !v.physicalCheckAttested) c.addIssue({code:'custom',path:['physicalCheckAttested'],message:'REAL_CHECK_NOT_ATTESTED'});
  if(v.resourceType==='INCOMING_MATERIAL') {
    if(v.quantityExpected===null || v.quantityArrived===null) c.addIssue({code:'custom',path:['quantityExpected'],message:'QUANTITY_REQUIRED'});
    if(final && (v.quantityExpected===0 || v.quantityArrived===0 || v.quantityExpected===null ||
        v.quantityArrived===null || v.quantityArrived<v.quantityExpected))
      c.addIssue({code:'custom',path:['quantityArrived'],message:'QUANTITY_SHORTFALL'});
  } else if(v.quantityExpected!==null || v.quantityArrived!==null)
    c.addIssue({code:'custom',path:['quantityExpected'],message:'QUANTITY_NOT_ALLOWED'});
  if(v.arrivedAt && v.expectedAt && Date.parse(v.arrivedAt)<Date.parse(v.expectedAt) &&
     v.resourceStatus==='NOT_ARRIVED') c.addIssue({code:'custom',path:['arrivedAt'],message:'ARRIVAL_CONFLICT'});
  if(final && !v.arrivedAt) c.addIssue({code:'custom',path:['arrivedAt'],message:'REAL_ARRIVAL_REQUIRED'});
});
const select = z.object({
  ...actor, action:z.literal('BASELINE_SELECT'),
  imageIds:z.array(z.string().uuid()).min(3).max(12),
}).strict().superRefine((v,c)=>{
 if(new Set(v.imageIds).size!==v.imageIds.length) c.addIssue({code:'custom',path:['imageIds'],message:'DUPLICATE_IMAGES'});
});
const confirm = z.object({
  ...actor, action:z.enum(['BASELINE_OFFICE_CONFIRM','BASELINE_WORKSHOP_CONFIRM']),
  baselineId:z.string().uuid(),
}).strict();
export type WosP2M2Action = z.infer<typeof material>|z.infer<typeof select>|z.infer<typeof confirm>;

export function parseWosP2M2Action(v:unknown):WosP2M2Action|null {
 if(!v || typeof v!=='object'||Array.isArray(v))return null;
 const action=(v as Record<string,unknown>).action;
 const parsed=action==='MATERIAL_RECORD'?material.safeParse(v)
   :action==='BASELINE_SELECT'?select.safeParse(v)
   :action==='BASELINE_OFFICE_CONFIRM'||action==='BASELINE_WORKSHOP_CONFIRM'?confirm.safeParse(v):null;
 return parsed?.success?parsed.data:null;
}

export function canActOnWosP2M2(role:unknown,action:WosP2M2Action['action']):boolean {
 if(typeof role!=='string')return false;
 return action==='MATERIAL_RECORD'||action==='BASELINE_WORKSHOP_CONFIRM'
   ? ['operator','manager','admin'].includes(role)
   : ['sales','manager','admin'].includes(role);
}
export function isWosP2M2QaEnabled(env:{
 readonly vercelEnv?:string, readonly flag?:string, readonly supabaseUrl?:string,
}):boolean {
 if(env.vercelEnv!=='preview'||env.flag!=='true')return false;
 try{
  const url=new URL(env.supabaseUrl??'');
  return url.origin===WOS_P2_M2_QA_URL && (url.pathname==='/'||url.pathname==='') &&
    !url.username&&!url.password&&!url.search&&!url.hash;
 }catch{return false;}
}
export function wosP2M2RpcArgs(v:WosP2M2Action) {
 const payload:Record<string,unknown>={productionVersionLabel:v.productionVersionLabel,note:v.note};
 if(v.action==='MATERIAL_RECORD')Object.assign(payload,{
  resourceType:v.resourceType,resourceStatus:v.resourceStatus,expectedAt:v.expectedAt,
  arrivedAt:v.arrivedAt,quantityExpected:v.quantityExpected,quantityArrived:v.quantityArrived,
  physicalCheckAttested:v.physicalCheckAttested,
 });
 if(v.action==='BASELINE_SELECT')payload.imageIds=v.imageIds;
 if(v.action==='BASELINE_OFFICE_CONFIRM'||v.action==='BASELINE_WORKSHOP_CONFIRM')payload.baselineId=v.baselineId;
 return {p_order_id:v.orderId,p_expected_version:v.expectedVersion,p_request_id:v.requestId,
   p_action:v.action,p_payload:payload};
}
const hex=/^[a-f0-9]{64}$/;
export function isWosP2M2RpcResult(v:unknown,action:WosP2M2Action):v is {
 status:'APPLIED'|'REPLAYED',orderId:string,requestId:string,version:number,
 productionVersionLabel:string,preSpecDigest:string,postSpecDigest:string,
 receiptDigest:string,proofStatus:'UNVERIFIED',canStart:false,
} {
 if(!v||typeof v!=='object'||Array.isArray(v))return false;
 const r=v as Record<string,unknown>;
 return (r.status==='APPLIED'||r.status==='REPLAYED')
   &&r.orderId===action.orderId&&r.requestId===action.requestId
   &&r.version===action.expectedVersion+1
   &&r.productionVersionLabel===action.productionVersionLabel
   &&typeof r.preSpecDigest==='string'&&hex.test(r.preSpecDigest)
   &&typeof r.postSpecDigest==='string'&&hex.test(r.postSpecDigest)
   &&typeof r.receiptDigest==='string'&&hex.test(r.receiptDigest)
   &&r.proofStatus==='UNVERIFIED'&&r.canStart===false;
}
