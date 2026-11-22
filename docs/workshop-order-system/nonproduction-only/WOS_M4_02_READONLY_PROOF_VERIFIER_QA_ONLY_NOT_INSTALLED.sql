-- WOS M4-02 READ-ONLY PRIVATE PROOF VERIFIER / QA ONLY / NOT INSTALLED
-- INSTALL_NOT_AUTHORIZED
--
-- This file creates one order-scoped read-only RPC and its dedicated NOLOGIN
-- function-owner role plus one object-scoped authenticated Storage SELECT
-- policy. It does not create or mutate business data, open a Gate, change any
-- other Storage policy, or grant direct proof/receipt table SELECT to
-- authenticated users.

BEGIN;

DO $preflight$
DECLARE
  v_m2_functions integer;
  v_expected_order uuid;
  v_expected_org uuid;
  v_expected_version integer;
  v_expected_label text;
  v_scope_count integer;
  v_active_gate_count integer;
  v_is_disposable boolean;
BEGIN
  IF pg_catalog.current_setting('server_version_num')::integer
      NOT BETWEEN 170000 AND 179999
    OR pg_catalog.to_regclass('public.wos_qa_p2_execution_gate') IS NULL
    OR pg_catalog.to_regclass('public.wos_qa_p2_office_execution_gate') IS NULL
    OR pg_catalog.to_regclass('public.wos_qa_p2_m2_gate') IS NULL
  THEN
    RAISE EXCEPTION 'M4_QA_PREREQUISITE_MISSING' USING ERRCODE = '55000';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles
             WHERE rolname = 'wos_m4_proof_verifier_owner') THEN
    RAISE EXCEPTION 'M4_OWNER_ROLE_ALREADY_EXISTS' USING ERRCODE = '42710';
  END IF;
  IF pg_catalog.to_regprocedure(
    'public.wos_qa_m4_readonly_proof_snapshot(uuid,integer,text)'
  ) IS NOT NULL THEN
    RAISE EXCEPTION 'M4_VERIFIER_FUNCTION_ALREADY_EXISTS' USING ERRCODE = '42723';
  END IF;
  IF pg_catalog.to_regprocedure(
    'public.wos_qa_m4_can_download_proof(text,text)'
  ) IS NOT NULL THEN
    RAISE EXCEPTION 'M4_STORAGE_GUARD_FUNCTION_ALREADY_EXISTS' USING ERRCODE = '42723';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_policies
    WHERE schemaname IN ('public','storage')
      AND policyname IN (
        'wos_m4_proof_owner_profiles_read',
        'wos_m4_proof_owner_orders_read',
        'wos_m4_proof_owner_baselines_read',
        'wos_m4_proof_owner_baseline_items_read',
        'wos_m4_proof_owner_images_read',
        'wos_m4_proof_owner_proofs_read',
        'wos_m4_proof_owner_receipts_read',
        'wos_m4_proof_owner_storage_read',
        'wos_m4_proof_verifier_storage_read'
      )
  ) THEN
    RAISE EXCEPTION 'M4_OWNER_POLICY_ALREADY_EXISTS' USING ERRCODE = '42710';
  END IF;

  SELECT pg_catalog.count(*)::integer
    INTO v_m2_functions
  FROM pg_catalog.pg_proc p
  WHERE (
    p.oid = pg_catalog.to_regprocedure(
      'public.wos_qa_p2_m2_action(uuid,integer,uuid,text,jsonb)'
    )
    AND p.proname = 'wos_qa_p2_m2_action'
    AND pg_catalog.pg_get_userbyid(p.proowner) = 'postgres'
    AND p.prosecdef IS TRUE
    AND p.proconfig IS NOT DISTINCT FROM ARRAY['search_path=""']::text[]
    AND pg_catalog.encode(
      pg_catalog.sha256(pg_catalog.convert_to(
        pg_catalog.pg_get_functiondef(p.oid),
        'UTF8'
      )),
      'hex'
    ) = 'be003e28743691c216784030dcd163612185d10eae3481ab67087e566e326830'
    AND pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE') IS FALSE
    AND pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE') IS FALSE
  ) OR (
    p.oid = pg_catalog.to_regprocedure(
      'public.wos_qa_p2_m2_checked_proof_set(uuid,uuid,uuid,text)'
    )
    AND p.proname = 'wos_qa_p2_m2_checked_proof_set'
    AND pg_catalog.pg_get_userbyid(p.proowner) = 'postgres'
    AND p.prosecdef IS FALSE
    AND p.proconfig IS NOT DISTINCT FROM ARRAY['search_path=""']::text[]
    AND pg_catalog.encode(
      pg_catalog.sha256(pg_catalog.convert_to(
        pg_catalog.pg_get_functiondef(p.oid),
        'UTF8'
      )),
      'hex'
    ) = 'a5c13f9acab42b378e971475a4d0dd0928618942979cbed9bd70a162c82d68d1'
    AND pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE') IS FALSE
    AND pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE') IS FALSE
  ) OR (
    p.oid = pg_catalog.to_regprocedure(
      'public.wos_qa_p2_m2_spec_digest(uuid)'
    )
    AND p.proname = 'wos_qa_p2_m2_spec_digest'
    AND pg_catalog.pg_get_userbyid(p.proowner) = 'postgres'
    AND p.prosecdef IS FALSE
    AND p.proconfig IS NOT DISTINCT FROM ARRAY['search_path=""']::text[]
    AND pg_catalog.encode(
      pg_catalog.sha256(pg_catalog.convert_to(
        pg_catalog.pg_get_functiondef(p.oid),
        'UTF8'
      )),
      'hex'
    ) = '3a684301e7cb890cd4a3f325b65d392c18902fca65054a4dada9157bddc5e173'
    AND pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE') IS FALSE
    AND pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE') IS FALSE
  );
  IF v_m2_functions <> 3 THEN
    RAISE EXCEPTION 'M4_M2_BASELINE_FINGERPRINT_MISMATCH'
      USING ERRCODE = '55000';
  END IF;

  SELECT pg_catalog.count(*)::integer
    INTO v_active_gate_count
  FROM (
    SELECT enabled, enabled_until, allowed_order_id, allowed_organization_id
    FROM public.wos_qa_p2_execution_gate
    UNION ALL
    SELECT enabled, enabled_until, allowed_order_id, allowed_organization_id
    FROM public.wos_qa_p2_office_execution_gate
    UNION ALL
    SELECT enabled, enabled_until, allowed_order_id, allowed_organization_id
    FROM public.wos_qa_p2_m2_gate
  ) gate
  WHERE gate.enabled IS NOT FALSE
    OR gate.enabled_until IS NOT NULL
    OR gate.allowed_order_id IS NOT NULL
    OR gate.allowed_organization_id IS NOT NULL;
  IF v_active_gate_count <> 0 THEN
    RAISE EXCEPTION 'M4_QA_GATE_MUST_BE_CLOSED' USING ERRCODE = '55000';
  END IF;

  IF pg_catalog.has_table_privilege(
      'authenticated',
      'public.wos_qa_verified_image_proofs',
      'SELECT'
    )
    OR pg_catalog.has_table_privilege(
      'authenticated',
      'public.wos_qa_p2_m2_receipts',
      'SELECT'
    )
    OR pg_catalog.has_function_privilege(
      'authenticated',
      'public.wos_qa_p2_m2_action(uuid,integer,uuid,text,jsonb)',
      'EXECUTE'
    )
  THEN
    RAISE EXCEPTION 'M4_QA_PRIVATE_READ_OR_WRITE_GRANT_EXISTS'
      USING ERRCODE = '55000';
  END IF;

  IF pg_catalog.has_table_privilege(
      'authenticated',
      'public.wos_qa_verified_image_proofs',
      'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
    )
    OR pg_catalog.has_table_privilege(
      'authenticated',
      'public.wos_qa_p2_m2_receipts',
      'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
    )
    OR pg_catalog.has_table_privilege(
      'anon',
      'public.wos_qa_verified_image_proofs',
      'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
    )
    OR pg_catalog.has_table_privilege(
      'anon',
      'public.wos_qa_p2_m2_receipts',
      'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
    )
    OR EXISTS (
      SELECT 1
      FROM pg_catalog.pg_class relation
      CROSS JOIN LATERAL pg_catalog.aclexplode(relation.relacl) acl
      WHERE relation.oid IN (
        'public.wos_qa_verified_image_proofs'::regclass,
        'public.wos_qa_p2_m2_receipts'::regclass
      )
        AND acl.grantee = 0
    )
  THEN
    RAISE EXCEPTION 'M4_QA_DIRECT_PRIVATE_TABLE_GRANT_EXISTS'
      USING ERRCODE = '55000';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc p
    CROSS JOIN LATERAL pg_catalog.aclexplode(p.proacl) acl
    WHERE p.oid IN (
      pg_catalog.to_regprocedure(
        'public.wos_qa_p2_m2_action(uuid,integer,uuid,text,jsonb)'
      ),
      pg_catalog.to_regprocedure(
        'public.wos_qa_p2_m2_checked_proof_set(uuid,uuid,uuid,text)'
      ),
      pg_catalog.to_regprocedure(
        'public.wos_qa_p2_m2_spec_digest(uuid)'
      )
    )
      AND acl.grantee = 0
      AND acl.privilege_type = 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'M4_QA_PUBLIC_M2_EXECUTE_GRANT_EXISTS'
      USING ERRCODE = '55000';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class relation
    WHERE relation.oid IN (
      'public.profiles'::regclass,
      'public.wos_production_orders'::regclass,
      'public.wos_visual_baselines'::regclass,
      'public.wos_visual_baseline_items'::regclass,
      'public.wos_reference_images'::regclass,
      'public.wos_qa_verified_image_proofs'::regclass,
      'public.wos_qa_p2_m2_receipts'::regclass,
      'storage.objects'::regclass
    )
      AND relation.relrowsecurity IS NOT TRUE
  ) THEN
    RAISE EXCEPTION 'M4_QA_REQUIRED_RLS_DISABLED'
      USING ERRCODE = '55000';
  END IF;

  v_is_disposable := pg_catalog.current_database() ~ '^wos_m4_02_pg17_'
    AND pg_catalog.to_regclass('tests.wos_m4_pg17_context') IS NOT NULL;
  IF pg_catalog.to_regclass('tests.wos_m4_pg17_context') IS NOT NULL
    AND v_is_disposable IS NOT TRUE
  THEN
    RAISE EXCEPTION 'M4_TEST_CONTEXT_OUTSIDE_DISPOSABLE_DATABASE'
      USING ERRCODE = '55000';
  END IF;

  IF v_is_disposable IS TRUE THEN
    SELECT expected_order_id, expected_org_id,
           expected_version, expected_version_label
      INTO STRICT v_expected_order, v_expected_org,
                  v_expected_version, v_expected_label
    FROM tests.wos_m4_pg17_context;
  ELSE
    v_expected_order := '953d2204-3e65-4b75-b10e-c6e97f1bbb56';
    v_expected_org := '0ff53d93-2b9e-48b9-8113-a4768c39cdd2';
    v_expected_version := 11;
    v_expected_label := 'QA-R6';
  END IF;

  SELECT pg_catalog.count(*)::integer
    INTO v_scope_count
  FROM public.wos_production_orders o
  WHERE o.id = v_expected_order
    AND o.organization_id = v_expected_org
    AND o.workflow_status = 'READINESS_CHECK'
    AND o.version = v_expected_version
    AND o.version_label = v_expected_label
    AND o.order_number ~ '^QA-NONPROD-[0-9a-f-]{36}$';
  IF v_scope_count <> 1 THEN
    RAISE EXCEPTION 'M4_QA_ORDER_BASELINE_CHANGED' USING ERRCODE = '55000';
  END IF;

  IF v_is_disposable IS NOT TRUE
  THEN
    SELECT pg_catalog.count(*)::integer
      INTO v_scope_count
    FROM public.wos_production_orders o
    WHERE o.id = '2071a963-1b35-4c96-81cd-709d8180ad49'
      AND o.organization_id = v_expected_org
      AND o.workflow_status = 'WAITING_MATERIAL'
      AND o.version = 7
      AND o.version_label = 'QA-R6'
      AND o.order_number ~ '^QA-NONPROD-[0-9a-f-]{36}$';
    IF v_scope_count <> 1 THEN
      RAISE EXCEPTION 'M4_QA_PEER_ORDER_BASELINE_CHANGED'
        USING ERRCODE = '55000';
    END IF;
  END IF;
