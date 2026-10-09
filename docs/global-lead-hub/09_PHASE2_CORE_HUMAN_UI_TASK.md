# GLH Phase 2 — Core Human UI Task

TASK_ID = GLH-P2-CORE-HUMAN-UI-001  
PROJECT = global-lead-hub  
BASE_MASTER_SHA = 9dd15968a0b9bf23e6126891d62683b743838cd6  
PRODUCTION_EXECUTION_AUTHORIZED = NO  
AUTO_MERGE = false  
AUTO_PRODUCTION = false

## Objective

Implement the bounded Phase 2 human workflow from the frozen GLH V1.0 specification:

1. Today workspace with actionable counts and priority work.
2. Lead library and lead detail surfaces.
3. Manual lead creation for explicit test/dev use only, persisted through the existing GLH Supabase schema.
4. Assignment/reassignment with append-oriented assignment and audit history.
5. Tasks and follow-ups.
6. Human workflows remain usable without Meta/WhatsApp or AI availability.

## Exact allowed paths

- `docs/global-lead-hub/09_PHASE2_CORE_HUMAN_UI_TASK.md`
- `src/app/global-lead-hub/page.tsx`
- `src/app/global-lead-hub/actions.ts`
- `src/app/global-lead-hub/leads/page.tsx`
- `src/app/global-lead-hub/leads/[leadId]/page.tsx`
- `src/app/global-lead-hub/tasks/page.tsx`
- `src/components/global-lead-hub/LeadCreateForm.tsx`
- `src/components/global-lead-hub/AssignmentForm.tsx`
- `src/components/global-lead-hub/TaskForm.tsx`
- `src/lib/global-lead-hub/human-workflows.ts`
- `src/lib/global-lead-hub/queries.ts`
- `tests/unit/global-lead-hub-phase2-core-human-ui.test.ts`

No other path is authorized. Root middleware, navigation, shared auth, shared Supabase helpers, package files, workflows, Agent Control files, migrations, and legacy `/leads` are excluded.

## Required behavior

### Authorization and data access

- Resolve trusted identity through the existing GLH server access layer.
- Use the existing request-scoped server Supabase client and the authenticated user's session; never use a service-role/admin client.
- Depend on the merged Phase 1 grants and RLS. Do not bypass RLS.
- Sales may read or mutate only leads permitted by the existing GLH scope rules.
- Manager/Admin operations remain organization-bound.
- Never derive authorization from user-editable metadata.
- Every mutation must validate the organization, actor `profiles.id`, target lead scope, and allowed role before write.
- Treat zero-row UPDATE results as a failed/forbidden mutation, not success.

### Today and lead surfaces

- Today shows new, ready-for-human, due-today, overdue, and priority-lead summaries from real GLH tables.
- Lead library supports bounded server-side filtering by lifecycle, grade, owner, country, and due state.
- Lead detail shows structured facts, assignment history, task/follow-up history, and existing message/audit summaries where present.
- Never use `localStorage`, mock constants, `site_data`, or generic `/api/data` as GLH source of truth.

### Test/dev manual creation

- Manual creation must be explicitly marked test/dev and fail closed outside the repository's existing non-Production development conditions.
- It creates only GLH records needed for a manual test lead.
- No provider call, customer message, Production channel, or external publication is allowed.

### Assignment, tasks, and audit

- Assignment/reassignment is append-oriented and preserves previous owner, prior actor, original messages, and audit history.
- Tasks/follow-ups are scoped to an accessible lead and organization.
- No normal UI action may hard-delete a lead, message, assignment, task, follow-up, or audit record.
- No fabricated AI, ad attribution, provider, customer-ownership, or finance source-of-truth facts.

## Verification

Run and record all of the following on the final exact HEAD:

1. `git diff --check`
2. `pnpm exec tsx tests/unit/global-lead-hub-phase2-core-human-ui.test.ts`
3. `pnpm exec tsc --noEmit`
4. `pnpm build`
5. `bash scripts/audit-bundle-secrets.sh`

The focused test must prove at minimum:

- unauthenticated/unauthorized access fails closed;
- Sales A cannot read or mutate a restricted Sales B lead;
- Manager/Admin actions remain organization-bound;
- reassignment preserves history and emits audit evidence;
- task/follow-up writes require accessible lead scope;
- test/dev creation is disabled outside permitted non-Production conditions;
- no hard-delete, provider call, AI dependency, generic data API, or formal local mock SoT is introduced.

## Completion Contract

Publish one bot-authored Completion Contract on the active PR with:

- `PROJECT = global-lead-hub`
- `TASK_ID = GLH-P2-CORE-HUMAN-UI-001`
- `TASK_STATUS = PASS`
- exact `BASE_MASTER_SHA`, `BASE_HEAD_SHA`, `HEAD_SHA`, PR, and branch
- complete `FILES_CHANGED`
- exact tests and PASS results
- `DATABASE_CHANGED = NO`
- `MIGRATION_CREATED = NO`
- `DATABASE_EXECUTED = NO`
- `RLS_CHANGED = NO`
- `RLS_EXECUTED = NO`
- `VERCEL_PRODUCTION_CHANGED = NO`
- `PRODUCTION_CHANGED = NO`
- `READY_FOR_PM_REVIEW = YES`

## Hard stops

Do not execute or alter Production SQL/RLS/env/secrets/data. Do not modify a migration. Do not connect or call real Meta/WhatsApp services. Do not alter customer ownership or finance source-of-truth. Do not publish externally. Do not force push.
