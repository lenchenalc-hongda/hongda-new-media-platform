import { register } from 'node:module';
import fs from 'node:fs';
import { NextRequest } from 'next/server';

const loader = `
export async function load(url, context, nextLoad) {
  if (url.endsWith('/src/lib/supabase/server.ts')) {
    return {
      format: 'module',
      source: 'export async function createClient() { return globalThis.__cpcPhase5CFakeSupabaseClient || null; }',
      shortCircuit: true,
    };
  }
  return nextLoad(url, context);
}
`;
await register('data:text/javascript,' + encodeURIComponent(loader), import.meta.url);

const { POST: createProjectPost } = await import(
  '../../src/app/api/customer-projects/projects/route'
);
const { POST: progressPost } = await import(
  '../../src/app/api/customer-projects/projects/[id]/progress/route'
);
const { mapCpcRpcResult, resolveCpcProfile } = await import(
  '../../src/lib/customer-projects/api'
);

const PROFILE_ID = '00000000-0000-0000-0000-000000000301';
const ORG_ID = '00000000-0000-0000-0000-000000000302';
const CUSTOMER_ID = '00000000-0000-0000-0000-000000000303';
const PROJECT_ID = '00000000-0000-0000-0000-000000000304';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error('FAIL: ' + message);
  }
}

