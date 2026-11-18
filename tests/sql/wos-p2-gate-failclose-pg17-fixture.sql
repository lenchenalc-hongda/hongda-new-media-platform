-- Disposable GitHub PostgreSQL 17 service only. NO remote QA connection.
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE anon NOLOGIN;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE SET search_path=''
AS $$ SELECT NULLIF(pg_catalog.current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE TABLE public.profiles(
 id uuid PRIMARY KEY,
 user_id uuid NOT NULL,
 role text NOT NULL,
 is_active boolean NOT NULL
);
INSERT INTO public.profiles(id,user_id,role,is_active) VALUES
 ('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','admin',true),
 ('22222222-2222-4222-8222-222222222222','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','viewer',true),
 ('33333333-3333-4333-8333-333333333333','cccccccc-cccc-4ccc-8ccc-cccccccccccc','operator',true),
 ('44444444-4444-4444-8444-444444444444','dddddddd-dddd-4ddd-8ddd-dddddddddddd','admin',false);
CREATE TABLE public.wos_qa_p2_execution_gate (
 gate_name text PRIMARY KEY,
 enabled boolean NOT NULL DEFAULT false,
 enabled_until timestamptz,
 approval_reference text NOT NULL DEFAULT 'NOT_AUTHORIZED',
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.wos_qa_p2_office_execution_gate (
 LIKE public.wos_qa_p2_execution_gate INCLUDING ALL
);
INSERT INTO public.wos_qa_p2_execution_gate(gate_name) VALUES('OPERATOR_WRITES');
INSERT INTO public.wos_qa_p2_office_execution_gate(gate_name) VALUES('OFFICE_WRITES');
REVOKE ALL ON public.wos_qa_p2_execution_gate FROM PUBLIC,anon,authenticated;
REVOKE ALL ON public.wos_qa_p2_office_execution_gate FROM PUBLIC,anon,authenticated;
