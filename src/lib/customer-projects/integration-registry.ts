// Phase 11 integration registry.
// This module describes integration authority boundaries. It is metadata only
// and must never become a source of customer, ownership, order, quote, lead,
// payment, review, knowledge, or conversation facts.

export const CPC_INTEGRATION_DOMAIN_IDS = [
  'customer_master',
  'customer_ownership',
  'receipt_payment',
  'orders',
  'quotations',
  'leads',
  'review_center',
  'knowledge',
  'whatsapp',
  'wecom_customer_conversation',
] as const;

export type CpcIntegrationDomainId = (typeof CPC_INTEGRATION_DOMAIN_IDS)[number];

export const CPC_INTEGRATION_STATUSES = [
  'connected',
  'available_internal',
  'external_contract_pending',
  'current_artifact_only',
  'backlog',
  'unknown',
] as const;

export type CpcIntegrationStatus = (typeof CPC_INTEGRATION_STATUSES)[number];

export type CpcIntegrationReadCapability =
  | 'not_available'
  | 'external_authority_only'
  | 'internal_read'
  | 'artifact_reference_only'
  | 'backlog'
  | 'unknown';

export type CpcIntegrationWriteCapability =
  | 'none'
  | 'external_authority_only'
  | 'internal_read_only'
  | 'future_contract_only';

export type CpcIntegrationFreshness =
  | {
      kind: 'live_internal_read';
      lastSyncedAt: null;
      note: string;
    }
  | {
      kind: 'not_synced';
      lastSyncedAt: null;
      note: string;
    }
  | {
      kind: 'artifact_reference';
      lastSyncedAt: null;
      note: string;
    }
  | {
      kind: 'backlog';
      lastSyncedAt: null;
      note: string;
    }
  | {
      kind: 'unknown';
      lastSyncedAt: null;
      note: string;
    };

export interface CpcIntegrationRegistryEntry {
  domain: CpcIntegrationDomainId;
  label: string;
  authority: string;
  status: CpcIntegrationStatus;
  readCapability: CpcIntegrationReadCapability;
  writeCapability: CpcIntegrationWriteCapability;
  stableIdKind: string;
  freshness: CpcIntegrationFreshness;
  knownLimitations: readonly string[];
  sourceOfTruthStatement: string;
  employeeAction: string;
  fallback: string;
}

export type CpcIntegrationReuseKind =
  | 'profiles_org_identity'
  | 'review_center'
  | 'knowledge';

export type CpcIntegrationAvailability = 'available' | 'unavailable' | 'unknown';

export interface CpcIntegrationReuseStatus {
  kind: CpcIntegrationReuseKind;
  state: CpcIntegrationAvailability;
  readOnly: true;
  detail: string;
}

export interface CpcIntegrationStatusSnapshot {
  generatedAt: string;
  registry: readonly CpcIntegrationRegistryEntry[];
  summary: Record<CpcIntegrationStatus, number>;
  internalReuse: readonly CpcIntegrationReuseStatus[];
  pendingExternalGates: readonly CpcIntegrationDomainId[];
  phase12InternalUiQaReady: true;
  fullLiveIntegrationReady: false;
}

