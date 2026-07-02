export const CONTENT_TYPES = [
  { value: 'product', label: '产品展示' },
  { value: 'process', label: '工艺讲解' },
  { value: 'case', label: '案例分析' },
  { value: 'qa', label: '问答解惑' },
  { value: 'factory', label: '工厂实拍' },
  { value: 'industry', label: '行业观点' },
  { value: 'tutorial', label: '教程指南' },
  { value: 'other', label: '其他' },
];

// === 选题库中文内容类型 ===
export const TOPIC_CONTENT_TYPES = [
  { value: '工艺科普', label: '工艺科普' },
  { value: '客户避坑', label: '客户避坑' },
  { value: '客户问答', label: '客户问答' },
  { value: '案例拆解', label: '案例拆解' },
  { value: '老板经验', label: '老板经验' },
  { value: '工厂实拍', label: '工厂实拍' },
  { value: '设备展示', label: '设备展示' },
  { value: '材料判断', label: '材料判断' },
  { value: '成本效率', label: '成本效率' },
  { value: '评论区答疑', label: '评论区答疑' },
  { value: '爆款改编', label: '爆款改编' },
  { value: '销售反馈', label: '销售反馈' },
];

// === 选题来源 ===
export const TOPIC_SOURCE_OPTIONS = [
  { value: '客户私信', label: '客户私信' },
  { value: '评论区问题', label: '评论区问题' },
  { value: '销售反馈', label: '销售反馈' },
  { value: '爆款拆解', label: '爆款拆解' },
  { value: '知识库', label: '知识库' },
  { value: '历史高表现视频', label: '历史高表现视频' },
  { value: '老板经验', label: '老板经验' },
  { value: '平台热点', label: '平台热点' },
  { value: '展会客户问题', label: '展会客户问题' },
  { value: '外贸客户问题', label: '外贸客户问题' },
  { value: '手动新增', label: '手动新增' },
];

// === 选题状态 ===
export const TOPIC_STATUSES_NEW = [
  { value: '待审核', label: '待审核', color: 'yellow' },
  { value: '已审核', label: '已审核', color: 'green' },
  { value: '已发布', label: '已发布', color: 'green' },
  { value: '待复盘', label: '待复盘', color: 'yellow' },
  { value: '可复制', label: '可复制', color: 'purple' },
];

// === 选题脚本状态 ===
export const TOPIC_SCRIPT_STATUSES = [
  { value: '未生成', label: '未生成', color: 'gray' },
  { value: '已生成', label: '已生成', color: 'blue' },
  { value: '待审核', label: '待审核', color: 'yellow' },
  { value: '已审核', label: '已审核', color: 'green' },
  { value: '已退回', label: '已退回', color: 'red' },
  { value: '已关联发布', label: '已关联发布', color: 'green' },
];

// === 平台（选题用） ===
export const TOPIC_PLATFORMS = [
  { value: '视频号', label: '视频号' },
  { value: '抖音', label: '抖音' },
  { value: '两者都适合', label: '两者都适合' },
];

// === 优先级 ===
export const TOPIC_PRIORITIES_NEW = [
  { value: '紧急', label: '紧急', color: 'red' },
  { value: '高', label: '高', color: 'red' },
  { value: '中', label: '中', color: 'yellow' },
  { value: '低', label: '低', color: 'gray' },
];

// === AI生成选题入口 ===
export const TOPIC_GENERATE_TYPES = [
  { value: 'from_customer_message', label: '从客户问题生成' },
  { value: 'from_sales_feedback', label: '从销售反馈生成' },
  { value: 'from_teardown', label: '从爆款拆解生成' },
  { value: 'from_knowledge', label: '从知识库生成' },
  { value: 'from_history', label: '从历史高表现视频生成' },
  { value: 'from_comment', label: '从评论区问题生成' },
  { value: 'from_foreign_trade', label: '从外贸客户问题生成' },
  { value: 'batch_weekly', label: '批量生成本周选题' },
];

