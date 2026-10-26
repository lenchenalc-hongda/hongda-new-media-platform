// HongdaOS Commercial Documents - draft-only template model.
// No price/tax inference: sales enters the final agreed unit prices.
export type DocumentKind = 'quotation' | 'machine_contract';
export type DocumentMarket = 'domestic' | 'export';
export type DocumentLanguage = 'zh' | 'en';
export type TaxStatement = 'exclusive' | 'vat13';
export type ItemMode = 'amount' | 'catalog';
import { NOTICE_TYPES } from './product-notices';
import type { NoticeOverrides, NoticeSelection } from './product-notices';
import { isPaymentMethodSelectionId } from './payment-methods';

export const FIXED_SELLER_NAME = '广东宏达印业股份有限公司';
export const FIXED_SELLER_NAME_EN = 'GUANGDONG HONGDA PRINTING CO.,LTD.';
export function fixedSellerName(language: DocumentLanguage): string {
  return language === 'en' ? FIXED_SELLER_NAME_EN : FIXED_SELLER_NAME;
}

export const PAYMENT_PRESETS = [
  { value: 'film_monthly', label: '版费先付，花膜月结', text: '版费先付，花膜月结。' },
  { value: 'film_before_shipping', label: '版费先付，花膜发货前付款', text: '版费先付，花膜发货前付款。' },
  { value: 'monthly', label: '月结', text: '月结。' },
  { value: 'credit_days', label: '账期多少天', text: '' },
  { value: 'machine_deposit', label: '机器：定金50%，发货前付清尾款', text: '机器定金50%，发货前付清剩余50%尾款。' },
  { value: 'other', label: '其他（自行填写）', text: '' },
] as const;
export type PaymentPreset = '' | (typeof PAYMENT_PRESETS)[number]['value'];

export const SHIPPING_PRESETS = [
  { value: 'exw', label: 'EXW', text: 'EXW（工厂交货），具体交货地点以双方约定为准。' },
  { value: 'ddp', label: 'DDP', text: 'DDP（完税后交货），具体目的地以双方约定为准。' },
  { value: 'included', label: '含运费', text: '含运费。' },
  { value: 'excluded', label: '不含运费', text: '不含运费。' },
  { value: 'pickup', label: '客户自提', text: '客户自提。' },
  { value: 'other', label: '其他（自行填写）', text: '' },
] as const;
export const INCOTERMS_2020 = [
  { value: 'exw', label: 'EXW — Ex Works', text: 'EXW — Ex Works (seller makes goods available at the named place; buyer arranges collection; named place/port: [specify]) — Incoterms® 2020.' },
  { value: 'fca', label: 'FCA — Free Carrier', text: 'FCA — Free Carrier (seller delivers to the buyer’s nominated carrier at the named place; named place/port: [specify]) — Incoterms® 2020.' },
  { value: 'cpt', label: 'CPT — Carriage Paid To', text: 'CPT — Carriage Paid To (seller pays carriage to the named destination; risk transfers on delivery to the carrier; named place/port: [specify]) — Incoterms® 2020.' },
  { value: 'cip', label: 'CIP — Carriage and Insurance Paid To', text: 'CIP — Carriage and Insurance Paid To (seller pays carriage and insurance to destination; risk transfers on delivery to the carrier; named place/port: [specify]) — Incoterms® 2020.' },
  { value: 'dap', label: 'DAP — Delivered at Place', text: 'DAP — Delivered at Place (seller delivers ready for unloading at the named destination; buyer handles import clearance; named place/port: [specify]) — Incoterms® 2020.' },
  { value: 'dpu', label: 'DPU — Delivered at Place Unloaded', text: 'DPU — Delivered at Place Unloaded (seller delivers and unloads at the named destination; buyer handles import clearance; named place/port: [specify]) — Incoterms® 2020.' },
  { value: 'ddp', label: 'DDP — Delivered Duty Paid', text: 'DDP — Delivered Duty Paid (seller delivers ready for unloading with import clearance and duties paid; named place/port: [specify]) — Incoterms® 2020.' },
  { value: 'fas', label: 'FAS — Free Alongside Ship', text: 'FAS — Free Alongside Ship (seller delivers alongside the vessel at the named port of shipment; named place/port: [specify]) — Incoterms® 2020.' },
  { value: 'fob', label: 'FOB — Free On Board', text: 'FOB — Free On Board (seller loads goods on board at the named port of shipment; named place/port: [specify]) — Incoterms® 2020.' },
  { value: 'cfr', label: 'CFR — Cost and Freight', text: 'CFR — Cost and Freight (seller pays freight to the named destination port; risk transfers once on board; named place/port: [specify]) — Incoterms® 2020.' },
  { value: 'cif', label: 'CIF — Cost, Insurance and Freight', text: 'CIF — Cost, Insurance and Freight (seller pays freight and insurance to destination port; risk transfers once on board; named place/port: [specify]) — Incoterms® 2020.' },
] as const;
export type ShippingPreset = '' | (typeof SHIPPING_PRESETS)[number]['value'] | (typeof INCOTERMS_2020)[number]['value'];

