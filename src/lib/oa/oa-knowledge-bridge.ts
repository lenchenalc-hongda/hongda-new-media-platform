// ===== 知识库 ↔ 公众号来源卡 桥梁 =====
// 将知识库的知识卡转换为 OA 来源卡，供公众号工厂使用
import { OASourceCard, OASourceCardType, BusinessLine } from './types';
import { OA_SOURCE_CARDS, getOASourceCardsByIds as getNativeCardsByIds } from '@/lib/constants/oa-source-cards';
import { MOCK_KNOWLEDGE_NEW } from '@/lib/constants/mock-data';
import type { KnowledgeCardNew } from '@/lib/constants/types';

// ===== Category mappings =====

const CATEGORY_TO_BUSINESS_LINE: Record<string, BusinessLine> = {
  '工艺': 'heat_transfer', '材料': 'heat_transfer', '设备': 'equipment',
  '品质': 'general', '品牌': 'brand',
};

const CARD_TYPE_TO_TYPE: Record<string, OASourceCardType> = {
  '工艺知识卡': 'knowledge', '材料知识卡': 'knowledge',
  '设备知识卡': 'equipment', 'FAQ': 'faq', '案例': 'case', '品牌': 'brand',
};

function detectBusinessLine(category: string): BusinessLine {
  for (const [k, v] of Object.entries(CATEGORY_TO_BUSINESS_LINE)) {
    if (category.includes(k)) return v;
  }
  return 'general';
}

function detectType(cardType: string): OASourceCardType {
  for (const [k, v] of Object.entries(CARD_TYPE_TO_TYPE)) {
    if (cardType.includes(k)) return v;
  }
  return 'knowledge';
}

function scopeToOutbound(scope: string): boolean {
  return scope === '可对外' || scope === '可对外模糊讲';
}

function splitText(text: string | null | undefined): string[] {
  if (!text) return [];
  return text.split(/[。；\n]/).map(s => s.trim()).filter(Boolean);
}

// ===== Conversion =====

export function convertKnowledgeToSourceCard(kc: KnowledgeCardNew): OASourceCard {
  const keyPoints = splitText(kc.key_judgement_points);
  const riskNotes = [
    ...splitText(kc.risky_expressions),
    ...splitText(kc.forbidden_expressions),
  ].filter((r, i, a) => a.indexOf(r) === i);
  const scenarios = splitText(kc.suitable_scenarios);
  const unsuitable = splitText(kc.unsuitable_scenarios);

  return {
    id: 'kb_' + kc.id,
    type: detectType(kc.card_type),
    title: kc.title,
    businessLine: detectBusinessLine(kc.category),
    targetAudience: kc.applicable_customers || '有相关需求的客户',
    customerPain: '', // Not directly available from knowledge cards
    coreConclusion: kc.core_conclusion || kc.summary || '',
    keyPoints: keyPoints.length > 0 ? keyPoints : [kc.summary || ''].filter(Boolean),
    applicableScenarios: scenarios,
    unsuitableScenarios: unsuitable,
    riskNotes: riskNotes,
    suggestedCTA: '联系我们获取更多信息',
    outboundAllowed: scopeToOutbound(kc.content_scope),
    owner: kc.owner_id || '',
    updatedAt: kc.updated_at || kc.created_at || new Date().toISOString(),
    sourceQuality: kc.knowledge_status === '已确认' ? 'high' : 'medium',
    visibility: kc.content_scope === '可对外' ? 'public' : 'internal',
  };
}

// ===== Get all knowledge cards as source cards =====

export function getKnowledgeSourceCards(): OASourceCard[] {
  return MOCK_KNOWLEDGE_NEW
    .filter(kc => kc.knowledge_status === '已确认')  // Only confirmed cards
    .map(convertKnowledgeToSourceCard);
}

// ===== Merge functions =====

/** 获取所有来源卡（OA原生 + 知识库知识卡） */
export function getAllSourceCards(oaCards?: OASourceCard[]): OASourceCard[] {
  const native = oaCards || OA_SOURCE_CARDS;
  const knowledge = getKnowledgeSourceCards();
  const userCardIds = new Set(native.map(c => c.id));
  // Don't duplicate cards with same ID (unlikely but safe)
  const uniqueKnowledge = knowledge.filter(kc => !userCardIds.has(kc.id));
  return [...native, ...uniqueKnowledge];
}

/** 在所有来源卡中按 ID 查找（OA原生 + 知识库） */
export function getSourceCardsByIds(ids: string[]): OASourceCard[] {
  const all = getAllSourceCards();
  return all.filter(c => ids.includes(c.id));
}

/** 在所有来源卡中按业务线筛选 */
export function getSourceCardsByBusinessLine(line: string): OASourceCard[] {
  return getAllSourceCards().filter(c => c.businessLine === line);
}

/** 在所有来源卡中按类型筛选 */
export function getSourceCardsByType(type: string): OASourceCard[] {
  return getAllSourceCards().filter(c => c.type === type);
}