// === 转化目标 ===
export const CONVERSION_GOALS = [
  { value: '引导私信', label: '引导私信' },
  { value: '发产品图', label: '发产品图片' },
  { value: '免费打样', label: '引导免费打样' },
  { value: '咨询报价', label: '引导报价咨询' },
  { value: '建立信任', label: '建立信任' },
  { value: '科普教育', label: '科普教育' },
  { value: '获取样品需求', label: '获取样品需求' },
  { value: '引导评论互动', label: '引导评论互动' },
  { value: '筛选客户', label: '筛选客户' },
  { value: '品牌认知', label: '品牌认知' },
];

// === 出镜方式 ===
export const SHOOTING_METHODS = [
  { value: '真人出镜讲解', label: '真人出镜讲解' },
  { value: '旁白+画面', label: '旁白+画面' },
  { value: '实操演示', label: '实操演示' },
  { value: '对比实拍', label: '对比实拍' },
  { value: '对话采访', label: '对话采访' },
  { value: '车间实录', label: '车间实录' },
];


export const PLATFORMS = [
  { value: 'weixin', label: '视频号' },
  { value: 'douyin', label: '抖音' },
  { value: 'other', label: '其他' },
];

export const TOPIC_PRIORITIES = [
  { value: 'urgent', label: '紧急', color: 'red' },
  { value: 'high', label: '高', color: 'red' },
  { value: 'medium', label: '中', color: 'yellow' },
  { value: 'low', label: '低', color: 'gray' },
];

export const TOPIC_STATUSES = [
  { value: 'draft', label: '草稿' },
  { value: 'approved', label: '已审核' },
  { value: 'in_production', label: '制作中' },
  { value: 'published', label: '已发布' },
  { value: 'archived', label: '已归档' },
];

export const LEAD_STATUSES = [
  { value: 'new', label: '新线索' },
  { value: 'contacted', label: '已联系' },
  { value: 'qualified', label: '已确认' },
  { value: 'negotiating', label: '谈判中' },
  { value: 'converted', label: '已成交' },
  { value: 'lost', label: '已丢失' },
  { value: 'closed', label: '已关闭' },
];

export const LEAD_GRADES = [
  { value: 'A', label: 'A-高价值' },
  { value: 'B', label: 'B-中价值' },
  { value: 'C', label: 'C-待观察' },
  { value: 'D', label: 'D-低价值' },
];

export const REQUIREMENT_TYPES = [
  { value: 'huamo', label: '花膜' },
  { value: 'processing', label: '加工' },
  { value: 'equipment', label: '设备' },
  { value: 'process_consult', label: '工艺咨询' },
  { value: 'unclear', label: '不明确' },
];

export const KNOWLEDGE_CATEGORIES = [
  { value: 'company', label: '公司介绍' },
  { value: 'process', label: '工艺知识' },
  { value: 'material', label: '材料适配' },
  { value: 'equipment', label: '产品设备' },
  { value: 'faq', label: '客户FAQ' },
  { value: 'persona', label: '人设指南' },
  { value: 'viral', label: '爆款拆解' },
  { value: 'review', label: '复盘案例' },
  { value: 'sales', label: '线索话术' },
  { value: 'risk', label: '风险规则' },
];

// === 知识库升级分类 ===
export const KNOWLEDGE_CATEGORIES_NEW = [
  { value: '公司介绍', label: '公司介绍' },
  { value: '账号人设', label: '账号人设' },
  { value: '工艺知识', label: '工艺知识' },
  { value: '材料适配', label: '材料适配' },
  { value: '产品设备', label: '产品设备' },
  { value: '客户FAQ', label: '客户FAQ' },
  { value: '私信话术', label: '私信话术' },
  { value: '评论区话术', label: '评论区话术' },
  { value: '案例故事', label: '案例故事' },
  { value: '客户痛点', label: '客户痛点' },
  { value: '销售反馈', label: '销售反馈' },
  { value: '外贸客户问题', label: '外贸客户问题' },
  { value: '爆款参考', label: '爆款参考' },
  { value: '脚本模板', label: '脚本模板' },
  { value: '拍摄素材', label: '拍摄素材' },
  { value: '风险禁忌', label: '风险禁忌' },
  { value: '流程SOP', label: '流程SOP' },
  { value: '复盘沉淀', label: '复盘沉淀' },
  { value: '内部培训', label: '内部培训' },
];

