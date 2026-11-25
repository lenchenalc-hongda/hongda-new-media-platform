-- WOS V1 PRODUCTION RUNTIME ROLLBACK DRAFT
-- INSTALL_NOT_AUTHORIZED
--
-- Removes only the Production-neutral V1 runtime added after Foundation and
-- P7. A full rollback must then run the reviewed P7 disposable rollback to
-- remove all WOS schema and return to the 67-table Production baseline.

BEGIN;

DO $guard$
DECLARE
  v_table text;
  v_has_rows boolean;
BEGIN
  IF current_database() <> 'wos_prod_bootstrap_ci'
    AND current_setting('wos_v1.production_rollback_authorized', true)
      IS DISTINCT FROM 'yes'
  THEN
    RAISE EXCEPTION 'WOS_V1_PRODUCTION_ROLLBACK_NOT_AUTHORIZED';
  END IF;
  IF to_regprocedure(
      'public.wos_v1_pre_runtime_confirm_office_completeness(uuid,integer,text,text)'
    ) IS NULL
    OR to_regprocedure(
      'public.wos_v1_pre_runtime_submit_production_order(uuid,integer,text,uuid)'
    ) IS NULL
    OR to_regprocedure(
      'public.wos_v1_pre_runtime_record_trusted_image_proof(uuid,uuid,uuid,text,uuid,text,timestamptz,text)'
    ) IS NULL
  THEN
    RAISE EXCEPTION 'WOS_V1_RUNTIME_ROLLBACK_BACKUP_MISSING';
  END IF;

  FOREACH v_table IN ARRAY ARRAY[
    'wos_operator_review_receipts',
    'wos_office_revisions',
    'wos_operator_action_receipts',
    'wos_order_create_receipts'
  ]
  LOOP
    IF to_regclass('public.' || v_table) IS NOT NULL THEN
      EXECUTE format(
        'SELECT EXISTS (SELECT 1 FROM public.%I)',
        v_table
      ) INTO v_has_rows;
      IF v_has_rows THEN
        RAISE EXCEPTION
          'WOS_V1_RUNTIME_ROLLBACK_REQUIRES_DATA_RETENTION_DECISION';
      END IF;
    END IF;
  END LOOP;
END;
$guard$;

DROP FUNCTION IF EXISTS public.wos_operator_review_correction(
  uuid,integer,uuid,text
);
DROP FUNCTION IF EXISTS public.wos_office_resubmit_order(
  uuid,integer,uuid,text
);
DROP FUNCTION IF EXISTS public.wos_office_save_correction(
  uuid,integer,uuid,jsonb,text
);
DROP FUNCTION IF EXISTS public.wos_operator_order_action(
  uuid,integer,uuid,text,text
);
DROP FUNCTION IF EXISTS public.wos_create_production_order(uuid,jsonb);
DROP FUNCTION IF EXISTS public.wos_v1_assert_current_image_set(
  uuid,uuid,text
);
DROP FUNCTION public.wos_confirm_office_completeness(
  uuid,integer,text,text
);
DROP FUNCTION public.wos_submit_production_order(
  uuid,integer,text,uuid
);
DROP FUNCTION public.wos_p7_record_trusted_image_proof(
  uuid,uuid,uuid,text,uuid,text,timestamptz,text
);

ALTER FUNCTION public.wos_v1_pre_runtime_confirm_office_completeness(
  uuid,integer,text,text
) RENAME TO wos_confirm_office_completeness;
ALTER FUNCTION public.wos_v1_pre_runtime_submit_production_order(
  uuid,integer,text,uuid
) RENAME TO wos_submit_production_order;
ALTER FUNCTION public.wos_v1_pre_runtime_record_trusted_image_proof(
  uuid,uuid,uuid,text,uuid,text,timestamptz,text
) RENAME TO wos_p7_record_trusted_image_proof;

