import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  glhProductionManualIntakeSchema,
  GLH_MANUAL_PRODUCTION_SOURCES,
  getGlhManualCreationGuard,
  parseGlhLeadListFilters,
} from '../../src/lib/global-lead-hub/validation';
import { buildGlhLeadList } from '../../src/lib/global-lead-hub/read-model';
import {
  createGlhProductionManualLead,
  GlhMutationError,
} from '../../src/lib/global-lead-hub/mutations';

const read = (path: string) => readFileSync(path, 'utf8');
const migration = read('supabase/migrations/20261021120000_global_lead_hub_stage1_manual_production_intake.sql');
const api = read('src/app/api/global-lead-hub/leads/manual/route.ts');
const legacyApi = read('src/app/api/global-lead-hub/leads/route.ts');
const form = read('src/components/global-lead-hub/ProductionManualLeadForm.tsx');
const page = read('src/app/global-lead-hub/leads/new/page.tsx');
const list = read('src/app/global-lead-hub/leads/page.tsx');
const detail = read('src/components/global-lead-hub/LeadDetail.tsx');

const base = {
  requestKey: '00000000-0000-4000-8000-000000009101',
  displayName: 'Synthetic buyer',
  companyName: 'Testing Limited',
  email: 'test@example.invalid',
  whatsapp: null,
  sourceDetail: 'EXHIBITION',
  notes: 'Only internal lead',
};
assert(glhProductionManualIntakeSchema.safeParse(base).success);
assert(glhProductionManualIntakeSchema.safeParse({ ...base, email: null, whatsapp: '+84901234567' }).success);
for (const wrong of [
  { ...base, email: null, whatsapp: null },
  { ...base, displayName: '' },
  { ...base, requestKey: 'not-uuid' },
  { ...base, email: 'not-email' },
  { ...base, sourceDetail: 'WHATSAPP' },
  { ...base, whatsapp: '123' },
  { ...base, orgId: 'caller-cannot-supply-org' },
  { ...base, userId: 'caller-cannot-supply-actor' },
]) assert(!glhProductionManualIntakeSchema.safeParse(wrong).success, JSON.stringify(wrong));
assert(GLH_MANUAL_PRODUCTION_SOURCES.includes('EXHIBITION'));

assert(getGlhManualCreationGuard !== undefined);
const legacy = read('src/lib/global-lead-hub/validation.ts');
assert(legacy.includes("input.nodeEnv === 'production'"));
assert(legacyApi.includes('getGlhManualCreationGuard()'));
assert(legacyApi.includes('createGlhManualTestLead('));
assert(!api.includes('getGlhManualCreationGuard'));
assert(!api.includes('createGlhManualTestLead'));
assert(api.includes('resolveGlhAccessContext()'));
assert(api.includes('glhProductionManualIntakeSchema.safeParse'));
assert(api.includes('createGlhProductionManualLead(client, parsed.data)'));
assert(api.includes('const client = await createClient()'));
assert(api.includes('Cache-Control'));
assert(api.includes('MAX_BYTES'));
assert(!api.includes('createAdminSupabaseClient'));
assert(!api.includes('service_role'));

for (const phrase of [
  'CREATE TABLE public.glh_manual_intake_requests',
  'UNIQUE (org_id, actor_profile_id, request_key)',
  'ALTER TABLE public.glh_manual_intake_requests ENABLE ROW LEVEL SECURITY',
  'REVOKE ALL ON TABLE public.glh_manual_intake_requests FROM PUBLIC,anon,authenticated',
  'CREATE OR REPLACE FUNCTION public.glh_create_manual_production_lead(',
  'SECURITY DEFINER',
  'SET search_path = pg_catalog,public',
  'WHERE user_id = auth.uid() AND is_active = true',
  "v_actor.role = 'sales'",
  'AND org_id = v_actor.org_id',
  "'CONTACT_ALREADY_EXISTS'",
  "'IDEMPOTENCY_CONFLICT'",
  "pg_advisory_xact_lock",
  'v_prior.request_hash <> v_hash',
  "'MANUAL_PRODUCTION'",
  "conversation_mode",
  "'PAUSED'",
  "'LEAD_ASSIGNED'",
  "'LEAD_CREATED'",
  "FROM PUBLIC,anon,authenticated",
  ") TO authenticated",
]) assert(migration.includes(phrase), 'Missing SQL invariant: ' + phrase);
assert(!migration.includes('app.glh_manual_creation_guard'));
assert(!migration.includes('app.environment'));
assert(!migration.includes('graph.facebook.com'));
assert(!migration.includes('api.whatsapp.com'));
assert(!migration.includes('DROP TABLE'));
assert(!migration.includes('DELETE FROM public.'));
assert(migration.includes("normalized_email") && migration.includes("normalized_whatsapp"));
// Prevent check-then-insert duplicate contacts under concurrent requests.
assert(migration.includes("':glh:contact:' || token"));
assert(migration.includes('ORDER BY k.key'));
assert(migration.includes("':glh:contact:email:' || v_email"));
assert(migration.includes("':glh:contact:phone:' || v_phone"));
assert(migration.indexOf('ORDER BY k.key') < migration.indexOf("RAISE EXCEPTION 'CONTACT_ALREADY_EXISTS'"));
assert(migration.includes("source_platform,created_by_profile_id"));
assert(migration.includes("'UNKNOWN',v_actor.id"));
assert(migration.includes("'PAUSED',0,0,'UNKNOWN'"));

