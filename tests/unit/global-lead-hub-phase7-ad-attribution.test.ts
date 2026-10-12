import fs from 'node:fs';
import type { GlhAccessContext } from '../../src/lib/global-lead-hub/access';
import { buildGlhAdAttributionDashboard, normalizeGlhMetaReferral } from '../../src/lib/global-lead-hub/ad-attribution';
import type { GlhContactRow, GlhLeadProfileRow, GlhLeadRow, GlhMessageRow } from '../../src/lib/global-lead-hub/read-model';

let passed = 0;
let failed = 0;
function assert(condition: boolean, message: string) {
  if (condition) passed++;
  else { failed++; console.error('FAIL: ' + message); }
}

console.log('\n=== Global Lead Hub Phase 7 Ad Attribution ===');
const referral = normalizeGlhMetaReferral({ source_type: 'ad', source_id: 'source-1', source_url: 'https://example.com/ad', ctwa_clid: 'click-1', headline: 'Printing solution', campaign_id: 'campaign-external', nested: { forbidden: true } });
assert(referral.referralIdentifier === 'click-1', 'CTWA click id is the preferred referral identifier');
assert(referral.sourcePlatform === 'UNKNOWN', 'Provider platform is not invented from generic ad source type');
assert(referral.raw?.nested === undefined && referral.malformed, 'Nested referral data is rejected from bounded raw facts');
assert(normalizeGlhMetaReferral(null).raw === null, 'Absent referral has a stable empty representation');
assert(normalizeGlhMetaReferral(['bad']).malformed, 'Non-object referral input is marked malformed');

const context: GlhAccessContext = { actorProfileId: 'manager-a', organizationId: 'org-a', role: 'MANAGER', authSource: 'supabase' };
const base: GlhLeadRow = { id: 'lead-1', org_id: 'org-a', contact_id: 'contact-1', owner_profile_id: 'sales-1', lifecycle_state: 'QUOTATION', conversation_mode: 'HUMAN_ACTIVE', priority_grade: 'A', score: 90, completeness: 80, source_platform: 'FACEBOOK', campaign_id: 'campaign-1', creative_id: 'creative-1', referral_identifier: 'click-1', last_message_at: null, next_follow_up_at: null, version: 1, created_at: '2026-10-01T00:00:00.000Z', updated_at: '2026-10-01T00:00:00.000Z' };
const leads: GlhLeadRow[] = [base, { ...base, id: 'lead-2', lifecycle_state: 'WON', priority_grade: 'B' }, { ...base, id: 'lead-3', creative_id: null, campaign_id: null, referral_identifier: null, priority_grade: null, lifecycle_state: 'NEW' }, { ...base, id: 'lead-other-org', org_id: 'org-b', lifecycle_state: 'WON' }];
const contacts: GlhContactRow[] = [{ id: 'contact-1', org_id: 'org-a', display_name: 'Buyer', company_name: null, country_code: 'NG', normalized_whatsapp: null, normalized_email: null, source_platform: 'FACEBOOK' }];
const profiles: GlhLeadProfileRow[] = [{ lead_id: 'lead-1', org_id: 'org-a', customer_company_name: null, country_code: 'NG', whatsapp: null, email: null, website: null, social_identifier: null, product: 'Printer', material: null, product_media_references: null, dimensions: null, quantity: null, artwork_reference: null, printing_area: null, requirement_type: 'MACHINE', current_printing_process: null, pain_points: null, test_requirements: null, sample_availability: null, purchase_timeline: null, machine_capacity_requirements: null, automation_requirements: null, machine_plus_process_solution_required: null, extracted_facts: null, ai_summary: null }];
function message(overrides: Partial<GlhMessageRow>): GlhMessageRow {
  return { id: 'message-referral', org_id: 'org-a', conversation_id: 'conversation-1', lead_id: 'lead-3', direction: 'INBOUND', actor_type: 'CUSTOMER', actor_profile_id: null, message_text: 'Interested', media_metadata: { referral: { source_platform: 'instagram', campaign_id: 'campaign-external', adset_id: 'adset-external', ad_id: 'ad-external', creative_id: 'creative-external', ctwa_clid: 'click-external' } }, provider_timestamp: '2026-10-11T10:00:00.000Z', delivery_status: 'RECEIVED', created_at: '2026-10-11T10:00:00.000Z', ...overrides };
}
const messages: GlhMessageRow[] = [
  message({}),
  message({ id: 'message-newer-no-referral', media_metadata: { message_type: 'text' }, provider_timestamp: '2026-10-11T11:00:00.000Z', created_at: '2026-10-11T11:00:00.000Z' }),
  message({ id: 'message-older-referral', media_metadata: { referral: { source_platform: 'facebook', creative_id: 'stale-creative' } }, provider_timestamp: '2026-10-11T09:00:00.000Z', created_at: '2026-10-11T09:00:00.000Z' }),
  message({ id: 'message-other-org', org_id: 'org-b', lead_id: 'lead-other-org' }),
];

