-- 宏达新媒体作战中台 - 种子数据
-- 适用于首次部署后的数据初始化

-- 插入默认组织
INSERT INTO organizations (id, name, description) VALUES
  ('org_001', '广东宏达印业有限公司', '专业热转印19年，服务客户超过500家');
  
-- 插入演示用户（需要先通过Supabase Auth创建用户）
-- placeholder：实际部署时替换为真实auth.uid()

-- 插入账号
INSERT INTO accounts (id, org_id, name, platform, persona, positioning, target_audience, content_style, main_content_types, conversion_goal, dos, donts, status) VALUES
  ('a1', 'org_001', '老板讲工艺号', 'weixin', '懂工艺的工厂老板', '用真实工厂经验讲清楚热转印、材料判断和客户避坑', '有热转印需求的中小企业采购、研发', '专业、接地气、少废话、案例导向', '{process,qa}', '咨询打样、建立信任', '讲真实案例、用工厂画面、有数据', '不要空谈理论、不要过度承诺', 'active'),
  ('a2', 'org_001', '工厂实拍号', 'weixin', '车间实拍员', '展示宏达工厂、设备、生产过程、打样过程', '需要看工厂实力的潜在客户', '真实、直观、画面优先', '{factory,product}', '建立信任、引导咨询', '多拍机器运转、展示品控流程', '不要过度剪辑、不要虚假内容', 'active'),
  ('a3', 'org_001', '案例展示号', 'weixin', '业务顾问', '用客户案例讲不同产品怎么选工艺', '有明确产品需要判断工艺的客户', '案例化、结果导向、适合转化', '{case,product}', '获取产品需求和样品需求', '前后对比、客户原话、工艺细节', '不要泄露客户信息、不要夸大效果', 'active'),
  ('a4', 'org_001', '客户问答号', 'douyin', '新媒体客服/工艺顾问', '回答客户最常见问题：价格、材质、附着力、小批量、打样', '抖音上的潜在小客户、初创品牌', '短平快、有钩子、有追问', '{qa,tutorial}', '引导私信咨询', '快速给答案、引导互动', '不要回复太慢、不要给模糊答案', 'active');

-- 插入知识卡（部分示例）
INSERT INTO knowledge_cards (id, org_id, title, category, applicable_accounts, core_conclusion, plain_explanation, is_external_allowed) VALUES
  ('k1', 'org_001', '宏达印业公司介绍', 'company', '{a1,a2,a3,a4}', '宏达印业成立于2005年，专业热转印19年', '我们是做热转印的老厂', TRUE),
  ('k2', 'org_001', '热转印适用材质', 'material', '{a1,a4}', 'ABS、PP、PC、PS、不锈钢等硬度较高的材质适合热转印', '不是所有塑料都能热转印', TRUE),
  ('k3', 'org_001', '关于价格的话术规则', 'risk', '{a1,a4}', '价格取决于数量、材质、印刷面积、颜色数', '不同产品价格差别很大', TRUE);
