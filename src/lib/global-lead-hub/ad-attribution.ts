import type { GlhAccessContext } from './access';
import type { GlhContactRow, GlhLeadProfileRow, GlhLeadRow, GlhSourcePlatform } from './read-model';

type ReferralRecord = Record<string, string>;
const REFERRAL_KEYS = ['source_type', 'source_id', 'source_url', 'source_platform', 'headline', 'body', 'ctwa_clid', 'media_type', 'image_url', 'video_url', 'thumbnail_url', 'campaign_id', 'adset_id', 'ad_id', 'creative_id'] as const;

export interface GlhMetaReferralFacts {
  sourcePlatform: Extract<GlhSourcePlatform, 'FACEBOOK' | 'INSTAGRAM' | 'UNKNOWN'>;
  sourceId: string | null;
  sourceUrl: string | null;
  headline: string | null;
  body: string | null;
  ctwaClickId: string | null;
  campaignExternalId: string | null;
  adsetExternalId: string | null;
  adExternalId: string | null;
  creativeExternalId: string | null;
  referralIdentifier: string | null;
  raw: ReferralRecord | null;
  malformed: boolean;
}

function boundedString(value: unknown, max = 500): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized ? normalized.slice(0, max) : null;
}

export function normalizeGlhMetaReferral(value: unknown): GlhMetaReferralFacts {
  const object = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
  const raw: ReferralRecord = {};
  let malformed = value !== null && value !== undefined && !object;
  if (object) {
    for (const key of REFERRAL_KEYS) {
      if (!(key in object)) continue;
      const normalized = boundedString(object[key], key.endsWith('_url') ? 2_048 : 500);
      if (normalized) raw[key] = normalized;
      else if (object[key] !== null && object[key] !== undefined) malformed = true;
    }
    if (Object.values(object).some(candidate => candidate !== null && candidate !== undefined && typeof candidate !== 'string')) malformed = true;
  }
  const explicitPlatform = raw.source_platform?.toLowerCase();
  const sourcePlatform = explicitPlatform === 'facebook' ? 'FACEBOOK' : explicitPlatform === 'instagram' ? 'INSTAGRAM' : 'UNKNOWN';
  const sourceId = raw.source_id ?? null;
  const sourceUrl = raw.source_url ?? null;
  const ctwaClickId = raw.ctwa_clid ?? null;
  return {
    sourcePlatform,
    sourceId,
    sourceUrl,
    headline: raw.headline ?? null,
    body: raw.body ?? null,
    ctwaClickId,
    campaignExternalId: raw.campaign_id ?? null,
    adsetExternalId: raw.adset_id ?? null,
    adExternalId: raw.ad_id ?? null,
    creativeExternalId: raw.creative_id ?? null,
    referralIdentifier: ctwaClickId || sourceId || sourceUrl,
    raw: Object.keys(raw).length > 0 ? raw : null,
    malformed,
  };
}

export interface GlhAdAttributionGroup {
  key: string;
  label: string;
  sourcePlatform: GlhSourcePlatform;
  campaignId: string | null;
  creativeId: string | null;
  referralIdentifier: string | null;
  leads: number;
  qualified: number;
  highPriority: number;
  quotation: number;
  sample: number;
  won: number;
  qualificationRate: number;
  winRate: number;
}

export interface GlhAdAttributionDashboard {
  scope: 'ORGANIZATION' | 'MY_ACCESSIBLE_RECORDS';
  managerView: boolean;
  generatedAt: string;
  summary: { totalLeads: number; attributedLeads: number; unattributedLeads: number; attributionRate: number; qualifiedLeads: number; wonLeads: number };
  groups: GlhAdAttributionGroup[];
  country: Array<{ value: string; leads: number }>;
  product: Array<{ value: string; leads: number }>;
  requirement: Array<{ value: string; leads: number }>;
}

function percentage(value: number, total: number): number {
  return total === 0 ? 0 : Math.round((value / total) * 1_000) / 10;
}

