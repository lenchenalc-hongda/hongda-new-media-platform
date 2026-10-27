-- CPC: source channel is descriptive and repeatable; provisional source reference is unique.
-- Preserve the existing org-scoped uniqueness and all legacy customer IDs/mappings.
-- Existing rows can keep NULL source labels and fall back to their original source reference.
BEGIN;

ALTER TABLE public.cpc_customer_references
  ADD COLUMN provisional_source_label TEXT;

ALTER TABLE public.cpc_customer_references
  ADD CONSTRAINT chk_cpc_provisional_source_label
  CHECK (
    provisional_source_label IS NULL
    OR (
      reference_kind = 'provisional'
      AND char_length(btrim(provisional_source_label)) BETWEEN 1 AND 300
    )
  );

COMMENT ON COLUMN public.cpc_customer_references.provisional_source_reference
  IS 'Org-scoped unique provisional identity. New rows get CPC-PROV-<UUID>; legacy references remain unchanged. Not a marketing/source channel.';

COMMENT ON COLUMN public.cpc_customer_references.provisional_source_label
  IS 'Repeatable free-text acquisition channel (e.g. 新媒体/展会/转介绍). Nullable for legacy records; read API falls back to legacy provisional_source_reference.';

-- Keep the existing authenticated RPC signature so in-flight clients do not break.
-- p_provisional_source_reference is the legacy API argument carrying the human
-- source description; this RPC now generates the internal unique reference.
CREATE OR REPLACE FUNCTION public.cpc_create_provisional_customer_reference(
  p_display_name_snapshot TEXT,
  p_provisional_source_reference TEXT,
  p_request_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_actor_profile_id UUID;
  v_actor_org_id UUID;
  v_actor_role TEXT;
  v_reference_id UUID := gen_random_uuid();
  v_source_label TEXT := btrim(coalesce(p_provisional_source_reference, ''));
  v_customer_name TEXT := btrim(coalesce(p_display_name_snapshot, ''));
  v_internal_reference TEXT := 'CPC-PROV-' || v_reference_id::text;
BEGIN
  SELECT p.id, p.org_id, p.role
    INTO v_actor_profile_id, v_actor_org_id, v_actor_role
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.is_active = TRUE
    LIMIT 1;

  IF NOT FOUND OR v_actor_role NOT IN ('admin','manager','sales') THEN
    RETURN public.cpc_rpc_error('FORBIDDEN', '无有效客户项目权限');
  END IF;

  IF v_customer_name = '' OR v_source_label = ''
     OR char_length(v_customer_name) > 300
     OR char_length(v_source_label) > 300 THEN
    RETURN public.cpc_rpc_error('INVALID_INPUT', '客户名称和来源渠道均需填写，最多300字');
  END IF;

  INSERT INTO public.cpc_customer_references (
    id, org_id, reference_kind, provisional_source_reference,
    provisional_source_label, display_name_snapshot, status,
    created_by_profile_id
  ) VALUES (
    v_reference_id, v_actor_org_id, 'provisional',
    v_internal_reference, v_source_label, v_customer_name,
    'pending_review', v_actor_profile_id
  );

  INSERT INTO public.cpc_audit_log (
    org_id, entity_type, entity_id, action,
    actor_profile_id, after_values, request_id
  ) VALUES (
    v_actor_org_id, 'CUSTOMER_REFERENCE', v_reference_id,
    'CUSTOMER_REFERENCE_CREATED', v_actor_profile_id,
    jsonb_build_object(
      'reference_kind', 'provisional',
      'display_name_snapshot', v_customer_name,
      'provisional_source_reference', v_internal_reference,
      'source_channel', v_source_label,
      'status', 'pending_review'
    ), p_request_id
  );

  RETURN jsonb_build_object(
    'ok', TRUE, 'code', 'OK', 'message', 'success',
    'data', jsonb_build_object(
      'customer_reference_id', v_reference_id,
      'status', 'pending_review',
      'version', 1
    )
  );
EXCEPTION
  WHEN unique_violation THEN
    -- A UUID/ref collision or unexpected integrity conflict, NOT a repeated channel.
    RETURN public.cpc_rpc_error('DUPLICATE_REFERENCE', '系统生成的客户编号冲突，请重试');
END;
$$;

REVOKE ALL ON FUNCTION public.cpc_create_provisional_customer_reference(TEXT,TEXT,UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cpc_create_provisional_customer_reference(TEXT,TEXT,UUID)
  TO authenticated;

COMMIT;
