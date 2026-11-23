-- WOS P8 | EPHEMERAL SUPABASE BRANCH ONLY | 2026-11-09
-- Source: immutable CI legacy extra-column/policy allowlist.
-- Never apply to Production or shared QA; this deliberately reconciles only
-- historical objects on an empty, broken-auto-replay development branch.
-- Guard: zero applied history + 67 public tables + zero users/customers/orders.
BEGIN;
DO $wos_p8_guard$
BEGIN
 IF (SELECT count(*) FROM supabase_migrations.schema_migrations) <> 0
    OR (SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE') <> 67
    OR (SELECT count(*) FROM auth.users) <> 0
    OR (SELECT count(*) FROM public.organizations) <> 0
    OR (SELECT count(*) FROM public.profiles) <> 0
    OR (SELECT count(*) FROM public.accounts) <> 0
    OR (SELECT count(*) FROM public.leads) <> 0
    OR (SELECT count(*) FROM public.posts) <> 0
    OR (SELECT count(*) FROM public.topics) <> 0
    OR (SELECT count(*) FROM public.scripts) <> 0
    OR (SELECT count(*) FROM public.knowledge_cards) <> 0
    OR (SELECT count(*) FROM public.site_data) <> 0
    OR (SELECT count(*) FROM storage.objects) <> 0
    OR (SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'wos_%') <> 0
 THEN RAISE EXCEPTION 'WOS_P8_EMPTY_BROKEN_AUTO_REPLAY_BRANCH_ONLY'; END IF;
 IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='knowledge_cards' AND column_name='applicable_customers') THEN RAISE EXCEPTION 'WOS_P8_UNEXPECTED_MISSING_FIELD'; END IF;
 IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='knowledge_cards' AND column_name='applicable_platforms') THEN RAISE EXCEPTION 'WOS_P8_UNEXPECTED_MISSING_FIELD'; END IF;
 IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='knowledge_cards' AND column_name='card_type') THEN RAISE EXCEPTION 'WOS_P8_UNEXPECTED_MISSING_FIELD'; END IF;
 IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='knowledge_cards' AND column_name='content_scope') THEN RAISE EXCEPTION 'WOS_P8_UNEXPECTED_MISSING_FIELD'; END IF;
 IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='knowledge_cards' AND column_name='forbidden_expressions') THEN RAISE EXCEPTION 'WOS_P8_UNEXPECTED_MISSING_FIELD'; END IF;
 IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='knowledge_cards' AND column_name='knowledge_status') THEN RAISE EXCEPTION 'WOS_P8_UNEXPECTED_MISSING_FIELD'; END IF;
 IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='knowledge_cards' AND column_name='last_updated_at') THEN RAISE EXCEPTION 'WOS_P8_UNEXPECTED_MISSING_FIELD'; END IF;
 IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='knowledge_cards' AND column_name='linked_script_ids') THEN RAISE EXCEPTION 'WOS_P8_UNEXPECTED_MISSING_FIELD'; END IF;
 IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='knowledge_cards' AND column_name='linked_topic_ids') THEN RAISE EXCEPTION 'WOS_P8_UNEXPECTED_MISSING_FIELD'; END IF;
 IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='knowledge_cards' AND column_name='owner_id') THEN RAISE EXCEPTION 'WOS_P8_UNEXPECTED_MISSING_FIELD'; END IF;
 IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='knowledge_cards' AND column_name='reviewer_id') THEN RAISE EXCEPTION 'WOS_P8_UNEXPECTED_MISSING_FIELD'; END IF;
 IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='knowledge_cards' AND column_name='risky_expressions') THEN RAISE EXCEPTION 'WOS_P8_UNEXPECTED_MISSING_FIELD'; END IF;
 IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='knowledge_cards' AND column_name='safer_alternatives') THEN RAISE EXCEPTION 'WOS_P8_UNEXPECTED_MISSING_FIELD'; END IF;
 IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='knowledge_cards' AND column_name='usage_count') THEN RAISE EXCEPTION 'WOS_P8_UNEXPECTED_MISSING_FIELD'; END IF;
 IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='scripts' AND column_name='grade') THEN RAISE EXCEPTION 'WOS_P8_UNEXPECTED_MISSING_FIELD'; END IF;
 IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='scripts' AND column_name='recommended_status') THEN RAISE EXCEPTION 'WOS_P8_UNEXPECTED_MISSING_FIELD'; END IF;
 IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='scripts' AND column_name='rewrite_suggestions') THEN RAISE EXCEPTION 'WOS_P8_UNEXPECTED_MISSING_FIELD'; END IF;
 IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='scripts' AND column_name='risk_level') THEN RAISE EXCEPTION 'WOS_P8_UNEXPECTED_MISSING_FIELD'; END IF;
 IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='scripts' AND column_name='risk_points') THEN RAISE EXCEPTION 'WOS_P8_UNEXPECTED_MISSING_FIELD'; END IF;
 IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='scripts' AND column_name='safer_expressions') THEN RAISE EXCEPTION 'WOS_P8_UNEXPECTED_MISSING_FIELD'; END IF;
 IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='scripts' AND column_name='score') THEN RAISE EXCEPTION 'WOS_P8_UNEXPECTED_MISSING_FIELD'; END IF;
 IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='scripts' AND column_name='score_detail') THEN RAISE EXCEPTION 'WOS_P8_UNEXPECTED_MISSING_FIELD'; END IF;
 IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='scripts' AND column_name='strengths') THEN RAISE EXCEPTION 'WOS_P8_UNEXPECTED_MISSING_FIELD'; END IF;
 IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='scripts' AND column_name='weaknesses') THEN RAISE EXCEPTION 'WOS_P8_UNEXPECTED_MISSING_FIELD'; END IF;
 IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='topics' AND column_name='case_refs') THEN RAISE EXCEPTION 'WOS_P8_UNEXPECTED_MISSING_FIELD'; END IF;
 IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='topics' AND column_name='comment_guidance') THEN RAISE EXCEPTION 'WOS_P8_UNEXPECTED_MISSING_FIELD'; END IF;
 IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='topics' AND column_name='content_angle') THEN RAISE EXCEPTION 'WOS_P8_UNEXPECTED_MISSING_FIELD'; END IF;
 IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='topics' AND column_name='content_purpose') THEN RAISE EXCEPTION 'WOS_P8_UNEXPECTED_MISSING_FIELD'; END IF;
 IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='topics' AND column_name='core_point') THEN RAISE EXCEPTION 'WOS_P8_UNEXPECTED_MISSING_FIELD'; END IF;
 IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='topics' AND column_name='faq_refs') THEN RAISE EXCEPTION 'WOS_P8_UNEXPECTED_MISSING_FIELD'; END IF;
 IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='topics' AND column_name='is_this_week') THEN RAISE EXCEPTION 'WOS_P8_UNEXPECTED_MISSING_FIELD'; END IF;
 IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='topics' AND column_name='knowledge_refs') THEN RAISE EXCEPTION 'WOS_P8_UNEXPECTED_MISSING_FIELD'; END IF;
 IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='topics' AND column_name='last_action') THEN RAISE EXCEPTION 'WOS_P8_UNEXPECTED_MISSING_FIELD'; END IF;
 IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='topics' AND column_name='linked_post_id') THEN RAISE EXCEPTION 'WOS_P8_UNEXPECTED_MISSING_FIELD'; END IF;
 IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='topics' AND column_name='linked_script_id') THEN RAISE EXCEPTION 'WOS_P8_UNEXPECTED_MISSING_FIELD'; END IF;
 IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='topics' AND column_name='logo_risk') THEN RAISE EXCEPTION 'WOS_P8_UNEXPECTED_MISSING_FIELD'; END IF;
 IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='topics' AND column_name='material') THEN RAISE EXCEPTION 'WOS_P8_UNEXPECTED_MISSING_FIELD'; END IF;
 IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='topics' AND column_name='owner_id') THEN RAISE EXCEPTION 'WOS_P8_UNEXPECTED_MISSING_FIELD'; END IF;
 IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='topics' AND column_name='planned_publish_date') THEN RAISE EXCEPTION 'WOS_P8_UNEXPECTED_MISSING_FIELD'; END IF;
 IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='topics' AND column_name='planned_shoot_date') THEN RAISE EXCEPTION 'WOS_P8_UNEXPECTED_MISSING_FIELD'; END IF;
 IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='topics' AND column_name='platform') THEN RAISE EXCEPTION 'WOS_P8_UNEXPECTED_MISSING_FIELD'; END IF;
 IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='topics' AND column_name='privacy_risk') THEN RAISE EXCEPTION 'WOS_P8_UNEXPECTED_MISSING_FIELD'; END IF;
 IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='topics' AND column_name='private_message_action') THEN RAISE EXCEPTION 'WOS_P8_UNEXPECTED_MISSING_FIELD'; END IF;
 IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='topics' AND column_name='product_process') THEN RAISE EXCEPTION 'WOS_P8_UNEXPECTED_MISSING_FIELD'; END IF;
 IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='topics' AND column_name='required_factory_assets') THEN RAISE EXCEPTION 'WOS_P8_UNEXPECTED_MISSING_FIELD'; END IF;
 IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='topics' AND column_name='required_products') THEN RAISE EXCEPTION 'WOS_P8_UNEXPECTED_MISSING_FIELD'; END IF;
 IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='topics' AND column_name='required_shots') THEN RAISE EXCEPTION 'WOS_P8_UNEXPECTED_MISSING_FIELD'; END IF;
 IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='topics' AND column_name='review_refs') THEN RAISE EXCEPTION 'WOS_P8_UNEXPECTED_MISSING_FIELD'; END IF;
 IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='topics' AND column_name='risk_level') THEN RAISE EXCEPTION 'WOS_P8_UNEXPECTED_MISSING_FIELD'; END IF;
 IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='topics' AND column_name='risk_result') THEN RAISE EXCEPTION 'WOS_P8_UNEXPECTED_MISSING_FIELD'; END IF;
 IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='topics' AND column_name='risk_rules') THEN RAISE EXCEPTION 'WOS_P8_UNEXPECTED_MISSING_FIELD'; END IF;
 IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='topics' AND column_name='score_detail') THEN RAISE EXCEPTION 'WOS_P8_UNEXPECTED_MISSING_FIELD'; END IF;
 IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='topics' AND column_name='script_status') THEN RAISE EXCEPTION 'WOS_P8_UNEXPECTED_MISSING_FIELD'; END IF;
 IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='topics' AND column_name='shooting_method') THEN RAISE EXCEPTION 'WOS_P8_UNEXPECTED_MISSING_FIELD'; END IF;
 IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='topics' AND column_name='target_customer') THEN RAISE EXCEPTION 'WOS_P8_UNEXPECTED_MISSING_FIELD'; END IF;
 IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='topics' AND column_name='topic_score') THEN RAISE EXCEPTION 'WOS_P8_UNEXPECTED_MISSING_FIELD'; END IF;
 IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='topics' AND column_name='topic_source') THEN RAISE EXCEPTION 'WOS_P8_UNEXPECTED_MISSING_FIELD'; END IF;
 IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='topics' AND column_name='video_length') THEN RAISE EXCEPTION 'WOS_P8_UNEXPECTED_MISSING_FIELD'; END IF;
 IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='topics' AND column_name='viral_refs') THEN RAISE EXCEPTION 'WOS_P8_UNEXPECTED_MISSING_FIELD'; END IF;
 IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='topics' AND column_name='why_user_watch') THEN RAISE EXCEPTION 'WOS_P8_UNEXPECTED_MISSING_FIELD'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='accounts' AND policyname='Read accounts: admin/manager/operator/viewer') THEN RAISE EXCEPTION 'WOS_P8_UNEXPECTED_MISSING_POLICY'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='accounts' AND policyname='Update accounts: admin/manager') THEN RAISE EXCEPTION 'WOS_P8_UNEXPECTED_MISSING_POLICY'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='accounts' AND policyname='Write accounts: admin only') THEN RAISE EXCEPTION 'WOS_P8_UNEXPECTED_MISSING_POLICY'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='knowledge_cards' AND policyname='Approve knowledge: admin/manager only') THEN RAISE EXCEPTION 'WOS_P8_UNEXPECTED_MISSING_POLICY'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='knowledge_cards' AND policyname='Read knowledge: admin/manager/operator/viewer') THEN RAISE EXCEPTION 'WOS_P8_UNEXPECTED_MISSING_POLICY'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='knowledge_cards' AND policyname='Write knowledge: admin/operator') THEN RAISE EXCEPTION 'WOS_P8_UNEXPECTED_MISSING_POLICY'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='leads' AND policyname='Delete leads: admin only') THEN RAISE EXCEPTION 'WOS_P8_UNEXPECTED_MISSING_POLICY'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='leads' AND policyname='Read leads: admin/manager') THEN RAISE EXCEPTION 'WOS_P8_UNEXPECTED_MISSING_POLICY'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='leads' AND policyname='Update leads: admin/manager') THEN RAISE EXCEPTION 'WOS_P8_UNEXPECTED_MISSING_POLICY'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='leads' AND policyname='Viewer cannot read leads') THEN RAISE EXCEPTION 'WOS_P8_UNEXPECTED_MISSING_POLICY'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='leads' AND policyname='Write leads: admin/operator/sales') THEN RAISE EXCEPTION 'WOS_P8_UNEXPECTED_MISSING_POLICY'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='posts' AND policyname='Read posts: admin/manager/operator/viewer') THEN RAISE EXCEPTION 'WOS_P8_UNEXPECTED_MISSING_POLICY'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='posts' AND policyname='Write posts: admin/operator') THEN RAISE EXCEPTION 'WOS_P8_UNEXPECTED_MISSING_POLICY'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='scripts' AND policyname='Approve scripts: admin/manager') THEN RAISE EXCEPTION 'WOS_P8_UNEXPECTED_MISSING_POLICY'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='scripts' AND policyname='Read scripts: admin/manager/operator/viewer') THEN RAISE EXCEPTION 'WOS_P8_UNEXPECTED_MISSING_POLICY'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='scripts' AND policyname='Write scripts: admin/operator') THEN RAISE EXCEPTION 'WOS_P8_UNEXPECTED_MISSING_POLICY'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='topics' AND policyname='Delete topics: admin only') THEN RAISE EXCEPTION 'WOS_P8_UNEXPECTED_MISSING_POLICY'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='topics' AND policyname='Read topics: admin/manager/operator/viewer') THEN RAISE EXCEPTION 'WOS_P8_UNEXPECTED_MISSING_POLICY'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='topics' AND policyname='Write topics: admin/operator') THEN RAISE EXCEPTION 'WOS_P8_UNEXPECTED_MISSING_POLICY'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='site_data' AND policyname='anyone_insert') THEN RAISE EXCEPTION 'WOS_P8_UNEXPECTED_MISSING_POLICY'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='site_data' AND policyname='anyone_select') THEN RAISE EXCEPTION 'WOS_P8_UNEXPECTED_MISSING_POLICY'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='site_data' AND policyname='anyone_update') THEN RAISE EXCEPTION 'WOS_P8_UNEXPECTED_MISSING_POLICY'; END IF;
