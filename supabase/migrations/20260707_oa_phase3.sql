-- ===== OA Phase 3: Analytics, A/B Testing, Monthly Cadence =====

CREATE TABLE IF NOT EXISTS article_experiments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id uuid REFERENCES wechat_articles(id),
  experiment_type text NOT NULL DEFAULT 'title',
  variant_a text NOT NULL,
  variant_b text NOT NULL,
  metric_type text DEFAULT 'read_count',
  winner_variant text,
  status text DEFAULT 'running',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS article_analytics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id uuid REFERENCES wechat_articles(id),
  read_count int DEFAULT 0,
  share_count int DEFAULT 0,
  like_count int DEFAULT 0,
  favorite_count int DEFAULT 0,
  message_count int DEFAULT 0,
  lead_count int DEFAULT 0,
  imported_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS monthly_cadences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  month text NOT NULL,
  target_count int DEFAULT 6,
  generated_count int DEFAULT 0,
  published_count int DEFAULT 0,
  status text DEFAULT 'planning',
  auto_generated_plan jsonb DEFAULT '[]',
  created_at timestamptz DEFAULT now()
);

COMMENT ON TABLE article_experiments IS '文章A/B实验';
COMMENT ON TABLE article_analytics IS '文章分析数据';
COMMENT ON TABLE monthly_cadences IS '月度内容节奏计划';
