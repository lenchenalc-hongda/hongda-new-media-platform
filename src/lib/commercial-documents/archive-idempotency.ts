import { createHash } from 'node:crypto';
import type { CommercialDocumentDraft } from './template';

export function validArchiveRequestId(value: unknown): value is string {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export function archiveRequestSha256(
  draft: CommercialDocumentDraft, sourceArchiveId: string | null, pdfSha256: string,
): string {
  return createHash('sha256').update(JSON.stringify({ draft, sourceArchiveId, pdfSha256 })).digest('hex');
}

export interface ArchiveRequestRecord {
  id: string;
  document_no: string;
  version: number;
  archived_at: string;
  request_sha256: string;
}

export function inspectArchivedRequest(existing: ArchiveRequestRecord | null, expectedSha256: string) {
  if (!existing) return { kind: 'fresh' as const };
  if (existing.request_sha256 !== expectedSha256) return { kind: 'conflict' as const };
  const { request_sha256: digest, ...archive } = existing;
  return { kind: 'replay' as const, archive };
}
