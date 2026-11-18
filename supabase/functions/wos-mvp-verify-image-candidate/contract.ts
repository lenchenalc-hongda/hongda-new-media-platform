// WOS P0-02-02: nonproduction-only Edge byte-proof request contract.
// Pure functions shared by the Edge verifier and offline, secret-free tests.
// This module does not issue a proof or create a READY reference image.
export const IMAGE_BUCKET = 'wos-private' as const;
export const MAX_BYTES = 20 * 1024 * 1024;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const digest = /^[a-f0-9]{64}$/;
const file = /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}\.png$/;
export type ProofRequest = {
  readonly orderId: string;
  readonly imageId: string;
  readonly expectedVersion: number;
  readonly storagePath: string;
  readonly sha256: string;
};
export type TrustedStorageSnapshot = {
  readonly id: string;
  readonly ownerId: string;
  readonly objectVersion: string | null;
  readonly objectUpdatedAt: string;
  readonly mimeType: string;
  readonly byteSize: number;
};
export type VerifiedOrderScope = {
  readonly organization_id: string;
  readonly id: string;
  readonly version: number;
  readonly version_label: string;
  readonly workflow_status: string;
  readonly created_by_profile_id: string;
  readonly sales_owner_profile_id: string;
};
export type VerifiedActorScope = { readonly id: string; readonly org_id: string; readonly role: string };
function rec(v: unknown): v is Record<string,unknown> {
  return v!==null && typeof v==='object' && !Array.isArray(v);
}
export function parseProofRequest(value:unknown): ProofRequest | null {
  if (!rec(value) || Object.keys(value).sort().join(',')!=='expectedVersion,imageId,orderId,sha256,storagePath'
    || typeof value.orderId!=='string' || !uuid.test(value.orderId)
    || typeof value.imageId!=='string' || !uuid.test(value.imageId)
    || typeof value.expectedVersion!=='number' || !Number.isSafeInteger(value.expectedVersion)
    || value.expectedVersion<1 || typeof value.storagePath!=='string'
    || value.storagePath.length>700 || typeof value.sha256!=='string'
    || !digest.test(value.sha256)) return null;
  return value as ProofRequest;
}
export function expectedProductPngPath(input: {
  organizationId:string; orderId:string; imageId:string;
  versionLabel:string; filename:string;
}):string | null {
  if (!uuid.test(input.organizationId) || !uuid.test(input.orderId) || !uuid.test(input.imageId)
    || !/^V[1-9][0-9]{0,20}$/.test(input.versionLabel)
    || !file.test(input.filename) || input.filename.includes('..')) return null;
  return ['organizations',input.organizationId,'wos','production-order',input.orderId,
    'images','product','versions',input.versionLabel,input.imageId,input.filename].join('/');
}
export function matchesCurrentOrder(input: {
  order:VerifiedOrderScope|null; actor:VerifiedActorScope; userId:string; request:ProofRequest;
}):boolean {
  const {order,actor,userId,request}=input;
  if (!order || order.id!==request.orderId || order.organization_id!==actor.org_id
    || order.workflow_status!=='DRAFT' || order.version!==request.expectedVersion
    || !/^V[1-9][0-9]{0,20}$/.test(order.version_label)
    || !['admin','manager','sales'].includes(actor.role)
    || !uuid.test(userId)
    || actor.role==='sales' && actor.id!==order.created_by_profile_id
       && actor.id!==order.sales_owner_profile_id) return false;
  const prefix=['organizations',actor.org_id,'wos','production-order',order.id,
    'images','product','versions',order.version_label,request.imageId].join('/')+'/';
  if (!request.storagePath.startsWith(prefix)) return false;
  const filename=request.storagePath.slice(prefix.length);
  return request.storagePath===expectedProductPngPath({
    organizationId:actor.org_id,orderId:order.id,
    imageId:request.imageId,versionLabel:order.version_label,filename,
  });
}
export function parseTrustedSnapshot(value:unknown):TrustedStorageSnapshot|null {
  if (!rec(value) || typeof value.id!=='string' || !uuid.test(value.id)
   || typeof value.ownerId!=='string' || !uuid.test(value.ownerId)
   || value.objectVersion!==null && typeof value.objectVersion!=='string'
   || typeof value.objectUpdatedAt!=='string'
   || !Number.isFinite(Date.parse(value.objectUpdatedAt))
   || value.mimeType!=='image/png'
   || !Number.isSafeInteger(value.byteSize) || (value.byteSize as number)<60
   || (value.byteSize as number)>MAX_BYTES) return null;
  return value as TrustedStorageSnapshot;
}
export function sameStorageObject(a:TrustedStorageSnapshot,b:TrustedStorageSnapshot):boolean {
  return a.id===b.id && a.ownerId===b.ownerId
    && a.objectVersion===b.objectVersion && a.objectUpdatedAt===b.objectUpdatedAt
    && a.mimeType===b.mimeType && a.byteSize===b.byteSize;
}