// === 内容可用范围 ===
export const CONTENT_SCOPES = [
  { value: '可对外', label: '可对外', color: 'green' },
  { value: '可模糊对外', label: '可模糊对外', color: 'yellow' },
  { value: '仅内部参考', label: '仅内部参考', color: 'gray' },
  { value: '禁止对外', label: '禁止对外', color: 'red' },
];

// === 知识状态 ===
export const KNOWLEDGE_STATUSES = [
  { value: '草稿', label: '草稿', color: 'gray' },
  { value: '待审核', label: '待审核', color: 'yellow' },
  { value: '已确认', label: '已确认', color: 'green' },
  { value: '需更新', label: '需更新', color: 'red' },
  { value: '已过期', label: '已过期', color: 'red' },
  { value: '停用', label: '停用', color: 'gray' },
];

// === 知识卡类型 ===
export const KNOWLEDGE_CARD_TYPES = [
  { value: '账号人设知识卡', label: '账号人设知识卡' },
  { value: '工艺知识卡', label: '工艺知识卡' },
  { value: '材料适配知识卡', label: '材料适配知识卡' },
  { value: '产品设备知识卡', label: '产品设备知识卡' },
  { value: '客户FAQ知识卡', label: '客户FAQ知识卡' },
  { value: '私信话术知识卡', label: '私信话术知识卡' },
  { value: '评论区话术知识卡', label: '评论区话术知识卡' },
  { value: '案例故事知识卡', label: '案例故事知识卡' },
  { value: '风险禁忌知识卡', label: '风险禁忌知识卡' },
  { value: '拍摄素材知识卡', label: '拍摄素材知识卡' },
  { value: '脚本模板知识卡', label: '脚本模板知识卡' },
  { value: '复盘沉淀知识卡', label: '复盘沉淀知识卡' },
];

// === 知识库适用平台 ===
export const KNOWLEDGE_APPLICABLE_PLATFORMS = [
  { value: '视频号', label: '视频号' },
  { value: '抖音', label: '抖音' },
  { value: '两者都适合', label: '两者都适合' },
];


export const POST_STATUSES = [
  { value: 'planned', label: '待发布' },
  { value: 'filming', label: '拍摄中' },
  { value: 'editing', label: '剪辑中' },
  { value: 'published', label: '已发布' },
  { value: 'reviewed', label: '已复盘' },
];

export const ACCOUNT_STATUSES = [
  { value: 'active', label: '启用' },
  { value: 'paused', label: '暂停' },
  { value: 'archived', label: '归档' },
];

export const SCRIPT_STATUSES = [
  { value: 'pending_generate', label: '待生成', color: 'gray' },
  { value: 'draft', label: '草稿', color: 'gray' },
  { value: 'pending_review', label: '待审核', color: 'yellow' },
  { value: 'review_rejected', label: '审核退回', color: 'red' },
  { value: 'approved', label: '已审核', color: 'blue' },
  { value: 'pending_filming', label: '待拍摄', color: 'blue' },
  { value: 'filming', label: '拍摄中', color: 'blue' },
  { value: 'editing', label: '剪辑中', color: 'purple' },
  { value: 'pending_publish', label: '待发布', color: 'purple' },
  { value: 'published', label: '已发布', color: 'green' },
  { value: 'pending_post_review', label: '待复盘', color: 'yellow' },
  { value: 'templated', label: '已沉淀为模板', color: 'green' },
];

export const REWRITE_STYLES = [
  { value: '更口语', label: '更口语化' },
  { value: '更专业', label: '更专业' },
  { value: '更像老板口吻', label: '老板口吻' },
  { value: '更适合视频号', label: '视频号风格' },
  { value: '更适合抖音', label: '抖音风格' },
  { value: '更短', label: '更精简' },
  { value: '更有冲突', label: '更有冲突感' },
  { value: '更强转化', label: '更强转化力' },
];

export const AI_GENERATE_TYPES = [
  { value: 'from_topic', label: '从选题库生成' },
  { value: 'from_customer', label: '从客户问题生成' },
  { value: 'from_teardown', label: '从爆款拆解改编' },
  { value: 'from_knowledge', label: '从知识库生成' },
  { value: 'from_history', label: '从历史高表现视频生成' },
  { value: 'batch', label: '批量生成脚本' },
];

