-- WOS V1 QA-only mirror from QA trusted proofs to the formal proof table.
-- NOT AUTHORIZED FOR EXECUTION.
--
-- The hosted QA Edge writes to wos_qa_verified_image_proofs. The formal Office
-- and M2 contracts read wos_verified_image_proofs. This mirror runs only while
-- an exact QA UAT control is ARMED and the Edge actor/order gate is open.

BEGIN;

DO $proof_mirror$
DECLARE
  v_function_definition text;
BEGIN
  IF current_setting(
    'wos_v1.qa_verified_proof_mirror_install_authorized',
    true
  ) IS DISTINCT FROM 'yes' THEN
    RAISE EXCEPTION
      'WOS_V1_QA_UAT_VERIFIED_PROOF_MIRROR_INSTALL_NOT_AUTHORIZED';
  END IF;
  IF current_setting('wos_v1.qa_project', true)
    IS DISTINCT FROM 'xulmpqaknlwqqculbsek' THEN
    RAISE EXCEPTION 'WOS_V1_QA_UAT_VERIFIED_PROOF_MIRROR_PROJECT_MISMATCH';
  END IF;
  IF current_setting('server_version_num')::integer < 170000 THEN
    RAISE EXCEPTION 'WOS_V1_QA_UAT_VERIFIED_PROOF_MIRROR_REQUIRES_PG17';
  END IF;
  IF to_regclass('wos_v1_qa_uat.closeout_controls') IS NULL
  THEN
    RAISE EXCEPTION
      'WOS_V1_QA_UAT_VERIFIED_PROOF_MIRROR_CLOSEOUT_CONTROLS_MISSING';
  END IF;
  IF to_regclass('wos_v1_qa_uat.write_gates') IS NULL THEN
    RAISE EXCEPTION
      'WOS_V1_QA_UAT_VERIFIED_PROOF_MIRROR_WRITE_GATES_MISSING';
  END IF;
  IF to_regclass('public.wos_qa_verified_image_proofs') IS NULL THEN
    RAISE EXCEPTION
      'WOS_V1_QA_UAT_VERIFIED_PROOF_MIRROR_QA_PROOFS_MISSING';
  END IF;
  IF to_regclass('public.wos_verified_image_proofs') IS NULL THEN
    RAISE EXCEPTION
      'WOS_V1_QA_UAT_VERIFIED_PROOF_MIRROR_FORMAL_PROOFS_MISSING';
  END IF;
  IF to_regnamespace('wos_v1_qa_proof_mirror_compat') IS NOT NULL
    OR to_regprocedure(
      'public.wos_v1_qa_uat_mirror_verified_proof()'
    ) IS NOT NULL
    OR EXISTS (
      SELECT 1
      FROM pg_trigger trigger_row
      WHERE trigger_row.tgname='wos_v1_qa_uat_verified_proof_mirror'
    )
  THEN
    RAISE EXCEPTION 'WOS_V1_QA_UAT_VERIFIED_PROOF_MIRROR_ALREADY_INSTALLED';
  END IF;

  CREATE SCHEMA wos_v1_qa_proof_mirror_compat;
  REVOKE ALL ON SCHEMA wos_v1_qa_proof_mirror_compat
    FROM PUBLIC, anon, authenticated;
  CREATE TABLE wos_v1_qa_proof_mirror_compat.install_state (
    singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
    function_oid oid NOT NULL,
    function_definition text NOT NULL,
    function_sha256 text NOT NULL,
    trigger_definition text NOT NULL,
    installed_at timestamptz NOT NULL DEFAULT clock_timestamp()
  );
  ALTER TABLE wos_v1_qa_proof_mirror_compat.install_state
    ENABLE ROW LEVEL SECURITY;
  REVOKE ALL ON TABLE wos_v1_qa_proof_mirror_compat.install_state
    FROM PUBLIC, anon, authenticated;

  CREATE FUNCTION public.wos_v1_qa_uat_mirror_verified_proof()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
  AS $mirror$
DECLARE
  v_control wos_v1_qa_uat.closeout_controls%ROWTYPE;
  v_actor public.profiles%ROWTYPE;
  v_existing public.wos_verified_image_proofs%ROWTYPE;