export const CPC_INTEGRATION_REGISTRY = [
  {
    domain: 'customer_master',
    label: '客户主数据',
    authority: 'external_workshop_customer_master',
    status: 'external_contract_pending',
    readCapability: 'external_authority_only',
    writeCapability: 'external_authority_only',
    stableIdKind: 'external customer id',
    freshness: {
      kind: 'not_synced',
      lastSyncedAt: null,
      note: 'No approved read adapter or synchronization contract is configured.',
    },
    knownLimitations: [
      'No approved narrow workshop read endpoint is present in repository evidence.',
      'CPC may store a stable external reference but must not recreate the customer master.',
      'Display-name matching is not an identity contract.',
    ],
    sourceOfTruthStatement:
      'The external workshop customer record remains authoritative. CPC stores references, not a second customer authority.',
    employeeAction:
      'Use the canonical external customer reference when an approved integration is available.',
    fallback:
      'If the reference is missing, keep customer identity unknown and use a provisional CPC reference only for intake.',
  },
  {
    domain: 'customer_ownership',
    label: '客户归属',
    authority: 'external_workshop_customer_ownership',
    status: 'external_contract_pending',
    readCapability: 'external_authority_only',
    writeCapability: 'external_authority_only',
    stableIdKind: 'external employee id plus external customer id',
    freshness: {
      kind: 'not_synced',
      lastSyncedAt: null,
      note: 'No approved ownership read contract or external employee mapping rows exist here.',
    },
    knownLimitations: [
      'External employee ids are not repository profiles.id values.',
      'Ownership history and effective-date semantics are not established.',
      'CPC Project Owner is separate from external customer ownership.',
    ],
    sourceOfTruthStatement:
      'External workshop customer ownership remains authoritative. CPC does not edit or infer it.',
    employeeAction:
      'Treat the external owner reference as display context only until an explicit employee bridge is approved.',
    fallback:
      'When ownership is unavailable, display unknown and do not assign CPC ownership by name.',
  },
  {
    domain: 'receipt_payment',
    label: '收款 / 回款',
    authority: 'external_workshop_receipt_records',
    status: 'external_contract_pending',
    readCapability: 'external_authority_only',
    writeCapability: 'external_authority_only',
    stableIdKind: 'external receipt id',
    freshness: {
      kind: 'not_synced',
      lastSyncedAt: null,
      note: 'No approved receipt read contract, reconciliation rules, or correction semantics exist here.',
    },
    knownLimitations: [
      'CPC must not create a financial ledger.',
      'Missing payment values remain unknown, never zero.',
      'Currency, reversal, refund, and reconciliation semantics are unresolved.',
    ],
    sourceOfTruthStatement:
      'External workshop receipt records remain authoritative for payment and commission facts.',
    employeeAction:
      'Continue financial work in the external workshop/finance source.',
    fallback:
      'When receipt data is unavailable, show unknown and request finance confirmation instead of estimating.',
  },
  {
    domain: 'orders',
    label: '订单',
    authority: 'no_unified_order_source_of_truth',
    status: 'current_artifact_only',
    readCapability: 'artifact_reference_only',
    writeCapability: 'future_contract_only',
    stableIdKind: 'no stable unified order id',
    freshness: {
      kind: 'artifact_reference',
      lastSyncedAt: null,
      note: 'Current production instructions are operational artifacts, not a unified order ledger.',
    },
    knownLimitations: [
      'Dongguan and Shantou operating flows are separate today.',
      'QQ is transport, not an order database.',
      'No unified historical order source of truth is evidenced.',
    ],
    sourceOfTruthStatement:
      'There is no unified order source of truth today. A current production instruction is an artifact, not a CPC order authority.',
    employeeAction:
      'Preserve the current production instruction during transition.',
    fallback:
      'If an order reference is unavailable, keep order status unknown and record only confirmed CPC project facts.',
  },
  {
    domain: 'quotations',
    label: '报价',
    authority: 'wecom_excel_quotation_artifact',
    status: 'current_artifact_only',
    readCapability: 'artifact_reference_only',
    writeCapability: 'future_contract_only',
    stableIdKind: 'no stable structured quotation id',
    freshness: {
      kind: 'artifact_reference',
      lastSyncedAt: null,
      note: 'The current quotation is an Excel artifact; no structured version or acceptance store is evidenced.',
    },
    knownLimitations: [
      'The quotation file remains the source artifact.',
      'Quote acceptance must not be inferred from chat or AI output.',
      'No structured quotation lifecycle is introduced by this registry.',
    ],
    sourceOfTruthStatement:
      'The existing quotation file remains the source artifact during transition.',
    employeeAction:
      'Keep working in the existing quotation file and retain the artifact link where available.',
    fallback:
      'If the quotation artifact is unavailable, keep quote and acceptance states unknown.',
  },
  {
    domain: 'leads',
    label: '线索',
    authority: 'unresolved_lead_authority',
    status: 'unknown',
    readCapability: 'unknown',
    writeCapability: 'none',
    stableIdKind: 'unknown',
    freshness: {
      kind: 'unknown',
      lastSyncedAt: null,
      note: 'The live lead authority and reconciliation contract remain unresolved.',
    },
    knownLimitations: [
      'Legacy lead UI state and database lead records are not proven to share one live authority.',
      'CPC must not create a third lead store.',
      'Legacy lead security debt is outside this task.',
    ],
    sourceOfTruthStatement:
      'No canonical live lead source is established for CPC integration.',
    employeeAction:
      'Continue using the current operational lead process without claiming CPC lead authority.',
    fallback:
      'Keep new-media lead and proactive-outbound categories unknown until authority is resolved.',
  },
  {
    domain: 'review_center',
    label: '项目复盘',
    authority: 'repository_review_center',
    status: 'available_internal',
    readCapability: 'internal_read',
    writeCapability: 'internal_read_only',
    stableIdKind: 'org-scoped review case id',
    freshness: {
      kind: 'live_internal_read',
      lastSyncedAt: null,
      note: 'Availability is checked through the authenticated same-organization read boundary.',
    },
    knownLimitations: [
      'Review Center owns review/case facts.',
      'No CPC relation may be invented when a stable case relation is unavailable.',
    ],
    sourceOfTruthStatement:
      'Review Center remains authoritative for its review/case domain. CPC may link or reuse context read-only.',
    employeeAction:
      'Use Review Center for review work and link only stable review references.',
    fallback:
      'If no stable review relation exists, show availability without creating a CPC copy.',
  },
  {
    domain: 'knowledge',
    label: '知识库',
    authority: 'repository_knowledge_domain',
    status: 'available_internal',
    readCapability: 'internal_read',
    writeCapability: 'internal_read_only',
    stableIdKind: 'org-aware knowledge card id',
    freshness: {
      kind: 'live_internal_read',
      lastSyncedAt: null,
      note: 'Availability is checked through the authenticated same-organization read boundary.',
    },
    knownLimitations: [
      'Knowledge is advisory context only.',
      'Knowledge and AI output cannot establish confirmed business facts.',
      'CPC must not clone knowledge records.',
    ],
    sourceOfTruthStatement:
      'Knowledge remains owned by its existing knowledge domain and is reusable as advisory context.',
    employeeAction:
      'Use existing knowledge retrieval for guidance and drafting context.',
    fallback:
      'If retrieval is unavailable, continue with confirmed CPC facts and request human confirmation.',
  },
  {
    domain: 'whatsapp',
    label: 'WhatsApp 会话',
    authority: 'external_whatsapp_backlog',
    status: 'backlog',
    readCapability: 'backlog',
    writeCapability: 'none',
    stableIdKind: 'not mapped',
    freshness: {
      kind: 'backlog',
      lastSyncedAt: null,
      note: 'Automatic WhatsApp conversation synchronization is backlog.',
    },
    knownLimitations: [
      'Provider, contact, and message identifiers are not mapped for V1.',
      'Conversation text is not a confirmed business fact.',
    ],
    sourceOfTruthStatement:
      'No CPC WhatsApp conversation authority is enabled.',
    employeeAction:
      'Continue using WhatsApp operationally without automatic CPC synchronization.',
    fallback:
      'Keep conversation-derived facts unknown until a separately approved integration.',
  },
  {
    domain: 'wecom_customer_conversation',
    label: '企业微信客户会话',
    authority: 'external_wecom_conversation_backlog',
    status: 'backlog',
    readCapability: 'backlog',
    writeCapability: 'none',
    stableIdKind: 'not mapped',
    freshness: {
      kind: 'backlog',
      lastSyncedAt: null,
      note: 'Customer WeCom conversation synchronization remains backlog.',
    },
    knownLimitations: [
      'The existing WeChat Official Account publisher is not a customer-conversation source.',
      'Contact and conversation identity contracts are not established.',
    ],
    sourceOfTruthStatement:
      'No CPC customer WeCom conversation authority is enabled.',
    employeeAction:
      'Continue using WeCom operationally without treating chat text as confirmed CPC fact.',
    fallback:
      'Keep conversation-derived facts unknown until a separately approved integration.',
  },
] as const satisfies readonly CpcIntegrationRegistryEntry[];

