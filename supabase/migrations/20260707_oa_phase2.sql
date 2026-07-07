-- ===== OA Phase 2: Integration & Publishing =====

CREATE TABLE IF NOT EXISTS integration_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL DEFAULT 'wechat_oa',
  app_id text NOT NULL,
  secret_ref text,
  account_name text,
  scopes text[] DEFAULT '{}',
  status text DEFAULT 'disconnected',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS token_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL DEFAULT 'wechat_oa',
  access_token text NOT NULL,
  expires_at timestamptz NOT NULL,
  refreshed_at timestamptz DEFAULT now(),
  UNIQUE(provider)
);

-- Extend wechat_articles with platform fields
ALTER TABLE wechat_articles ADD COLUMN IF NOT EXISTS external_draft_id text;
ALTER TABLE wechat_articles ADD COLUMN IF NOT EXISTS external_publish_id text;
ALTER TABLE wechat_articles ADD COLUMN IF NOT EXISTS external_status text;
ALTER TABLE wechat_articles ADD COLUMN IF NOT EXISTS published_at timestamptz;
ALTER TABLE wechat_articles ADD COLUMN IF NOT EXISTS cover_media_id text;
ALTER TABLE wechat_articles ADD COLUMN IF NOT EXISTS content_media_ids jsonb DEFAULT '[]';

COMMENT ON TABLE integration_connections IS '第三方平台连接配置';
COMMENT ON TABLE token_cache IS '平台 Access Token 缓存';
COMMENT ON COLUMN wechat_articles.external_draft_id IS '微信草稿箱 media_id';
COMMENT ON COLUMN wechat_articles.external_publish_id IS '微信发布任务 publish_id';
COMMENT ON COLUMN wechat_articles.external_status IS '微信端状态';
COMMENT ON COLUMN wechat_articles.cover_media_id IS '微信端封面图片 media_id';
COMMENT ON COLUMN wechat_articles.content_media_ids IS '微信端正文素材 media_id 列表';
