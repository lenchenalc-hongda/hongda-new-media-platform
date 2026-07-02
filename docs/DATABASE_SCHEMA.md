# 宏达新媒体作战中台 - 数据库Schema

## 表结构

### organizations
组织/公司表。系统支持多组织多租户。

### profiles
用户档案表。扩展Supabase Auth，关联到组织。
- role: admin/manager/operator/sales/viewer
- org_id: 关联到组织

### accounts
新媒体账号表。
- platform: weixin/douyin/other
- persona: 人设
- positioning: 定位
- main_content_types: 主要内容类型（数组）

### account_rules
账号规则表。记录每个账号的禁止表达、注意事项。

### topics
选题表。关联到账号。
- content_type: 内容类型
- priority: 优先级
- status: 状态

### scripts
脚本表。关联到选题和账号。
- shot_list: 分镜脚本（JSONB）
- version: 版本号
- ai_meta: AI生成元数据

### posts
发布记录表。关联到账号和脚本。
- status: planned/filming/editing/published/reviewed

### post_metrics
视频数据表。关联到发布记录。
记录播放量、完播率、互动数据、线索数据。

### reviews
复盘表。关联到发布记录。
- ai_review: AI复盘结果（JSONB）
- is_template: 是否沉淀为模板

### viral_teardowns
爆款拆解表。关联到账号。
- adapted_topics: 改编选题（JSONB）

### leads
线索表。关联到来源账号和视频。
- lead_score: 0-100
- lead_grade: A/B/C/D
- requirement_type: 需求类型

### lead_interactions
线索互动记录表。

### knowledge_cards
知识卡表。
- category: 10个分类
- applicable_accounts: 适用账号（UUID数组）

### media_assets
媒体资源表。支持多态关联（related_type + related_id）。

### tasks
任务表。支持多态关联。

### ai_runs
AI调用记录表。用于审计和调试。

## 索引策略
所有核心表按org_id、status、created_at建立索引。
关联字段（account_id, post_id, lead_id）建立索引。
