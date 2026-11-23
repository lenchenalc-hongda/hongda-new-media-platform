-- WOS V1 PRODUCTION FOUNDATION CONTAINMENT
-- INSTALL_NOT_AUTHORIZED
--
-- Run in the same psql transaction immediately after the Foundation file:
--   psql --single-transaction -f foundation.sql -f this-file.sql
--
-- The Foundation draft contains authenticated direct SELECT/INSERT grants and
-- insert policies that are not part of the V1 write contract. This containment
-- step removes every direct browser table privilege before the transaction can
-- commit. P7 later grants only the read surfaces required by the first release.

DO $guard$
BEGIN
  IF current_database() NOT IN ('wos_prod_bootstrap_ci', 'postgres')
    AND current_setting('wos_v1.production_migration_authorized', true)
      IS DISTINCT FROM 'yes'
  THEN
    RAISE EXCEPTION 'WOS_V1_PRODUCTION_MIGRATION_NOT_AUTHORIZED';
  END IF;
  IF to_regclass('public.wos_production_orders') IS NULL
    OR to_regclass('public.wos_reference_images') IS NULL
  THEN
    RAISE EXCEPTION 'WOS_V1_FOUNDATION_REQUIRED';
  END IF;
END;
$guard$;

DROP POLICY IF EXISTS wos_production_orders_insert_draft_same_org
  ON public.wos_production_orders;
DROP POLICY IF EXISTS wos_sampling_requests_insert_draft_same_org
  ON public.wos_sampling_requests;
DROP POLICY IF EXISTS wos_reference_images_insert_same_org
  ON public.wos_reference_images;

REVOKE ALL ON TABLE
  public.wos_production_orders,
  public.wos_sampling_requests,
  public.wos_resource_readiness,
  public.wos_reference_images,
  public.wos_visual_baselines,
  public.wos_visual_baseline_items,
  public.wos_blockers,
  public.wos_confirmations,
  public.wos_sampling_technical_records,
  public.wos_status_history
FROM anon, authenticated;

DO $postcheck$
BEGIN
  IF pg_catalog.has_table_privilege(
      'authenticated',
      'public.wos_production_orders',
      'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
    )
    OR pg_catalog.has_table_privilege(
      'authenticated',
      'public.wos_reference_images',
      'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
    )
    OR pg_catalog.has_table_privilege(
      'anon',
      'public.wos_production_orders',
      'SELECT,INSERT,UPDATE,DELETE'
    )
  THEN
    RAISE EXCEPTION 'WOS_V1_FOUNDATION_CONTAINMENT_FAILED';
  END IF;
END;
$postcheck$;

-- INSTALL_NOT_AUTHORIZED
