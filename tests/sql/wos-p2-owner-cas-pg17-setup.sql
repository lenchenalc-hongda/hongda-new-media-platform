-- EPHEMERAL PostgreSQL 17 ONLY. Builds schema-compatible synthetic QA
-- tables for source audit of the proposed, NOT INSTALLED attestation RPC.
-- NEVER run against a hosted Supabase or real business database.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE SCHEMA auth;
CREATE SCHEMA wos_qa_safety;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE TABLE public.profiles (
 user_id uuid PRIMARY KEY,
 org_id uuid NOT NULL,
 role text NOT NULL,
 is_active boolean NOT NULL
);
CREATE TABLE public.wos_production_orders (
 id uuid PRIMARY KEY,
 order_number text NOT NULL,
 organization_id uuid NOT NULL,
 workflow_status text NOT NULL,
 version integer NOT NULL
);
CREATE TABLE public.wos_submission_receipts(order_id uuid NOT NULL);
CREATE TABLE public.wos_workshop_inbox(order_id uuid NOT NULL);
CREATE TABLE public.wos_qa_p2_action_receipts(order_id uuid NOT NULL);
CREATE TABLE wos_qa_safety.p2_gate_close_receipts(github_run_id text NOT NULL);
CREATE TABLE public.wos_qa_p2_execution_gate (
 gate_name text PRIMARY KEY,
 enabled boolean NOT NULL,
 enabled_until timestamptz,
 approval_reference text NOT NULL,
 updated_at timestamptz NOT NULL
);
CREATE TABLE public.wos_qa_p2_office_execution_gate
  (LIKE public.wos_qa_p2_execution_gate INCLUDING ALL);
INSERT INTO public.profiles VALUES
 ('11111111-1111-4111-8111-111111111111','0ff53d93-2b9e-48b9-8113-a4768c39cdd2','admin',true),
 ('22222222-2222-4222-8222-222222222222','0ff53d93-2b9e-48b9-8113-a4768c39cdd2','operator',true),
 ('33333333-3333-4333-8333-333333333333','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','admin',true);
INSERT INTO public.wos_production_orders VALUES
 ('953d2204-3e65-4b75-b10e-c6e97f1bbb56',
 'QA-NONPROD-d2f91453-fe42-42e9-98d4-a6a902645ded',
 '0ff53d93-2b9e-48b9-8113-a4768c39cdd2','SUBMITTED',2);
INSERT INTO public.wos_submission_receipts VALUES
 ('953d2204-3e65-4b75-b10e-c6e97f1bbb56');
INSERT INTO public.wos_workshop_inbox VALUES
 ('953d2204-3e65-4b75-b10e-c6e97f1bbb56');
INSERT INTO public.wos_qa_p2_execution_gate VALUES
 ('OPERATOR_WRITES',false,NULL,'NOT_AUTHORIZED',clock_timestamp());
INSERT INTO public.wos_qa_p2_office_execution_gate VALUES
 ('OFFICE_WRITES',false,NULL,'NOT_AUTHORIZED',clock_timestamp());
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC,authenticated,anon;
REVOKE ALL ON ALL TABLES IN SCHEMA wos_qa_safety FROM PUBLIC,authenticated,anon;
GRANT USAGE ON SCHEMA public TO authenticated,anon;
GRANT USAGE ON SCHEMA auth TO authenticated,anon;
-- Synthetic auth.uid() is session-local; only the attestor has table reads.
