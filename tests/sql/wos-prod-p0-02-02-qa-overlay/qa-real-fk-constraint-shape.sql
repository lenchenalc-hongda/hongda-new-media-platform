-- DISPOSABLE PG17 ONLY: mimic REAL Supabase QA uniqueness.
-- The earlier rehearsal added UNIQUE(order_id,org) not present in live QA.
-- This fixture is intentionally strict about NOT having such uniqueness.
\set ON_ERROR_STOP on
ALTER TABLE public.cpc_projects DROP CONSTRAINT cpc_projects_owner_profile_id_org_id_fkey;
ALTER TABLE public.profiles DROP CONSTRAINT profiles_id_org_id_key;
ALTER TABLE public.cpc_projects ADD CONSTRAINT qa_reality_project_owner_id_fk
 FOREIGN KEY(owner_profile_id) REFERENCES public.profiles(id);
CREATE TABLE public.wos_office_readiness_receipts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES public.organizations(id),
 order_id uuid NOT NULL REFERENCES public.wos_production_orders(id),
 source_revision integer NOT NULL,
 source_version_label text NOT NULL,
 actor_profile_id uuid NOT NULL REFERENCES public.profiles(id),
 note text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(order_id,source_revision)
);
CREATE TABLE public.wos_submission_receipts(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES public.organizations(id),
 order_id uuid NOT NULL REFERENCES public.wos_production_orders(id),
 source_revision integer NOT NULL,
 source_version_label text NOT NULL,
 idempotency_key uuid NOT NULL UNIQUE,
 actor_profile_id uuid NOT NULL REFERENCES public.profiles(id),
 request_fingerprint text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(order_id,source_revision)
);
CREATE TABLE public.wos_workshop_inbox(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES public.organizations(id),
 order_id uuid NOT NULL UNIQUE REFERENCES public.wos_production_orders(id),
 submission_id uuid NOT NULL UNIQUE REFERENCES public.wos_submission_receipts(id),
 source_revision integer NOT NULL,
 source_version_label text NOT NULL,
 workflow_status text NOT NULL DEFAULT 'SUBMITTED',
 created_at timestamptz NOT NULL DEFAULT now()
);
-- Both public referenced tables must have ONLY PK(id), exactly as hosted QA.
DO $uniques$
DECLARE n int;
BEGIN
 SELECT count(*) INTO n FROM pg_index i
 WHERE i.indrelid='public.wos_production_orders'::regclass
   AND i.indisunique
   AND pg_get_indexdef(i.indexrelid) ~ '\(id,\s*organization_id\)';
 IF n<>0 THEN RAISE EXCEPTION 'FALSE_QA_WOS_COMPOSITE_UNIQUE_FIXTURE'; END IF;
 SELECT count(*) INTO n FROM pg_index i
 WHERE i.indrelid='public.profiles'::regclass
   AND i.indisunique
   AND pg_get_indexdef(i.indexrelid) ~ '\(id,\s*org_id\)';
 IF n<>0 THEN RAISE EXCEPTION 'FALSE_QA_PROFILE_COMPOSITE_UNIQUE_FIXTURE'; END IF;
END $uniques$;
SELECT 'WOS_QA_REAL_FK_SHAPE_WOS_PROFILE_PK_ONLY=PASS' AS result;
