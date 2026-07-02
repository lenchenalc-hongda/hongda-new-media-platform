-- 宏达新媒体作战中台 - 数据库初始化脚本
-- 适用：Supabase PostgreSQL

-- 1. organizations 组织表
CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. profiles 用户档案表（扩展Supabase Auth）
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id),
  full_name TEXT,
  email TEXT,
  role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin', 'manager', 'operator', 'sales', 'viewer')),
  department TEXT,
  avatar_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. accounts 账号表
CREATE TABLE IF NOT EXISTS accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT 'weixin' CHECK (platform IN ('weixin', 'douyin', 'other')),
  owner_id UUID REFERENCES profiles(id),
  persona TEXT,
  positioning TEXT,
  target_audience TEXT,
  content_style TEXT,
  main_content_types TEXT[] DEFAULT '{}',
  conversion_goal TEXT,
  dos TEXT,
  donts TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. account_rules 账号规则表
CREATE TABLE IF NOT EXISTS account_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  rule_type TEXT NOT NULL,
  rule_content TEXT NOT NULL,
  example_good TEXT,
  example_bad TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. topics 选题表
CREATE TABLE IF NOT EXISTS topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  account_id UUID NOT NULL REFERENCES accounts(id),
  title TEXT NOT NULL,
  content_type TEXT NOT NULL DEFAULT 'other' CHECK (content_type IN ('product','process','case','qa','factory','industry','tutorial','other')),
  target_audience TEXT,
  customer_pain TEXT,
  product_or_process TEXT,
  source TEXT,
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('urgent','high','medium','low')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','in_production','published','archived')),
  conversion_goal TEXT,
  notes TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. scripts 脚本表
CREATE TABLE IF NOT EXISTS scripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  topic_id UUID REFERENCES topics(id),
  account_id UUID REFERENCES accounts(id),
  title TEXT NOT NULL,
  hook TEXT,
  main_script TEXT,
  shot_list JSONB DEFAULT '[]',
  subtitle_points TEXT,
  cover_text TEXT,
  comment_reply TEXT,
  private_message_cta TEXT,
  risk_notes TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','revised','used')),
  ai_meta JSONB,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. posts 发布记录表
CREATE TABLE IF NOT EXISTS posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  account_id UUID NOT NULL REFERENCES accounts(id),
  script_id UUID REFERENCES scripts(id),
  platform TEXT NOT NULL DEFAULT 'weixin' CHECK (platform IN ('weixin','douyin','other')),
  post_url TEXT,
  publish_date TIMESTAMPTZ,
  title TEXT,
  content_type TEXT CHECK (content_type IN ('product','process','case','qa','factory','industry','tutorial','other')),
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','filming','editing','published','reviewed')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. post_metrics 视频数据表
CREATE TABLE IF NOT EXISTS post_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  views INTEGER NOT NULL DEFAULT 0,
  completion_rate DECIMAL(5,4) NOT NULL DEFAULT 0,
  likes INTEGER NOT NULL DEFAULT 0,
  comments INTEGER NOT NULL DEFAULT 0,
  shares INTEGER NOT NULL DEFAULT 0,
  favorites INTEGER NOT NULL DEFAULT 0,
  followers_gained INTEGER NOT NULL DEFAULT 0,
  private_messages INTEGER NOT NULL DEFAULT 0,
  leads_count INTEGER NOT NULL DEFAULT 0,
  qualified_leads_count INTEGER NOT NULL DEFAULT 0,
  metric_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. reviews 复盘表
CREATE TABLE IF NOT EXISTS reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  summary TEXT,
  what_worked TEXT,
  what_failed TEXT,
  next_optimization TEXT,
  ai_review JSONB,
  human_review TEXT,
  is_template BOOLEAN NOT NULL DEFAULT FALSE,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 10. viral_teardowns 爆款拆解表
CREATE TABLE IF NOT EXISTS viral_teardowns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  platform TEXT NOT NULL DEFAULT 'weixin' CHECK (platform IN ('weixin','douyin','other')),
  source_url TEXT,
  source_account TEXT,
  title TEXT NOT NULL,
  cover_text TEXT,
  video_theme TEXT,
  hook TEXT,
  target_audience TEXT,
  pain_point TEXT,
  structure TEXT,
  trust_elements TEXT,
  conversion_action TEXT,
  learnable_points TEXT,
  not_suitable_points TEXT,
  adapted_topics JSONB DEFAULT '[]',
  suitable_account_id UUID REFERENCES accounts(id),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','in_production','published','archived')),
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 11. leads 线索表
CREATE TABLE IF NOT EXISTS leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  source_platform TEXT CHECK (source_platform IN ('weixin','douyin','other')),
  source_account_id UUID REFERENCES accounts(id),
  source_post_id UUID REFERENCES posts(id),
  customer_name TEXT,
  wechat TEXT,
  phone TEXT,
  company TEXT,
  region TEXT,
  product TEXT,
  material TEXT,
  quantity TEXT,
  requirement_type TEXT CHECK (requirement_type IN ('huamo','processing','equipment','process_consult','unclear')),
  product_images TEXT[] DEFAULT '{}',
  artwork_requirement TEXT,
  test_requirement TEXT,
  is_urgent BOOLEAN NOT NULL DEFAULT FALSE,
  current_process TEXT,
  pain_points TEXT,
  lead_score INTEGER NOT NULL DEFAULT 0,
  lead_grade TEXT CHECK (lead_grade IN ('A','B','C','D')),
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','contacted','qualified','negotiating','converted','lost','closed')),
  assigned_to UUID REFERENCES profiles(id),
  next_action TEXT,
  next_follow_up_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 12. lead_interactions 线索互动表
