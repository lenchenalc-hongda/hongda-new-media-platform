import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  glhManualHumanStageSchema, glhManualWorkCompletionSchema, GLH_MANUAL_HUMAN_STAGES,
} from '../../src/lib/global-lead-hub/validation';
import {
  changeGlhManualHumanStage, finishGlhManualWork, GlhMutationError,
} from '../../src/lib/global-lead-hub/mutations';

const src = (path: string) => readFileSync(path, 'utf8');
const sql = src('supabase/migrations/20261021135000_global_lead_hub_stage1_human_workflow.sql');
const stage = src('src/app/api/global-lead-hub/leads/[leadId]/stage/route.ts');
const complete = src('src/app/api/global-lead-hub/tasks/complete/route.ts');
const detail = src('src/components/global-lead-hub/LeadDetail.tsx');
const board = src('src/components/global-lead-hub/TaskBoard.tsx');

assert(glhManualHumanStageSchema.safeParse({stage:'HUMAN_FOLLOWING',expectedVersion:1,reason:null}).success);
assert(glhManualHumanStageSchema.safeParse({stage:'LOST',expectedVersion:3,reason:'Customer chose another supplier'}).success);
for (const invalid of [
  {stage:'AI_QUALIFYING',expectedVersion:2},
  {stage:'LOST',expectedVersion:1},
  {stage:'INVALID',expectedVersion:1,reason:'a'},
  {stage:'WON',expectedVersion:0},
  {stage:'WON',expectedVersion:1,orgId:'spoofed'},
]) assert(!glhManualHumanStageSchema.safeParse(invalid).success);
assert(GLH_MANUAL_HUMAN_STAGES.includes('NEGOTIATION'));
assert(glhManualWorkCompletionSchema.safeParse({
  workId:'00000000-0000-4000-8000-000000009001',kind:'FOLLOWUP',expectedVersion:1,
}).success);
assert(!glhManualWorkCompletionSchema.safeParse({
  workId:'00000000-0000-4000-8000-000000009001',kind:'AI_SEND',expectedVersion:1,
}).success);

for (const p of [
  'CREATE TABLE public.glh_manual_work_updates',
  'ENABLE ROW LEVEL SECURITY',
  'USING (public.glh_can_access_lead(lead_id))',
  'REVOKE ALL ON public.glh_manual_work_updates',
  'GRANT SELECT ON public.glh_manual_work_updates TO authenticated',
  'CREATE OR REPLACE FUNCTION public.glh_change_manual_lead_stage(',
  'CREATE OR REPLACE FUNCTION public.glh_finish_manual_work(',
  'SET search_path = pg_catalog,public',
  'WHERE user_id = auth.uid() AND is_active = true',
  "lp.extracted_facts->>'origin' = 'MANUAL_PRODUCTION'",
  "lp.extracted_facts->>'origin'='MANUAL_PRODUCTION'",
  "RAISE EXCEPTION 'VERSION_CONFLICT'",
  'FOR UPDATE',
  'INSERT INTO public.glh_audit_events',
  'INSERT INTO public.glh_manual_work_updates',
  'next_follow_up_at=(',
  "f.status IN ('OPEN','OVERDUE')",
  'RETURNS jsonb',
]) assert(sql.includes(p), 'Required SQL invariant missing: '+p);

assert(!/\b(DROP TABLE|TRUNCATE|DELETE FROM)\b/.test(sql));
assert(!sql.includes('graph.facebook.com'));
assert(!sql.includes('api.whatsapp.com'));
assert(!/GRANT\s+(INSERT|UPDATE|DELETE|ALL)\s+ON\s+public\.glh_/i.test(sql));
assert(stage.includes('resolveGlhAccessContext'));
assert(stage.includes('glhManualHumanStageSchema.safeParse'));
assert(stage.includes('changeGlhManualHumanStage(client'));
assert(!stage.includes('createAdminSupabaseClient'));
assert(complete.includes('resolveGlhAccessContext'));
assert(complete.includes('glhManualWorkCompletionSchema.safeParse'));
assert(complete.includes('finishGlhManualWork(client'));
assert(!complete.includes('createAdminSupabaseClient'));
assert(detail.includes('submitManualStage'));
assert(detail.includes('isManualIntake &&'));
assert(detail.includes("'/api/global-lead-hub/leads/'"));
assert(board.includes('标记完成'));
assert(board.includes("'/api/global-lead-hub/tasks/complete'"));
assert(board.includes('router.refresh()'));

async function rpcTests() {
  let n = 0;
  const mock = { rpc: async (name:string,args:Record<string,unknown>) => {
    n++;
    if(name==='glh_change_manual_lead_stage') {
      assert.equal(args.p_expected_version,2);
      assert.equal(args.p_stage,'QUOTATION');
      assert.equal(args.p_lead_id,'00000000-0000-4000-8000-000000009001');
    } else {
      assert.equal(name,'glh_finish_manual_work');
      assert.equal(args.p_work_kind,'FOLLOWUP');
      assert.equal(args.p_expected_version,1);
    }
    assert(!('p_org_id' in args));
    return { data:{version:3},error:null };
  }};
  await changeGlhManualHumanStage(
    mock,'00000000-0000-4000-8000-000000009001',
    glhManualHumanStageSchema.parse({stage:'QUOTATION',expectedVersion:2}),
  );
  await finishGlhManualWork(
    mock,glhManualWorkCompletionSchema.parse({
      workId:'00000000-0000-4000-8000-000000009002',
      kind:'FOLLOWUP',expectedVersion:1,
    }),
  );
  assert.equal(n,2);
  const denied={rpc:async()=>({data:null,error:{code:'42501',message:'ACCESS_DENIED'}})};
  await assert.rejects(
    ()=>finishGlhManualWork(denied,glhManualWorkCompletionSchema.parse({
      workId:'00000000-0000-4000-8000-000000009002',
      kind:'FOLLOWUP',expectedVersion:1,
    })),
    (error:unknown)=>error instanceof GlhMutationError && error.status===403,
  );
}
void rpcTests().then(()=>console.log('GLH Stage 1 human workflow unit tests passed'));