CREATE OR REPLACE FUNCTION public.wos_register_uploaded_reference_image(
 p_order_id uuid,p_image_id uuid,p_category text,p_storage_path text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE
 v_actor public.profiles%ROWTYPE;
 v_order public.wos_production_orders%ROWTYPE;
 v_object storage.objects%ROWTYPE;
 v_row public.wos_reference_images%ROWTYPE;
 v_category_slug text;
 v_prefix text;
 v_filename text;
 v_mime text;
 v_size bigint;
BEGIN
 SELECT * INTO v_actor FROM public.profiles
 WHERE user_id=auth.uid() AND is_active=true
 AND role IN ('admin','manager','sales') LIMIT 1;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE='42501';END IF;
 IF p_order_id IS NULL OR p_image_id IS NULL OR p_storage_path IS NULL
 OR length(p_storage_path)>1024
 OR p_category NOT IN ('FILM_PATTERN','PRODUCT','CUSTOMER_APPROVED_SAMPLE',
   'SIGNED_SAMPLE','PACKAGING_LABEL','DEFECT_RISK','OTHER')
 THEN RAISE EXCEPTION 'INVALID_INPUT' USING ERRCODE='22023';END IF;
 v_category_slug:=replace(lower(p_category),'_','-');
 SELECT * INTO v_order FROM public.wos_production_orders WHERE id=p_order_id FOR UPDATE;
 IF NOT FOUND OR v_order.organization_id<>v_actor.org_id
 OR (v_actor.role='sales'
    AND v_actor.id<>v_order.created_by_profile_id
    AND v_actor.id<>v_order.sales_owner_profile_id)
 THEN RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE='42501';END IF;
 IF v_order.workflow_status <> 'DRAFT'
 OR v_order.version_label !~ '^V[1-9][0-9]{0,20}$'
 THEN RAISE EXCEPTION 'UNSUPPORTED_ORDER_VERSION' USING ERRCODE='23514';END IF;
 v_prefix:='organizations/'||v_order.organization_id::text||
  '/wos/production-order/'||v_order.id::text||'/images/'||v_category_slug||
  '/versions/'||v_order.version_label||'/'||p_image_id::text||'/';
 IF left(p_storage_path,length(v_prefix))<>v_prefix
 OR length(p_storage_path)<=length(v_prefix)
 THEN RAISE EXCEPTION 'INVALID_STORAGE_PATH' USING ERRCODE='23514'; END IF;
 v_filename:=substring(p_storage_path FROM length(v_prefix)+1);
 IF v_filename !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,199}\.(jpg|jpeg|png|webp)$' OR position('..' in v_filename)>0
 THEN RAISE EXCEPTION 'INVALID_STORAGE_FILE' USING ERRCODE='23514';END IF;
 SELECT * INTO v_object FROM storage.objects
 WHERE bucket_id='wos-private' AND name=p_storage_path
   AND owner_id=auth.uid()::text
   AND is_delete_marker=false AND archived_at IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'PRIVATE_STORAGE_OBJECT_NOT_VERIFIED' USING ERRCODE='23514';END IF;
 v_mime:=v_object.metadata->>'mimetype';
 IF v_mime NOT IN ('image/jpeg','image/png','image/webp')
 OR (v_mime='image/jpeg' AND lower(v_filename) !~ '\.(jpg|jpeg)$')
 OR (v_mime='image/png' AND lower(v_filename) !~ '\.png$')
 OR (v_mime='image/webp' AND lower(v_filename) !~ '\.webp$')
 OR COALESCE(v_object.metadata->>'size','') !~ '^[0-9]+$'
 THEN RAISE EXCEPTION 'UNSUPPORTED_PRIVATE_IMAGE' USING ERRCODE='23514';END IF;
 v_size:=(v_object.metadata->>'size')::bigint;
 IF v_size<1 OR v_size>20971520
 THEN RAISE EXCEPTION 'UNSUPPORTED_IMAGE_SIZE' USING ERRCODE='23514';END IF;
 SELECT * INTO v_row FROM public.wos_reference_images WHERE id=p_image_id;
 IF FOUND THEN
  IF v_row.organization_id<>v_actor.org_id OR v_row.entity_id<>p_order_id
   OR v_row.storage_bucket<>'wos-private' OR v_row.storage_path<>p_storage_path
   OR v_row.category<>p_category OR v_row.image_status<>'READY'
   OR v_row.version_label<>v_order.version_label
  THEN RAISE EXCEPTION 'IMAGE_ID_CONFLICT' USING ERRCODE='23505';END IF;
  RETURN jsonb_build_object('status','REPLAYED','imageId',v_row.id,'bucket','wos-private');
 END IF;
 -- Must be enforced inside the privileged RPC: a directly authenticated
 -- PostgREST caller cannot mint a byte-proof (proof table write privileges
 -- are withheld from anon/authenticated).
 IF v_mime<>'image/png'
 THEN RAISE EXCEPTION 'TRUSTED_PNG_ONLY' USING ERRCODE='23514'; END IF;
 IF NOT EXISTS (
   SELECT 1 FROM public.wos_verified_image_proofs proof
   WHERE proof.image_id=p_image_id
     AND proof.order_id=p_order_id
     AND proof.organization_id=v_actor.org_id
     AND proof.actor_user_id=auth.uid()
     AND proof.storage_bucket='wos-private'
     AND proof.storage_path=p_storage_path
     AND proof.storage_object_id=v_object.id
     AND proof.storage_object_version IS NOT DISTINCT FROM v_object.version
     AND proof.storage_object_updated_at IS NOT DISTINCT FROM v_object.updated_at
     AND proof.expires_at>clock_timestamp()
 ) THEN RAISE EXCEPTION 'TRUSTED_BINARY_PROOF_REQUIRED' USING ERRCODE='42501'; END IF;
 INSERT INTO public.wos_reference_images(
  id,organization_id,entity_type,entity_id,category,storage_bucket,storage_path,
  file_name,mime_type,file_size,version_label,image_status,uploaded_by_profile_id)
 VALUES(p_image_id,v_actor.org_id,'PRODUCTION_ORDER',p_order_id,p_category,'wos-private',
 p_storage_path,v_filename,v_mime,v_size,v_order.version_label,'READY',v_actor.id);
 RETURN jsonb_build_object('status','CREATED','imageId',p_image_id,'bucket','wos-private');
