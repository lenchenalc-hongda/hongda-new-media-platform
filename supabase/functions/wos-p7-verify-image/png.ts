// @ts-expect-error Deno requires the explicit .ts extension.
import { pngValid } from '../_shared/wos-png-integrity.ts';

export { pngValid };

const QA_ORDER_NUMBER=/^QA-NONPROD-[0-9a-f-]{36}$/i;
const DRAFT_VERSION=/^V[1-9][0-9]{0,20}$/;
const REVISION_VERSION=/^QA-R[1-9][0-9]*$/;
export type WosQaRevisionAccessCode=
  |'ALLOWED_DRAFT'
  |'ALLOWED_REVISION'
  |'RUNTIME_DENIED'
  |'ROLE_FORBIDDEN'
  |'ORGANIZATION_DENIED'
  |'OWNER_DENIED'
  |'ORDER_NUMBER_INVALID'
  |'STATUS_INVALID'
  |'REVISION_AUTH_REQUIRED'
  |'DRAFT_VERSION_INVALID'
  |'REVISION_VERSION_INVALID';
export interface WosQaRevisionOrderSnapshot{
 readonly id:string;
 readonly organization_id:string;
 readonly created_by_profile_id:string;
 readonly sales_owner_profile_id:string;
 readonly order_number:string;
 readonly version_label:string;
 readonly workflow_status:string;
}
export interface WosQaRevisionProfileSnapshot{
 readonly id:string;
 readonly org_id:string;
 readonly role:string;
}
export interface WosQaRevisionAccessInput{
 readonly runtimeAuthorized:boolean;
 readonly localRevisionAuthorized:boolean;
 readonly qaRevisionAuthorized:boolean;
 readonly profile:WosQaRevisionProfileSnapshot|null|undefined;
 readonly order:WosQaRevisionOrderSnapshot|null|undefined;
}
export interface WosQaRevisionAccessDecision{
 readonly allowed:boolean;
 readonly code:WosQaRevisionAccessCode;
}
export function evaluateWosQaRevisionImageAccess(
 input:WosQaRevisionAccessInput,
):WosQaRevisionAccessDecision{
 if(!input.runtimeAuthorized)return {allowed:false,code:'RUNTIME_DENIED'};
 const profile=input.profile;
 if(!profile||!['admin','manager','sales'].includes(profile.role)){
  return {allowed:false,code:'ROLE_FORBIDDEN'};
 }
 const order=input.order;
 if(!order||order.organization_id!==profile.org_id){
  return {allowed:false,code:'ORGANIZATION_DENIED'};
 }
 if(profile.role==='sales'
   &&profile.id!==order.created_by_profile_id
   &&profile.id!==order.sales_owner_profile_id){
  return {allowed:false,code:'OWNER_DENIED'};
 }
 if(!QA_ORDER_NUMBER.test(order.order_number)){
  return {allowed:false,code:'ORDER_NUMBER_INVALID'};
 }
 if(order.workflow_status==='DRAFT'){
  return DRAFT_VERSION.test(order.version_label)
    ?{allowed:true,code:'ALLOWED_DRAFT'}
    :{allowed:false,code:'DRAFT_VERSION_INVALID'};
 }
 if(order.workflow_status!=='WAITING_MATERIAL'){
  return {allowed:false,code:'STATUS_INVALID'};
 }
 const approvedRevision=input.localRevisionAuthorized||input.qaRevisionAuthorized;
 if(!approvedRevision)return {allowed:false,code:'REVISION_AUTH_REQUIRED'};
 return REVISION_VERSION.test(order.version_label)
   ?{allowed:true,code:'ALLOWED_REVISION'}
   :{allowed:false,code:'REVISION_VERSION_INVALID'};
}