CREATE TABLE IF NOT EXISTS lead_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,
  customer_message TEXT,
  team_reply TEXT,
  ai_suggestion TEXT,
  next_action TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 13. knowledge_cards 知识卡表
CREATE TABLE IF NOT EXISTS knowledge_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  title TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('company','process','material','equipment','faq','persona','viral','review','sales','risk')),
  applicable_accounts UUID[] DEFAULT '{}',
  applicable_content_types TEXT[] DEFAULT '{}',
  customer_type TEXT,
  is_external_allowed BOOLEAN NOT NULL DEFAULT TRUE,
  core_conclusion TEXT,
  plain_explanation TEXT,
  customer_questions TEXT,
  new_media_expression TEXT,
  dont_say TEXT,
  topic_ideas TEXT,
  script_angles TEXT,
  owner TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 14. media_assets 媒体资源表
CREATE TABLE IF NOT EXISTS media_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  related_type TEXT NOT NULL,
  related_id UUID,
  file_url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  description TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 15. tasks 任务表
CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  title TEXT NOT NULL,
  description TEXT,
  related_type TEXT NOT NULL CHECK (related_type IN ('account','topic','script','post','lead','review')),
  related_id UUID,
  assignee_id UUID REFERENCES profiles(id),
  status TEXT NOT NULL DEFAULT 'pending',
  due_date DATE,
  priority INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 16. ai_runs AI调用记录表
CREATE TABLE IF NOT EXISTS ai_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  run_type TEXT NOT NULL,
  input JSONB,
  output JSONB,
  model TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ========== INDEXES ==========
CREATE INDEX idx_profiles_org_id ON profiles(org_id);
CREATE INDEX idx_profiles_user_id ON profiles(user_id);
CREATE INDEX idx_profiles_role ON profiles(role);

CREATE INDEX idx_accounts_org_id ON accounts(org_id);
CREATE INDEX idx_accounts_platform ON accounts(platform);
CREATE INDEX idx_accounts_status ON accounts(status);

CREATE INDEX idx_topics_org_id ON topics(org_id);
CREATE INDEX idx_topics_account_id ON topics(account_id);
CREATE INDEX idx_topics_status ON topics(status);
CREATE INDEX idx_topics_priority ON topics(priority);
CREATE INDEX idx_topics_content_type ON topics(content_type);
CREATE INDEX idx_topics_created_at ON topics(created_at);

CREATE INDEX idx_scripts_org_id ON scripts(org_id);
CREATE INDEX idx_scripts_account_id ON scripts(account_id);
CREATE INDEX idx_scripts_topic_id ON scripts(topic_id);
CREATE INDEX idx_scripts_status ON scripts(status);

CREATE INDEX idx_posts_org_id ON posts(org_id);
CREATE INDEX idx_posts_account_id ON posts(account_id);
CREATE INDEX idx_posts_platform ON posts(platform);
CREATE INDEX idx_posts_publish_date ON posts(publish_date);
CREATE INDEX idx_posts_status ON posts(status);

CREATE INDEX idx_post_metrics_org_id ON post_metrics(org_id);
CREATE INDEX idx_post_metrics_post_id ON post_metrics(post_id);
CREATE INDEX idx_post_metrics_metric_date ON post_metrics(metric_date);

CREATE INDEX idx_reviews_org_id ON reviews(org_id);
CREATE INDEX idx_reviews_post_id ON reviews(post_id);

CREATE INDEX idx_leads_org_id ON leads(org_id);
CREATE INDEX idx_leads_source_account_id ON leads(source_account_id);
CREATE INDEX idx_leads_status ON leads(status);
CREATE INDEX idx_leads_lead_grade ON leads(lead_grade);
CREATE INDEX idx_leads_assigned_to ON leads(assigned_to);
CREATE INDEX idx_leads_created_at ON leads(created_at);

CREATE INDEX idx_lead_interactions_lead_id ON lead_interactions(lead_id);

CREATE INDEX idx_knowledge_cards_org_id ON knowledge_cards(org_id);
CREATE INDEX idx_knowledge_cards_category ON knowledge_cards(category);

CREATE INDEX idx_viral_teardowns_org_id ON viral_teardowns(org_id);
CREATE INDEX idx_viral_teardowns_suitable_account_id ON viral_teardowns(suitable_account_id);

CREATE INDEX idx_media_assets_related ON media_assets(related_type, related_id);
CREATE INDEX idx_tasks_assignee ON tasks(assignee_id);
CREATE INDEX idx_ai_runs_org_id ON ai_runs(org_id);
CREATE INDEX idx_ai_runs_run_type ON ai_runs(run_type);

-- ========== RLS POLICIES (基础) ==========
-- 注意：以下为RLS策略模板，需要在Supabase中启用行级安全后生效
-- 实际部署时需要根据角色细粒度配置

-- 启用行级安全
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE scripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE viral_teardowns ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE media_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_runs ENABLE ROW LEVEL SECURITY;

-- 策略：用户只能访问自己组织的数据
-- admin可以访问所有数据
-- manager可以访问所有业务数据
-- operator可以访问内容、账号、选题、脚本、复盘、线索
-- sales只能访问分配给自己的线索
-- viewer只读

-- 以下为示例策略（按需调整）
CREATE POLICY org_isolation ON accounts
  FOR ALL USING (
    org_id IN (
      SELECT org_id FROM profiles WHERE user_id = auth.uid()
    )
  );

-- 对其他表重复类似策略