END;
$preflight$;

CREATE ROLE wos_m4_proof_verifier_owner
  NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE
  NOREPLICATION NOBYPASSRLS;
COMMENT ON ROLE wos_m4_proof_verifier_owner IS
  'WOS_M4_02_READONLY_PROOF_VERIFIER_OWNER_V1';

GRANT USAGE ON SCHEMA public, auth, storage
  TO wos_m4_proof_verifier_owner;
GRANT EXECUTE ON FUNCTION auth.uid()
  TO wos_m4_proof_verifier_owner;

GRANT SELECT ON TABLE
  public.profiles,
  public.wos_production_orders,
  public.wos_visual_baselines,
  public.wos_visual_baseline_items,
  public.wos_reference_images,
  public.wos_qa_verified_image_proofs,
  public.wos_qa_p2_m2_receipts,
  storage.objects
TO wos_m4_proof_verifier_owner;

GRANT EXECUTE ON FUNCTION public.wos_qa_p2_m2_spec_digest(uuid)
TO wos_m4_proof_verifier_owner;

-- These are owner-only permissive RLS policies. The owner is NOLOGIN and has
-- no application-role membership. Every row visible through them is still
-- constrained by explicit auth.uid(), Profile, organization, order, version,
-- baseline, proof, and receipt predicates inside the SECURITY DEFINER RPC.
CREATE POLICY wos_m4_proof_owner_profiles_read
  ON public.profiles FOR SELECT TO wos_m4_proof_verifier_owner USING (true);