const PAYMENT_TEXT_EN: Partial<Record<PaymentPreset, string>> = {
  film_monthly: 'Plate-making fees payable in advance; transfer film payments settled monthly.',
  film_before_shipping: 'Plate-making fees payable in advance; transfer film payments due before shipment.',
  monthly: 'Monthly settlement.',
  machine_deposit: '50% deposit for the machine; remaining 50% balance payable before shipment.',
};

const SHIPPING_TEXT_EN: Partial<Record<ShippingPreset, string>> = {
  exw: 'EXW (Ex Works), named place to be agreed.',
  ddp: 'DDP (Delivered Duty Paid), named destination to be agreed.',
  included: 'Freight included.',
  excluded: 'Freight excluded.',
  pickup: 'Buyer pickup.',
};

export function paymentPresetText(preset: PaymentPreset, days: string, language: DocumentLanguage = 'zh'): string {
  if (preset === 'credit_days') {
    if (!/^\d{1,3}$/.test(days) || Number(days) < 1 || Number(days) > 365) return '';
    return language === 'en'
      ? 'Payment term: ' + Number(days) + ' days; start date subject to mutual agreement.'
      : '账期' + Number(days) + '天，具体起算时间以双方约定为准。';
  }
  return language === 'en'
    ? PAYMENT_TEXT_EN[preset] ?? ''
    : PAYMENT_PRESETS.find(option => option.value === preset)?.text ?? '';
}

export function shippingPresetText(preset: ShippingPreset, language: DocumentLanguage = 'zh', useIncoterms = false): string {
  if (language === 'en' && useIncoterms) {
    const incoterm = INCOTERMS_2020.find(option => option.value === preset);
    if (incoterm) return incoterm.text;
  }
  return language === 'en'
    ? SHIPPING_TEXT_EN[preset] ?? ''
    : SHIPPING_PRESETS.find(option => option.value === preset)?.text ?? '';
}

/** Randomized, non-sequential document numbers. Central uniqueness requires a durable registry. */
export function formatDocumentNumber(kind: DocumentKind, date: string, randomCode: string): string {
  const yearMonth = /^\d{4}-\d{2}/.test(date) ? date.slice(2, 4) + date.slice(5, 7) : '0000';
  return 'HD-' + (kind === 'quotation' ? 'Q' : 'C') + '-' + yearMonth + '-' + randomCode;
}
export function isGeneratedDocumentNumber(value: string): boolean {
  return /^HD-[QC]-\d{4}-[A-HJ-NP-Z2-9]{12}$/.test(value);
}


export interface DocumentItem {
  id: string;
  name: string;
  specification: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  mode: ItemMode;
  note: string;
}

export interface DocumentSection {
  id: string;
  title: string;
  items: DocumentItem[];
  /** Optional for backward-compatible V1/V1.1 JSON drafts. */
  noticeType?: NoticeSelection;
}

export interface CommercialDocumentDraft {
  kind: DocumentKind;
  market: DocumentMarket;
  language: DocumentLanguage;
  currency: 'CNY' | 'USD' | 'EUR';
  documentNo: string;
  date: string;
  sellerName: string;
  // Retained only for backward-compatible JSON imports; never printed or editable.
  sellerAddress: string;
  sellerContact: string;
  buyerName: string;
  buyerAddress: string;
  buyerContact: string;
  salespersonName: string;
  buyerCustomerReferenceId: string;
  projectName: string;
  taxStatement: TaxStatement;
  validity: string;
  deliveryTerms: string;
  paymentTerms: string;
  paymentPreset: PaymentPreset;
  paymentDays: string;
  shippingTerms: string;
  shippingPreset: ShippingPreset;
  warrantyTerms: string;
  acceptanceTerms: string;
  additionalTerms: string;
  /** Machine defaults are editable for each quote, never universal equipment specs. */
  machineVoltage?: string;
  machineFrequency?: string;
  machineWarrantyPeriod?: string;
  /** User-edited notice text, per category and language. */
  noticeOverrides?: NoticeOverrides;
  // Optional at template stage. Only enter account data approved by Finance.
  accountLabel: string;
  accountDetails: string;
  /** Selected approved catalog UUID; account values never stored in editable JSON. */
  paymentMethodId?: string;
  sections: DocumentSection[];
}

