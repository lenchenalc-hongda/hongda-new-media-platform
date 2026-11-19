// Candidate-only: validate complete Office draft on server, NOT just client.
import { PRODUCTION_ORDER_ENTRY_FIELD_KEYS, validateProductionOrderDraft,
  type ProductionOrderDraft, type NormalizedProductionOrderDraft
} from './office-entry';
import { isWosCpcUuid } from './prod-cpc-eligibility';
export interface OfficeDocumentSaveCandidate {
  readonly orderId:string;
  readonly requestId:string;
  readonly expectedVersion:number;
  readonly normalized:NormalizedProductionOrderDraft;
}
const booleans=new Set(['isUrgent','splitDelivery']);
function obj(v:unknown):v is Record<string,unknown> {
  return typeof v==='object'&&v!==null&&!Array.isArray(v);
}
export function parseOfficeDocumentSaveCandidate(input:unknown):OfficeDocumentSaveCandidate|null {
  if(!obj(input)||Object.keys(input).sort().join(',')!=='expectedVersion,form,orderId,requestId'
    ||!isWosCpcUuid(input.orderId)||!isWosCpcUuid(input.requestId)
    ||!Number.isSafeInteger(input.expectedVersion)||(input.expectedVersion as number)<1
    ||!obj(input.form))return null;
  const raw=input.form,keys=PRODUCTION_ORDER_ENTRY_FIELD_KEYS;
  if(Object.keys(raw).length!==keys.length
    ||!Object.keys(raw).every(k=>(keys as readonly string[]).includes(k))
    ||!keys.every(k=>booleans.has(k)?typeof raw[k]==='boolean':typeof raw[k]==='string'))
    return null;
  const verified=validateProductionOrderDraft(raw as unknown as ProductionOrderDraft);
  if(!verified.ok||JSON.stringify(raw).length>20000)return null;
  return {orderId:input.orderId,requestId:input.requestId,
    expectedVersion:input.expectedVersion as number,normalized:verified.normalized};
}
export function parseImageRegistrationCandidate(input:unknown):{
  orderId:string;imageId:string;expectedVersion:number;storagePath:string;
}|null {
  if(!obj(input)||Object.keys(input).sort().join(',')!=='expectedVersion,imageId,orderId,storagePath'
   ||!isWosCpcUuid(input.orderId)||!isWosCpcUuid(input.imageId)
   ||!Number.isSafeInteger(input.expectedVersion)||(input.expectedVersion as number)<1
   ||typeof input.storagePath!=='string'||input.storagePath.length>700)
    return null;
  // The authoritative order/org/version/path match remains in the database RPC.
  if(!/^organizations\/[a-f0-9-]+\/wos\/production-order\/[a-f0-9-]+\/images\/product\/versions\/V[1-9][0-9]{0,20}\/[a-f0-9-]+\/[A-Za-z0-9._-]+\.png$/i.test(input.storagePath)
  ||input.storagePath.includes('..'))return null;
  return {orderId:input.orderId,imageId:input.imageId,
    expectedVersion:input.expectedVersion as number,storagePath:input.storagePath};
}
