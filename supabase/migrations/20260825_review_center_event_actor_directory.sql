-- 宏达项目复盘与改善中心 - Phase 2L.1 Event Actor Directory
-- Purpose: resolve actor_profile_id -> safe display info for actors actually
--          referenced by one review's timeline/audit rows, including inactive
--          and non-participant actors.
-- Security: SECURITY DEFINER is required to read profiles including inactive
--           actors while bypassing profiles RLS. All caller, org, review, and
--           purpose gates are enforced inside the function.
-- Scope: TIMELINE is available to any active same-org profile. AUDIT is
--        available only to active same-org admin/manager profiles.

BEGIN;

CREATE OR REPLACE FUNCTION public.review_event_actor_directory(
  p_review_id UUID,
  p_purpose TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_actor_profile_id UUID;
  v_actor_org_id UUID;
  v_purpose TEXT := upper(btrim(p_purpose));
  v_items JSONB := '[]'::jsonb;
BEGIN
  v_actor_profile_id := public.auth_profile_id();
  IF v_actor_profile_id IS NULL THEN
    RETURN public.review_rpc_error('FORBIDDEN', 'Forbidden');
  END IF;

  v_actor_org_id := NULLIF(public.auth_org_id(), '')::uuid;
  IF v_actor_org_id IS NULL THEN
    RETURN public.review_rpc_error('FORBIDDEN', 'Forbidden');
  END IF;

  IF v_purpose IS NULL OR v_purpose NOT IN ('TIMELINE', 'AUDIT') THEN
    RETURN public.review_rpc_error('INVALID_PURPOSE', 'Invalid directory purpose');
  END IF;

  IF v_purpose = 'AUDIT'
     AND NOT (
       public.auth_has_role('admin')
       OR public.auth_has_role('manager')
     ) THEN
    RETURN public.review_rpc_error('FORBIDDEN', 'Forbidden');
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.review_cases rc
     WHERE rc.id = p_review_id
       AND rc.org_id = v_actor_org_id
  ) THEN
    RETURN public.review_rpc_error('NOT_FOUND', 'Review not found');
  END IF;

  IF v_purpose = 'TIMELINE' THEN
    WITH actors AS (
      SELECT DISTINCT
        p.id AS profile_id,
        p.full_name,
        p.role,
        p.is_active
      FROM public.review_timeline_events te
      JOIN public.profiles p
        ON p.id = te.actor_profile_id
       AND p.org_id = te.org_id
      WHERE te.review_id = p_review_id
        AND te.org_id = v_actor_org_id
        AND te.actor_profile_id IS NOT NULL
    )
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'profile_id', a.profile_id,
          'display_name', COALESCE(NULLIF(btrim(a.full_name), ''), '未命名用户'),
          'role', a.role,
          'is_active', a.is_active
        )
        ORDER BY COALESCE(NULLIF(btrim(a.full_name), ''), '未命名用户'), a.profile_id
      ),
      '[]'::jsonb
    )
    INTO v_items
    FROM actors a;
  ELSE
    WITH actors AS (
      SELECT DISTINCT
        p.id AS profile_id,
        p.full_name,
        p.role,
        p.is_active
      FROM public.review_audit_logs al
      JOIN public.profiles p
        ON p.id = al.actor_profile_id
       AND p.org_id = al.org_id
      WHERE al.review_id = p_review_id
        AND al.org_id = v_actor_org_id
        AND al.actor_profile_id IS NOT NULL
    )
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'profile_id', a.profile_id,
          'display_name', COALESCE(NULLIF(btrim(a.full_name), ''), '未命名用户'),
          'role', a.role,
          'is_active', a.is_active
        )
        ORDER BY COALESCE(NULLIF(btrim(a.full_name), ''), '未命名用户'), a.profile_id
      ),
      '[]'::jsonb
    )
    INTO v_items
    FROM actors a;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'code', 'OK',
    'message', 'success',
    'data', jsonb_build_object('items', v_items)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.review_event_actor_directory(UUID, TEXT)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_event_actor_directory(UUID, TEXT)
  TO authenticated;

COMMIT;
