-- ===== 测试用户 Profile 初始化模板（人工执行） =====
-- 用途：为 Supabase Auth 测试用户创建 profiles 记录。
-- 仅用于 Development / Preview。禁止用于 Production。
-- 执行前请人工替换 <TEST_EMAIL> 等占位符。密码不写入本文件。

-- 1. 先在 Supabase Dashboard: Authentication → Users 创建测试用户
--    记录该用户的 auth.users.id（可从 SQL 查询获得）。

-- 2. 用邮箱查询真实 auth.users.id，避免手工复制 UUID：
--    (在 Supabase SQL Editor 执行)
--    SELECT id, email FROM auth.users WHERE email = '<TEST_EMAIL>';

-- 3. 创建 profile（角色可按需改为 admin / manager / viewer）：
--    INSERT INTO profiles (user_id, org_id, full_name, email, role, department, is_active)
--    SELECT
--      u.id,
--      'org_001',
--      '<TEST_FULL_NAME>',
--      u.email,
--      '<TEST_ROLE>',            -- 例如 'admin' / 'viewer' / 'manager'
--      '<TEST_DEPARTMENT>',      -- 例如 '测试部'
--      true
--    FROM auth.users u
--    WHERE u.email = '<TEST_EMAIL>'
--    ON CONFLICT (user_id) DO NOTHING;

-- 4. 验证：
--    SELECT p.user_id, p.full_name, p.email, p.role, p.department, p.is_active
--    FROM profiles p
--    JOIN auth.users u ON u.id = p.user_id
--    WHERE u.email = '<TEST_EMAIL>';