export function blankItem(id: string): DocumentItem {
  return { id, name: '', specification: '', quantity: '1', unit: '项', unitPrice: '',
    mode: 'amount', note: '' };
}

export function initialDraft(salespersonName = ''): CommercialDocumentDraft {
  return {
    kind: 'quotation',
    market: 'domestic',
    language: 'zh',
    currency: 'CNY',
    documentNo: '',
    date: new Date().toISOString().slice(0, 10),
    sellerName: FIXED_SELLER_NAME,
    sellerAddress: '',
    sellerContact: '',
    buyerName: '',
    buyerAddress: '',
    buyerContact: '',
    salespersonName,
    buyerCustomerReferenceId: '',
    projectName: '',
    taxStatement: 'exclusive',
    validity: '',
    deliveryTerms: '',
    paymentTerms: '',
    paymentPreset: '',
    paymentDays: '30',
    shippingTerms: '',
    shippingPreset: '',
    warrantyTerms: '',
    acceptanceTerms: '',
    additionalTerms: '',
    machineVoltage: '220V',
    machineFrequency: '60Hz',
    machineWarrantyPeriod: '',
    noticeOverrides: {},
    accountLabel: '',
    accountDetails: '',
    paymentMethodId: '',
    sections: [
      { id: 'section-initial', title: '版费', items: [blankItem('item-initial')] },
    ],
  };
}

/** Historical name: quote money is stored in integer 0.001 units (not cents).
 * Keep the existing API to avoid changing saved draft shapes and consumers.
 * Currency and tax are display-only: no implicit conversion or tax calculation.
 */
export function moneyToMinor(value: string): number | null {
  const text = value.trim();
  if (!/^\d{1,11}(?:\.\d{1,3})?$/.test(text)) return null;
  const [whole, fraction = ''] = text.split('.');
  const thousandths = Number(whole) * 1000 + Number(fraction.padEnd(3, '0'));
  return Number.isSafeInteger(thousandths) ? thousandths : null;
}

/** Quantity is fixed-point 1/1000 unit, not binary float. */
export function quantityToMilli(value: string): number | null {
  const text = value.trim();
  if (!/^\d{1,9}(?:\.\d{1,3})?$/.test(text)) return null;
  const [whole, fraction = ''] = text.split('.');
  const milli = Number(whole) * 1000 + Number(fraction.padEnd(3, '0'));
  return Number.isSafeInteger(milli) && milli > 0 ? milli : null;
}

export function itemAmountMinor(item: DocumentItem): number | null {
  if (item.mode === 'catalog') return null;
  const minor = moneyToMinor(item.unitPrice);
  const milli = quantityToMilli(item.quantity);
  if (minor === null || milli === null) return null;
  // Both operands are integer thousandths. Multiply exactly, then round each
  // line to 0.001 (half-up for these nonnegative values). Never round the
  // entered unit price to cents before multiplication.
  const total = (BigInt(minor) * BigInt(milli) + BigInt(500)) / BigInt(1000);
  return total <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(total) : null;
}

export interface SectionAmount {
  /** Integer thousandths (0.001) for bilingual quote/contract amounts. */
  amountMinor: number;
  amountLines: number;
  catalogLines: number;
  invalidLines: number;
}

export function sectionAmount(section: DocumentSection): SectionAmount {
  return section.items.reduce<SectionAmount>((result, item) => {
    if (item.mode === 'catalog') {
      result.catalogLines++;
      return result;
    }
    const amount = itemAmountMinor(item);
    if (amount === null || !Number.isSafeInteger(result.amountMinor + amount)) {
      result.invalidLines++;
    } else {
      result.amountMinor += amount;
      result.amountLines++;
    }
    return result;
  }, { amountMinor: 0, amountLines: 0, catalogLines: 0, invalidLines: 0 });
}

