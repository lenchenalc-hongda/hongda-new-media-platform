// ===== 品牌文风控制 =====
export interface BrandVoiceConfig {
  tone: string;
  sentenceStyle: string[];
  endingStyle: string;
  forbiddenWords: string[];
  structurePreference: string[];
}

export const BRAND_VOICE: BrandVoiceConfig = {
  tone: '专业、可信、不过度营销。语气像工厂技术顾问在说话，不是推销员。',
  sentenceStyle: [
    '短段落为主，每段不超过3句话',
    '小标题清晰，多用问句或判断句',
    '每段只讲一个点',
    '多用"你"、"您的"，直接对话读者',
  ],
  endingStyle: '自然引导，不硬卖。结尾提供价值（免费打样、寄样测试、方案评估），而非直接推销。',
  forbiddenWords: [
    '全国最好', '绝对不掉', '完全一致', '闭眼选',
    '永不褪色', '行业第一', '最专业', '最便宜',
    '保证不掉', '保证能做', '零风险', '100%',
  ],
  structurePreference: [
    '封面标题 + 导语',
    '2-3个小标题正文',
    '重点提示框（1-2处）',
    'CTA引导（留资/打样/咨询）',
    '品牌署名',
  ],
};

export function checkBrandCompliance(text: string): { pass: boolean; violations: string[] } {
  const violations: string[] = [];
  BRAND_VOICE.forbiddenWords.forEach(word => {
    if (text.includes(word)) violations.push(`出现禁止词："${word}"`);
  });
  return { pass: violations.length === 0, violations };
}
