/**
 * GLH V2 evidence boundary: validate an untrusted model proposal against already
 * persisted / verified inbound message identities supplied by the caller.
 *
 * This module is pure and does not call models, send messages, change lead grade,
 * create customers, or persist data. It is NOT a production eligibility gate.
 */
export const GLH_V2_INQUIRY_EVIDENCE_SCHEMA_VERSION =
  'GLH-V2-INQUIRY-EVIDENCE-001' as const;

export const GLH_V2_INQUIRY_FIELDS = [
  'product',
  'material',
  'quantity',
  'country',
  'requirementType',
  'imageReferences',
  'company',
  'website',
  'dimensions',
  'artwork',
  'printingArea',
  'currentProcess',
  'painPoints',
  'testRequirements',
  'sampleIntent',
  'purchaseTimeline',
  'targetCapacity',
  'automationLevel',
  'fullSolutionRequired',
] as const;

export type GlhV2InquiryField = (typeof GLH_V2_INQUIRY_FIELDS)[number];

export interface GlhV2TrustedScope {
  organizationId: string;
  inquiryId: string;
}

export interface GlhV2SourceMessage {
  id: string;
  organizationId: string;
  inquiryId: string;
  direction: 'INBOUND' | 'OUTBOUND';
  kind: 'TEXT' | 'MEDIA';
  text: string | null;
  /** Trusted canonical attachment IDs, not LLM-generated URLs or guesses. */
  mediaReferences?: readonly string[];
}

export interface GlhV2EvidenceClaim {
  field: GlhV2InquiryField;
  value: string;
  sourceMessageId: string;
  excerpt: string | null;
  confidence: number;
  needsVerification: boolean;
}

export interface GlhV2EvidenceDraft {
  schemaVersion: typeof GLH_V2_INQUIRY_EVIDENCE_SCHEMA_VERSION;
  inquiryId: string;
  organizationId: string;
  claims: readonly GlhV2EvidenceClaim[];
  humanReviewRequired: true;
  customerFacingAutoSendAllowed: false;
  authoritativeWriteAllowed: false;
  legacyGradeUntouched: true;
}

export type GlhV2EvidenceResult =
  | { ok: true; data: GlhV2EvidenceDraft }
  | {
      ok: false;
      errorCode:
        | 'INVALID_SCHEMA'
        | 'INVALID_TRUSTED_SCOPE'
        | 'INVALID_INQUIRY_ID'
        | 'INVALID_MESSAGES'
        | 'SOURCE_SCOPE_MISMATCH'
        | 'INVALID_CLAIMS'
        | 'INVALID_FIELD'
        | 'INVALID_CLAIM_VALUE'
        | 'UNKNOWN_INBOUND_SOURCE'
        | 'INVALID_TEXT_EVIDENCE'
        | 'INVALID_MEDIA_EVIDENCE'
        | 'INVALID_CONFIDENCE'
        | 'DUPLICATE_CLAIM';
    };

const fieldSet: ReadonlySet<string> = new Set(GLH_V2_INQUIRY_FIELDS);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function bounded(value: unknown, limit: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= limit ? trimmed : null;
}

function reject(errorCode: Extract<GlhV2EvidenceResult, { ok: false }>['errorCode']): GlhV2EvidenceResult {
  return { ok: false, errorCode };
}

/**
 * Input proposal (untrusted):
 * { schemaVersion, inquiryId, claims: [{ field, value, sourceMessageId,
 *   excerpt?: string, confidence: 0..1 }] }
 *
 * TEXT claims MUST quote an exact excerpt of the referenced inbound message.
 * MEDIA claims may only assert a canonical attachment ID present on the trusted
 * inbound message. A matching excerpt is NOT semantic validation of the proposed
 * value: every candidate needs human review regardless of model confidence.
 * The trusted scope MUST originate from the authenticated server, not the model.
 */
