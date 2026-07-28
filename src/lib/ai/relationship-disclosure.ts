// ===== Relationship Disclosure Detection =====
// Detects whether the customer has explicitly asked about
// manufacturing relationships, brand ownership, or R&D capabilities.
// Used to enforce truthful_when_asked in brand_policy.

import type { BrandPolicy } from '@/lib/accounts/types';

export interface RelationshipDisclosureContext {
  manufacturing_relationship_asked: boolean;
  brand_relationship_asked: boolean;
  ownership_relationship_asked: boolean;
  disclosure_required: boolean;
  matched_signals: string[];
}

// ===== Signal patterns =====

var MANUFACTURING_SIGNALS = [
  '是不是你们自己生产的',
  '机器是哪里生产的',
  '设备是谁生产的',
  '是你们自己制造的吗',
  '你们自己造机器吗',
  '你们是设备厂家吗',
  '机器是代工的还是自己做的',
  '设备是哪家厂做的',
  '有没有自己的工厂',
  '机器是自己研发的吗',
  '是不是宏达自己生产的',
];

var BRAND_RELATIONSHIP_SIGNALS = [
  '是宏达自己的品牌吗',
  '和宏达什么关系',
  '品牌是宏达的吗',
  '你们和厂家什么关系',
  '这是宏达的品牌吗',
  '宏达和点盛什么关系',
];

var OWNERSHIP_SIGNALS = [
  '宏达有没有入股',
  '你们是不是投资了',
  '宏达是股东吗',
  '有没有股权关系',
  '宏达是不是控股',
  '你们是不是收购了',
];

// ===== Safe questions (should NOT trigger disclosure) =====

var SAFE_QUESTIONS = [
  '机器稳定吗',
  '白墨循环怎么样',
  '视觉定位准不准',
  '售后怎么做',
  '你们售后怎么样',
  '多久能交货',
  '产品适不适合UV',
  '价格多少钱',
  '能不能打样',
  '可以寄样吗',
  '保修多久',
  '耗材贵不贵',
  '一天能打多少',
  '产能怎么样',
  '效果怎么样',
  '你们做的怎么样',
  '有什么案例吗',
  '怎么联系你们',
  '地址在哪里',
];

// ===== Detection =====

export function detectRelationshipDisclosure(input: {
  customerPain?: string;
  productOrProcess?: string;
  topic?: string;
  customerQuestion?: string;
}): RelationshipDisclosureContext {
  var text = [
    input.customerPain || '',
    input.productOrProcess || '',
    input.topic || '',
    input.customerQuestion || '',
  ].join(' ');

  var manufacturingSignals = MANUFACTURING_SIGNALS.filter(function(s) { return text.includes(s); });
  var brandSignals = BRAND_RELATIONSHIP_SIGNALS.filter(function(s) { return text.includes(s); });
  var ownershipSignals = OWNERSHIP_SIGNALS.filter(function(s) { return text.includes(s); });

  var allSignals = manufacturingSignals.concat(brandSignals, ownershipSignals);
  var disclosureRequired = allSignals.length > 0;

  return {
    manufacturing_relationship_asked: manufacturingSignals.length > 0,
    brand_relationship_asked: brandSignals.length > 0,
    ownership_relationship_asked: ownershipSignals.length > 0,
    disclosure_required: disclosureRequired,
    matched_signals: allSignals,
  };
}

// ===== Apply disclosure to brand contract =====

export function buildDisclosureAugmentedBrandContract(
  bp: BrandPolicy,
  disclosure: RelationshipDisclosureContext,
): string {
  var lines: string[] = [];

  if (disclosure.disclosure_required) {
    lines.push('⚠️ 客户已经明确询问制造、品牌或股权关系。');
    lines.push('回答时必须真实、简洁，不得虚构自主研发、生产、控股或入股关系，也不得故意回避问题。');
    lines.push('');
    lines.push('匹配到的客户信号：');
    disclosure.matched_signals.forEach(function(s) { lines.push('- "' + s + '"'); });
    lines.push('');
    lines.push('必须参照以下规则回答：');
    bp.forbidden_claims.forEach(function(c) { lines.push('- 不得：' + c); });
    lines.push('');
    lines.push('注：宏达负责售前测试、方案配置、安装培训和本地售后服务。');
    lines.push('    设备本身由合作厂商制造，宏达经过实际验证后选择该方案。');
    lines.push('    客户可以先到宏达进行产品测试，由宏达技术团队评估。');
  } else {
    // Normal brand contract
    if (bp.allowed_claims.length > 0) {
      lines.push('可以说的品牌表达：');
      bp.allowed_claims.forEach(function(c) { lines.push('- ' + c); });
    }
    if (bp.forbidden_claims.length > 0) {
      lines.push('');
      lines.push('绝对不能说的：');
      bp.forbidden_claims.forEach(function(c) { lines.push('- ' + c); });
    }
    if (bp.preferred_brand_expressions.length > 0) {
      lines.push('');
      lines.push('推荐品牌表达：');
      bp.preferred_brand_expressions.forEach(function(e) { lines.push('- ' + e); });
    }
    if (bp.competitor_policy.rules.length > 0) {
      lines.push('');
      lines.push('竞争品牌政策：');
      bp.competitor_policy.rules.forEach(function(r) { lines.push('- ' + r); });
    }
    // Normal mode: no disclosure required
    lines.push('');
    lines.push('客户未询问制造关系，不得主动解释制造主体。');
  }

  return lines.join('\n');
}
