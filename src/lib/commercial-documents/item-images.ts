import type { CommercialDocumentDraft } from './template';

/**
 * Only immutable object paths are persisted to quotation JSON. Never persist
 * signed URLs, public URLs, data URLs, or image bytes.
 */
export const QUOTATION_IMAGE_BUCKET = 'commercial-quotation-item-images';
export const MAX_IMAGE_UPLOAD_BYTES = 3 * 1024 * 1024;
export const QUOTATION_IMAGE_URL_TTL_SECONDS = 60 * 60;
const UUID = '[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}';
export const PHOTO_PATH_RE = new RegExp('^(' + UUID + ')/(' + UUID + ')/(' + UUID + ')\\.(jpg|png|webp)$', 'i');

export function isQuotationImagePath(value: unknown): value is string {
  return typeof value === 'string' && PHOTO_PATH_RE.test(value);
}

export function canAccessQuotationImagePath(
  path: unknown, orgId: string, profileId: string, role: string,
): path is string {
  if (!isQuotationImagePath(path)) return false;
  const segments = PHOTO_PATH_RE.exec(path);
  return !!segments
    && segments[1].toLowerCase() === orgId.toLowerCase()
    && (segments[2].toLowerCase() === profileId.toLowerCase()
        || role === 'admin' || role === 'manager');
}

/** Extra authorization for any server endpoint accepting saved quotation JSON. */
export function hasAuthorizedQuotationImages(
  draft: CommercialDocumentDraft, orgId: string, profileId: string, role: string,
): boolean {
  return draft.sections.every(section => section.items.every(item =>
    item.photoPath === undefined || item.photoPath === ''
      || canAccessQuotationImagePath(item.photoPath, orgId, profileId, role),
  ));
}

export function collectQuotationImagePaths(draft: CommercialDocumentDraft): string[] {
  return [...new Set(draft.sections.flatMap(section =>
    section.items.map(item => item.photoPath || '').filter(isQuotationImagePath)))];
}

/**
 * Files are served only as images. Block SVG and mixed MIME/magic signatures.
 * The browser converts supported photos to JPEG, removing EXIF metadata.
 */
export function validImageSignature(bytes: Uint8Array, mime: string): boolean {
  if (bytes.length < 12 || bytes.length > MAX_IMAGE_UPLOAD_BYTES) return false;
  if (mime === 'image/jpeg') {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (mime === 'image/png') {
    return [137,80,78,71,13,10,26,10].every((value,index) => bytes[index] === value);
  }
  if (mime === 'image/webp') {
    return [82,73,70,70].every((value,index) => bytes[index] === value)
      && [87,69,66,80].every((value,index) => bytes[index+8] === value);
  }
  return false;
}

export function imageExtension(mime: string): 'jpg'|'png'|'webp'|null {
  return mime === 'image/jpeg' ? 'jpg' : mime === 'image/png' ? 'png'
    : mime === 'image/webp' ? 'webp' : null;
}