export function validateGlhV2InquiryEvidence(
  proposal: unknown,
  sourceMessages: readonly GlhV2SourceMessage[],
  trustedScope: GlhV2TrustedScope,
): GlhV2EvidenceResult {
  if (!isObject(proposal) || proposal.schemaVersion !== GLH_V2_INQUIRY_EVIDENCE_SCHEMA_VERSION) {
    return reject('INVALID_SCHEMA');
  }
  const inquiryId = bounded(trustedScope?.inquiryId, 128);
  const organizationId = bounded(trustedScope?.organizationId, 128);
  if (!inquiryId || !organizationId) return reject('INVALID_TRUSTED_SCOPE');
  if (bounded(proposal.inquiryId, 128) !== inquiryId) return reject('INVALID_INQUIRY_ID');
  if (!Array.isArray(sourceMessages) || sourceMessages.length > 200) {
    return reject('INVALID_MESSAGES');
  }

  const sources = new Map<string, GlhV2SourceMessage>();
  for (const message of sourceMessages) {
    if (!message || typeof message !== 'object' || !bounded(message.id, 128)
      || (message.direction !== 'INBOUND' && message.direction !== 'OUTBOUND')
      || (message.kind !== 'TEXT' && message.kind !== 'MEDIA')
      || (message.text !== null && typeof message.text !== 'string')
      || !bounded(message.inquiryId, 128)
      || !bounded(message.organizationId, 128)
      || (message.kind === 'MEDIA' && (!Array.isArray(message.mediaReferences)
        || message.mediaReferences.length === 0
        || message.mediaReferences.length > 30
        || message.mediaReferences.some((ref: unknown) => !bounded(ref, 300))))
      || sources.has(message.id.trim())) {
      return reject('INVALID_MESSAGES');
    }
    if (message.inquiryId.trim() !== inquiryId || message.organizationId.trim() !== organizationId) {
      return reject('SOURCE_SCOPE_MISMATCH');
    }
    sources.set(message.id.trim(), message);
  }

  if (!Array.isArray(proposal.claims) || proposal.claims.length > 50) {
    return reject('INVALID_CLAIMS');
  }
  const claims: GlhV2EvidenceClaim[] = [];
  const seen = new Set<string>();
  for (const item of proposal.claims) {
    if (!isObject(item)) return reject('INVALID_CLAIMS');
    if (typeof item.field !== 'string' || !fieldSet.has(item.field)) {
      return reject('INVALID_FIELD');
    }
    const field = item.field as GlhV2InquiryField;
    const value = bounded(item.value, 300);
    const sourceMessageId = bounded(item.sourceMessageId, 128);
    if (!value || !sourceMessageId) return reject('INVALID_CLAIM_VALUE');

    const source = sources.get(sourceMessageId);
    if (!source || source.direction !== 'INBOUND') {
      return reject('UNKNOWN_INBOUND_SOURCE');
    }

    let excerpt: string | null = null;
    if (field === 'imageReferences') {
      if (source.kind !== 'MEDIA' || !source.mediaReferences?.includes(value)) {
        return reject('INVALID_MEDIA_EVIDENCE');
      }
    } else {
      excerpt = bounded(item.excerpt, 400);
      if (source.kind !== 'TEXT' || !excerpt || !source.text?.includes(excerpt)) {
        return reject('INVALID_TEXT_EVIDENCE');
      }
    }

    const confidence = item.confidence;
    if (typeof confidence !== 'number' || !Number.isFinite(confidence)
      || confidence < 0 || confidence > 1) {
      return reject('INVALID_CONFIDENCE');
    }

    const duplicateKey = JSON.stringify([field, sourceMessageId, value]);
    if (seen.has(duplicateKey)) return reject('DUPLICATE_CLAIM');
    seen.add(duplicateKey);
    claims.push({
      field,
      value,
      sourceMessageId,
      excerpt,
      confidence,
      // A plausible quote is provenance, not proof of the LLM's interpretation.
      // Do not let the model self-certify a high-confidence factual claim.
      needsVerification: true,
    });
  }

  return {
    ok: true,
    data: {
      schemaVersion: GLH_V2_INQUIRY_EVIDENCE_SCHEMA_VERSION,
      inquiryId,
      organizationId,
      claims,
      humanReviewRequired: true,
      customerFacingAutoSendAllowed: false,
      authoritativeWriteAllowed: false,
      legacyGradeUntouched: true,
    },
  };
}