export function documentAmount(draft: CommercialDocumentDraft): SectionAmount {
  return draft.sections.reduce<SectionAmount>((result, section) => {
    const subtotal = sectionAmount(section);
    if (!Number.isSafeInteger(result.amountMinor + subtotal.amountMinor)) {
      result.invalidLines++;
    } else {
      result.amountMinor += subtotal.amountMinor;
    }
    result.amountLines += subtotal.amountLines;
    result.catalogLines += subtotal.catalogLines;
    result.invalidLines += subtotal.invalidLines;
    return result;
  }, { amountMinor: 0, amountLines: 0, catalogLines: 0, invalidLines: 0 });
}

/** Format integer thousandths exactly, including very large safe totals.
 * Keep two fractional digits for older prices; show the third only if nonzero.
 */
export function formatMoney(amountMinor: number, currency: string): string {
  if (!Number.isSafeInteger(amountMinor)) return '—';
  const absolute = BigInt(Math.abs(amountMinor));
  const whole = absolute / BigInt(1000);
  const remainder = String(absolute % BigInt(1000)).padStart(3, '0');
  const decimals = remainder.endsWith('0') ? remainder.slice(0, 2) : remainder;
  const currencyPrefix = new Intl.NumberFormat('zh-CN', {
    style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(whole);
  return (amountMinor < 0 ? '-' : '') + currencyPrefix + '.' + decimals;
}

export function validateForPrint(draft: CommercialDocumentDraft): string[] {
  const errors: string[] = [];
  if (draft.sellerName !== FIXED_SELLER_NAME) errors.push('卖方公司名称必须使用固定的宏达正式主体');
  if (!draft.salespersonName.trim()) errors.push('缺少当前登录的业务员姓名');
  if (!draft.buyerName.trim()) errors.push('请填写客户名称');
  if (!draft.documentNo.trim() || draft.documentNo.length > 80) errors.push('请填写有效的单据编号');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.date)) errors.push('请填写正确的单据日期');
  if (draft.paymentPreset === 'credit_days' && !paymentPresetText('credit_days', draft.paymentDays)) {
    errors.push('账期天数必须是1到365之间的整数');
  }
  if (draft.sections.length === 0) errors.push('请至少添加一个报价大项');
  for (const [groupIndex, section] of draft.sections.entries()) {
    const prefix = '大项 ' + (groupIndex + 1);
    if (!section.title.trim()) errors.push(prefix + '：缺少名称');
    if (section.items.length === 0) errors.push(prefix + '：请至少填写一条明细');
    for (const [lineIndex, item] of section.items.entries()) {
      const name = prefix + ' 第 ' + (lineIndex + 1) + ' 行';
      if (!item.name.trim()) errors.push(name + '：缺少产品名称');
      if (moneyToMinor(item.unitPrice) === null) errors.push(name + '：请输入有效单价（最多3位小数）');
      if (item.mode === 'amount' && quantityToMilli(item.quantity) === null) {
        errors.push(name + '：请输入有效数量（最多3位小数）');
      }
      if (draft.kind === 'machine_contract' && item.mode === 'catalog') {
        errors.push(name + '：合同不能包含未确定数量的单价目录');
      }
    }
  }
  if (draft.kind === 'machine_contract') {
    if (!draft.paymentTerms.trim()) errors.push('机器合同必须填写经确认的付款条款');
    if (!draft.deliveryTerms.trim()) errors.push('机器合同必须填写经确认的交付条款');
    if (!draft.acceptanceTerms.trim()) errors.push('机器合同必须填写经确认的验收条款');
    if (!draft.warrantyTerms.trim()) errors.push('机器合同必须填写经确认的售后/保修条款');
  }
  if (documentAmount(draft).invalidLines > 0) errors.push('存在无法计算的报价明细');
  return errors;
}

