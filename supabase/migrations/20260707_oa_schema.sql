-- ===== 公众号门户 Schema =====

CREATE TABLE IF NOT EXISTS wechat_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  article_type text NOT NULL DEFAULT '知识解释类',
  header_style text,
  body_style text,
  cta_style text,
  footer_style text,
  is_default boolean DEFAULT false,
  layout_json jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wechat_articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  subtitle text,
  summary text,
  article_type text NOT NULL DEFAULT '知识解释类',
  column_name text,
  cover_asset_id text,
  template_id uuid REFERENCES wechat_templates(id),
  body_blocks jsonb DEFAULT '[]',
  body_markdown text,
  source_knowledge_card_ids uuid[] DEFAULT '{}',
  holiday_tag text,
  schedule_at timestamptz,
  publish_status text DEFAULT 'draft',
  reviewer_id uuid,
  risk_level text DEFAULT '低',
  risk_notes text[] DEFAULT '{}',
  word_count int DEFAULT 0,
  estimated_read_time int DEFAULT 0,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS publish_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_type text NOT NULL DEFAULT 'wechat_oa',
  entity_type text NOT NULL DEFAULT 'article',
  entity_id uuid NOT NULL,
  schedule_at timestamptz,
  job_status text DEFAULT 'pending',
  retry_count int DEFAULT 0,
  mock_publish_id text,
  last_error text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

COMMENT ON TABLE wechat_templates IS '公众号文章模板';
COMMENT ON TABLE wechat_articles IS '公众号文章';
COMMENT ON TABLE publish_jobs IS '发布任务队列';
