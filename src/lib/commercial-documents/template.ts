// HongdaOS Commercial Documents - draft-only template model.
// No price/tax inference: sales enters the final agreed unit prices.
export type DocumentKind = 'quotation' | 'machine_contract';
export type DocumentMarket = 'domestic' | 'export';
export type DocumentLanguage = 'zh' | 'en';
export type TaxStatement = 'exclusive' | 'vat13';
export type ItemMode = 'amount' | 'catalog';

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
}

export interface CommercialDocumentDraft {
  kind: DocumentKind;
  market: DocumentMarket;
  language: DocumentLanguage;
  currency: 'CNY' | 'USD' | 'EUR';
  documentNo: string;
  date: string;
  sellerName: string;
  sellerAddress: string;
  sellerContact: string;
  buyerName: string;
  buyerAddress: string;
  buyerContact: string;
  projectName: string;
  taxStatement: TaxStatement;
  validity: string;
  deliveryTerms: string;
  paymentTerms: string;
  shippingTerms: string;
  warrantyTerms: string;
  acceptanceTerms: string;
  additionalTerms: string;
  // Optional at template stage. Only enter account data approved by Finance.
  accountLabel: string;
  accountDetails: string;
  sections: DocumentSection[];
}

export function blankItem(id: string): DocumentItem {
  return { id, name: '', specification: '', quantity: '1', unit: '项', unitPrice: '',
    mode: 'amount', note: '' };
}

export function initialDraft(): CommercialDocumentDraft {
  return {
    kind: 'quotation',
    market: 'domestic',
    language: 'zh',
    currency: 'CNY',
    documentNo: '',
    date: new Date().toLocaleDateString('en-CA'),
    sellerName: '',
    sellerAddress: '',
    sellerContact: '',
    buyerName: '',
    buyerAddress: '',
    buyerContact: '',
    projectName: '',
    taxStatement: 'exclusive',
    validity: '',
    deliveryTerms: '',
    paymentTerms: '',
    shippingTerms: '',
    warrantyTerms: '',
    acceptanceTerms: '',
    additionalTerms: '',
    accountLabel: '',
    accountDetails: '',
    sections: [
      { id: 'section-initial', title: '版费', items: [blankItem('item-initial')] },
    ],
  };
}

/** Money is integer minor units. Accept up to two decimal places. */
export function moneyToMinor(value: string): number | null {
  const text = value.trim();
  if (!/^\d{1,11}(?:\.\d{1,2})?$/.test(text)) return null;
  const [whole, fraction = ''] = text.split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(cents) ? cents : null;
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
  // Round each line to the currency's smallest minor unit.
  const total = Math.round((minor * milli) / 1000);
  return Number.isSafeInteger(total) ? total : null;
}

export interface SectionAmount {
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
    result.amountMinor += subtotal.amountMinor;
    result.amountLines += subtotal.amountLines;
    result.catalogLines += subtotal.catalogLines;
    result.invalidLines += subtotal.invalidLines;
    return result;
  }, { amountMinor: 0, amountLines: 0, catalogLines: 0, invalidLines: 0 });
}

export function formatMoney(amountMinor: number, currency: string): string {
  return new Intl.NumberFormat('zh-CN', {
    style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(amountMinor / 100);
}

export function validateForPrint(draft: CommercialDocumentDraft): string[] {
  const errors: string[] = [];
  if (!draft.sellerName.trim()) errors.push('请填写正式卖方/报价主体名称');
  if (!draft.buyerName.trim()) errors.push('请填写客户名称');
  if (!draft.documentNo.trim()) errors.push('请填写单据编号');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.date)) errors.push('请填写正确的单据日期');
  if (draft.sections.length === 0) errors.push('请至少添加一个报价大项');
  for (const [groupIndex, section] of draft.sections.entries()) {
    const prefix = '大项 ' + (groupIndex + 1);
    if (!section.title.trim()) errors.push(prefix + '：缺少名称');
    if (section.items.length === 0) errors.push(prefix + '：请至少填写一条明细');
    for (const [lineIndex, item] of section.items.entries()) {
      const name = prefix + ' 第 ' + (lineIndex + 1) + ' 行';
      if (!item.name.trim()) errors.push(name + '：缺少产品名称');
      if (moneyToMinor(item.unitPrice) === null) errors.push(name + '：请输入有效单价（最多2位小数）');
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
    && Array.isArray(draft.sections) && draft.sections.length <= 50
    && draft.sections.every(g => typeof g?.id === 'string'
      && typeof g?.title === 'string' && Array.isArray(g?.items) && g.items.length <= 200
      && g.items.every(i => typeof i?.id === 'string'
        && ['amount', 'catalog'].includes(i?.mode)
        && ['name', 'specification', 'quantity', 'unit', 'unitPrice', 'note']
          .every(k => typeof (i as unknown as Record<string, unknown>)[k] === 'string')))
  );
}
