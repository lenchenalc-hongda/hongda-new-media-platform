export type Role = 'admin' | 'manager' | 'operator' | 'sales' | 'viewer';
export type Platform = 'weixin' | 'douyin' | 'other';
export type AccountStatus = 'active' | 'paused' | 'archived';
export type ScriptStatus = 'pending_generate' | 'draft' | 'pending_review' | 'review_rejected' | 'approved' | 'pending_filming' | 'filming' | 'editing' | 'pending_publish' | 'published' | 'pending_post_review' | 'templated' | 'revised' | 'used';
export type PostStatus = 'planned' | 'filming' | 'editing' | 'published' | 'reviewed';
export type LeadGrade = 'A' | 'B' | 'C' | 'D';
export type LeadStatus = 'new' | 'contacted' | 'qualified' | 'negotiating' | 'converted' | 'lost' | 'closed';
export type RequirementType = 'huamo' | 'processing' | 'equipment' | 'process_consult' | 'unclear';
export type ContentType = 'product' | 'process' | 'case' | 'qa' | 'factory' | 'industry' | 'tutorial' | 'other';
export type KnowledgeCategory = 'company' | 'process' | 'material' | 'equipment' | 'faq' | 'persona' | 'viral' | 'review' | 'sales' | 'risk';
// === 知识库新类型 ===
export type ContentScope = '可对外' | '可模糊对外' | '仅内部参考' | '禁止对外';
export type KnowledgeStatus = '草稿' | '待审核' | '已确认' | '需更新' | '已过期' | '停用';
export type KnowledgeCardType =
  | '账号人设知识卡' | '工艺知识卡' | '材料适配知识卡' | '产品设备知识卡'
  | '客户FAQ知识卡' | '私信话术知识卡' | '评论区话术知识卡' | '案例故事知识卡'
  | '风险禁忌知识卡' | '拍摄素材知识卡' | '脚本模板知识卡' | '复盘沉淀知识卡';

export type TaskRelatedType = 'account' | 'topic' | 'script' | 'post' | 'lead' | 'review';
export type AiRunType = 'account_diagnosis' | 'generate_topics' | 'generate_script' | 'rewrite_script' | 'viral_teardown' | 'post_review' | 'lead_score' | 'lead_reply' | 'weekly_report';

export interface Organization {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
}

export interface Profile {
  id: string;
  user_id: string;
  org_id: string;
  full_name: string | null;
  email: string | null;
  role: Role;
  department: string | null;
  avatar_url: string | null;
  is_active: boolean;
  created_at: string;
}

export interface Account {
  id: string;
  org_id: string;
  name: string;
  platform: Platform;
  owner_id: string | null;
  persona: string | null;
  positioning: string | null;
  target_audience: string | null;
  content_style: string | null;
  main_content_types: ContentType[];
  conversion_goal: string | null;
  dos: string | null;
  donts: string | null;
  status: AccountStatus;
  created_at: string;
}

export interface AccountRule {
  id: string;
  org_id: string;
  account_id: string;
  rule_type: string;
  rule_content: string;
  example_good: string | null;
  example_bad: string | null;
  created_at: string;
}

export interface Topic {
  id: string;
  org_id: string;
  account_id: string;
  title: string;
  content_type: string;
  platform: string;
  topic_source: string;
  target_customer: string | null;
  customer_pain: string | null;
  product_process: string | null;
  material: string | null;
  content_angle: string | null;
  core_point: string | null;
  why_user_watch: string | null;
  content_purpose: string | null;
  conversion_goal: string | null;
  comment_guidance: string | null;
  private_message_action: string | null;
  required_customer_info: string | null;
  sample_guidance: string | null;
  shooting_method: string | null;
  video_length: string | null;
  required_products: string | null;
  required_shots: string | null;
  required_factory_assets: string | null;
  required_case_images: string | null;
  logo_risk: string | null;
  privacy_risk: string | null;
  knowledge_refs: string | null;
  faq_refs: string | null;
  case_refs: string | null;
  viral_refs: string | null;
  review_refs: string | null;
  risk_rules: string | null;
  script_status: string;
  linked_script_id: string | null;
  linked_post_id: string | null;
  topic_score: number | null;
  score_detail: string | null;
  risk_level: string | null;
  risk_result: string | null;
  owner_id: string | null;
  last_action: string | null;
  is_this_week: boolean;
  planned_shoot_date: string | null;
  planned_publish_date: string | null;
  target_audience: string | null;
  product_or_process: string | null;
  source: string | null;
  priority: string;
  status: string;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at?: string;
}

export interface Script {
  id: string;
  org_id: string;
  topic_id: string | null;
  account_id: string | null;
  title: string;
  hook: string | null;
  main_script: string | null;
  shot_list: ScriptShot[];
  subtitle_points: string | null;
  cover_text: string | null;
  comment_reply: string | null;
  private_message_cta: string | null;
  risk_notes: string | null;
  version: number;
  status: ScriptStatus;
  ai_meta: Record<string, unknown> | null;
  created_by: string;
  created_at: string;
  updated_at?: string;
}

export interface ScriptShot {
  sequence: number;
  duration: string;
  visual: string;
  audio: string;
  text_overlay: string | null;
  props: string | null;
}

export interface Post {
  id: string;
  org_id: string;
  account_id: string;
  script_id: string | null;
  platform: Platform;
  post_url: string | null;
  publish_date: string | null;
  title: string | null;
  content_type: ContentType | null;
  status: PostStatus;
  notes: string | null;
  created_at: string;
}

export interface PostMetrics {
  id: string;
  org_id: string;
  post_id: string;
  views: number;
  completion_rate: number;
  likes: number;
  comments: number;
  shares: number;
  favorites: number;
  followers_gained: number;
  private_messages: number;
  leads_count: number;
  qualified_leads_count: number;
  metric_date: string;
  created_at: string;
}

