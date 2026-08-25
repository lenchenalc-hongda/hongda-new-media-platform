-- Review Center - Phase 2N.2B CAPA Schema + Read Foundation
-- Scope: review_actions table, RLS/grants, audit entity_type ACTION,
--        ACTION_OWNER profile directory purpose, participant directory
--        action references.
-- Safety: schema/read foundation only; no mutation RPC, no lifecycle close
--         integration, no service role, no seed data, no DML on existing rows.

BEGIN;

-- ============ 1. review_actions ============
CREATE TABLE public.review_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  review_id UUID NOT NULL,
  sequence INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  action_type TEXT NOT NULL,
  owner_profile_id UUID NOT NULL,
  due_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN',
  completion_note TEXT,
  verification_note TEXT,
  verified_by_profile_id UUID,
  verified_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancel_reason TEXT,
  created_by_profile_id UUID NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_review_actions_sequence CHECK (sequence >= 1),
  CONSTRAINT chk_review_actions_version CHECK (version >= 1),
  CONSTRAINT chk_review_actions_action_type CHECK (
    action_type IN ('IMMEDIATE', 'CORRECTIVE', 'PREVENTIVE')
  ),
  CONSTRAINT chk_review_actions_status CHECK (
    status IN ('OPEN', 'IN_PROGRESS', 'PENDING_VERIFICATION', 'VERIFIED', 'CANCELLED')
  ),
  CONSTRAINT chk_review_actions_title CHECK (
    char_length(btrim(title)) > 0
    AND char_length(title) <= 200
  ),
  CONSTRAINT chk_review_actions_description CHECK (
    description IS NULL
    OR (
      char_length(btrim(description)) > 0
      AND char_length(description) <= 5000
    )
  ),
  CONSTRAINT chk_review_actions_completion_note CHECK (
    completion_note IS NULL
    OR (
      char_length(btrim(completion_note)) > 0
      AND char_length(completion_note) <= 5000
    )
  ),
  CONSTRAINT chk_review_actions_verification_note CHECK (
    verification_note IS NULL
    OR (
      char_length(btrim(verification_note)) > 0
      AND char_length(verification_note) <= 5000
    )
  ),
  CONSTRAINT chk_review_actions_cancel_reason CHECK (
    cancel_reason IS NULL
    OR (
      char_length(btrim(cancel_reason)) > 0
      AND char_length(cancel_reason) <= 1000
    )
  ),
  CONSTRAINT chk_review_actions_verified_metadata CHECK (
    (status = 'VERIFIED'
      AND verified_by_profile_id IS NOT NULL
      AND verified_at IS NOT NULL)
    OR
    (status <> 'VERIFIED'
      AND verified_by_profile_id IS NULL
      AND verified_at IS NULL)
  ),
  CONSTRAINT chk_review_actions_cancelled_metadata CHECK (
    (status = 'CANCELLED'
      AND cancelled_at IS NOT NULL
      AND cancel_reason IS NOT NULL
      AND char_length(btrim(cancel_reason)) > 0
      AND char_length(cancel_reason) <= 1000)
    OR
    (status <> 'CANCELLED'
      AND cancelled_at IS NULL
      AND cancel_reason IS NULL)
  ),
  CONSTRAINT chk_review_actions_completed_at CHECK (
    (status IN ('PENDING_VERIFICATION', 'VERIFIED')
      AND completed_at IS NOT NULL)
    OR
    (status IN ('OPEN', 'IN_PROGRESS', 'CANCELLED')
      AND completed_at IS NULL)
  ),
  CONSTRAINT uq_review_actions_review_sequence
    UNIQUE (review_id, org_id, sequence),
  CONSTRAINT fk_review_actions_case_org
    FOREIGN KEY (review_id, org_id)
    REFERENCES public.review_cases(id, org_id)
    ON DELETE NO ACTION,
  CONSTRAINT fk_review_actions_owner_org
    FOREIGN KEY (owner_profile_id, org_id)
    REFERENCES public.profiles(id, org_id)
    ON DELETE NO ACTION,
  CONSTRAINT fk_review_actions_created_by_org
    FOREIGN KEY (created_by_profile_id, org_id)
    REFERENCES public.profiles(id, org_id)
    ON DELETE NO ACTION,
  CONSTRAINT fk_review_actions_verified_by_org
    FOREIGN KEY (verified_by_profile_id, org_id)
    REFERENCES public.profiles(id, org_id)
    ON DELETE NO ACTION
);

CREATE INDEX idx_review_actions_org_review
  ON public.review_actions(org_id, review_id);
CREATE INDEX idx_review_actions_org_owner_status
  ON public.review_actions(org_id, owner_profile_id, status);
CREATE INDEX idx_review_actions_org_status_due_date
  ON public.review_actions(org_id, status, due_date);

-- ============ 2. review_actions RLS + grants ============
ALTER TABLE public.review_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "review_actions_select_org_active"
  ON public.review_actions
  FOR SELECT TO authenticated
  USING (
    org_id::text = public.auth_org_id()
    AND public.auth_profile_id() IS NOT NULL
  );

REVOKE ALL ON public.review_actions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.review_actions TO authenticated;

-- ============ 3. audit entity_type ACTION ============
ALTER TABLE public.review_audit_logs
  DROP CONSTRAINT chk_review_audit_entity_type;

ALTER TABLE public.review_audit_logs
  ADD CONSTRAINT chk_review_audit_entity_type CHECK (
    entity_type IN ('REVIEW', 'TYPE_DETAILS', 'MEMBER', 'ASSIGNMENT', 'ACTION')
  );

-- ============ 4. profile directory ACTION_OWNER ============
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

  IF p_purpose IS NULL OR p_purpose NOT IN ('MEMBER', 'ASSIGNMENT', 'ACTION_OWNER') THEN
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
        OR (p_purpose IN ('ASSIGNMENT', 'ACTION_OWNER') AND p.role <> 'viewer')
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

-- ============ 5. participant directory action references ============
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
    UNION
    SELECT owner_profile_id AS profile_id
      FROM public.review_actions ra
      WHERE ra.review_id = p_review_id
        AND ra.org_id = v_actor_org_id
    UNION
    SELECT created_by_profile_id AS profile_id
      FROM public.review_actions ra
      WHERE ra.review_id = p_review_id
        AND ra.org_id = v_actor_org_id
    UNION
    SELECT verified_by_profile_id AS profile_id
      FROM public.review_actions ra
      WHERE ra.review_id = p_review_id
        AND ra.org_id = v_actor_org_id
        AND ra.verified_by_profile_id IS NOT NULL
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
