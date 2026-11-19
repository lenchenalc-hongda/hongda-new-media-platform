-- WOS P0-01-02: isolated PostgreSQL 17 CPC customer/project/organization triple-link proposal.
-- DRAFT ONLY: no hosted QA/Production installation and not a timestamped migration.
-- Requires disposable PG17 schema with synthetic CPC fixture + foundation + P0-01 receipts.
BEGIN;
SET LOCAL statement_timeout = '15s';
DO $gate$
BEGIN
 IF current_setting('wos.p0_01_ephemeral_rehearsal', true) IS DISTINCT FROM 'on' THEN
  RAISE EXCEPTION 'WOS_CPC_TRIPLE_PROPOSAL_NO_HOSTED_EXECUTION';
 END IF;
 IF to_regclass('public.wos_production_orders') IS NULL
 OR to_regclass('public.cpc_customer_references') IS NULL
 OR to_regclass('public.cpc_projects') IS NULL
 OR to_regclass('public.profiles') IS NULL THEN
  RAISE EXCEPTION 'WOS_CPC_TRIPLE_DEPENDENCY_MISSING';
 END IF;
END $gate$;

-- Project ID -> customer ID -> org ID is a single referential tuple.
-- This new CPC index is a REVIEWED-DESIGN requirement, not authorization
-- to change indexes on the actual CPC Production table. Release needs a lock plan.
CREATE UNIQUE INDEX wos_mvp_cpc_project_customer_org_unique
 ON public.cpc_projects(id,customer_reference_id,org_id);

-- First MVP orders must be CPC-linked. Any historical WOS data must be audited
-- before converting this proposal to a real migration.
ALTER TABLE public.wos_production_orders
 ALTER COLUMN customer_id SET NOT NULL,
 ALTER COLUMN project_id SET NOT NULL;

ALTER TABLE public.wos_production_orders
 ADD CONSTRAINT wos_mvp_customer_org_fk
 FOREIGN KEY (customer_id,organization_id)
 REFERENCES public.cpc_customer_references(id,org_id)
 ON UPDATE RESTRICT ON DELETE RESTRICT,
 ADD CONSTRAINT wos_mvp_project_customer_org_fk
 FOREIGN KEY (project_id,customer_id,organization_id)
 REFERENCES public.cpc_projects(id,customer_reference_id,org_id)
 ON UPDATE RESTRICT ON DELETE RESTRICT,
 ADD CONSTRAINT wos_mvp_sales_owner_org_fk
 FOREIGN KEY (sales_owner_profile_id,organization_id)
 REFERENCES public.profiles(id,org_id)
 ON UPDATE RESTRICT ON DELETE RESTRICT,
 ADD CONSTRAINT wos_mvp_project_owner_org_fk
 FOREIGN KEY (project_owner_profile_id,organization_id)
 REFERENCES public.profiles(id,org_id)
 ON UPDATE RESTRICT ON DELETE RESTRICT,
 ADD CONSTRAINT wos_mvp_creator_org_fk
 FOREIGN KEY (created_by_profile_id,organization_id)
 REFERENCES public.profiles(id,org_id)
 ON UPDATE RESTRICT ON DELETE RESTRICT;

CREATE INDEX wos_mvp_order_cpc_idx
 ON public.wos_production_orders(organization_id,project_id,customer_id);

-- Existing Phase-1 foundation grants direct authenticated INSERT into drafts;
-- this candidate closes direct write access until separately audited RPC exists.
-- Keep existing read-only RLS policies; production-grade assignment read policies
-- are not yet complete. No SECURITY DEFINER, service-role or public write granted.
REVOKE INSERT, UPDATE, DELETE
 ON public.wos_production_orders,public.wos_reference_images
 FROM PUBLIC,anon,authenticated;
COMMIT;