function request(path: string, body: unknown): NextRequest {
  return new NextRequest('http://localhost' + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeClient(options: {
  authUserId?: string | null;
  profile?: any;
  rpcResult?: any;
}) {
  const rpcCalls: Array<{ name: string; args: any }> = [];
  const client: any = {
    auth: {
      getUser: async () => ({
        data: {
          user: options.authUserId === null
            ? null
            : { id: options.authUserId ?? 'auth-user-1' },
        },
        error: null,
      }),
    },
    from: (table: string) => {
      if (table !== 'profiles') throw new Error('unexpected table: ' + table);
      const builder: any = {
        select: () => builder,
        eq: () => builder,
        maybeSingle: async () => options.profile ?? {
          data: {
            id: PROFILE_ID,
            org_id: ORG_ID,
            role: 'sales',
            is_active: true,
          },
          error: null,
        },
      };
      return builder;
    },
    rpc: async (name: string, args: any) => {
      rpcCalls.push({ name, args });
      return options.rpcResult ?? {
        data: {
          ok: true,
          code: 'OK',
          message: 'success',
          data: {
            project_id: PROJECT_ID,
            version: 1,
            next_action_id: null,
            org_id: ORG_ID,
            owner_profile_id: PROFILE_ID,
            secret: 'SECRET_INTERNAL',
          },
        },
        error: null,
      };
    },
  };
  return { client, rpcCalls };
}

console.log('\n=== Customer Project Center Phase 5C API Contract ===');

const anonymous = await resolveCpcProfile(makeClient({ authUserId: null }).client);
assert(!anonymous.ok && anonymous.status === 401, 'missing auth user rejected');

const viewer = await resolveCpcProfile(makeClient({
  profile: {
    data: {
      id: PROFILE_ID,
      org_id: ORG_ID,
      role: 'viewer',
      is_active: true,
    },
    error: null,
  },
}).client);
assert(!viewer.ok && viewer.status === 403, 'viewer cannot enter CPC API');

const sales = await resolveCpcProfile(makeClient({}).client);
assert(
  sales.ok
    && sales.profile.id === PROFILE_ID
    && sales.profile.orgId === ORG_ID
    && sales.profile.role === 'sales',
  'active sales profile resolved',
);

const successMap = mapCpcRpcResult('CREATE_PROJECT', {
  data: {
    ok: true,
    code: 'OK',
    message: 'RAW MESSAGE',
    data: {
      project_id: PROJECT_ID,
      version: 2,
      next_action_id: null,
      org_id: ORG_ID,
      owner_profile_id: PROFILE_ID,
      token: 'SECRET_TOKEN',
    },
  },
  error: null,
});
assert(successMap.status === 200, 'success RPC maps 200');
assert(
  JSON.stringify(Object.keys((successMap.body.data as any) ?? {}).sort())
    === '["nextActionId","projectId","version"]',
  'success DTO is strict whitelist',
);
assert(
  !JSON.stringify(successMap.body).includes('SECRET_TOKEN')
    && !JSON.stringify(successMap.body).includes(ORG_ID)
    && !JSON.stringify(successMap.body).includes(PROFILE_ID),
  'success DTO hides internal org/profile/secret fields',
);

const conflict = mapCpcRpcResult('TRANSITION_PROJECT', {
  data: {
    ok: false,
    code: 'VERSION_CONFLICT',
    message: 'RAW VERSION DETAIL',
    data: { internal: 'SECRET' },
  },
  error: null,
});
assert(
  conflict.status === 409
    && !JSON.stringify(conflict.body).includes('RAW VERSION DETAIL')
    && !JSON.stringify(conflict.body).includes('SECRET'),
  'business error is locally mapped and raw details hidden',
);

const customerFollowUpMap = mapCpcRpcResult('RECORD_CUSTOMER_FOLLOW_UP', {
  data: {
    ok: true,
    code: 'OK',
    message: 'RAW FOLLOW-UP MESSAGE',
    data: {
      customer_reference_id: CUSTOMER_ID,
      event_id: '00000000-0000-0000-0000-000000000399',
      completed_follow_up_id: '00000000-0000-0000-0000-000000000398',
      next_follow_up_id: '00000000-0000-0000-0000-000000000397',
      external_owner_reference: 'SECRET_OWNER',
    },
  },
  error: null,
});
assert(customerFollowUpMap.status === 200, 'customer follow-up success maps 200');
assert(
  JSON.stringify(Object.keys((customerFollowUpMap.body.data as any) ?? {}).sort())
    === '["completedFollowUpId","customerReferenceId","eventId","nextFollowUpId"]',
  'customer follow-up response is strict whitelist',
);
assert(
  !JSON.stringify(customerFollowUpMap.body).includes('SECRET_OWNER'),
  'customer follow-up response does not expose ownership internals',
);

const rescheduleMap = mapCpcRpcResult('RESCHEDULE_WORK_ITEM', {
  data: {
    ok: true,
    code: 'OK',
    message: 'RAW RESCHEDULE MESSAGE',
    data: {
      work_item_id: '00000000-0000-0000-0000-000000000396',
      due_at: '2026-10-05T08:00:00.000Z',
      version: 5,
      org_id: ORG_ID,
      secret: 'SECRET_RESCHEDULE',
    },
  },
  error: null,
});
assert(rescheduleMap.status === 200, 'reschedule success maps 200');
assert(
  JSON.stringify(Object.keys((rescheduleMap.body.data as any) ?? {}).sort())
    === '["dueAt","version","workItemId"]',
  'reschedule response is strict whitelist',
);
assert(
  !JSON.stringify(rescheduleMap.body).includes('SECRET_RESCHEDULE')
    && !JSON.stringify(rescheduleMap.body).includes(ORG_ID),
  'reschedule response hides internal fields',
);

const aiDraftMap = mapCpcRpcResult('CREATE_AI_WORK_ITEM_DRAFT', {
  data: {
    ok: true,
    code: 'OK',
    message: 'RAW AI DRAFT MESSAGE',
    data: {
      ai_draft_id: '00000000-0000-0000-0000-000000000395',
      status: 'draft',
      version: 1,
      structured_proposal: { secret: 'SECRET_PROPOSAL' },
    },
  },
  error: null,
});
assert(aiDraftMap.status === 200, 'AI draft staging success maps 200');
assert(
  JSON.stringify(Object.keys((aiDraftMap.body.data as any) ?? {}).sort())
    === '["aiDraftId","status","version"]',
  'AI draft staging response is strict whitelist',
);
assert(
  !JSON.stringify(aiDraftMap.body).includes('SECRET_PROPOSAL'),
  'AI draft staging response hides raw proposal internals',
);

const aiAcceptMap = mapCpcRpcResult('ACCEPT_AI_DRAFT', {
  data: {
    ok: true,
    code: 'OK',
    message: 'RAW AI ACCEPT MESSAGE',
    data: {
      ai_draft_id: '00000000-0000-0000-0000-000000000395',
      status: 'accepted',
      version: 2,
      created_work_item_id: '00000000-0000-0000-0000-000000000394',
      owner_profile_id: PROFILE_ID,
    },
  },
  error: null,
});
assert(aiAcceptMap.status === 200, 'AI draft accept success maps 200');
assert(
  JSON.stringify(Object.keys((aiAcceptMap.body.data as any) ?? {}).sort())
    === '["aiDraftId","createdWorkItemId","status","version"]',
  'AI draft accept response is strict whitelist',
);
assert(
  !JSON.stringify(aiAcceptMap.body).includes(PROFILE_ID),
  'AI draft accept response hides internal profile identifiers',
);

const aiRejectMap = mapCpcRpcResult('REJECT_AI_DRAFT', {
  data: {
    ok: true,
    code: 'OK',
    message: 'RAW AI REJECT MESSAGE',
    data: {
      ai_draft_id: '00000000-0000-0000-0000-000000000395',
      status: 'rejected',
      version: 2,
      raw_input: 'SECRET_RAW_INPUT',
    },
  },
  error: null,
});
assert(aiRejectMap.status === 200, 'AI draft reject success maps 200');
assert(
  JSON.stringify(Object.keys((aiRejectMap.body.data as any) ?? {}).sort())
    === '["aiDraftId","status","version"]',
  'AI draft reject response is strict whitelist',
);
assert(
  !JSON.stringify(aiRejectMap.body).includes('SECRET_RAW_INPUT'),
  'AI draft reject response hides raw input',
);

const transport = mapCpcRpcResult('CREATE_PROJECT', {
  data: null,
  error: {
    code: 'PGRST500',
    message: 'RAW DATABASE MESSAGE',
    details: 'RAW DATABASE DETAILS',
    hint: 'RAW DATABASE HINT',
  },
});
assert(
  transport.status === 500
    && transport.body.code === 'INTERNAL_ERROR'
    && !JSON.stringify(transport.body).includes('RAW DATABASE'),
  'transport errors map to generic internal error',
);

const validCreate = {
  customerReferenceId: CUSTOMER_ID,
  title: '测试项目',
  objectiveSummary: '确认客户新的热转印膜机会',
  projectType: 'transfer_film',
  stage: 'requirement_alignment',
  priority: 'high',
  initialNextActionTitle: '确认材质和图稿',
  initialNextActionDueAt: '2026-10-03T08:00:00+08:00',
  waitingOn: 'none',
};

const holder = makeClient({});
(globalThis as any).__cpcPhase5CFakeSupabaseClient = holder.client;
const createResponse = await createProjectPost(
  request('/api/customer-projects/projects', validCreate),
);
const createBody: any = await createResponse.json();

assert(createResponse.status === 200, 'create Project route returns 200');
assert(
  holder.rpcCalls.length === 1
    && holder.rpcCalls[0].name === 'cpc_create_project',
  'create Project route calls only controlled RPC',
);
assert(
  holder.rpcCalls[0].args.p_customer_reference_id === CUSTOMER_ID
    && holder.rpcCalls[0].args.p_project_type === 'transfer_film'
    && holder.rpcCalls[0].args.p_initial_next_action_title === '确认材质和图稿',
  'create Project route maps request fields to RPC args',
);
assert(
  typeof holder.rpcCalls[0].args.p_request_id === 'string'
    && holder.rpcCalls[0].args.p_request_id.length > 0,
  'server generates audit request id',
);
assert(
  JSON.stringify(Object.keys(createBody.data).sort())
    === '["nextActionId","projectId","version"]',
  'create Project HTTP response keeps whitelist',
);

const invalidHolder = makeClient({});
(globalThis as any).__cpcPhase5CFakeSupabaseClient = invalidHolder.client;
const invalidCreate = await createProjectPost(
  request('/api/customer-projects/projects', {
    ...validCreate,
    projectType: 'fabric_sublimation',
  }),
);
assert(
  invalidCreate.status === 400 && invalidHolder.rpcCalls.length === 0,
  'invalid project type rejected before RPC',
);

const progressHolder = makeClient({});
(globalThis as any).__cpcPhase5CFakeSupabaseClient = progressHolder.client;
const invalidProgress = await progressPost(
  request('/api/customer-projects/projects/not-a-uuid/progress', {
    expectedVersion: 1,
    eventType: 'EFFECTIVE_PROGRESS_RECORDED',
    payload: {},
  }),
  { params: { id: 'not-a-uuid' } },
);
assert(
  invalidProgress.status === 400 && progressHolder.rpcCalls.length === 0,
  'invalid resource id rejected before RPC',
);

const forgedProgressHolder = makeClient({});
(globalThis as any).__cpcPhase5CFakeSupabaseClient = forgedProgressHolder.client;
const forgedProgress = await progressPost(
  request('/api/customer-projects/projects/' + PROJECT_ID + '/progress', {
    expectedVersion: 1,
    eventType: 'CONTACT_LOGGED',
    payload: {
      relationship_conversion_source_event_id:
        '00000000-0000-0000-0000-000000000501',
    },
  }),
  { params: { id: PROJECT_ID } },
);
assert(
  forgedProgress.status === 400 && forgedProgressHolder.rpcCalls.length === 0,
  'generic progress input rejects reserved conversion provenance keys',
);

const forgedProjectHolder = makeClient({});
(globalThis as any).__cpcPhase5CFakeSupabaseClient = forgedProjectHolder.client;
const forgedProjectResponse = await createProjectPost(
  request('/api/customer-projects/projects', {
    ...validCreate,
    sourceFollowUpEventId: '00000000-0000-0000-0000-000000000501',
  }),
);
assert(
  forgedProjectResponse.status === 400
    && forgedProjectHolder.rpcCalls.length === 0,
  'CREATE_PROJECT rejects sourceFollowUpEventId instead of claiming conversion attribution',
);

const mutationOnlyRouteFiles = [
  'src/app/api/customer-projects/customers/provisional/route.ts',
  'src/app/api/customer-projects/customers/[id]/follow-up/route.ts',
  'src/app/api/customer-projects/projects/[id]/progress/route.ts',
  'src/app/api/customer-projects/projects/[id]/waiting/route.ts',
  'src/app/api/customer-projects/projects/[id]/transition/route.ts',
  'src/app/api/customer-projects/work-items/[id]/transition/route.ts',
  'src/app/api/customer-projects/work-items/[id]/reschedule/route.ts',
  'src/app/api/customer-projects/ai-drafts/[id]/accept/route.ts',
  'src/app/api/customer-projects/ai-drafts/[id]/reject/route.ts',
];

for (const path of mutationOnlyRouteFiles) {
  const source = fs.readFileSync(path, 'utf8');
  assert(source.includes('runCpcMutation'), path + ' delegates to shared command layer');
  assert(!source.includes('.from('), path + ' does not directly query/write tables');
  assert(!source.includes('.rpc('), path + ' does not duplicate RPC mapping');
}

const projectsRouteSource = fs.readFileSync(
  'src/app/api/customer-projects/projects/route.ts',
  'utf8',
);
assert(
  projectsRouteSource.includes('export async function POST')
    && projectsRouteSource.includes("runCpcMutation(req, {}, 'CREATE_PROJECT')"),
  'Projects POST continues to delegate mutation to shared command layer',
);
assert(
  !projectsRouteSource.includes('.rpc('),
  'Projects route does not duplicate RPC mutation mapping even after read GET was added',
);

const workbenchSource = fs.readFileSync(
  'src/app/api/customer-projects/workbench/route.ts',
  'utf8',
);
assert(
  workbenchSource.includes(".eq('owner_profile_id', profile.id)")
    && workbenchSource.includes(".eq('assignee_profile_id', profile.id)"),
  'Workbench is personal-first for owned Projects and assigned work',
);
assert(
  !workbenchSource.includes('cpc_audit_log')
    && !workbenchSource.includes('payload'),
  'Workbench avoids raw audit/event payload access',
);

const detailSource = fs.readFileSync(
  'src/app/api/customer-projects/projects/[id]/route.ts',
  'utf8',
);
assert(
  !detailSource.includes('actor_profile_id')
    && !detailSource.includes('org_id,actor'),
  'Project detail does not expose event actor identifiers',
);
assert(
  detailSource.includes('evidenceReference')
    && detailSource.includes('rawInput'),
  'Project detail exposes meaningful history/evidence through explicit DTO',
);

console.log('Phase 5C API tests: ' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
