-- ============================================================
-- READ-ONLY IMPACT AUDIT — 001_initial_schema.sql 生产库影响评估
-- 只读检查，不创建/修改/删除任何对象，不读取业务数据。
-- 仅使用 SELECT + information_schema / pg_catalog 元数据视图。
-- ============================================================

-- ------------------------------------------------------------
-- 1) 001 涉及的 16 张表：当前是否存在 + 是否启用 RLS
--    （注意：只反映当前状态，无法判断表是 001 新建还是之前已存在）
-- ------------------------------------------------------------
WITH target(tbl) AS (
  VALUES
    ('organizations'), ('profiles'), ('accounts'), ('account_rules'),
    ('topics'), ('scripts'), ('posts'), ('post_metrics'),
    ('reviews'), ('viral_teardowns'), ('leads'), ('lead_interactions'),
    ('knowledge_cards'), ('media_assets'), ('tasks'), ('ai_runs')
),
-- 只允许 public schema 的普通表/分区表进入存在性判断，
-- 避免其他 schema 同名对象导致误判 PRESENT
public_tables AS (
  SELECT c.relname,
         c.relrowsecurity,
         c.relforcerowsecurity
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind IN ('r', 'p')
)
SELECT t.tbl AS table_name,
       CASE WHEN pt.relname IS NOT NULL THEN 'PRESENT' ELSE 'MISSING' END AS table_status,
       COALESCE(pt.relrowsecurity, false) AS rls_enabled,
       COALESCE(pt.relforcerowsecurity, false) AS rls_forced
FROM target t
LEFT JOIN public_tables pt ON pt.relname = t.tbl
ORDER BY t.tbl;

-- ------------------------------------------------------------
-- 2) 16 张表当前所有 RLS policy
-- ------------------------------------------------------------
SELECT DISTINCT schemaname, tablename, policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'organizations','profiles','accounts','account_rules','topics','scripts',
    'posts','post_metrics','reviews','viral_teardowns','leads','lead_interactions',
    'knowledge_cards','media_assets','tasks','ai_runs'
  )
ORDER BY tablename, policyname;

-- ------------------------------------------------------------
-- 3) 是否存在 001 创建的 org_isolation policy（仅在 accounts 上）
-- ------------------------------------------------------------
SELECT DISTINCT schemaname, tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public' AND policyname = 'org_isolation'
ORDER BY tablename;

-- ------------------------------------------------------------
-- 4) 001 创建的 41 个 index 是否当前存在
-- ------------------------------------------------------------
SELECT schemaname, tablename, indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname IN (
    'idx_profiles_org_id','idx_profiles_user_id','idx_profiles_role',
    'idx_accounts_org_id','idx_accounts_platform','idx_accounts_status',
    'idx_topics_org_id','idx_topics_account_id','idx_topics_status',
    'idx_topics_priority','idx_topics_content_type','idx_topics_created_at',
    'idx_scripts_org_id','idx_scripts_account_id','idx_scripts_topic_id','idx_scripts_status',
    'idx_posts_org_id','idx_posts_account_id','idx_posts_platform','idx_posts_publish_date','idx_posts_status',
    'idx_post_metrics_org_id','idx_post_metrics_post_id','idx_post_metrics_metric_date',
    'idx_reviews_org_id','idx_reviews_post_id',
    'idx_leads_org_id','idx_leads_source_account_id','idx_leads_status',
    'idx_leads_lead_grade','idx_leads_assigned_to','idx_leads_created_at',
    'idx_lead_interactions_lead_id',
    'idx_knowledge_cards_org_id','idx_knowledge_cards_category',
    'idx_viral_teardowns_org_id','idx_viral_teardowns_suitable_account_id',
    'idx_media_assets_related',
    'idx_tasks_assignee',
    'idx_ai_runs_org_id','idx_ai_runs_run_type'
  )
ORDER BY indexname;

-- ------------------------------------------------------------
-- 5) 001 不包含 function / trigger。
--    以下仅确认 public schema 当前是否存在任何 function / trigger
--    （用于判断 001 是否在真实库留下了超出预期的对象）
-- ------------------------------------------------------------
SELECT n.nspname AS schema_name,
       p.proname AS function_name,
       pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
ORDER BY p.proname;

SELECT event_object_schema, event_object_table, trigger_name, action_timing, event_manipulation
FROM information_schema.triggers
WHERE trigger_schema = 'public'
ORDER BY event_object_table, trigger_name;

-- ------------------------------------------------------------
-- 6) profiles / organizations / accounts 核心状态汇总
-- ------------------------------------------------------------
SELECT c.relname AS table_name,
       c.relrowsecurity AS rls_enabled,
       (SELECT count(*) FROM pg_policies p
         WHERE p.schemaname = 'public' AND p.tablename = c.relname) AS policy_count
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r'
  AND c.relname IN ('profiles','organizations','accounts')
ORDER BY c.relname;
