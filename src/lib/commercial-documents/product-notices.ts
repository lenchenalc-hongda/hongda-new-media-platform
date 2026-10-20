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
  plate: { zh: '开版及铜版', en: 'Copper gravure plate' },
  gravure_film: { zh: '凹版热转印花膜', en: 'Gravure transfer film' },
  digital_film: { zh: '数码热转印花膜', en: 'Digital transfer film' },
  machine: { zh: '机器出厂及保修', en: 'Machine configuration and warranty' },
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

function defaultNoticeText(draft: CommercialDocumentDraft, type: ProductNoticeType): string {
  const en = draft.language === 'en';
  const voltage = draft.machineVoltage?.trim() || (en ? 'to be confirmed' : '待确认');
  const frequency = draft.machineFrequency?.trim() || (en ? 'to be confirmed' : '待确认');
  const warranty = draft.machineWarrantyPeriod?.trim() || (en ? 'to be confirmed' : '待填写');
  if (type === 'machine') {
    if (draft.kind === 'machine_contract') {
      return en
        ? `Power specification: ${voltage} / ${frequency}, subject to the final confirmed equipment configuration. The warranty for non-human-caused component faults follows the agreed warranty terms of this contract.`
        : `设备供电配置：${voltage}／${frequency}，以双方最终确认的设备参数为准。非人为因素造成的零部件故障，按本合同双方确认的售后与保修条款执行。`;
    }
    return en
      ? `Standard power: ${voltage} / ${frequency}, subject to the confirmed machine configuration. Warranty for component faults not caused by human factors: ${warranty}; scope and start date subject to written agreement.`
      : `设备默认供电：${voltage}／${frequency}，具体以双方最终确认的机型和配置为准。非人为因素造成的零部件故障保修期为${warranty}；保修范围及起算时间以双方书面确认为准。`;
  }
  const zh: Record<Exclude<ProductNoticeType, 'machine'>, string> = {
    plate: '铜版自开版日起保质期18个月；保质期内一切修补费用由我司承担。超过18个月且连续一年未下单的印版，我司直接作报废处理。',
    gravure_film: '（1）印刷色彩、套印精度存在一定批次差异，一般约为±半个PANTONE色卡号、±0.3mm；以双方确认的打样稿或客户提供的样板为准。需对实物样板的，应提供样板用于开版和打样。\n（2）烫印结合力应依据需方实际材质，由供方送样、需方试烫确认。',
    digital_film: '数码热转印花膜仅按客户最终确认的电子图稿文件及其颜色生产；如有特殊颜色或对样要求，应在生产前提供参考并由双方确认。',
    processing: '请确保客户来料清洁。我司入库后进行印前抽检；脏污超过双方确认的比例时，来料退回或另行协商处理。加工默认预留3%备品，并力求降低；产品难度较大时，备品比例需另行协商。',
  };
  const english: Record<Exclude<ProductNoticeType, 'machine'>, string> = {
    plate: 'Copper gravure plates have an 18-month quality guarantee from the plate-making date. We bear repair costs during this period. Plates older than 18 months with no orders for one full year will be scrapped.',
    gravure_film: '(1) Printing color and registration may vary by batch (generally about half a PANTONE shade designation and ±0.3 mm registration). The mutually approved proof or customer-provided sample governs. A physical sample must be supplied before plate making and proofing if sample matching is required.\n(2) Transfer adhesion must be verified on the buyer’s actual substrate through supplier sampling and buyer trial approval.',
    digital_film: 'Digital transfer film is produced to the colors in the customer’s finally approved artwork file. Any special color-matching requirements must be provided and confirmed by both parties before production.',
    processing: 'Incoming products must be clean. We conduct incoming pre-printing inspections; contamination beyond the mutually agreed threshold requires return or separate handling agreement. A 3% spare allowance is normally reserved for processing, with efforts to minimize usage; difficult products may require a separately agreed higher allowance.',
  };
  return en ? english[type] : zh[type];
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
