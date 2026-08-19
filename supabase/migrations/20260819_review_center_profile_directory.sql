-- 宏达项目复盘与改善中心 - Phase 2E.1 Profile Directory Database Foundation
-- Purpose: controlled same-org active profile directory for Review Center
--          member / owner / PMO selectors and read-only display hydration.
-- Safety: no DML, no policy changes, no table/column/index/trigger changes,
--         no service role, no email disclosure, no email display fallback.

BEGIN;

CREATE OR REPLACE FUNCTION public.review_profile_directory(
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
  v_items JSONB := '[]'::jsonb;
BEGIN
  SELECT p.id, p.org_id
    INTO v_actor_profile_id, v_actor_org_id
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.is_active = true
    LIMIT 1;

  IF NOT FOUND THEN
    RETURN public.review_rpc_error('FORBIDDEN', 'Forbidden');
  END IF;

  IF p_purpose IS NULL OR p_purpose NOT IN ('MEMBER', 'ASSIGNMENT') THEN
    RETURN public.review_rpc_error('INVALID_PURPOSE', 'Invalid directory purpose');
  END IF;

  WITH candidate AS (
    SELECT
      p.id AS sort_profile_id,
      p.department AS sort_department,
      COALESCE(NULLIF(btrim(p.full_name), ''), '未命名用户') AS sort_display_name,
      jsonb_build_object(
        'profile_id', p.id,
        'display_name', COALESCE(NULLIF(btrim(p.full_name), ''), '未命名用户'),
        'role', p.role,
        'department', p.department,
        'assignment_eligible', p.role <> 'viewer'
      ) AS item
    FROM public.profiles p
    WHERE p.org_id = v_actor_org_id
      AND p.is_active = true
      AND (
        p_purpose = 'MEMBER'
        OR (p_purpose = 'ASSIGNMENT' AND p.role <> 'viewer')
      )
  )
  SELECT COALESCE(
    jsonb_agg(
      item
      ORDER BY sort_department NULLS LAST,
               sort_display_name,
               sort_profile_id
    ),
    '[]'::jsonb
  )
  INTO v_items
  FROM candidate;

  RETURN jsonb_build_object(
    'ok', true,
    'code', 'OK',
    'message', 'success',
    'data', jsonb_build_object('items', v_items)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.review_profile_directory(TEXT)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_profile_directory(TEXT)
  TO authenticated;

COMMIT;