export const PHASE_11_REPOSITORY_READINESS = {
  phase12InternalUiQaReady: true,
  fullLiveIntegrationReady: false,
  pendingExternalGates: [
    'customer_master',
    'customer_ownership',
    'receipt_payment',
    'orders',
    'quotations',
    'leads',
    'whatsapp',
    'wecom_customer_conversation',
  ],
} as const;

export function canReadIntegrationStatus(
  role: string | null | undefined,
): boolean {
  return role === 'admin';
}

export function getCpcIntegrationRegistryEntry(
  domain: CpcIntegrationDomainId,
): CpcIntegrationRegistryEntry {
  const entry = CPC_INTEGRATION_REGISTRY.find(item => item.domain === domain);
  if (!entry) {
    throw new Error('Unknown CPC integration domain');
  }
  return entry;
}

export function summariseCpcIntegrationStatuses(
  entries: readonly CpcIntegrationRegistryEntry[] = CPC_INTEGRATION_REGISTRY,
): Record<CpcIntegrationStatus, number> {
  const summary: Record<CpcIntegrationStatus, number> = {
    connected: 0,
    available_internal: 0,
    external_contract_pending: 0,
    current_artifact_only: 0,
    backlog: 0,
    unknown: 0,
  };

  for (const entry of entries) {
    summary[entry.status] += 1;
  }

  return summary;
}

export function buildCpcIntegrationStatusSnapshot(input: {
  generatedAt: string;
  internalReuse: readonly CpcIntegrationReuseStatus[];
}): CpcIntegrationStatusSnapshot {
  return {
    generatedAt: input.generatedAt,
    registry: CPC_INTEGRATION_REGISTRY,
    summary: summariseCpcIntegrationStatuses(),
    internalReuse: input.internalReuse,
    pendingExternalGates: PHASE_11_REPOSITORY_READINESS.pendingExternalGates,
    phase12InternalUiQaReady: PHASE_11_REPOSITORY_READINESS.phase12InternalUiQaReady,
    fullLiveIntegrationReady: PHASE_11_REPOSITORY_READINESS.fullLiveIntegrationReady,
  };
}
