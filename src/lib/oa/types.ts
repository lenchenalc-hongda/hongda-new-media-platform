// ===== 公众号工厂 Phase 1 类型定义 =====

/** 内容来源卡类型 */
export type OASourceCardType =
  | 'knowledge'
  | 'faq'
  | 'case'
  | 'product'
  | 'equipment'
  | 'script'
  | 'brand';

/** 业务线 */
export type BusinessLine =
  | 'heat_transfer'
  | 'digital_heat_transfer'
  | 'uv_machine'
  | 'film'
  | 'equipment'
  | 'brand'
  | 'general';

/** 内容来源卡 */
export interface OASourceCard {
  id: string;
  type: OASourceCardType;
  title: string;
  businessLine: BusinessLine;
  targetAudience: string;
  customerPain?: string;
  coreConclusion: string;
  keyPoints: string[];
  applicableScenarios: string[];
  unsuitableScenarios?: string[];
  riskNotes: string[];
  suggestedCTA?: string;
  outboundAllowed: boolean;
  owner?: string;
  updatedAt: string;
  /** 来源质量评估 */
  sourceQuality?: 'high' | 'medium' | 'low';
  /** 可见性：公开展示 / 内部参考 / 仅团队 */
  visibility?: 'public' | 'internal' | 'team';
  /** 关联产品 */
  relatedProduct?: string;
  /** 关联材质 */
  relatedMaterial?: string;
  /** 关联工艺 */
  relatedProcess?: string;
}

/** 文章类型 */
export type OAArticleType =
  | 'technical_guide'
  | 'faq_answer'
  | 'machine_selection'
  | 'process_sop'
  | 'case_study'
  | 'troubleshooting'
  | 'brand_story'
  | 'sales_enablement'
  | 'festival_soft';

/** 文章策略卡 */
export interface OAArticleStrategy {
  id: string;
  topic: string;
  articleType?: OAArticleType;
  targetAudience: string;
  customerPain: string;
  corePoint: string;
  sourceCardIds: string[];
  articleAngle: string;
  recommendedTemplateId: string;
  riskToAvoid: string[];
  ctaType: 'send_sample' | 'ask_product_info' | 'book_demo' | 'contact_sales' | 'save_article' | 'internal_share';
  coverTitle: string;
  summary: string;
}

/** 内容块类型 */
export type OABodyBlockType =
  | 'title'
  | 'lead'
  | 'heading'
  | 'paragraph'
  | 'quote'
  | 'tip'
  | 'checklist'
  | 'warning'
  | 'case'
  | 'cta'
  | 'image';

/** 内容块 */
export interface OABodyBlock {
  id: string;
  type: OABodyBlockType;
  content: string;
  items?: string[];
  imageUrl?: string;
  alt?: string;
}

/** 文章草稿 */
export interface OAArticleDraft {
  id: string;
  strategyId: string;
  title: string;
  coverTitle: string;
  summary: string;
  outline: string[];
  bodyBlocks: OABodyBlock[];
  bodyMarkdown: string;
  bodyHtml?: string;
  templateId?: string;
  sourceCardIds: string[];
  score?: number;
  riskLevel?: 'low' | 'medium' | 'high';
  status: 'draft' | 'pending_review' | 'approved';
  usage: 'wechat_publish' | 'sales_forward' | 'website_article' | 'internal_training' | 'video_script_expand';
  createdAt: string;
  updatedAt: string;
}

/** 文章模板 */
export interface OAArticleReview {
  id: string;
  articleId: string;
  action: 'submit' | 'approve' | 'reject' | 'comment' | 'rescore' | 'risk_check';
  reviewer?: string;
  comment: string;
  previousStatus: string;
  newStatus: string;
  score?: number;
  riskLevel?: 'low' | 'medium' | 'high';
  createdAt: string;
}

export interface OAArticleTemplate {
  id: string;
  name: string;
  description: string;
  suitableArticleTypes: OAArticleType[];
  requiredBlocks: OABodyBlockType[];
  defaultOutline: string[];
  styleTokens: Record<string, string>;
  ctaSuggestions: string[];
  riskReminders: string[];
}

/** 生成输入 */
export interface GenerateArticleInput {
  sourceCardIds: string[];
  articleType?: OAArticleType;
  targetAudience?: string;
  usage?: OAArticleDraft['usage'];
  templateId?: string;
  topic?: string;
}

/** 生成输出 */
export interface GenerateArticleOutput {
  strategy: OAArticleStrategy;
  draft: OAArticleDraft;
  score: { score: number; riskLevel: 'low' | 'medium' | 'high'; notes: string[] };
}

/** 渲染输入 */
export interface RenderTemplateInput {
  draft: OAArticleDraft;
  templateId: string;
}

/** 渲染输出 */
export interface RenderTemplateOutput {
  html: string;
  markdown: string;
  templateName: string;
  blocksCount: number;
}
