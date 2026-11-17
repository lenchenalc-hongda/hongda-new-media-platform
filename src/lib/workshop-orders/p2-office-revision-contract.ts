import { z } from 'zod';

/**
 * Office correction of a returned QA-only order. This module does not enable
 * database writes or certify a resubmission; the restricted SQL RPC is separately
 * reviewed/installed and turned OFF until another owner authorization.
 */
const uuid = z.string().uuid();
export const wosP2OfficeRevisionPatchSchema = z.object({
  productName: z.string().trim().min(1).max(200).optional(),
  productMaterial: z.string().trim().min(1).max(200).optional(),
  requestedQuantity: z.number().int().positive().max(2147483647).optional(),
  currentBatchQuantity: z.number().int().positive().max(2147483647).optional(),
  customerAcceptanceStandard: z.string().trim().min(1).max(2000).optional(),
  positionReference: z.string().trim().min(1).max(2000).optional(),
}).strict();
export const wosP2OfficeRevisionRequestSchema=z.object({
  orderId: uuid,
  expectedVersion: z.number().int().min(2).max(2147483646),
  requestId: uuid,
  action: z.enum(['SAVE_CORRECTION','RESUBMIT_CORRECTION']),
  reason: z.string().trim().min(10).max(500),
  patch: wosP2OfficeRevisionPatchSchema,
}).strict().superRefine((p,ctx)=>{
  if (p.action==='SAVE_CORRECTION' && Object.keys(p.patch).length===0) {
    ctx.addIssue({code:'custom',path:['patch'],message:'AT_LEAST_ONE_CORRECTION_REQUIRED'});
  }
  // Empty RESUBMIT_CORRECTION is allowed only when the database confirms a
  // previously saved correction on this exact current order version.
  if (p.patch.requestedQuantity!==undefined
    && p.patch.currentBatchQuantity!==undefined
    && p.patch.currentBatchQuantity>p.patch.requestedQuantity) {
    ctx.addIssue({code:'custom',path:['patch','currentBatchQuantity'],message:'BATCH_EXCEEDS_REQUESTED_QUANTITY'});
  }
});
export type WosP2OfficeRevision=z.infer<typeof wosP2OfficeRevisionRequestSchema>;

export function parseWosP2OfficeRevision(value:unknown):WosP2OfficeRevision|null {
  const parsed=wosP2OfficeRevisionRequestSchema.safeParse(value);
  return parsed.success?parsed.data:null;
}
export function canWosOfficeRevise(role:unknown):boolean {
  return role==='admin'||role==='manager'||role==='sales';
}
export function isWosP2QaOfficeRevisionEnabled(env:{
  vercelEnv?:string;
  flag?:string;
  supabaseUrl?:string;
}):boolean {
  if(env.vercelEnv!=='preview'||env.flag!=='true')return false;
  try{
    const u=new URL(env.supabaseUrl??'');
    return u.origin==='https://xulmpqaknlwqqculbsek.supabase.co'
      && u.pathname==='/' && !u.search && !u.hash && !u.username && !u.password;
  }catch{return false;}
}

export function wosP2OfficeRpcArgs(x:WosP2OfficeRevision){
  return {
    p_order_id:x.orderId,
    p_expected_version:x.expectedVersion,
    p_request_id:x.requestId,
    p_action:x.action,
    p_patch:x.patch,
    p_reason:x.reason,
  };
}
export function isWosP2OfficeRpcResult(response:unknown,request:WosP2OfficeRevision):response is {
  status:'UPDATED'|'RESUBMITTED'|'REPLAYED';
  version:number;
  orderId:string;
  requestId:string;
  workflowStatus:'NEEDS_INFORMATION'|'WORKSHOP_REVIEW';
} {
  if(!response||typeof response!=='object'||Array.isArray(response))return false;
  const v=response as Record<string,unknown>;
  const expectedState=request.action==='SAVE_CORRECTION'?'NEEDS_INFORMATION':'WORKSHOP_REVIEW';
  return (v.status=== 'REPLAYED' ||(request.action==='SAVE_CORRECTION'?
      v.status==='UPDATED':v.status==='RESUBMITTED'))
    && v.workflowStatus===expectedState && v.orderId===request.orderId
    && v.requestId===request.requestId
    && v.version===request.expectedVersion+1;
}