/** Narrow import guard for local JSON draft files. Not a trust boundary for server data. */
export function isDraftShape(value: unknown): value is CommercialDocumentDraft {
  if (!value || typeof value !== 'object') return false;
  const draft = value as Partial<CommercialDocumentDraft>;
  return (
    (draft.kind === 'quotation' || draft.kind === 'machine_contract')
    && (draft.market === 'domestic' || draft.market === 'export')
    && (draft.language === 'zh' || draft.language === 'en')
    && ['CNY', 'USD', 'EUR'].includes(draft.currency || '')
    && (draft.taxStatement === 'exclusive' || draft.taxStatement === 'vat13')
    && ['documentNo', 'date', 'sellerName', 'sellerAddress', 'sellerContact',
      'buyerName', 'buyerAddress', 'buyerContact', 'projectName', 'validity',
      'deliveryTerms', 'paymentTerms', 'shippingTerms', 'warrantyTerms',
      'acceptanceTerms', 'additionalTerms', 'accountLabel', 'accountDetails']
      .every(k => typeof (draft as Record<string, unknown>)[k] === 'string')
    && (draft.paymentMethodId === undefined
      || typeof draft.paymentMethodId === 'string' && isPaymentMethodSelectionId(draft.paymentMethodId))
    && (draft.salespersonName === undefined || typeof draft.salespersonName === 'string')
    && (draft.buyerCustomerReferenceId === undefined || typeof draft.buyerCustomerReferenceId === 'string')
    && (draft.paymentDays === undefined || typeof draft.paymentDays === 'string')
    && (draft.paymentPreset === undefined || draft.paymentPreset === '' || PAYMENT_PRESETS.some(option => option.value === draft.paymentPreset))
    && (draft.shippingPreset === undefined || draft.shippingPreset === '' || [...SHIPPING_PRESETS, ...INCOTERMS_2020].some(option => option.value === draft.shippingPreset))
    && (draft.machineVoltage === undefined || typeof draft.machineVoltage === 'string' && draft.machineVoltage.length <= 60)
    && (draft.machineFrequency === undefined || typeof draft.machineFrequency === 'string' && draft.machineFrequency.length <= 60)
    && (draft.machineWarrantyPeriod === undefined || typeof draft.machineWarrantyPeriod === 'string' && draft.machineWarrantyPeriod.length <= 60)
    && (draft.noticeOverrides === undefined || (
      !!draft.noticeOverrides && typeof draft.noticeOverrides === 'object' && !Array.isArray(draft.noticeOverrides)
      && Object.entries(draft.noticeOverrides).every(([key, languageText]) =>
        NOTICE_TYPES.some(type => type === key) && !!languageText
        && typeof languageText === 'object' && !Array.isArray(languageText)
        && Object.entries(languageText).every(([language, text]) =>
          (language === 'zh' || language === 'en') && typeof text === 'string' && text.length <= 2000))
    ))
    && Array.isArray(draft.sections) && draft.sections.length <= 50
    && draft.sections.every(g => typeof g?.id === 'string'
      && typeof g?.title === 'string' && (g.noticeType === undefined || g.noticeType === 'auto' || g.noticeType === 'none' || NOTICE_TYPES.some(type => type === g.noticeType))
      && Array.isArray(g?.items) && g.items.length <= 200
      && g.items.every(i => typeof i?.id === 'string'
        && ['amount', 'catalog'].includes(i?.mode)
        && ['name', 'specification', 'quantity', 'unit', 'unitPrice', 'note']
          .every(k => typeof (i as unknown as Record<string, unknown>)[k] === 'string')))
  );
}

/** Restore older JSON drafts safely; hidden seller, address and payment data are not trusted. */
export function normalizeImportedDraft(draft: CommercialDocumentDraft, salespersonName: string): CommercialDocumentDraft {
  return {
    ...draft,
    sellerName: FIXED_SELLER_NAME,
    sellerAddress: '',
    sellerContact: '',
    buyerAddress: '',
    salespersonName,
    buyerCustomerReferenceId: '',
    paymentPreset: PAYMENT_PRESETS.some(option => option.value === draft.paymentPreset)
      ? draft.paymentPreset : draft.paymentTerms ? 'other' : '',
    paymentDays: typeof draft.paymentDays === 'string' ? draft.paymentDays : '30',
    machineVoltage: typeof draft.machineVoltage === 'string' ? draft.machineVoltage : '220V',
    machineFrequency: typeof draft.machineFrequency === 'string' ? draft.machineFrequency : '60Hz',
    machineWarrantyPeriod: typeof draft.machineWarrantyPeriod === 'string' ? draft.machineWarrantyPeriod : '',
    noticeOverrides: draft.noticeOverrides ?? {},
    shippingPreset: [...SHIPPING_PRESETS, ...INCOTERMS_2020].some(option => option.value === draft.shippingPreset)
      ? draft.shippingPreset : draft.shippingTerms ? 'other' : '',
    accountLabel: '',
    accountDetails: '',
    paymentMethodId: typeof draft.paymentMethodId === 'string' && isPaymentMethodSelectionId(draft.paymentMethodId)
      ? draft.paymentMethodId : '',
  };
}