END $fn$;

DROP TABLE IF EXISTS public.wos_operator_review_receipts;
DROP TABLE IF EXISTS public.wos_office_revisions;
DROP TABLE IF EXISTS public.wos_operator_action_receipts;
DROP TABLE IF EXISTS public.wos_order_create_receipts;

DO $postcheck$
BEGIN
  IF to_regclass('public.wos_operator_review_receipts') IS NOT NULL
    OR to_regclass('public.wos_office_revisions') IS NOT NULL
    OR to_regclass('public.wos_operator_action_receipts') IS NOT NULL
    OR to_regclass('public.wos_order_create_receipts') IS NOT NULL
    OR to_regprocedure('public.wos_create_production_order(uuid,jsonb)')
      IS NOT NULL
    OR to_regprocedure(
      'public.wos_v1_pre_runtime_confirm_office_completeness(uuid,integer,text,text)'
    ) IS NOT NULL
    OR to_regprocedure(
      'public.wos_v1_pre_runtime_submit_production_order(uuid,integer,text,uuid)'
    ) IS NOT NULL
    OR to_regprocedure(
      'public.wos_v1_pre_runtime_record_trusted_image_proof(uuid,uuid,uuid,text,uuid,text,timestamptz,text)'
    ) IS NOT NULL
    OR to_regprocedure(
      'public.wos_confirm_office_completeness(uuid,integer,text,text)'
    ) IS NULL
    OR to_regprocedure(
      'public.wos_submit_production_order(uuid,integer,text,uuid)'
    ) IS NULL
    OR to_regprocedure(
      'public.wos_p7_record_trusted_image_proof(uuid,uuid,uuid,text,uuid,text,timestamptz,text)'
    ) IS NULL
  THEN
    RAISE EXCEPTION 'WOS_V1_RUNTIME_ROLLBACK_INCOMPLETE';
  END IF;
END;
$postcheck$;

COMMIT;

SELECT 'WOS_V1_RUNTIME_ROLLBACK=PASS' AS check_name;