function breakdown(values: Array<string | null | undefined>) {
  const counts = new Map<string, number>();
  for (const candidate of values) {
    const value = candidate?.trim() || 'Unknown';
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()].map(([value, leads]) => ({ value, leads })).sort((left, right) => right.leads - left.leads || left.value.localeCompare(right.value));
}

function reached(lead: GlhLeadRow, state: 'QUOTATION' | 'SAMPLE'): boolean {
  const order = ['NEW', 'AI_QUALIFYING', 'WAITING_CUSTOMER', 'READY_FOR_HUMAN', 'HUMAN_FOLLOWING', 'QUOTATION', 'SAMPLE', 'NEGOTIATION', 'WON'];
  return order.indexOf(lead.lifecycle_state) >= order.indexOf(state);
}

export function buildGlhAdAttributionDashboard(input: { context: GlhAccessContext; leads: GlhLeadRow[]; contacts: GlhContactRow[]; leadProfiles: GlhLeadProfileRow[]; now?: Date }): GlhAdAttributionDashboard {
  const managerView = input.context.role === 'ADMIN' || input.context.role === 'MANAGER';
  // Supabase RLS remains authoritative; this is defense in depth for aggregation.
  const leads = input.leads.filter(lead => lead.org_id === input.context.organizationId);
  const contacts = new Map(input.contacts.filter(contact => contact.org_id === input.context.organizationId).map(contact => [contact.id, contact]));
  const profiles = new Map(input.leadProfiles.filter(profile => profile.org_id === input.context.organizationId).map(profile => [profile.lead_id, profile]));
  const groupMap = new Map<string, GlhAdAttributionGroup>();
  for (const lead of leads) {
    const identifier = lead.creative_id || lead.campaign_id || lead.referral_identifier;
    const key = identifier ? `${lead.source_platform}:${identifier}` : `${lead.source_platform}:UNATTRIBUTED`;
    const current = groupMap.get(key) ?? { key, label: identifier || 'Unattributed', sourcePlatform: lead.source_platform, campaignId: lead.campaign_id, creativeId: lead.creative_id, referralIdentifier: lead.referral_identifier, leads: 0, qualified: 0, highPriority: 0, quotation: 0, sample: 0, won: 0, qualificationRate: 0, winRate: 0 };
    current.leads++;
    if (lead.priority_grade) current.qualified++;
    if (lead.priority_grade === 'A' || lead.priority_grade === 'B') current.highPriority++;
    if (reached(lead, 'QUOTATION')) current.quotation++;
    if (reached(lead, 'SAMPLE')) current.sample++;
    if (lead.lifecycle_state === 'WON') current.won++;
    groupMap.set(key, current);
  }
  const groups = [...groupMap.values()].map(group => ({ ...group, qualificationRate: percentage(group.qualified, group.leads), winRate: percentage(group.won, group.leads) })).sort((left, right) => right.leads - left.leads || left.key.localeCompare(right.key));
  const attributedLeads = leads.filter(lead => Boolean(lead.creative_id || lead.campaign_id || lead.referral_identifier)).length;
  return {
    scope: managerView ? 'ORGANIZATION' : 'MY_ACCESSIBLE_RECORDS',
    managerView,
    generatedAt: (input.now ?? new Date()).toISOString(),
    summary: { totalLeads: leads.length, attributedLeads, unattributedLeads: leads.length - attributedLeads, attributionRate: percentage(attributedLeads, leads.length), qualifiedLeads: leads.filter(lead => Boolean(lead.priority_grade)).length, wonLeads: leads.filter(lead => lead.lifecycle_state === 'WON').length },
    groups,
    country: breakdown(leads.map(lead => profiles.get(lead.id)?.country_code || contacts.get(lead.contact_id)?.country_code)),
    product: breakdown(leads.map(lead => profiles.get(lead.id)?.product)),
    requirement: breakdown(leads.map(lead => profiles.get(lead.id)?.requirement_type)),
  };
}
