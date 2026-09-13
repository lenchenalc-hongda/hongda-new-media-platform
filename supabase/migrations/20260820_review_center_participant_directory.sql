-- 宏达项目复盘与改善中心 - Phase 2F.1 Participant Historical Read Foundation
-- Purpose: safe read of profiles actually referenced by one review, including
--          inactive participants, for Detail / Editor display labels.
-- Safety: no DML, no profiles RLS change, no policy/table/column/index/trigger,
--         no service role, no email return, no email display fallback.

BEGIN;

CREATE OR REPLACE FUNCTION public.review_participant_directory(
  p_review_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_actor_profile_id UUID;
  v_actor_org_id UUID;
  v_review_row public.review_cases%ROWTYPE;
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

  SELECT rc.* INTO v_review_row
    FROM public.review_cases rc
    WHERE rc.id = p_review_id
      AND rc.org_id = v_actor_org_id;

  IF NOT FOUND THEN
    RETURN public.review_rpc_error('NOT_FOUND', 'Review not found');
  END IF;

  WITH referenced AS (
    SELECT owner_id AS profile_id
      FROM public.review_cases rc
      WHERE rc.id = p_review_id
        AND rc.org_id = v_actor_org_id
    UNION
    SELECT pmo_id AS profile_id
      FROM public.review_cases rc
      WHERE rc.id = p_review_id
        AND rc.org_id = v_actor_org_id
        AND pmo_id IS NOT NULL
    UNION
    SELECT created_by AS profile_id
      FROM public.review_cases rc
      WHERE rc.id = p_review_id
        AND rc.org_id = v_actor_org_id
    UNION
    SELECT profile_id
      FROM public.review_members rm
      WHERE rm.review_id = p_review_id
        AND rm.org_id = v_actor_org_id
  ),
  participants AS (
    SELECT DISTINCT
      r.profile_id,
      p.id,
      p.full_name,
      p.role,
      p.department,
      p.is_active
    FROM referenced r
    JOIN public.profiles p
      ON p.id = r.profile_id
     AND p.org_id = v_review_row.org_id
  )
  SELECT COALESCE(
    jsonb_agg(
      item
      ORDER BY sort_display_name, sort_profile_id
    ),
    '[]'::jsonb
  )
  INTO v_items
  FROM (
    SELECT
      COALESCE(NULLIF(btrim(pt.full_name), ''), '未命名用户') AS sort_display_name,
      pt.id AS sort_profile_id,
      jsonb_build_object(
        'profile_id', pt.id,
        'display_name', COALESCE(NULLIF(btrim(pt.full_name), ''), '未命名用户'),
        'role', pt.role,
        'department', pt.department,
        'is_active', pt.is_active
      ) AS item
    FROM participants pt
  ) q;

  RETURN jsonb_build_object(
    'ok', true,
    'code', 'OK',
    'message', 'success',
    'data', jsonb_build_object('items', v_items)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.review_participant_directory(UUID)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_participant_directory(UUID)
  TO authenticated;

COMMIT;
