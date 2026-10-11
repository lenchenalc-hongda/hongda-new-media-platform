import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(
  'supabase/migrations/20261011181500_global_lead_hub_phase5_handoff_persistence.sql',
  'utf8',
);
const mutations = readFileSync('src/lib/global-lead-hub/mutations.ts', 'utf8');
const actions = readFileSync('src/app/api/global-lead-hub/inbox/actions/route.ts', 'utf8');
const component = readFileSync('src/components/global-lead-hub/UnifiedInbox.tsx', 'utf8');
const executableSql = migration.replace(/^--.*$/gm, '');

function includesAll(source: string, values: string[]) {
  for (const value of values) assert(source.includes(value), `missing contract: ${value}`);
}

includesAll(migration, [
  'BEGIN;',
  'COMMIT;',
  'CREATE OR REPLACE FUNCTION public.glh_take_over_conversation(',
  'CREATE OR REPLACE FUNCTION public.glh_queue_human_message(',
  'SECURITY DEFINER',
  'SET search_path = pg_catalog, public',
  'WHERE user_id = auth.uid()',
  "v_actor.role NOT IN ('admin', 'manager', 'sales')",
  'AND org_id = v_actor.org_id',
  'FOR UPDATE',
]);

// Takeover is atomic, conflict-controlled, preserves assignment history, and
// shuts down pending customer-facing AI sends before recording the audit event.
includesAll(migration, [
  "p_expected_mode NOT IN ('AI_ACTIVE', 'HANDOFF_PENDING')",
  'v_lead.version <> p_expected_lead_version',
  'v_conversation.conversation_mode <> p_expected_mode',
  "SET status = 'ENDED'",
  "assignment_type = 'PRIMARY'",
  "conversation_mode = 'HUMAN_ACTIVE'",
  "SET status = 'BLOCKED'",
  "AND action_type = 'AI_SEND'",
  "'customer_facing_auto_send_allowed', false",
  "'HUMAN_HANDOFF'",
]);
assert(
  migration.indexOf('UPDATE public.glh_ai_actions')
    < migration.indexOf('INSERT INTO public.glh_audit_events'),
  'pending AI sends are blocked before handoff audit completion',
);

// The human adapter persists one QUEUED source record per organization/provider
// idempotency key and never performs a provider send.
includesAll(migration, [
  "p_expected_mode <> 'HUMAN_ACTIVE'",
  "v_provider_message_id := 'human:' || v_idempotency_key",
  'FROM public.glh_messages',
  "RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'",
  'INSERT INTO public.glh_messages',
  'ON CONFLICT ON CONSTRAINT uq_glh_messages_provider_external DO NOTHING',
  "'OUTBOUND', 'HUMAN', v_actor.id",
  "v_text, NULL, 'QUEUED'",
  "'provider_action', 'NONE'",
  "'idempotent_replay', true",
  "'idempotent_replay', false",
]);
assert(!migration.includes('graph.facebook.com'));
assert(!migration.includes('api.whatsapp.com'));
assert(!migration.includes('http://'));
assert(!migration.includes('https://'));

// Least privilege: functions are the only authenticated mutation boundary.
includesAll(migration, [
  'REVOKE ALL ON FUNCTION public.glh_take_over_conversation(',
  'REVOKE ALL ON FUNCTION public.glh_queue_human_message(',
  ') FROM PUBLIC, anon, authenticated;',
  ') TO authenticated;',
]);
assert(!/GRANT\s+(INSERT|UPDATE|DELETE|ALL)\s+ON\s+TABLE/i.test(executableSql));
assert(!/\b(DROP|TRUNCATE|DELETE\s+FROM)\b/i.test(executableSql));

// The Next.js boundary calls only the reviewed RPC wrappers; the UI exposes
// takeover and queued human intent while retaining fail-closed error handling.
includesAll(mutations, [
  "client.rpc('glh_take_over_conversation'",
  "client.rpc('glh_queue_human_message'",
]);
includesAll(actions, [
  "action: z.literal('TAKE_OVER')",
  "action: z.literal('QUEUE_HUMAN_MESSAGE')",
  'resolveGlhAccessContext',
]);
includesAll(component, [
  "action: 'TAKE_OVER'",
  "action: 'QUEUE_HUMAN_MESSAGE'",
  'Queue human reply',
  'it does not call Meta/WhatsApp',
]);
assert(!component.includes('localStorage'));

console.log('Global Lead Hub Phase 5 handoff persistence tests passed');
