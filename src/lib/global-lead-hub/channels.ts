import type { GlhPriorityGrade } from './domain';

export const GLH_CHANNEL_PROVIDERS = [
  'WHATSAPP',
  'FACEBOOK',
  'INSTAGRAM',
] as const;

export type GlhChannelProvider = (typeof GLH_CHANNEL_PROVIDERS)[number];

export const GLH_CHANNEL_ACCOUNT_STATUSES = [
  'DISCONNECTED',
  'PENDING',
  'TEST_READY',
  'CONNECTED',
  'ERROR',
] as const;

export type GlhChannelAccountStatus =
  (typeof GLH_CHANNEL_ACCOUNT_STATUSES)[number];

export const GLH_CHANNEL_SETTINGS_AUDIT_ACTION = 'CHANNEL_SETTING_CHANGED';
export const GLH_PROVIDER_CALLS_ENABLED = false;

export interface GlhChannelAccountProviderRecord {
  id: string;
  organizationId: string;
  provider: GlhChannelProvider;
  externalAccountId: string;
  displayName: string | null;
  status: GlhChannelAccountStatus;
  configurationReference: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GlhChannelAccountRecordInput {
  id: string;
  organizationId: string;
  provider: string;
  externalAccountId: string;
  displayName?: string | null;
  status?: string;
  configurationReference?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface GlhOutboundMessageCommand {
  organizationId: string;
  channelAccountId: string;
  conversationId: string;
  idempotencyKey: string;
  body: string;
}

export type GlhOutboundMessageResult =
  | {
      ok: true;
      provider: GlhChannelProvider;
      providerMessageId: string;
      status: 'SENT';
    }
  | {
      ok: false;
      provider: GlhChannelProvider;
      status: 'PROVIDER_CALLS_DISABLED';
      errorCode: 'PROVIDER_CUTOVER_NOT_AUTHORIZED';
    };

export interface GlhChannelAdapter {
  readonly provider: GlhChannelProvider;
  sendApprovedMessage(
    command: GlhOutboundMessageCommand,
  ): Promise<GlhOutboundMessageResult>;
}

export interface GlhAttributionRecord {
  sourcePlatform: GlhChannelProvider | 'UNKNOWN';
  campaignExternalId: string | null;
  adsetExternalId: string | null;
  adExternalId: string | null;
  creativeExternalId: string | null;
  referralIdentifier: string | null;
}

export function isGlhChannelProvider(value: unknown): value is GlhChannelProvider {
  return typeof value === 'string'
    && (GLH_CHANNEL_PROVIDERS as readonly string[]).includes(value);
}

export function isGlhChannelAccountStatus(
  value: unknown,
): value is GlhChannelAccountStatus {
  return typeof value === 'string'
    && (GLH_CHANNEL_ACCOUNT_STATUSES as readonly string[]).includes(value);
}

export function toGlhChannelAccountProviderRecord(
  input: GlhChannelAccountRecordInput,
): GlhChannelAccountProviderRecord | null {
  if (!isGlhChannelProvider(input.provider)) return null;
  if (!input.id || !input.organizationId || !input.externalAccountId) return null;

  const status = input.status ?? 'DISCONNECTED';
  if (!isGlhChannelAccountStatus(status)) return null;

  return {
    id: input.id,
    organizationId: input.organizationId,
    provider: input.provider,
    externalAccountId: input.externalAccountId,
    displayName: input.displayName?.trim() || null,
    status,
    configurationReference: input.configurationReference?.trim() || null,
    createdAt: input.createdAt ?? '',
    updatedAt: input.updatedAt ?? input.createdAt ?? '',
  };
}

export function normalizeGlhAttribution(
  input: Partial<GlhAttributionRecord> | null | undefined,
): GlhAttributionRecord {
  const sourcePlatform = input?.sourcePlatform;
  return {
    sourcePlatform: sourcePlatform && isGlhChannelProvider(sourcePlatform)
      ? sourcePlatform
      : 'UNKNOWN',
    campaignExternalId: input?.campaignExternalId?.trim() || null,
    adsetExternalId: input?.adsetExternalId?.trim() || null,
    adExternalId: input?.adExternalId?.trim() || null,
    creativeExternalId: input?.creativeExternalId?.trim() || null,
    referralIdentifier: input?.referralIdentifier?.trim() || null,
  };
}

export function createDisabledGlhChannelAdapter(
  provider: GlhChannelProvider,
): GlhChannelAdapter {
  return {
    provider,
    async sendApprovedMessage() {
      return {
        ok: false,
        provider,
        status: 'PROVIDER_CALLS_DISABLED',
        errorCode: 'PROVIDER_CUTOVER_NOT_AUTHORIZED',
      };
    },
  };
}

export interface GlhLeadQualityMetrics {
  leadCount: number;
  qualifiedLeadCount: number;
  gradeDistribution: Record<GlhPriorityGrade, number>;
}