export interface Review {
  id: string;
  org_id: string;
  post_id: string;
  summary: string | null;
  what_worked: string | null;
  what_failed: string | null;
  next_optimization: string | null;
  ai_review: Record<string, unknown> | null;
  human_review: string | null;
  is_template: boolean;
  created_by: string;
  created_at: string;
}

export interface ViralTeardown {
  id: string;
  org_id: string;
  platform: Platform;
  source_url: string | null;
  source_account: string | null;
  title: string;
  cover_text: string | null;
  video_theme: string | null;
  hook: string | null;
  target_audience: string | null;
  pain_point: string | null;
  structure: string | null;
  trust_elements: string | null;
  conversion_action: string | null;
  learnable_points: string | null;
  not_suitable_points: string | null;
  adapted_topics: string[];
  suitable_account_id: string | null;
  status: string;
  created_by: string;
  created_at: string;
}

export interface Lead {
  id: string;
  org_id: string;
  source_platform: Platform | null;
  source_account_id: string | null;
  source_post_id: string | null;
  customer_name: string | null;
  wechat: string | null;
  phone: string | null;
  company: string | null;
  region: string | null;
  product: string | null;
  material: string | null;
  quantity: string | null;
  requirement_type: RequirementType | null;
  product_images: string[];
  artwork_requirement: string | null;
  test_requirement: string | null;
  is_urgent: boolean;
  current_process: string | null;
  pain_points: string | null;
  lead_score: number;
  lead_grade: LeadGrade | null;
  status: LeadStatus;
  assigned_to: string | null;
  next_action: string | null;
  next_follow_up_date: string | null;
  notes: string | null;
  created_at: string;
  source_branch: string | null;
  month: string | null;
}

export interface LeadInteraction {
  id: string;
  org_id: string;
  lead_id: string;
  channel: string;
  customer_message: string | null;
  team_reply: string | null;
  ai_suggestion: string | null;
  next_action: string | null;
  created_by: string;
  created_at: string;
}

export interface KnowledgeCard {
  id: string;
  org_id: string;
  title: string;
  category: KnowledgeCategory;
  applicable_accounts: string[];
  applicable_content_types: ContentType[];
  customer_type: string | null;
  is_external_allowed: boolean;
  core_conclusion: string | null;
  plain_explanation: string | null;
  customer_questions: string | null;
  new_media_expression: string | null;
  dont_say: string | null;
  topic_ideas: string | null;
  script_angles: string | null;
  owner: string | null;
  version: number;
  updated_at: string;
  created_at: string;
}

export interface KnowledgeCardNew {
  id: string;
  org_id: string;
  title: string;
  category: string; // Chinese category name
  card_type: string; // Chinese card type
  summary: string | null;
  core_conclusion: string | null;
  applicable_accounts: string[];
  applicable_platforms: string[];
  applicable_content_types: string[];
  applicable_customers: string | null;
  content_scope: string; // 可对外/可模糊对外/仅内部参考/禁止对外
  knowledge_status: string; // 草稿/待审核/已确认/需更新/已过期/停用
  owner_id: string | null;
  reviewer_id: string | null;
  version: number;
  suitable_scenarios: string | null;
  unsuitable_scenarios: string | null;
  key_judgement_points: string | null;
  new_media_expression: string | null;
  unsuitable_expression: string | null;
  boss_tone_expression: string | null;
  technical_tone_expression: string | null;
  qa_tone_expression: string | null;
  video_channel_expression: string | null;
  douyin_expression: string | null;
  forbidden_expressions: string | null;
  risky_expressions: string | null;
  safer_alternatives: string | null;
  risk_reason: string | null;
  needs_human_review: boolean;
  customer_questions: string | null;
  standard_replies: string | null;
  required_followup_info: string | null;
  can_send_to_customer: boolean;
  topic_ideas: string | null;
  script_angles: string | null;
  linked_topic_ids: string[];
  linked_script_ids: string[];
  linked_teardown_ids: string[];
  linked_lead_reply_ids: string[];
  linked_case_ids: string[];
  linked_review_ids: string[];
  usage_count: number;
  generated_topics_count: number;
  generated_scripts_count: number;
  linked_posts_count: number;
  related_private_messages: number;
  related_qualified_leads: number;
  last_used_at: string | null;
  tags: string[];
  attachments: string[];
  source_type: string | null;
  source_reference: string | null;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at?: string;
}

export interface MediaAsset {
  id: string;
  org_id: string;
  related_type: string;
  related_id: string;
  file_url: string;
  file_name: string;
  file_type: string;
  description: string | null;
  created_by: string;
  created_at: string;
}

export interface Task {
  id: string;
  org_id: string;
  title: string;
  description: string | null;
  related_type: TaskRelatedType;
  related_id: string | null;
  assignee_id: string | null;
  status: string;
  due_date: string | null;
  priority: number;
  created_at: string;
}

export interface AiRun {
  id: string;
  org_id: string;
  run_type: AiRunType;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  model: string | null;
  created_by: string;
  created_at: string;
}

// Extended display types
export interface AccountWithStats extends Account {
  monthly_posts: number;
  monthly_leads: number;
  latest_review_summary: string | null;
  updated_at?: string;
}

export interface TopicWithAccount extends Topic {
  account_name?: string;
}

export interface ScriptWithRelations extends Script {
  account_name?: string;
  topic_title?: string;
}

export interface PostWithMetrics extends Post {
  metrics?: PostMetrics;
  account_name?: string;
}

export interface LeadWithDetails extends Lead {
  account_name?: string;
  post_title?: string;
  assignee_name?: string;
}
