import type {
  CommercialDocumentDraft, DocumentLanguage, DocumentSection,
} from './template';

export const NOTICE_TYPES = ['plate', 'gravure_film', 'digital_film', 'machine', 'processing'] as const;
export type ProductNoticeType = (typeof NOTICE_TYPES)[number];
export type NoticeSelection = ProductNoticeType | 'auto' | 'none';
export type NoticeOverrides = Partial<Record<ProductNoticeType, Partial<Record<DocumentLanguage, string>>>>;

export const NOTICE_OPTIONS: { value: NoticeSelection; label: string }[] = [
  { value: 'auto', label: '自动识别大项名称（推荐）' },
  { value: 'plate', label: '开版 / 铜版' },
  { value: 'gravure_film', label: '凹版热转印花膜' },
  { value: 'digital_film', label: '数码热转印花膜' },
  { value: 'machine', label: '机器设备' },
  { value: 'processing', label: '热转印加工' },
  { value: 'none', label: '不附加工艺说明' },
];

export const NOTICE_TITLES: Record<ProductNoticeType, { zh: string; en: string }> = {
  plate: { zh: '版费', en: 'Plate-making Fees' },
  gravure_film: { zh: '凹版热转印花膜', en: 'Gravure Heat Transfer Film' },
  digital_film: { zh: '数码热转印花膜', en: 'Digital Heat Transfer Film' },
  machine: { zh: '机器设备', en: 'Machinery and Equipment' },
  processing: { zh: '热转印加工', en: 'Heat Transfer Printing Services' },
};

/** Classification never looks at price or tax fields. Unclear names require explicit selection. */
export function inferNoticeType(title: string): ProductNoticeType | null {
  const normalized = title.trim().replace(/[\s_\-]/g, '').toLowerCase();
  if (!normalized || /(^|[^a-z])uv([^a-z]|$)/.test(normalized)) return null;
  if (/数码|digital/.test(normalized) && /花膜|转印膜|热转印|film/.test(normalized)) {
    return 'digital_film';
  }
  if (/花膜|转印膜|transferfilm|热转印耗材/.test(normalized)) return 'gravure_film';
  if (/版费|开版|制版|铜版|印版|电雕|gravureplate/.test(normalized)) return 'plate';
  if (/机器|设备|机台|热转印机|machine|equipment/.test(normalized)) return 'machine';
  if (/加工|代工|processing|printingservice/.test(normalized)) return 'processing';
  return null;
}

export function sectionNoticeType(section: DocumentSection): ProductNoticeType | null {
  if (section.noticeType === 'none') return null;
  if (section.noticeType && section.noticeType !== 'auto') return section.noticeType;
  return inferNoticeType(section.title);
}

/** Preserve first occurrence order, deduplicate repeated groups of the same type. */
export function activeNoticeTypes(sections: readonly DocumentSection[]): ProductNoticeType[] {
  const seen = new Set<ProductNoticeType>();
  for (const section of sections) {
    // Empty placeholder sections must not trigger contract terms.
    if (!section.items.some(item => item.name.trim() || item.specification.trim() || item.unitPrice.trim())) continue;
    const type = sectionNoticeType(section);
    if (type) seen.add(type);
  }
  return [...seen];
}

// Approved by Hongda. Do not paraphrase, normalize punctuation, change numbers or add technical promises.
// Newline-only separators are for compact PDF paragraph layout; the approved sentences stay verbatim.
export const APPROVED_ZH_NOTICES: Record<ProductNoticeType, string> = {
  plate: [
    '1。 铜版自制版完成之日起享有18个月质量保证期。正常保管及使用情况下，因制版质量产生的问题由我司负责免费修补；客户修改图稿、尺寸或工艺要求所产生的费用另行计算。',
    '2. 超过质保期且连续12个月未下单的印版，期满后进行报废处理。印版实物归属及特殊保管要求以双方约定为准。',
  ].join('\n'),
  gravure_film: [
    '1. 印刷颜色、图案尺寸及套印效果以双方确认的实物样品为准。正常生产过程中可能存在合理批次差异；有特殊色差、套印精度要求的，须于打样前确认具体验收标准。',
    '2. 花膜的烫印结合力应依据客户实际产品材质、表面处理方式及烫印条件进行打样验证，并以双方确认的测试结果为准。',
    '3. 如产品涉及耐磨、耐酒精、耐水、耐高温、耐多轮洗碗机等特殊性能要求，应在生产前提出并另行确认测试条件及验收标准。',
  ].join('\n'),
  digital_film: [
    '数码热转印花膜依据客户最终确认的电子图稿及工艺要求生产。由于显示设备、印刷工艺及承印材料不同，实际印刷效果可能与屏幕显示存在一定差异；特殊色彩要求应通过实物打样确认。',
    '产品附着力及耐磨、耐水、耐高温等特殊性能须根据实际材质及使用条件另行验证。未经双方确认的特殊性能，不视为默认产品验收要求。',
  ].join('\n\n'),
  machine: [
    '设备电压、频率、气源及技术配置以双方最终确认的设备规格为准。设备生产能力应依据约定产品、花膜、夹具及测试条件进行验收。',
    '设备在正常使用及维护条件下，因制造质量产生的零部件故障，按双方约定的保修期限和范围提供售后服务。易损件、安装培训及其他服务事项以合同约定为准。',
  ].join('\n\n'),
  processing: [
    '客户提供的产品应符合双方确认的材质、尺寸及表面质量要求。我司在入库后进行约定的印前抽检；发现来料脏污、损伤或其他异常时，双方协商退回、清洁或另行处理。',
    '常规加工建议额外预留订单数量3%的产品作为试产及工艺损耗备品，具体损耗责任按实际原因及双方约定处理。高难度或特殊工艺产品的备品比例应在生产前另行确认。',
  ].join('\n\n'),
};