CREATE POLICY wos_m4_proof_owner_orders_read
  ON public.wos_production_orders FOR SELECT TO wos_m4_proof_verifier_owner USING (true);
CREATE POLICY wos_m4_proof_owner_baselines_read
  ON public.wos_visual_baselines FOR SELECT TO wos_m4_proof_verifier_owner USING (true);
CREATE POLICY wos_m4_proof_owner_baseline_items_read
  ON public.wos_visual_baseline_items FOR SELECT TO wos_m4_proof_verifier_owner USING (true);
CREATE POLICY wos_m4_proof_owner_images_read
  ON public.wos_reference_images FOR SELECT TO wos_m4_proof_verifier_owner USING (true);
CREATE POLICY wos_m4_proof_owner_proofs_read
  ON public.wos_qa_verified_image_proofs FOR SELECT TO wos_m4_proof_verifier_owner USING (true);
CREATE POLICY wos_m4_proof_owner_receipts_read
  ON public.wos_qa_p2_m2_receipts FOR SELECT TO wos_m4_proof_verifier_owner USING (true);
CREATE POLICY wos_m4_proof_owner_storage_read
  ON storage.objects FOR SELECT TO wos_m4_proof_verifier_owner
  USING (bucket_id = 'wos-private');

-- The existing application Storage policy grants Operator access only while
-- an order is SUBMITTED. M4 verification occurs at READINESS_CHECK, so the
-- caller needs one narrowly scoped SELECT policy for the exact current proof
-- objects. This function returns only a boolean and never returns a path,
-- object ID or proof row.
CREATE FUNCTION public.wos_qa_m4_can_download_proof(
  p_bucket_id text,
  p_object_name text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
VOLATILE
AS $download_guard$
DECLARE
  v_profile_id uuid;
  v_org_id uuid;
  v_role text;
  v_image_id uuid;
  v_order_id uuid;
  v_order_version integer;
  v_version_label text;
  v_snapshot jsonb;
BEGIN
  IF p_bucket_id IS DISTINCT FROM 'wos-private'
    OR p_object_name IS NULL
    OR auth.uid() IS NULL
  THEN
    RETURN false;
  END IF;

  BEGIN
    SELECT p.id, p.org_id, p.role
      INTO STRICT v_profile_id, v_org_id, v_role
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.is_active = true
      AND p.role IN ('admin','manager','sales','operator');
  EXCEPTION
    WHEN NO_DATA_FOUND OR TOO_MANY_ROWS THEN
      RETURN false;
  END;

  SELECT im.id, o.id, o.version, o.version_label
    INTO v_image_id, v_order_id, v_order_version, v_version_label
  FROM public.wos_reference_images im
  JOIN public.wos_production_orders o
    ON o.id = im.entity_id
    AND o.organization_id = im.organization_id
  WHERE im.organization_id = v_org_id
    AND im.entity_type = 'PRODUCTION_ORDER'
    AND im.image_status = 'READY'
    AND im.superseded_at IS NULL
    AND im.storage_bucket = p_bucket_id
    AND im.storage_path = p_object_name
    AND im.version_label = o.version_label
    AND o.workflow_status = 'READINESS_CHECK'
    AND o.order_number ~ '^QA-NONPROD-[0-9a-f-]{36}$'
    AND (
      v_role IN ('admin','manager','operator')
      OR (
        v_role = 'sales'
        AND v_profile_id IN (o.created_by_profile_id, o.sales_owner_profile_id)
      )
    );
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  BEGIN
    v_snapshot := public.wos_qa_m4_readonly_proof_snapshot(
      v_order_id,
      v_order_version,
      v_version_label
    );
  EXCEPTION
    WHEN OTHERS THEN
      RETURN false;
  END;

  RETURN v_snapshot IS NOT NULL
    AND v_snapshot->>'orderId' = v_order_id::text
    AND v_snapshot->>'orderVersion' = v_order_version::text
    AND v_snapshot->>'versionLabel' = v_version_label
    AND v_snapshot->>'canStart' = 'false'
    AND EXISTS (
      SELECT 1
      FROM pg_catalog.jsonb_array_elements(v_snapshot->'images') AS image
      WHERE image->>'imageId' = v_image_id::text
    );
END;
$download_guard$;

ALTER FUNCTION public.wos_qa_m4_can_download_proof(text,text)
  OWNER TO wos_m4_proof_verifier_owner;
COMMENT ON FUNCTION public.wos_qa_m4_can_download_proof(text,text) IS
  'WOS_M4_02_READONLY_PROOF_DOWNLOAD_GUARD_V1';
REVOKE ALL ON FUNCTION public.wos_qa_m4_can_download_proof(text,text)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.wos_qa_m4_can_download_proof(text,text)
TO authenticated;

CREATE POLICY wos_m4_proof_verifier_storage_read
  ON storage.objects FOR SELECT TO authenticated
  USING (public.wos_qa_m4_can_download_proof(bucket_id, name));

CREATE FUNCTION public.wos_qa_m4_readonly_proof_snapshot(
  p_order_id uuid,
  p_expected_version integer,
  p_version_label text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
VOLATILE
AS $m4$
DECLARE
  v_checked_at timestamptz := pg_catalog.clock_timestamp();
  v_actor_profile_id uuid;
  v_actor_org_id uuid;
  v_actor_role text;
  v_order public.wos_production_orders%ROWTYPE;
  v_baseline public.wos_visual_baselines%ROWTYPE;
  v_office public.profiles%ROWTYPE;
  v_workshop public.profiles%ROWTYPE;
  v_baseline_item_count integer;
  v_baseline_distinct_images integer;
  v_image_ids uuid[];
  v_image_count integer;
  v_distinct_images integer;
  v_categories text[];
  v_required_items integer;
  v_proof_missing integer;
  v_proof_invalid integer;
  v_proof_expired integer;
  v_object_count integer;
  v_proof_expires_at timestamptz;
  v_proof_last_verified_at timestamptz;
  v_internal_images jsonb;
  v_public_images jsonb;
  v_spec jsonb;
  v_proof_digest text;
  v_spec_digest text;
  v_receipts jsonb;
  v_receipt_count integer;
  v_previous_after_digest text;
  v_current_before_digest text;
  v_current_after_digest text;
  v_current_payload_fingerprint text;
  v_current_receipt_digest text;
  v_expected_receipt_digest text;
  v_expected_workflow_status text;
  v_snapshot_fingerprint text;
BEGIN
  IF p_order_id IS NULL
    OR p_expected_version IS NULL
    OR p_expected_version < 5
    OR p_version_label IS NULL
    OR p_version_label !~ '^QA-R[1-9][0-9]*$'
  THEN
    RAISE EXCEPTION 'VERSION_CONFLICT' USING ERRCODE = 'PT409';
  END IF;

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;

  SELECT p.id, p.org_id, p.role
    INTO STRICT v_actor_profile_id, v_actor_org_id, v_actor_role
  FROM public.profiles p
  WHERE p.user_id = auth.uid()
    AND p.is_active = true
    AND p.role IN ('admin','manager','sales','operator');

  -- Serialize with all reviewed M2 writers. Shared mode permits concurrent
  -- verifiers while excluding any M2 write that takes the exclusive order lock.
  PERFORM pg_catalog.pg_advisory_xact_lock_shared(
    pg_catalog.hashtextextended('wos-qa-m2:' || p_order_id::text, 0)
  );

  BEGIN
    SELECT o.* INTO STRICT v_order
    FROM public.wos_production_orders o
    WHERE o.id = p_order_id
      AND o.organization_id = v_actor_org_id
      AND o.order_number ~ '^QA-NONPROD-[0-9a-f-]{36}$'
    ;
  EXCEPTION
    WHEN NO_DATA_FOUND THEN
      RAISE EXCEPTION 'ORDER_NOT_AVAILABLE' USING ERRCODE = '42501';
    WHEN TOO_MANY_ROWS THEN
      RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
  END;

  IF v_order.workflow_status <> 'READINESS_CHECK' THEN
    RAISE EXCEPTION 'PROOF_ORDER_NOT_READY' USING ERRCODE = 'PT409';
  END IF;
  IF v_order.version <> p_expected_version
    OR v_order.version_label <> p_version_label
  THEN
    RAISE EXCEPTION 'VERSION_CONFLICT' USING ERRCODE = 'PT409';
  END IF;

  BEGIN
    SELECT b.* INTO STRICT v_baseline
    FROM public.wos_visual_baselines b
    WHERE b.organization_id = v_actor_org_id
      AND b.entity_type = 'PRODUCTION_ORDER'
      AND b.entity_id = p_order_id
      AND b.version_label = p_version_label
      AND b.status = 'CURRENT'
      AND b.superseded_at IS NULL
    ;
  EXCEPTION
    WHEN NO_DATA_FOUND THEN
      RAISE EXCEPTION 'PROOF_NOT_AVAILABLE' USING ERRCODE = 'PT409';
    WHEN TOO_MANY_ROWS THEN
      RAISE EXCEPTION 'BASELINE_CARDINALITY_INVALID' USING ERRCODE = 'PT409';
  END;

  SELECT
    pg_catalog.count(*)::integer,
    pg_catalog.count(DISTINCT bi.reference_image_id)::integer
  INTO v_baseline_item_count, v_baseline_distinct_images
  FROM public.wos_visual_baseline_items bi
  WHERE bi.baseline_id = v_baseline.id;
  IF v_baseline_item_count <> 4
    OR v_baseline_distinct_images <> 4
  THEN
    RAISE EXCEPTION 'BASELINE_CARDINALITY_INVALID' USING ERRCODE = 'PT409';
  END IF;

  IF v_baseline.confirmed_by_office_profile_id IS NULL
    OR v_baseline.confirmed_by_workshop_profile_id IS NULL
    OR v_baseline.confirmed_by_office_profile_id =
       v_baseline.confirmed_by_workshop_profile_id
    OR v_baseline.office_confirmed_at IS NULL
    OR v_baseline.workshop_confirmed_at IS NULL
    OR v_baseline.office_proof_set_digest IS NULL
    OR v_baseline.workshop_proof_set_digest IS NULL
    OR v_baseline.office_proof_set_digest IS DISTINCT FROM
       v_baseline.workshop_proof_set_digest
    OR v_baseline.office_post_order_version IS DISTINCT FROM
       p_expected_version - 2
    OR v_baseline.workshop_post_order_version IS DISTINCT FROM
       p_expected_version - 1
    OR v_baseline.office_confirmed_at < v_baseline.created_at
    OR v_baseline.workshop_confirmed_at < v_baseline.office_confirmed_at
    OR v_baseline.workshop_confirmed_at > v_checked_at
  THEN
    RAISE EXCEPTION 'SIGNOFF_MISMATCH' USING ERRCODE = 'PT409';
  END IF;

  BEGIN
    SELECT p.* INTO STRICT v_office
    FROM public.profiles p
    WHERE p.id = v_baseline.confirmed_by_office_profile_id
      AND p.org_id = v_actor_org_id
      AND p.is_active = true
      AND p.role IN ('admin','manager','sales');

    SELECT p.* INTO STRICT v_workshop
    FROM public.profiles p
    WHERE p.id = v_baseline.confirmed_by_workshop_profile_id
      AND p.org_id = v_actor_org_id
      AND p.is_active = true
      AND p.role IN ('admin','manager','operator');
  EXCEPTION
    WHEN NO_DATA_FOUND OR TOO_MANY_ROWS THEN
      RAISE EXCEPTION 'SIGNOFF_MISMATCH' USING ERRCODE = 'PT409';
  END;

  SELECT
    pg_catalog.count(*)::integer,
    pg_catalog.count(DISTINCT bi.reference_image_id)::integer,
    pg_catalog.count(*) FILTER (WHERE bi.is_required IS NOT TRUE)::integer,
    pg_catalog.array_agg(im.category ORDER BY im.id),
    pg_catalog.array_agg(im.id ORDER BY im.id)
  INTO v_image_count, v_distinct_images, v_required_items,
       v_categories, v_image_ids
  FROM public.wos_visual_baseline_items bi
  JOIN public.wos_reference_images im
    ON im.id = bi.reference_image_id
  WHERE bi.baseline_id = v_baseline.id
    AND im.organization_id = v_actor_org_id
    AND im.entity_type = 'PRODUCTION_ORDER'
    AND im.entity_id = p_order_id
    AND im.version_label = p_version_label
    AND im.image_status = 'READY'
    AND im.superseded_at IS NULL
    AND im.storage_bucket = 'wos-private'
    AND im.storage_path = pg_catalog.format(
      'organizations/%s/wos/production-order/%s/images/%s/versions/%s/%s/qa-preview-proof.png',
      v_actor_org_id,
      p_order_id,
      CASE im.category
        WHEN 'PRODUCT' THEN 'product'
        WHEN 'FILM_PATTERN' THEN 'film-pattern'
        WHEN 'CUSTOMER_APPROVED_SAMPLE' THEN 'customer-approved-sample'
        WHEN 'SIGNED_SAMPLE' THEN 'signed-sample'
        ELSE 'invalid'
      END,
      p_version_label,
      im.id
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.wos_reference_images newer
      WHERE newer.supersedes_image_id = im.id
        AND newer.image_status = 'READY'
    );

  IF v_image_count <> 4
    OR v_distinct_images <> 4
    OR v_required_items <> 0
    OR pg_catalog.cardinality(v_image_ids) <> 4
    OR pg_catalog.cardinality(v_categories) <> 4
    OR (
      SELECT pg_catalog.count(DISTINCT category.value)
      FROM pg_catalog.unnest(v_categories) AS category(value)
    ) <> 4
    OR NOT ARRAY[
      'PRODUCT',
      'FILM_PATTERN',
      'CUSTOMER_APPROVED_SAMPLE',
      'SIGNED_SAMPLE'
    ]::text[] @> v_categories
  THEN
    RAISE EXCEPTION 'BASELINE_CARDINALITY_INVALID' USING ERRCODE = 'PT409';
  END IF;

  SELECT pg_catalog.count(*)::integer
    INTO v_proof_missing
  FROM pg_catalog.unnest(v_image_ids) AS selected(image_id)
  LEFT JOIN public.wos_qa_verified_image_proofs pf
    ON pf.image_id = selected.image_id
  WHERE pf.image_id IS NULL;
  IF v_proof_missing <> 0 THEN
    RAISE EXCEPTION 'PROOF_NOT_AVAILABLE' USING ERRCODE = 'PT409';
  END IF;

  WITH proof_rows AS MATERIALIZED (
    SELECT
      im.id AS image_id,
      im.category,
      im.version_label,
      im.storage_bucket,
      im.storage_path,
      pf.image_id AS proof_image_id,
      pf.organization_id AS proof_org_id,
      pf.order_id AS proof_order_id,
      pf.storage_bucket AS proof_bucket,
      pf.storage_path AS proof_path,
      pf.storage_object_id,
      pf.storage_object_version,
      pf.storage_object_updated_at,
      pf.verified_sha256,
      pf.verified_at,
      pf.expires_at
    FROM pg_catalog.unnest(v_image_ids) AS selected(image_id)
    JOIN public.wos_reference_images im
      ON im.id = selected.image_id
    JOIN public.wos_qa_verified_image_proofs pf
      ON pf.image_id = im.id
    WHERE im.organization_id = v_actor_org_id
      AND im.entity_type = 'PRODUCTION_ORDER'
      AND im.entity_id = p_order_id
      AND im.version_label = p_version_label
      AND im.image_status = 'READY'
      AND im.superseded_at IS NULL
  )
  SELECT
    pg_catalog.count(*) FILTER (
      WHERE proof_org_id IS DISTINCT FROM v_actor_org_id
        OR proof_order_id IS DISTINCT FROM p_order_id
        OR proof_bucket IS DISTINCT FROM storage_bucket
        OR proof_path IS DISTINCT FROM storage_path
        OR storage_object_id IS NULL
        OR storage_object_version IS NULL
        OR pg_catalog.btrim(storage_object_version) = ''
        OR storage_object_updated_at IS NULL
        OR verified_sha256 !~ '^[a-f0-9]{64}$'
        OR verified_at IS NULL
        OR verified_at > v_checked_at
    )::integer,
    pg_catalog.count(*) FILTER (
      WHERE expires_at IS NULL OR expires_at <= v_checked_at
    )::integer,
    pg_catalog.min(expires_at),
    pg_catalog.max(verified_at),
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'imageId', image_id,
        'category', category,
        'expectedSha256', verified_sha256,
        'expiresAt', expires_at
      )
      ORDER BY image_id
    )
  INTO v_proof_invalid, v_proof_expired,
       v_proof_expires_at, v_proof_last_verified_at,
       v_public_images
  FROM proof_rows;

  IF v_proof_invalid <> 0 THEN
    RAISE EXCEPTION 'PROOF_NOT_AVAILABLE' USING ERRCODE = 'PT409';
  END IF;
  IF v_proof_expired <> 0 THEN
    RAISE EXCEPTION 'PROOF_EXPIRED' USING ERRCODE = 'PT409';
  END IF;
  IF v_proof_expires_at IS NULL
    OR v_proof_expires_at <= v_checked_at
    OR v_proof_last_verified_at IS NULL
    OR v_proof_last_verified_at > v_baseline.office_confirmed_at
  THEN
    RAISE EXCEPTION 'PROOF_EXPIRED' USING ERRCODE = 'PT409';
  END IF;

  SELECT pg_catalog.count(*)::integer
    INTO v_object_count
  FROM pg_catalog.unnest(v_image_ids) AS selected(image_id)
  JOIN public.wos_reference_images im
    ON im.id = selected.image_id
  JOIN public.wos_qa_verified_image_proofs pf
    ON pf.image_id = im.id
  JOIN storage.objects ob
    ON ob.id = pf.storage_object_id
  WHERE im.organization_id = v_actor_org_id
    AND im.entity_type = 'PRODUCTION_ORDER'
    AND im.entity_id = p_order_id
    AND im.version_label = p_version_label
    AND pf.organization_id = v_actor_org_id
    AND pf.order_id = p_order_id
    AND pf.storage_bucket = im.storage_bucket
    AND pf.storage_path = im.storage_path
    AND ob.bucket_id = pf.storage_bucket
    AND ob.name = pf.storage_path
    AND ob.version IS NOT DISTINCT FROM pf.storage_object_version
    AND ob.updated_at IS NOT DISTINCT FROM pf.storage_object_updated_at
    AND ob.archived_at IS NULL
    AND ob.is_delete_marker IS DISTINCT FROM true
  ;
  IF v_object_count <> 4 THEN
    RAISE EXCEPTION 'PROOF_OBJECT_CHANGED' USING ERRCODE = 'PT409';
  END IF;

  SELECT pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'imageId', im.id,
      'category', im.category,
      'productionVersion', im.version_label,
      'bucket', pf.storage_bucket,
      'path', pf.storage_path,
      'objectId', pf.storage_object_id,
      'objectVersion', pf.storage_object_version,
      'objectUpdatedAt', pf.storage_object_updated_at,
      'sha256', pf.verified_sha256,
      'proofVerifiedAt', pf.verified_at,
      'proofExpiresAt', pf.expires_at
    )
    ORDER BY im.id
  )
  INTO v_internal_images
  FROM pg_catalog.unnest(v_image_ids) AS selected(image_id)
  JOIN public.wos_reference_images im
    ON im.id = selected.image_id
  JOIN public.wos_qa_verified_image_proofs pf
    ON pf.image_id = im.id
  JOIN storage.objects ob
    ON ob.id = pf.storage_object_id;

  v_spec := pg_catalog.jsonb_build_object(
    'org', v_order.organization_id,
    'order', v_order.id,
    'productionVersion', v_order.version_label,
    'customerId', v_order.customer_id,
    'customer', v_order.customer_name_snapshot,
    'product', v_order.product_name,
    'material', v_order.product_material,
    'surface', v_order.surface_treatment,
    'pattern', v_order.pattern_scope,
    'seam', v_order.seam_tolerance,
    'position', v_order.position_reference,
    'acceptance', v_order.customer_acceptance_standard,
    'packaging', v_order.packaging_method,
    'cartonQty', v_order.carton_quantity,
    'labelRule', v_order.label_marking_rule,
    'requestedQty', v_order.requested_quantity,
    'batchQty', v_order.current_batch_quantity
  );
  v_proof_digest := pg_catalog.encode(
    pg_catalog.sha256(
      pg_catalog.convert_to(
        pg_catalog.jsonb_build_object(
          'baselineId', v_baseline.id,
          'productionSpec', v_spec,
          'imageProofSet', v_internal_images
        )::text,
        'UTF8'
      )
    ),
    'hex'
  );

  IF v_proof_digest IS DISTINCT FROM v_baseline.office_proof_set_digest
    OR v_proof_digest IS DISTINCT FROM v_baseline.workshop_proof_set_digest
  THEN
    RAISE EXCEPTION 'PROOF_SET_MISMATCH' USING ERRCODE = 'PT409';
  END IF;

  SELECT
    pg_catalog.count(*)::integer,
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'requestId', r.request_id,
        'action', r.action,
        'expectedVersion', r.expected_version,
        'actorProfileId', r.actor_profile_id,
        'payloadFingerprint', r.payload_fingerprint,
        'beforeSpecDigest', r.before_spec_digest,
        'afterSpecDigest', r.after_spec_digest,
        'receiptDigest', r.receipt_digest,
        'resultJson', r.result_json
      )
      ORDER BY r.expected_version
    )
  INTO v_receipt_count, v_receipts
  FROM public.wos_qa_p2_m2_receipts r
  WHERE r.organization_id = v_actor_org_id
    AND r.order_id = p_order_id
    AND r.production_version_label = p_version_label
    AND r.result_json->>'baselineId' = v_baseline.id::text;

  IF v_receipt_count <> 4
    OR pg_catalog.jsonb_array_length(v_receipts) <> 4
  THEN
    RAISE EXCEPTION 'RECEIPT_CHAIN_INVALID' USING ERRCODE = 'PT409';
  END IF;

  FOR i IN 0..3 LOOP
    DECLARE
      v_receipt jsonb := v_receipts->i;
      v_expected_action text;
      v_expected_version integer;
      v_expected_actor uuid;
      v_expected_before text;
    BEGIN
      CASE i
        WHEN 0 THEN
          v_expected_action := 'BASELINE_SELECT';
          v_expected_version := p_expected_version - 4;
          v_expected_actor := v_office.id;
          v_expected_workflow_status := 'WAITING_MATERIAL';
        WHEN 1 THEN
          v_expected_action := 'BASELINE_OFFICE_CONFIRM';
          v_expected_version := p_expected_version - 3;
          v_expected_actor := v_office.id;
          v_expected_workflow_status := 'WAITING_MATERIAL';
        WHEN 2 THEN
          v_expected_action := 'BASELINE_WORKSHOP_CONFIRM';
          v_expected_version := p_expected_version - 2;
          v_expected_actor := v_workshop.id;
          v_expected_workflow_status := 'WAITING_MATERIAL';
        ELSE
          v_expected_action := 'FINAL_READINESS_CONFIRM';
          v_expected_version := p_expected_version - 1;
          v_expected_actor := v_workshop.id;
          v_expected_workflow_status := 'READINESS_CHECK';
      END CASE;

      v_current_before_digest := v_receipt->>'beforeSpecDigest';
      v_current_after_digest := v_receipt->>'afterSpecDigest';
      v_current_payload_fingerprint := v_receipt->>'payloadFingerprint';
      v_current_receipt_digest := v_receipt->>'receiptDigest';
      v_expected_receipt_digest := pg_catalog.encode(
        pg_catalog.sha256(pg_catalog.convert_to(
          pg_catalog.jsonb_build_object(
            'requestId', (v_receipt->>'requestId')::uuid,
            'actorProfile', v_expected_actor,
            'orderId', p_order_id,
            'expectedVersion', v_expected_version,
            'version', v_expected_version + 1,
            'action', v_expected_action,
            'payloadHash', v_current_payload_fingerprint,
            'beforeDigest', v_current_before_digest,
            'afterDigest', v_current_after_digest
          )::text,
          'UTF8'
        )),
        'hex'
      );
      IF v_receipt->>'action' IS DISTINCT FROM v_expected_action
        OR (v_receipt->>'expectedVersion')::integer IS DISTINCT FROM v_expected_version
        OR (v_receipt->>'actorProfileId')::uuid IS DISTINCT FROM v_expected_actor
        OR v_current_payload_fingerprint IS NULL
        OR v_current_payload_fingerprint !~ '^[a-f0-9]{64}$'
        OR v_current_before_digest IS NULL
        OR v_current_before_digest !~ '^[a-f0-9]{64}$'
        OR v_current_after_digest IS NULL
        OR v_current_after_digest !~ '^[a-f0-9]{64}$'
        OR v_current_receipt_digest IS NULL
        OR v_current_receipt_digest !~ '^[a-f0-9]{64}$'
        OR v_current_receipt_digest IS DISTINCT FROM v_expected_receipt_digest
        OR v_receipt->'resultJson'->>'status' IS DISTINCT FROM 'APPLIED'
        OR v_receipt->'resultJson'->>'orderId' IS DISTINCT FROM p_order_id::text
        OR v_receipt->'resultJson'->>'requestId'
          IS DISTINCT FROM v_receipt->>'requestId'
        OR v_receipt->'resultJson'->>'version'
          IS DISTINCT FROM (v_expected_version + 1)::text
        OR v_receipt->'resultJson'->>'productionVersionLabel'
          IS DISTINCT FROM p_version_label
        OR v_receipt->'resultJson'->>'preSpecDigest'
          IS DISTINCT FROM v_current_before_digest
        OR v_receipt->'resultJson'->>'postSpecDigest'
          IS DISTINCT FROM v_current_after_digest
        OR v_receipt->'resultJson'->>'receiptDigest'
          IS DISTINCT FROM v_current_receipt_digest
        OR v_receipt->'resultJson'->>'proofStatus'
          IS DISTINCT FROM 'UNVERIFIED'
        OR v_receipt->'resultJson'->>'canStart' IS DISTINCT FROM 'false'
        OR v_receipt->'resultJson'->>'workflowStatus'
          IS DISTINCT FROM v_expected_workflow_status
        OR v_receipt->'resultJson'->>'baselineId'
          IS DISTINCT FROM v_baseline.id::text
        OR (i > 0 AND v_current_before_digest IS DISTINCT FROM v_previous_after_digest)
      THEN
        RAISE EXCEPTION 'RECEIPT_CHAIN_INVALID' USING ERRCODE = 'PT409';
      END IF;
      v_previous_after_digest := v_current_after_digest;
    END;
  END LOOP;

  SELECT pg_catalog.count(*)::integer
    INTO v_receipt_count
  FROM public.wos_qa_p2_m2_receipts r
  WHERE r.request_id = (v_receipts->3->>'requestId')::uuid
    AND r.result_json->>'orderId' = p_order_id::text
    AND r.result_json->>'baselineId' = v_baseline.id::text
    AND r.result_json->>'canStart' = 'false'
    AND r.result_json->>'requestId' = r.request_id::text;
  IF v_receipt_count <> 1 THEN
    RAISE EXCEPTION 'RECEIPT_CHAIN_INVALID' USING ERRCODE = 'PT409';
  END IF;

  v_spec_digest := public.wos_qa_p2_m2_spec_digest(p_order_id);
  IF v_spec_digest IS NULL
    OR v_spec_digest IS DISTINCT FROM v_current_after_digest
  THEN
    RAISE EXCEPTION 'RECEIPT_CHAIN_INVALID' USING ERRCODE = 'PT409';
  END IF;

  v_snapshot_fingerprint := pg_catalog.encode(
    pg_catalog.sha256(
      pg_catalog.convert_to(
        pg_catalog.jsonb_build_object(
          'schema', 'wos-qa-m4-proof-v1',
          'orderId', v_order.id,
          'organizationId', v_order.organization_id,
          'orderVersion', v_order.version,
          'productionVersionLabel', v_order.version_label,
          'baselineId', v_baseline.id,
          'baselineCreatedAt', v_baseline.created_at,
          'officeProfileId', v_office.id,
          'workshopProfileId', v_workshop.id,
          'officeConfirmedAt', v_baseline.office_confirmed_at,
          'workshopConfirmedAt', v_baseline.workshop_confirmed_at,
          'proofSetDigest', v_proof_digest,
          'proofLastVerifiedAt', v_proof_last_verified_at,
          'proofExpiresAt', v_proof_expires_at,
          'imageProofs', v_internal_images,
          'receipts', v_receipts
        )::text,
        'UTF8'
      )
    ),
    'hex'
  );

  RETURN pg_catalog.jsonb_build_object(
    'orderId', v_order.id,
    'orderVersion', v_order.version,
    'versionLabel', v_order.version_label,
    'baselineId', v_baseline.id,
    'checkedAt', v_checked_at,
    'proofExpiresAt', v_proof_expires_at,
    'snapshotFingerprint', v_snapshot_fingerprint,
    'metadataSnapshotValid', true,
    'officeWorkshopDistinct', true,
    'proofSetDigestMatch', true,
    'm2ReceiptChainComplete', true,
    'images', v_public_images,
    'canStart', false
  );
EXCEPTION
  WHEN NO_DATA_FOUND OR TOO_MANY_ROWS THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
END;
$m4$;

ALTER FUNCTION public.wos_qa_m4_readonly_proof_snapshot(uuid,integer,text)
  OWNER TO wos_m4_proof_verifier_owner;
COMMENT ON FUNCTION public.wos_qa_m4_readonly_proof_snapshot(uuid,integer,text) IS
  'WOS_M4_02_READONLY_PROOF_VERIFIER_SNAPSHOT_V1';

REVOKE ALL ON FUNCTION
  public.wos_qa_m4_readonly_proof_snapshot(uuid,integer,text)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION
  public.wos_qa_m4_readonly_proof_snapshot(uuid,integer,text)
TO authenticated;

COMMIT;

-- INSTALL_NOT_AUTHORIZED: do not execute against Supabase QA or Production
-- until a separate Owner authorization binds the raw SQL SHA-256, rollback,
-- object ownership, ACLs, PG17 evidence and exact code HEAD.
