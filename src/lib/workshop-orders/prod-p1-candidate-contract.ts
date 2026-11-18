// P1 MVP candidate request contracts, NO Supabase access, NO trusted byte proof minting.
import { isWosCpcUuid } from './prod-cpc-eligibility';

export interface WosP1DraftCandidate {
  requestId: string;
  customerId: string;
  projectId: string;
  productName: string;
  productMaterial: string;
  requestedQuantity: number;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}
export interface WosP1FirstSubmitCandidate {
  orderId: string;
  expectedVersion: number;
  idempotencyKey: string;
  readinessNote: string;
}
const draftKeys = ['requestId','customerId','projectId','productName','productMaterial','requestedQuantity','priority'];
const submitKeys = ['orderId','expectedVersion','idempotencyKey','readinessNote'];
function exactObject(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const got = Object.keys(value);
  return got.length === keys.length && got.every(k => keys.includes(k));
}
function boundedText(t: unknown, max: number): t is string {
  return typeof t === 'string' && t.trim().length > 0 && t.length <= max;
}
export function parseWosP1DraftCandidate(value: unknown): WosP1DraftCandidate | null {
  if (!exactObject(value,draftKeys)
    || !isWosCpcUuid(value.requestId) || !isWosCpcUuid(value.customerId) || !isWosCpcUuid(value.projectId)
    || !boundedText(value.productName,200) || !boundedText(value.productMaterial,200)
    || !Number.isInteger(value.requestedQuantity) || (value.requestedQuantity as number) <= 0
    || (value.requestedQuantity as number) > 2147483647
    || !['LOW','MEDIUM','HIGH','CRITICAL'].includes(String(value.priority))) return null;
  return value as unknown as WosP1DraftCandidate;
}
export function parseWosP1FirstSubmitCandidate(value: unknown): WosP1FirstSubmitCandidate | null {
  if (!exactObject(value,submitKeys)
    || !isWosCpcUuid(value.orderId) || !isWosCpcUuid(value.idempotencyKey)
    || !Number.isInteger(value.expectedVersion) || (value.expectedVersion as number) < 1
    || !boundedText(value.readinessNote,2000) || (value.readinessNote as string).trim().length < 10) return null;
  return value as unknown as WosP1FirstSubmitCandidate;
}
const categories = [
  'PRODUCT','FILM_PATTERN','CUSTOMER_APPROVED_SAMPLE','SIGNED_SAMPLE',
  'PACKAGING_LABEL','DEFECT_RISK','OTHER',
] as const;
type ImageCategory = typeof categories[number];
const mimeByExt: Record<string,string> = {
  jpg: 'image/jpeg',jpeg: 'image/jpeg',png: 'image/png',webp: 'image/webp',
};
export function buildWosPrivateImageCandidate(input: {
  organizationId: string;
  orderId: string;
  imageId: string;
  category: ImageCategory;
  versionLabel: string;
  filename: string;
  mimeType: string;
  byteSize: number;
  sha256Hex: string;
}): { storageBucket: 'wos-private'; storagePath: string; sha256Hex: string } | null {
  if (![input.organizationId,input.orderId,input.imageId].every(isWosCpcUuid)
    || !(categories as readonly string[]).includes(input.category)
    || !/^V[1-9][0-9]{0,20}$/.test(input.versionLabel)
    || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,199}\.(jpg|jpeg|png|webp)$/.test(input.filename)
    || input.filename.includes('..') || input.filename.includes('\\')
    || !Number.isInteger(input.byteSize) || input.byteSize < 1 || input.byteSize > 20971520
    || !/^[a-f0-9]{64}$/.test(input.sha256Hex)) return null;
  const ext = input.filename.split('.').at(-1)?.toLowerCase() || '';
  if (mimeByExt[ext] !== input.mimeType) return null;
  const slug = input.category.toLowerCase().replaceAll('_','-');
  return {
    storageBucket: 'wos-private',
    storagePath: 'organizations/' + input.organizationId
      + '/wos/production-order/' + input.orderId
      + '/images/' + slug + '/versions/' + input.versionLabel
      + '/' + input.imageId + '/' + input.filename,
    sha256Hex: input.sha256Hex,
  };
}
// A path and SHA string are ONLY an *upload intent*. Neither this module nor
// its API can assert a binary was stored or attested. Never register READY from it.