const dashboard = buildGlhAdAttributionDashboard({ context, leads, contacts, leadProfiles: profiles, messages, now: new Date('2026-10-12T00:00:00.000Z') });
assert(dashboard.summary.totalLeads === 3, 'Cross-organization leads never enter attribution aggregates');
assert(dashboard.summary.attributedLeads === 3 && dashboard.summary.attributionRate === 100, 'Persisted referral facts contribute to deterministic coverage');
assert(dashboard.groups[0]?.leads === 2 && dashboard.groups[0]?.won === 1, 'Creative quality aggregates persisted outcomes');
const persistedGroup = dashboard.groups.find(group => group.creativeId === 'creative-external');
assert(persistedGroup?.sourcePlatform === 'INSTAGRAM', 'Explicit persisted source platform is reported');
assert(persistedGroup?.campaignId === 'campaign-external' && persistedGroup.adsetId === 'adset-external' && persistedGroup.adId === 'ad-external', 'Persisted campaign, adset and ad identifiers remain auditable');
assert(persistedGroup?.clickId === 'click-external' && persistedGroup.leads === 1, 'Latest valid referral is selected and each lead is counted once');
assert(!dashboard.groups.some(group => group.creativeId === 'stale-creative'), 'Older referral facts do not override the latest valid referral');
const adsetOnlyLead: GlhLeadRow = { ...base, id: 'lead-adset-only', source_platform: 'UNKNOWN', campaign_id: null, creative_id: null, referral_identifier: null };
const adsetOnlyDashboard = buildGlhAdAttributionDashboard({
  context,
  leads: [adsetOnlyLead],
  contacts,
  leadProfiles: profiles,
  messages: [message({ id: 'message-adset-only', lead_id: adsetOnlyLead.id, media_metadata: { referral: { adset_id: 'adset-only' } } })],
});
assert(adsetOnlyDashboard.groups[0]?.adsetId === 'adset-only' && adsetOnlyDashboard.groups[0]?.label === 'adset-only', 'Adset-only referral facts retain a distinct reportable attribution group');
assert(dashboard.country[0]?.value === 'NG', 'Country breakdown uses existing facts');
const sales = buildGlhAdAttributionDashboard({ context: { ...context, role: 'SALES' }, leads: [base], contacts, leadProfiles: profiles });
assert(sales.scope === 'MY_ACCESSIBLE_RECORDS' && !sales.managerView, 'Sales output labels its RLS-scoped view');
const empty = buildGlhAdAttributionDashboard({ context, leads: [], contacts: [], leadProfiles: [] });
assert(empty.summary.attributionRate === 0 && empty.groups.length === 0, 'Empty state is stable');

const paths = ['src/app/global-lead-hub/ads/page.tsx', 'src/app/api/global-lead-hub/ads/route.ts', 'src/components/global-lead-hub/AdAttributionDashboard.tsx'];
assert(paths.every(path => fs.existsSync(path)), 'Phase 7 page, API, and component exist');
const source = paths.map(path => fs.readFileSync(path, 'utf8')).join('\n') + fs.readFileSync('src/lib/global-lead-hub/server.ts', 'utf8');
assert(source.includes('resolveGlhAccessContext') && source.includes(".eq('org_id', context.organizationId)"), 'Routes use trusted access and organization-scoped reads');
assert(source.includes(".in('lead_id', leadIds)") && source.includes('media_metadata'), 'Server reads persisted referral facts only for RLS-accessible lead IDs');
for (const forbidden of ['SUPABASE_' + 'SERVICE_ROLE_KEY', 'createAdmin' + 'SupabaseClient', 'graph.' + 'facebook.com', 'api.' + 'whatsapp.com']) assert(!source.includes(forbidden), `Read surfaces avoid forbidden token: ${forbidden}`);

console.log(`GLH Phase 7 Ad Attribution tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