BEGIN
  IF TG_OP IS DISTINCT FROM 'INSERT' THEN
    RAISE EXCEPTION 'QA_VERIFIED_PROOF_MIRROR_INSERT_ONLY'
      USING ERRCODE='42501';
  END IF;

  SELECT control.* INTO v_control
  FROM wos_v1_qa_uat.closeout_controls control
  WHERE control.project_ref='xulmpqaknlwqqculbsek'
    AND control.db_state='ARMED'
    AND control.edge_state='ARMED'
    AND control.write_deadline_at>clock_timestamp()
    AND control.authorized_order_id=NEW.order_id
    AND control.authorized_organization_id=NEW.organization_id
  ORDER BY control.opened_at DESC
  LIMIT 1;
  IF NOT FOUND OR v_control.edge_process_nonce IS NULL THEN
    RAISE EXCEPTION 'QA_VERIFIED_PROOF_MIRROR_GATE_REQUIRED'
      USING ERRCODE='42501';
  END IF;

  SELECT profile.* INTO v_actor
  FROM public.profiles profile
  WHERE profile.user_id=NEW.actor_user_id
    AND profile.org_id=NEW.organization_id
    AND profile.role IN ('admin','manager','sales')
    AND profile.is_active=true
  LIMIT 1;
  IF NOT FOUND
    OR NOT public.wos_v1_qa_uat_edge_write_allowed(
      v_control.authorization_id,
      'xulmpqaknlwqqculbsek',
      v_control.execution_id,
      v_control.edge_process_nonce,
      v_actor.id,
      NEW.organization_id,
      NEW.order_id
    )
  THEN
    RAISE EXCEPTION 'QA_VERIFIED_PROOF_MIRROR_GATE_REQUIRED'
      USING ERRCODE='42501';
  END IF;

  SELECT proof.* INTO v_existing
  FROM public.wos_verified_image_proofs proof
  WHERE proof.image_id=NEW.image_id
  FOR UPDATE;
  IF FOUND THEN
    IF v_existing.organization_id IS DISTINCT FROM NEW.organization_id
      OR v_existing.order_id IS DISTINCT FROM NEW.order_id
      OR v_existing.actor_user_id IS DISTINCT FROM NEW.actor_user_id
      OR v_existing.storage_bucket IS DISTINCT FROM NEW.storage_bucket
      OR v_existing.storage_path IS DISTINCT FROM NEW.storage_path
      OR v_existing.storage_object_id IS DISTINCT FROM NEW.storage_object_id
      OR v_existing.storage_object_version
        IS DISTINCT FROM NEW.storage_object_version
      OR v_existing.storage_object_updated_at
        IS DISTINCT FROM NEW.storage_object_updated_at
      OR v_existing.verified_sha256 IS DISTINCT FROM NEW.verified_sha256
      OR v_existing.verified_at IS DISTINCT FROM NEW.verified_at
      OR v_existing.expires_at IS DISTINCT FROM NEW.expires_at
    THEN
      RAISE EXCEPTION 'QA_VERIFIED_PROOF_MIRROR_CONFLICT'
        USING ERRCODE='23505';
    END IF;
    RETURN NEW;
  END IF;

  INSERT INTO public.wos_verified_image_proofs(
    image_id,
    organization_id,
    order_id,
    actor_user_id,
    storage_bucket,
    storage_path,
    storage_object_id,
    storage_object_version,
    storage_object_updated_at,
    verified_sha256,
    verified_at,
    expires_at
  ) VALUES (
    NEW.image_id,
    NEW.organization_id,
    NEW.order_id,
    NEW.actor_user_id,
    NEW.storage_bucket,
    NEW.storage_path,
    NEW.storage_object_id,
    NEW.storage_object_version,
    NEW.storage_object_updated_at,
    NEW.verified_sha256,
    NEW.verified_at,
    NEW.expires_at
  );
  RETURN NEW;
END;
$mirror$;

  REVOKE ALL ON FUNCTION public.wos_v1_qa_uat_mirror_verified_proof()
    FROM PUBLIC, anon, authenticated;
  CREATE TRIGGER wos_v1_qa_uat_verified_proof_mirror
  AFTER INSERT ON public.wos_qa_verified_image_proofs
  FOR EACH ROW EXECUTE FUNCTION public.wos_v1_qa_uat_mirror_verified_proof();

  SELECT pg_get_functiondef(
    'public.wos_v1_qa_uat_mirror_verified_proof()'::regprocedure
  ) INTO v_function_definition;
  INSERT INTO wos_v1_qa_proof_mirror_compat.install_state(
    function_oid,
    function_definition,
    function_sha256,
    trigger_definition
  ) VALUES (
    'public.wos_v1_qa_uat_mirror_verified_proof()'::regprocedure::oid,
    v_function_definition,
    encode(sha256(convert_to(v_function_definition,'UTF8')),'hex'),
    pg_get_triggerdef((
      SELECT trigger_row.oid
      FROM pg_trigger trigger_row
      WHERE trigger_row.tgname='wos_v1_qa_uat_verified_proof_mirror'
    ))
  );

  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger trigger_row
    WHERE trigger_row.tgname='wos_v1_qa_uat_verified_proof_mirror'
      AND trigger_row.tgrelid='public.wos_qa_verified_image_proofs'::regclass
      AND trigger_row.tgenabled='O'
      AND NOT trigger_row.tgisinternal
  ) THEN
    RAISE EXCEPTION 'WOS_V1_QA_UAT_VERIFIED_PROOF_MIRROR_POSTFLIGHT_FAILED';
  END IF;
  IF to_regprocedure(
      'public.wos_v1_qa_uat_edge_write_allowed(text,text,uuid,uuid,uuid,uuid,uuid)'
    ) IS NULL
  THEN
    RAISE EXCEPTION 'WOS_V1_QA_UAT_VERIFIED_PROOF_MIRROR_EDGE_FUNCTION_MISSING';
  END IF;
END;
$proof_mirror$;

COMMIT;

-- NOT_AUTHORIZED
