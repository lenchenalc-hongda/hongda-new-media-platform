-- 宏达项目复盘与改善中心 - Phase 2 Policy Role Hardening
-- Purpose: tighten Migration 1 policies from default PUBLIC to authenticated.
-- Method: ALTER POLICY ... TO authenticated; no DROP/RECREATE.
-- Business USING / WITH CHECK / cmd logic is not changed.

BEGIN;

-- organizations
ALTER POLICY "organizations_select_own" ON organizations TO authenticated;
ALTER POLICY "organizations_update_admin_own" ON organizations TO authenticated;

-- review_dict_items
ALTER POLICY "review_dict_items_select" ON review_dict_items TO authenticated;
ALTER POLICY "review_dict_items_insert_org_admin" ON review_dict_items TO authenticated;

-- review_cases
ALTER POLICY "review_cases_select_org" ON review_cases TO authenticated;
ALTER POLICY "review_cases_insert" ON review_cases TO authenticated;

-- review_type_details
ALTER POLICY "review_type_details_select_org" ON review_type_details TO authenticated;
ALTER POLICY "review_type_details_insert_draft" ON review_type_details TO authenticated;
ALTER POLICY "review_type_details_delete_draft" ON review_type_details TO authenticated;

-- review_members
ALTER POLICY "review_members_select_org" ON review_members TO authenticated;
ALTER POLICY "review_members_insert_draft" ON review_members TO authenticated;
ALTER POLICY "review_members_delete_draft" ON review_members TO authenticated;

COMMIT;
