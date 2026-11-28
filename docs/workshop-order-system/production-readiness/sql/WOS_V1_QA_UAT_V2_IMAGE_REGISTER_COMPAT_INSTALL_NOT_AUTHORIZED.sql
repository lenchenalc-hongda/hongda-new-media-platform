-- WOS V1 QA-only V2 image registration compatibility install.
-- NOT AUTHORIZED FOR EXECUTION.
--
-- The retained QA order resumes at NEEDS_INFORMATION / V2. The hosted
-- registration RPC predates that formal correction state and currently accepts
-- only DRAFT. This installer changes only that state guard.

BEGIN;

DO $register_compat$
DECLARE
  v_definition text;
  v_source_sha256 text;
  v_target_sha256 text;
  v_expected_target_sha256 constant text :=
    'd8250a39ce42e185b3376f016714899fa7c831341ee314708e90a9a21bcb1db7';
  v_old_clause text;
  v_new_clause text;
  v_old_insert text;
  v_new_insert text;
BEGIN
  IF current_setting(
    'wos_v1.qa_v2_image_register_install_authorized',
    true
  ) IS DISTINCT FROM 'yes' THEN
    RAISE EXCEPTION
      'WOS_V1_QA_UAT_V2_IMAGE_REGISTER_INSTALL_NOT_AUTHORIZED';
  END IF;
  IF current_setting('wos_v1.qa_project', true)
    IS DISTINCT FROM 'xulmpqaknlwqqculbsek' THEN
    RAISE EXCEPTION 'WOS_V1_QA_UAT_V2_IMAGE_REGISTER_PROJECT_MISMATCH';
  END IF;
  IF current_setting('server_version_num')::integer < 170000 THEN
    RAISE EXCEPTION 'WOS_V1_QA_UAT_V2_IMAGE_REGISTER_REQUIRES_PG17';
  END IF;
  IF to_regprocedure(
      'public.wos_register_uploaded_reference_image(uuid,uuid,text,text)'
    ) IS NULL
    OR to_regclass('public.wos_qa_verified_image_proofs') IS NULL
    OR to_regclass('public.wos_reference_images') IS NULL
    OR to_regclass('storage.objects') IS NULL
  THEN
    RAISE EXCEPTION 'WOS_V1_QA_UAT_V2_IMAGE_REGISTER_PREREQUISITE_MISSING';
  END IF;
  IF to_regnamespace('wos_v1_qa_v2_image_register_compat') IS NOT NULL THEN
    RAISE EXCEPTION 'WOS_V1_QA_UAT_V2_IMAGE_REGISTER_ALREADY_INSTALLED';
  END IF;

  v_definition := pg_get_functiondef(
    'public.wos_register_uploaded_reference_image(uuid,uuid,text,text)'::regprocedure
  );
  v_source_sha256 := encode(
    sha256(convert_to(v_definition, 'UTF8')),
    'hex'
  );
  IF v_source_sha256 IS DISTINCT FROM
    'f508ce6444cc679662c2f4622003bfca4baf27b5b2cf02d01594aeb8d9f72187'
  THEN
    RAISE EXCEPTION 'WOS_V1_QA_UAT_V2_IMAGE_REGISTER_SOURCE_MISMATCH';
  END IF;

  v_old_clause := $old$
 IF v_order.workflow_status <> 'DRAFT'
 OR v_order.version_label !~ '^V[1-9][0-9]{0,20}$'
 THEN RAISE EXCEPTION 'UNSUPPORTED_ORDER_VERSION' USING ERRCODE='23514';END IF;$old$;
  v_new_clause := $new$
 IF NOT (
  (
   v_order.workflow_status='DRAFT'
   AND v_order.version_label ~ '^V[1-9][0-9]{0,20}$'
  )
  OR (
   v_order.workflow_status='NEEDS_INFORMATION'
   AND v_order.version_label ~ '^V(?:[2-9]|[1-9][0-9]{1,20})$'
  )
 )
 THEN RAISE EXCEPTION 'UNSUPPORTED_ORDER_VERSION' USING ERRCODE='23514';END IF;$new$;
  IF position(v_old_clause IN v_definition) = 0 THEN
    RAISE EXCEPTION 'WOS_V1_QA_UAT_V2_IMAGE_REGISTER_CLAUSE_MISSING';
  END IF;
  v_definition := replace(v_definition, v_old_clause, v_new_clause);

  v_old_insert := $old_insert$
 INSERT INTO public.wos_reference_images(
  id,organization_id,entity_type,entity_id,category,storage_bucket,storage_path,
  file_name,mime_type,file_size,version_label,image_status,uploaded_by_profile_id)
 VALUES(p_image_id,v_actor.org_id,'PRODUCTION_ORDER',p_order_id,p_category,'wos-private',
 p_storage_path,v_filename,v_mime,v_size,v_order.version_label,'READY',v_actor.id);$old_insert$;
  v_new_insert := $new_insert$
 SELECT image.id INTO v_previous_image_id
 FROM public.wos_reference_images image
 WHERE image.organization_id=v_actor.org_id
   AND image.entity_type='PRODUCTION_ORDER'
   AND image.entity_id=p_order_id
   AND image.category=p_category
   AND image.version_label=v_order.version_label
   AND image.image_status='READY'
   AND image.superseded_at IS NULL
   AND image.id<>p_image_id
 ORDER BY image.uploaded_at DESC,image.id DESC
 LIMIT 1
 FOR UPDATE;
 IF v_previous_image_id IS NOT NULL THEN
  UPDATE public.wos_reference_images
  SET image_status='SUPERSEDED',superseded_at=clock_timestamp()
  WHERE id=v_previous_image_id
    AND organization_id=v_actor.org_id
    AND entity_id=p_order_id
    AND category=p_category
    AND version_label=v_order.version_label
    AND image_status='READY'
    AND superseded_at IS NULL;
  IF NOT FOUND THEN
   RAISE EXCEPTION 'IMAGE_SUPERSESSION_CONFLICT' USING ERRCODE='PT409';
  END IF;
 END IF;
 INSERT INTO public.wos_reference_images(
  id,organization_id,entity_type,entity_id,category,storage_bucket,storage_path,
  file_name,mime_type,file_size,version_label,image_status,supersedes_image_id,
  uploaded_by_profile_id)
 VALUES(p_image_id,v_actor.org_id,'PRODUCTION_ORDER',p_order_id,p_category,'wos-private',
 p_storage_path,v_filename,v_mime,v_size,v_order.version_label,'READY',
 v_previous_image_id,v_actor.id);$new_insert$;
  IF position(v_old_insert IN v_definition) = 0 THEN
    RAISE EXCEPTION 'WOS_V1_QA_UAT_V2_IMAGE_REGISTER_INSERT_MISSING';
  END IF;
  v_definition := replace(v_definition, v_old_insert, v_new_insert);
  v_definition := replace(
    v_definition,
    ' v_size bigint;',
    ' v_size bigint;
 v_previous_image_id uuid;'
  );
  v_target_sha256 := encode(
    sha256(convert_to(v_definition, 'UTF8')),
    'hex'
  );
  IF v_target_sha256 IS DISTINCT FROM v_expected_target_sha256 THEN
    RAISE EXCEPTION
      'WOS_V1_QA_UAT_V2_IMAGE_REGISTER_TARGET_MISMATCH expected=% actual=%',
      v_expected_target_sha256,
      v_target_sha256;
  END IF;

  CREATE SCHEMA wos_v1_qa_v2_image_register_compat;
  REVOKE ALL ON SCHEMA wos_v1_qa_v2_image_register_compat
    FROM PUBLIC, anon, authenticated;
  CREATE TABLE wos_v1_qa_v2_image_register_compat.definition_backup (
    singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
    function_definition text NOT NULL,
    source_sha256 text NOT NULL,
    target_sha256 text NOT NULL,
    installed_at timestamptz NOT NULL DEFAULT clock_timestamp()
  );
  ALTER TABLE wos_v1_qa_v2_image_register_compat.definition_backup
    ENABLE ROW LEVEL SECURITY;
  REVOKE ALL
    ON TABLE wos_v1_qa_v2_image_register_compat.definition_backup
    FROM PUBLIC, anon, authenticated;
  INSERT INTO wos_v1_qa_v2_image_register_compat.definition_backup(
    function_definition,
    source_sha256,
    target_sha256
  ) VALUES (
    pg_get_functiondef(
      'public.wos_register_uploaded_reference_image(uuid,uuid,text,text)'::regprocedure
    ),
    v_source_sha256,
    v_target_sha256
  );

  EXECUTE v_definition;

  IF encode(
      sha256(convert_to(
        pg_get_functiondef(
          'public.wos_register_uploaded_reference_image(uuid,uuid,text,text)'::regprocedure
        ),
        'UTF8'
      )),
      'hex'
    ) IS DISTINCT FROM v_target_sha256
  THEN
    RAISE EXCEPTION 'WOS_V1_QA_UAT_V2_IMAGE_REGISTER_POSTFLIGHT_MISMATCH';
  END IF;
END;
$register_compat$;

COMMIT;

-- NOT_AUTHORIZED