END $wos_p8_guard$;
DROP POLICY "Read accounts: admin/manager/operator/viewer" ON public."accounts";
DROP POLICY "Update accounts: admin/manager" ON public."accounts";
DROP POLICY "Write accounts: admin only" ON public."accounts";
DROP POLICY "Approve knowledge: admin/manager only" ON public."knowledge_cards";
DROP POLICY "Read knowledge: admin/manager/operator/viewer" ON public."knowledge_cards";
DROP POLICY "Write knowledge: admin/operator" ON public."knowledge_cards";
DROP POLICY "Delete leads: admin only" ON public."leads";
DROP POLICY "Read leads: admin/manager" ON public."leads";
DROP POLICY "Update leads: admin/manager" ON public."leads";
DROP POLICY "Viewer cannot read leads" ON public."leads";
DROP POLICY "Write leads: admin/operator/sales" ON public."leads";
DROP POLICY "Read posts: admin/manager/operator/viewer" ON public."posts";
DROP POLICY "Write posts: admin/operator" ON public."posts";
DROP POLICY "Approve scripts: admin/manager" ON public."scripts";
DROP POLICY "Read scripts: admin/manager/operator/viewer" ON public."scripts";
DROP POLICY "Write scripts: admin/operator" ON public."scripts";
DROP POLICY "Delete topics: admin only" ON public."topics";
DROP POLICY "Read topics: admin/manager/operator/viewer" ON public."topics";
DROP POLICY "Write topics: admin/operator" ON public."topics";
ALTER POLICY "anyone_insert" ON public.site_data RENAME TO "anon_insert";
ALTER POLICY "anyone_select" ON public.site_data RENAME TO "anon_select";
ALTER POLICY "anyone_update" ON public.site_data RENAME TO "anon_update";
ALTER TABLE public."knowledge_cards" DROP COLUMN "applicable_customers";
ALTER TABLE public."knowledge_cards" DROP COLUMN "applicable_platforms";
ALTER TABLE public."knowledge_cards" DROP COLUMN "card_type";
ALTER TABLE public."knowledge_cards" DROP COLUMN "content_scope";
ALTER TABLE public."knowledge_cards" DROP COLUMN "forbidden_expressions";
ALTER TABLE public."knowledge_cards" DROP COLUMN "knowledge_status";
ALTER TABLE public."knowledge_cards" DROP COLUMN "last_updated_at";
ALTER TABLE public."knowledge_cards" DROP COLUMN "linked_script_ids";
ALTER TABLE public."knowledge_cards" DROP COLUMN "linked_topic_ids";
ALTER TABLE public."knowledge_cards" DROP COLUMN "owner_id";
ALTER TABLE public."knowledge_cards" DROP COLUMN "reviewer_id";
ALTER TABLE public."knowledge_cards" DROP COLUMN "risky_expressions";
ALTER TABLE public."knowledge_cards" DROP COLUMN "safer_alternatives";
ALTER TABLE public."knowledge_cards" DROP COLUMN "usage_count";
ALTER TABLE public."scripts" DROP COLUMN "grade";
ALTER TABLE public."scripts" DROP COLUMN "recommended_status";
ALTER TABLE public."scripts" DROP COLUMN "rewrite_suggestions";
ALTER TABLE public."scripts" DROP COLUMN "risk_level";
ALTER TABLE public."scripts" DROP COLUMN "risk_points";
ALTER TABLE public."scripts" DROP COLUMN "safer_expressions";
ALTER TABLE public."scripts" DROP COLUMN "score";
ALTER TABLE public."scripts" DROP COLUMN "score_detail";
ALTER TABLE public."scripts" DROP COLUMN "strengths";
ALTER TABLE public."scripts" DROP COLUMN "weaknesses";
ALTER TABLE public."topics" DROP COLUMN "case_refs";
ALTER TABLE public."topics" DROP COLUMN "comment_guidance";
ALTER TABLE public."topics" DROP COLUMN "content_angle";
ALTER TABLE public."topics" DROP COLUMN "content_purpose";
ALTER TABLE public."topics" DROP COLUMN "core_point";
ALTER TABLE public."topics" DROP COLUMN "faq_refs";
ALTER TABLE public."topics" DROP COLUMN "is_this_week";
ALTER TABLE public."topics" DROP COLUMN "knowledge_refs";
ALTER TABLE public."topics" DROP COLUMN "last_action";
ALTER TABLE public."topics" DROP COLUMN "linked_post_id";
ALTER TABLE public."topics" DROP COLUMN "linked_script_id";
ALTER TABLE public."topics" DROP COLUMN "logo_risk";
ALTER TABLE public."topics" DROP COLUMN "material";
ALTER TABLE public."topics" DROP COLUMN "owner_id";
ALTER TABLE public."topics" DROP COLUMN "planned_publish_date";
ALTER TABLE public."topics" DROP COLUMN "planned_shoot_date";
ALTER TABLE public."topics" DROP COLUMN "platform";
ALTER TABLE public."topics" DROP COLUMN "privacy_risk";
ALTER TABLE public."topics" DROP COLUMN "private_message_action";
ALTER TABLE public."topics" DROP COLUMN "product_process";
ALTER TABLE public."topics" DROP COLUMN "required_factory_assets";
ALTER TABLE public."topics" DROP COLUMN "required_products";
ALTER TABLE public."topics" DROP COLUMN "required_shots";
ALTER TABLE public."topics" DROP COLUMN "review_refs";
ALTER TABLE public."topics" DROP COLUMN "risk_level";
ALTER TABLE public."topics" DROP COLUMN "risk_result";
ALTER TABLE public."topics" DROP COLUMN "risk_rules";
ALTER TABLE public."topics" DROP COLUMN "score_detail";
ALTER TABLE public."topics" DROP COLUMN "script_status";
ALTER TABLE public."topics" DROP COLUMN "shooting_method";
ALTER TABLE public."topics" DROP COLUMN "target_customer";
ALTER TABLE public."topics" DROP COLUMN "topic_score";
ALTER TABLE public."topics" DROP COLUMN "topic_source";
ALTER TABLE public."topics" DROP COLUMN "video_length";
ALTER TABLE public."topics" DROP COLUMN "viral_refs";
ALTER TABLE public."topics" DROP COLUMN "why_user_watch";
COMMIT;