export const SCRIPT_STRUCTURES = [
  { value: '问题_方案', label: '问题 → 方案' },
  { value: '对比_选择', label: '对比 → 选择' },
  { value: '故事_结论', label: '故事 → 结论' },
  { value: '观点_论证', label: '观点 → 论证' },
  { value: '揭秘_真相', label: '揭秘 → 真相' },
  { value: '教程_步骤', label: '教程 → 步骤' },
  { value: '案例_复盘', label: '案例 → 复盘' },
];

export const ACTING_STYLES = [
  { value: '出镜_讲', label: '真人出镜讲解' },
  { value: '出镜_演', label: '真人出镜演绎' },
  { value: '旁白_画面', label: '旁白+画面' },
  { value: '对话_采访', label: '对话/采访' },
  { value: '实操_演示', label: '实操演示' },
  { value: '对比_实拍', label: '对比实拍' },
];

export const TONE_STYLES = [
  { value: '专业', label: '专业严谨' },
  { value: '亲和', label: '亲切友好' },
  { value: '幽默', label: '轻松幽默' },
  { value: '直接', label: '直接干脆' },
  { value: '故事化', label: '故事化叙述' },
  { value: '老板腔', label: '老板口吻' },
];

export const TOPIC_SOURCES = [
  '客户咨询', '评论区问题', '团队经验', '客户案例', '爆款拆解',
  '行业动态', '销售反馈', 'AI生成', '原创',
];

export const NAV_ITEMS = [
  { label: '战情盘', path: '/dashboard', icon: '📊' },
  { label: '账号矩阵', path: '/accounts', icon: '👤' },
  { label: '选题库', path: '/topics', icon: '📋' },
  { label: '脚本工厂', path: '/scripts', icon: '✍️' },
  { label: '爆款拆解', path: '/teardowns', icon: '🔍' },
  { label: '发布日历', path: '/calendar', icon: '📅' },
  { label: '数据复盘', path: '/posts', icon: '📈' },
  { label: '线索中心', path: '/leads', icon: '🎯' },
  { label: '知识库', path: '/knowledge', icon: '📚' },
  { label: '报表', path: '/reports', icon: '📄' },
  { label: '设置', path: '/settings', icon: '⚙️' },
];

export const REVIEW_CHECKLIST = [
  { key: 'persona_match', label: '账号人设是否匹配' },
  { key: 'target_audience_clear', label: '目标客户是否清楚' },
  { key: 'hook_3s', label: '前3秒有没有钩子' },
  { key: 'watch_reason', label: '用户为什么愿意看是否明确' },
  { key: 'real_scene', label: '有没有真实产品/场景支撑' },
  { key: 'pain_point', label: '有没有讲清楚客户痛点' },
  { key: 'no_overpromise', label: '有没有乱承诺价格/交期/附着力/一定能做' },
  { key: 'remind_info', label: '有没有提醒客户补充图片/材质/数量/测试要求' },
  { key: 'clear_cta', label: '结尾有没有明确转化动作' },
  { key: 'shootable', label: '拍摄团队是否看得懂' },
];

export const QUALITY_DIMENSIONS = [
  { key: 'hook_score', label: '前3秒钩子（能不能留住人）', max: 20 },
  { key: 'pain_score', label: '客户痛点是否说清楚了', max: 20 },
  { key: 'persona_score', label: '人设语气对不对', max: 15 },
  { key: 'content_value', label: '这条视频有没有真正帮到客户', max: 15 },
  { key: 'watch_reason', label: '用户为什么愿意看完', max: 10 },
  { key: 'platform_fit', label: '适合视频号还是抖音', max: 10 },
  { key: 'cta_score', label: '结尾有没有让人想行动', max: 10 },
];

// 线索承接来源
export const SOURCE_BRANCHES = [
  { value: '汕头宏达', label: '汕头宏达', color: 'red' },
  { value: '东莞宏达', label: '东莞宏达', color: 'black' },
];