function defaultNoticeText(draft: CommercialDocumentDraft, type: ProductNoticeType): string {
  if (draft.language === 'zh') return APPROVED_ZH_NOTICES[type];
  // Match the approved Chinese clauses in scope, conditions, time periods and exclusions.
  // Keep language-specific overrides in the draft separate from these defaults.
  const english: Record<ProductNoticeType, string> = {
    plate: [
      '1. Copper gravure plates are covered by an 18-month quality warranty from the date plate-making is completed. Under normal storage and use, we will repair defects caused by plate-making quality at no charge. Changes requested by the buyer to artwork, dimensions or process specifications will be charged separately.',
      '2. Plates that are beyond the warranty period and have not been used for orders for 12 consecutive months will be disposed of upon expiry of that period. Ownership of the physical plates and any special storage requirements are subject to the agreement between both parties.',
    ].join('\\n'),
    gravure_film: [
      '1. Print colors, artwork dimensions and color registration shall be based on the physical sample mutually approved by both parties. Reasonable variation between production batches may occur. Any special requirements for color tolerance or registration accuracy must be agreed, together with specific acceptance criteria, before sampling.',
      '2. Transfer adhesion must be verified through sample testing using the buyer’s actual product material, surface treatment and transfer conditions, and shall be assessed against the test results mutually approved by both parties.',
      '3. Any special performance requirements, including abrasion resistance, alcohol resistance, water resistance, high-temperature resistance or repeated dishwasher-cycle resistance, must be disclosed before production. The corresponding test conditions and acceptance criteria shall be agreed separately.',
    ].join('\\n'),
    digital_film: [
      'Digital heat transfer film is produced according to the final digital artwork and process requirements approved by the buyer. Actual printed results may differ from on-screen appearance due to differences in display devices, printing processes and substrates. Special color requirements must be verified using a physical proof.',
      'Adhesion and special performance requirements, including abrasion, water and high-temperature resistance, must be verified separately based on the actual substrate and intended use conditions. Special performance requirements not mutually agreed shall not be treated as default product acceptance criteria.',
    ].join('\\n\\n'),
    machine: [
      'Machine voltage, frequency, air supply and technical configuration shall be based on the equipment specifications finally agreed by both parties. Production capacity shall be verified under the agreed product, transfer film, tooling and testing conditions.',
      'Under normal operation and maintenance, after-sales service for component failures arising from manufacturing defects shall be provided within the warranty period and scope agreed by both parties. Wear parts, installation, training and other services shall be governed by the contract.',
    ].join('\\n\\n'),
    processing: [
      'Products supplied by the buyer must meet the mutually agreed requirements for material, dimensions and surface quality. We will carry out the agreed pre-printing incoming inspection after receipt. If contamination, damage or other abnormalities are found, both parties shall agree on return, cleaning or other handling arrangements.',
      'For standard processing, we recommend providing an additional 3% of the order quantity as spare products for trial production and process loss. Responsibility for any loss shall be determined according to its actual cause and the agreement between both parties. The spare allowance for complex products or special processes must be agreed separately before production.',
    ].join('\\n\\n'),
  };
  return english[type];
}
export interface ProductNotice {
  type: ProductNoticeType;
  title: string;
  text: string;
  isCustomized: boolean;
}

export function defaultProductNotice(draft: CommercialDocumentDraft, type: ProductNoticeType): string {
  return defaultNoticeText(draft, type);
}

export function documentProductNotices(draft: CommercialDocumentDraft): ProductNotice[] {
  return activeNoticeTypes(draft.sections).map(type => {
    const rawOverride = draft.noticeOverrides?.[type]?.[draft.language];
    const hasOverride = typeof rawOverride === 'string' && !!rawOverride.trim();
    return {
      type,
      title: NOTICE_TITLES[type][draft.language],
      text: hasOverride ? rawOverride!.trim() : defaultNoticeText(draft, type),
      isCustomized: hasOverride,
    };
  });
}