assert(page.includes('ProductionManualLeadForm'));
assert(page.includes('guard.allowed') && page.includes('<LeadForm'));
assert(list.includes('新增线索'));
assert(form.includes("crypto.randomUUID()"));
assert(form.includes("'/api/global-lead-hub/leads/manual'"));
assert(form.includes('requestKey.current = null'));
assert(form.includes('submittingRef.current = true'));
assert(detail.includes("manualFacts?.origin === 'MANUAL_PRODUCTION'"));
assert(detail.includes('销售录入备注'));

// Manual provenance must remain distinct from WhatsApp/Meta source; list filtering
// should use the actual captured source_detail, not misleading provider='UNKNOWN'.
const parsedManual = parseGlhLeadListFilters(new URLSearchParams('manualSource=EXHIBITION'));
assert.equal(parsedManual.manualSource, 'EXHIBITION');
assert.equal(
  parseGlhLeadListFilters(new URLSearchParams('manualSource=WHATSAPP')).manualSource,
  undefined,
);
const fixtureLead = {
  id:'lead-manual',org_id:'org-a',contact_id:'contact-manual',
  owner_profile_id:'sales-a',lifecycle_state:'NEW',conversation_mode:'PAUSED',
  priority_grade:null,score:0,completeness:0,source_platform:'UNKNOWN',
  campaign_id:null,creative_id:null,referral_identifier:null,last_message_at:null,
  next_follow_up_at:null,version:1,created_at:'2026-10-21T00:00:00Z',
  updated_at:'2026-10-21T00:00:00Z',
} as const;
const manualInput = {
  leads:[fixtureLead],
  contacts:[{
    id:'contact-manual',org_id:'org-a',display_name:'Synthetic',
    company_name:'Synthetic Group',country_code:'VN',
    normalized_whatsapp:null,normalized_email:'test@example.invalid',source_platform:'UNKNOWN',
  } as const],
  leadProfiles:[{
    lead_id:'lead-manual',org_id:'org-a',requirement_type:'FILM',
    extracted_facts:{origin:'MANUAL_PRODUCTION',source_detail:'EXHIBITION'},
    customer_company_name:'Synthetic Group',
  } as any],
  profiles:[{id:'sales-a',org_id:'org-a',full_name:'Sales A',role:'sales',is_active:true}],
  tasks:[],followups:[],
};
const manualRows = buildGlhLeadList({ ...manualInput, filters:parsedManual });
assert.equal(manualRows.length,1);
assert.equal(manualRows[0].source,'UNKNOWN');
assert.equal(manualRows[0].manualSourceDetail,'EXHIBITION');
assert.equal(buildGlhLeadList({
  ...manualInput,
  filters:parseGlhLeadListFilters(new URLSearchParams('manualSource=WEBSITE')),
}).length,0);

async function testRpc() {
  let count = 0;
  const fake = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      count++;
      assert.equal(name, 'glh_create_manual_production_lead');
      assert.equal(args.p_request_key, base.requestKey);
      assert.equal(args.p_display_name, base.displayName);
      assert.equal(args.p_source_detail, base.sourceDetail);
      assert(!('p_org_id' in args) && !('p_actor_profile_id' in args));
      return { data: { leadId: 'lead-1', idempotentReplay: false }, error: null };
    },
  };
  const created = await createGlhProductionManualLead(fake, glhProductionManualIntakeSchema.parse(base));
  assert.equal(created.leadId, 'lead-1');
  assert.equal(count, 1);
  const denied = {
    rpc: async () => ({ data: null, error: { code: '42501', message: 'ACCESS_DENIED' } }),
  };
  await assert.rejects(
    () => createGlhProductionManualLead(denied, glhProductionManualIntakeSchema.parse(base)),
    (error: unknown) => error instanceof GlhMutationError && error.status === 403,
  );
  const duplicate = {
    rpc: async () => ({ data: null, error: { code: '23505', message: 'Sensitive database constraint' } }),
  };
  await assert.rejects(
    () => createGlhProductionManualLead(duplicate, glhProductionManualIntakeSchema.parse(base)),
    (error: unknown) => error instanceof GlhMutationError
      && error.code === 'CONTACT_ALREADY_EXISTS' && error.status === 409
      && !error.message.includes('Sensitive database constraint'),
  );
}
void testRpc().then(() => console.log('GLH Stage 1 manual Production intake unit tests passed'));
