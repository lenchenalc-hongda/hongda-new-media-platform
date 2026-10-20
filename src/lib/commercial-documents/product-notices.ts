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
  plate: { zh: '版费', en: 'Copper gravure plate' },
  gravure_film: { zh: '凹版热转印花膜', en: 'Gravure transfer film' },
  digital_film: { zh: '数码热转印花膜', en: 'Digital transfer film' },
  machine: { zh: '机器设备', en: 'Machine configuration and warranty' },
  processing: { zh: '热转印加工', en: 'Transfer printing service' },
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
  // English wording stays on the existing template until the English version is approved.
  const voltage = draft.machineVoltage?.trim() || 'to be confirmed';
  const frequency = draft.machineFrequency?.trim() || 'to be confirmed';
  const warranty = draft.machineWarrantyPeriod?.trim() || 'to be confirmed';
  if (type === 'machine') {
    if (draft.kind === 'machine_contract') {
      return `Power specification: ${voltage} / ${frequency}, subject to the final confirmed equipment configuration. The warranty for non-human-caused component faults follows the agreed warranty terms of this contract.`;
    }
    return `Standard power: ${voltage} / ${frequency}, subject to the confirmed machine configuration. Warranty for component faults not caused by human factors: ${warranty}; scope and start date subject to written agreement.`;
  }
  const english: Record<Exclude<ProductNoticeType, 'machine'>, string> = {
    plate: 'Copper gravure plates have an 18-month quality guarantee from the plate-making date. We bear repair costs during this period. Plates older than 18 months with no orders for one full year will be scrapped.',
    gravure_film: '(1) Printing color and registration may vary by batch (generally about half a PANTONE shade designation and ±0.3 mm registration). The mutually approved proof or customer-provided sample governs. A physical sample must be supplied before plate making and proofing if sample matching is required.\n(2) Transfer adhesion must be verified on the buyer’s actual substrate through supplier sampling and buyer trial approval.',
    digital_film: 'Digital transfer film is produced to the colors in the customer’s finally approved artwork file. Any special color-matching requirements must be provided and confirmed by both parties before production.',
    processing: 'Incoming products must be clean. We conduct incoming pre-printing inspections; contamination beyond the mutually agreed threshold requires return or separate handling agreement. A 3% spare allowance is normally reserved for processing, with efforts to minimize usage; difficult products may require a separately agreed higher allowance.',
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
