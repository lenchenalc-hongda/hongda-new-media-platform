-- ===== RLS Policies =====
-- Enable row-level security on all core tables
-- Each policy checks org_id and role via the auth user's metadata.

-- Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE scripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_cards ENABLE ROW LEVEL SECURITY;

-- ===== Helper function: check if user has a role =====
CREATE OR REPLACE FUNCTION auth_has_role(required_role text)
RETURNS boolean AS $$
  SELECT COALESCE(
    (auth.jwt() -> 'app_metadata' -> 'role')::text = ('"' || required_role || '"')::text,
    false
  );
$$ LANGUAGE sql STABLE;

-- ===== Helper function: user's org_id =====
CREATE OR REPLACE FUNCTION auth_org_id()
RETURNS text AS $$
  SELECT COALESCE(
    (auth.jwt() -> 'app_metadata' -> 'org_id')::text,
    ''
  );
$$ LANGUAGE sql STABLE;

-- ===== Helper function: user's user_id =====
CREATE OR REPLACE FUNCTION auth_user_id()
RETURNS uuid AS $$
  SELECT auth.uid();
$$ LANGUAGE sql STABLE;

-- ==================== PROFILES ====================
CREATE POLICY "Admins can manage all profiles" ON profiles
  FOR ALL USING (auth_has_role('admin'));

CREATE POLICY "Users can read own profile" ON profiles
  FOR SELECT USING (auth_user_id() = user_id);

CREATE POLICY "Managers can read org profiles" ON profiles
  FOR SELECT USING (
    auth_has_role('manager') AND org_id::text = auth_org_id()
  );

-- ==================== ACCOUNTS ====================
CREATE POLICY "Read accounts: admin/manager/operator/viewer" ON accounts
  FOR SELECT USING (
    auth_has_role('admin') OR auth_has_role('manager') OR
    auth_has_role('operator') OR auth_has_role('viewer')
  );

CREATE POLICY "Write accounts: admin only" ON accounts
  FOR ALL USING (auth_has_role('admin'));

CREATE POLICY "Update accounts: admin/manager" ON accounts
  FOR UPDATE USING (auth_has_role('admin') OR auth_has_role('manager'));

-- ==================== TOPICS ====================
CREATE POLICY "Read topics: admin/manager/operator/viewer" ON topics
  FOR SELECT USING (
    auth_has_role('admin') OR auth_has_role('manager') OR
    auth_has_role('operator') OR auth_has_role('viewer')
  );

CREATE POLICY "Write topics: admin/operator" ON topics
  FOR INSERT WITH CHECK (auth_has_role('admin') OR auth_has_role('operator'));

CREATE POLICY "Update topics: admin/manager/operator" ON topics
  FOR UPDATE USING (
    auth_has_role('admin') OR auth_has_role('manager') OR
    (auth_has_role('operator') AND owner_id = auth_user_id())
  );

CREATE POLICY "Delete topics: admin only" ON topics
  FOR DELETE USING (auth_has_role('admin'));

-- ==================== SCRIPTS ====================
CREATE POLICY "Read scripts: admin/manager/operator/viewer" ON scripts
  FOR SELECT USING (
    auth_has_role('admin') OR auth_has_role('manager') OR
    auth_has_role('operator') OR auth_has_role('viewer')
  );

CREATE POLICY "Write scripts: admin/operator" ON scripts
  FOR ALL USING (auth_has_role('admin') OR auth_has_role('operator'));

CREATE POLICY "Approve scripts: admin/manager" ON scripts
  FOR UPDATE USING (
    auth_has_role('admin') OR auth_has_role('manager')
  );

-- ==================== POSTS ====================
CREATE POLICY "Read posts: admin/manager/operator/viewer" ON posts
  FOR SELECT USING (
    auth_has_role('admin') OR auth_has_role('manager') OR
    auth_has_role('operator') OR auth_has_role('viewer')
  );

CREATE POLICY "Write posts: admin/operator" ON posts
  FOR ALL USING (auth_has_role('admin') OR auth_has_role('operator'));

-- ==================== LEADS ====================
CREATE POLICY "Read leads: admin/manager" ON leads
  FOR SELECT USING (
    auth_has_role('admin') OR auth_has_role('manager')
  );

CREATE POLICY "Read own leads: sales" ON leads
  FOR SELECT USING (
    auth_has_role('sales') AND assigned_to = auth_user_id()
  );

CREATE POLICY "Viewer cannot read leads" ON leads
  FOR SELECT USING (NOT auth_has_role('viewer'));

CREATE POLICY "Write leads: admin/operator/sales" ON leads
  FOR INSERT WITH CHECK (
    auth_has_role('admin') OR auth_has_role('operator') OR auth_has_role('sales')
  );

CREATE POLICY "Update leads: admin/manager" ON leads
  FOR UPDATE USING (
    auth_has_role('admin') OR auth_has_role('manager')
  );

CREATE POLICY "Update own assigned leads: sales" ON leads
  FOR UPDATE USING (
    auth_has_role('sales') AND assigned_to = auth_user_id()
  );

CREATE POLICY "Delete leads: admin only" ON leads
  FOR DELETE USING (auth_has_role('admin'));

-- ==================== KNOWLEDGE CARDS ====================
CREATE POLICY "Read knowledge: admin/manager/operator/viewer" ON knowledge_cards
  FOR SELECT USING (
    auth_has_role('admin') OR auth_has_role('manager') OR
    auth_has_role('operator') OR auth_has_role('viewer')
  );

CREATE POLICY "Write knowledge: admin/operator" ON knowledge_cards
  FOR ALL USING (auth_has_role('admin') OR auth_has_role('operator'));

CREATE POLICY "Approve knowledge: admin/manager only" ON knowledge_cards
  FOR UPDATE USING (
    auth_has_role('admin') OR auth_has_role('manager')
  );

-- ==================== COMMENTS ====================
COMMENT ON POLICY "Read own leads: sales" ON leads IS '销售只能看到分配给自己的线索';
COMMENT ON POLICY "Approve scripts: admin/manager" ON scripts IS '只有管理员和管理者可以审批脚本';
COMMENT ON POLICY "Write accounts: admin only" ON accounts IS '只有管理员可以创建/删除账号';
COMMENT ON POLICY "Delete topics: admin only" ON topics IS '只有管理员可以删除选题';
COMMENT ON POLICY "Approve knowledge: admin/manager only" ON knowledge_cards IS '只有管理员和管理者可以确认知识卡';
