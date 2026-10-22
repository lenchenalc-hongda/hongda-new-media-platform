'use client';


import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import DocumentPreview from './DocumentPreview';
import {
  blankItem, documentAmount, formatMoney, initialDraft, isDraftShape,
  itemAmountMinor, sectionAmount, validateForPrint, formatDocumentNumber,
  isGeneratedDocumentNumber, fixedSellerName, PAYMENT_PRESETS,
  SHIPPING_PRESETS, paymentPresetText, shippingPresetText, normalizeImportedDraft,
  type CommercialDocumentDraft, type DocumentItem, type DocumentSection,
  type PaymentPreset, type ShippingPreset,
} from '@/lib/commercial-documents/template';
import {
  documentProductNotices, NOTICE_OPTIONS, NOTICE_TITLES, sectionNoticeType,
  type NoticeSelection, type ProductNoticeType,
} from '@/lib/commercial-documents/product-notices';

const SECTION_PRESETS = [
  { zh: '版费', en: 'Plate-making Fees' },
  { zh: '热转印花膜', en: 'Heat Transfer Film' },
  { zh: '数码花膜', en: 'Digital Heat Transfer Film' },
  { zh: '机器设备', en: 'Machinery and Equipment' },
  { zh: '夹具与配件', en: 'Tooling and Accessories' },
  { zh: '加工费用', en: 'Printing Service Fees' },
  { zh: '其他费用', en: 'Other Charges' },
] as const;
const SECTION_TITLES = new Map<string, { zh: string; en: string }>(
  SECTION_PRESETS.flatMap(preset => [[preset.zh, preset], [preset.en, preset]]),
);
function localizeSectionTitle(title: string, language: CommercialDocumentDraft['language']): string {
  return SECTION_TITLES.get(title)?.[language] ?? title;
}
const UNIT_PRESETS = [
  { zh: '支', en: 'sticks' },
  { zh: '张', en: 'sheets' },
  { zh: '平方米', en: 'm²' },
  { zh: 'pcs', en: 'pcs' },
  { zh: '套', en: 'sets' },
  { zh: '台', en: 'units' },
  { zh: '个', en: 'pieces' },
  { zh: '项', en: 'items' },
] as const;
function localizeUnit(unit: string, from: CommercialDocumentDraft['language'], to: CommercialDocumentDraft['language']): string {
  if (from === to) return unit;
  const mapping: Record<string, string> = from === 'zh'
    ? { '支': 'sticks', '张': 'sheets', '平方米': 'm²', 'pcs': 'pcs', '套': 'sets', '台': 'units', '个': 'pieces', '项': 'items' }
    : { 'sticks': '支', 'pcs': 'pcs', 'pieces': '个', 'sheets': '张', 'm²': '平方米', 'sets': '套', 'units': '台', 'items': '项' };
  return mapping[unit.trim()] ?? unit;
}
const CURRENCIES = ['CNY', 'USD', 'EUR'] as const;
let sequence = 1;
function id(prefix: string) { return prefix + '-' + Date.now() + '-' + sequence++; }

// 12 cryptographically random characters in a human-readable, non-sequential ID.
// This does not replace database-side unique constraints for saved documents.
function createDocumentNo(kind: CommercialDocumentDraft['kind'], date: string): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 32 characters.
  const bytes = new Uint8Array(12);
  window.crypto.getRandomValues(bytes);
  const code = Array.from(bytes, byte => alphabet[byte & 31]).join('');
  return formatDocumentNumber(kind, date, code);
}

interface CustomerOption { id: string; name: string; }
function localDateToday(): string {
  const date = new Date();
  return [String(date.getFullYear()).padStart(4, '0'),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')].join('-');
}

function Field({
  label, value, onChange, placeholder, multiline = false, required = false, type = 'text',
}: {
  label: string; value: string; onChange: (value: string) => void; placeholder?: string;
  multiline?: boolean; required?: boolean; type?: string;
}) {
  return (
    <label className="block min-w-0">
      <span className="block text-xs font-medium text-gray-600 mb-1">{label}{required && <span className="text-red-600 ml-1">*</span>}</span>
      {multiline
        ? <textarea value={value} onChange={event => onChange(event.target.value)}
            placeholder={placeholder} rows={2} maxLength={2000} className="w-full bg-white text-sm" />
        : <input type={type} value={value} onChange={event => onChange(event.target.value)}
            placeholder={placeholder} maxLength={300} className="w-full bg-white text-sm" />}
    </label>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border border-gray-200 rounded-xl bg-white p-4 space-y-3">
      <h2 className="text-sm font-bold text-gray-800">{title}</h2>
      {children}
    </section>
  );
}

export default function DocumentWorkbench({ userName }: { userName: string }) {
  const [draft, setDraft] = useState<CommercialDocumentDraft>(() => initialDraft(userName));
  const [errors, setErrors] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<'edit' | 'preview'>('edit');
  const [customerSearchOpen, setCustomerSearchOpen] = useState(false);
  const [customerOptions, setCustomerOptions] = useState<CustomerOption[]>([]);
  const [customerError, setCustomerError] = useState('');
  const [customerLoading, setCustomerLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Generate after hydration to avoid server/client random-ID mismatches.
  useEffect(() => {
    const date = localDateToday();
    const nextNumber = createDocumentNo('quotation', date);
    setDraft(previous => previous.documentNo ? previous : { ...previous, date, documentNo: nextNumber });
  }, []);

  // Existing CPC references only. All customer read permissions remain enforced by Supabase RLS.
  useEffect(() => {
    const query = draft.buyerName.trim();
    if (!customerSearchOpen || !query || draft.buyerCustomerReferenceId) {
      setCustomerOptions([]);
      setCustomerLoading(false);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setCustomerLoading(true);
      setCustomerError('');
      try {
        const response = await fetch(
          '/api/commercial-documents/customer-options?q=' + encodeURIComponent(query),
          { cache: 'no-store', signal: controller.signal },
        );
        const json: { ok?: boolean; message?: string; customers?: CustomerOption[] } = await response.json();
        if (!response.ok || !json.ok) {
          setCustomerOptions([]);
          setCustomerError(json.message || '客户池暂不可用，可直接输入名称');
        } else {
          setCustomerOptions(Array.isArray(json.customers) ? json.customers : []);
        }
      } catch {
        if (!controller.signal.aborted) {
          setCustomerOptions([]);
          setCustomerError('无法读取客户池，可直接输入名称');
        }
      } finally {
        if (!controller.signal.aborted) setCustomerLoading(false);
      }
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [customerSearchOpen, draft.buyerName, draft.buyerCustomerReferenceId]);

  const patch = <K extends keyof CommercialDocumentDraft>(key: K, value: CommercialDocumentDraft[K]) => {
    setDraft(previous => ({ ...previous, [key]: value }));
    setErrors([]);
  };
  const changeDocumentKind = (kind: CommercialDocumentDraft['kind']) => {
    const nextNumber = createDocumentNo(kind, draft.date);
    setDraft(previous => ({
      ...previous,
      kind,
      documentNo: !previous.documentNo || isGeneratedDocumentNumber(previous.documentNo)
        ? nextNumber : previous.documentNo,
      sections: previous.sections.map(section => ({
        ...section,
        items: section.items.map(item => kind === 'machine_contract' && item.mode === 'catalog'
          ? { ...item, mode: 'amount', quantity: item.quantity || '1' } : item),
      })),
    }));
    setErrors([]);
  };

  const changeDate = (date: string) => {
    const number = createDocumentNo(draft.kind, date);
    setDraft(previous => ({
      ...previous,
      date,
      documentNo: isGeneratedDocumentNumber(previous.documentNo)
        && previous.date.slice(0, 7) !== date.slice(0, 7) ? number : previous.documentNo,
    }));
    setErrors([]);
  };

  const changeBuyerName = (buyerName: string) => {
    setDraft(previous => ({ ...previous, buyerName, buyerCustomerReferenceId: '' }));
    setCustomerSearchOpen(true);
    setErrors([]);
  };

  const selectCustomer = (customer: CustomerOption) => {
    setDraft(previous => ({
      ...previous,
      buyerName: customer.name,
      buyerCustomerReferenceId: customer.id,
    }));
    setCustomerSearchOpen(false);
    setCustomerOptions([]);
    setCustomerError('');
  };

  const changeLanguage = (language: CommercialDocumentDraft['language']) => {
    setDraft(previous => {
      const previousPaymentPreset = paymentPresetText(previous.paymentPreset, previous.paymentDays, previous.language);
      const previousShippingPreset = shippingPresetText(previous.shippingPreset, previous.language);
      return {
        ...previous,
        language,
        sections: previous.sections.map(section => ({ ...section, title: localizeSectionTitle(section.title, language), items: section.items.map(item => ({ ...item, unit: localizeUnit(item.unit, previous.language, language) })) })),
        paymentTerms: previousPaymentPreset && previous.paymentTerms === previousPaymentPreset
          ? paymentPresetText(previous.paymentPreset, previous.paymentDays, language) : previous.paymentTerms,
        shippingTerms: previousShippingPreset && previous.shippingTerms === previousShippingPreset
          ? shippingPresetText(previous.shippingPreset, language) : previous.shippingTerms,
      };
    });
    setErrors([]);
  };

  const choosePayment = (preset: PaymentPreset) => {
    setDraft(previous => ({
      ...previous,
      paymentPreset: preset,
      paymentTerms: preset === 'other' ? '' : paymentPresetText(preset, previous.paymentDays, previous.language),
    }));
    setErrors([]);
  };

  const setPaymentDays = (days: string) => {
    setDraft(previous => ({
      ...previous,
      paymentDays: days,
      paymentTerms: previous.paymentPreset === 'credit_days'
        ? paymentPresetText('credit_days', days, previous.language) : previous.paymentTerms,
    }));
    setErrors([]);
  };

  const chooseShipping = (preset: ShippingPreset) => {
    setDraft(previous => ({
      ...previous,
      shippingPreset: preset,
      shippingTerms: preset === 'other' ? '' : shippingPresetText(preset, previous.language),
    }));
    setErrors([]);
  };

  const updateSection = (sectionId: string, update: (section: DocumentSection) => DocumentSection) => {
    setDraft(previous => ({
      ...previous, sections: previous.sections.map(section => section.id === sectionId ? update(section) : section),
    }));
    setErrors([]);
  };
  const updateItem = (sectionId: string, itemId: string, change: Partial<DocumentItem>) => {
    updateSection(sectionId, section => ({
      ...section, items: section.items.map(item => item.id === itemId ? { ...item, ...change } : item),
    }));
  };
  const editProductNotice = (type: ProductNoticeType, value: string) => {
    setDraft(previous => ({
      ...previous,
      noticeOverrides: {
        ...previous.noticeOverrides,
        [type]: { ...previous.noticeOverrides?.[type], [previous.language]: value },
      },
    }));
    setErrors([]);
  };

  const resetProductNotice = (type: ProductNoticeType) => {
    setDraft(previous => ({
      ...previous,
      noticeOverrides: {
        ...previous.noticeOverrides,
        [type]: { ...previous.noticeOverrides?.[type], [previous.language]: undefined },
      },
    }));
    setErrors([]);
  };

  const addSection = (title: string) => {
    setDraft(previous => ({
      ...previous, sections: [
        ...previous.sections,
        { id: id('section'), title: localizeSectionTitle(title, previous.language), items: [{ ...blankItem(id('item')), unit: localizeUnit('项', 'zh', previous.language) }] },
      ],
    }));
    setErrors([]);
  };
  const moveSection = (index: number, offset: number) => {
    setDraft(previous => {
      const sections = [...previous.sections];
      const target = index + offset;
      if (target < 0 || target >= sections.length) return previous;
      [sections[index], sections[target]] = [sections[target], sections[index]];
      return { ...previous, sections };
    });
  };
  const removeSection = (section: DocumentSection) => {
    if (section.items.some(item => item.name.trim() || item.unitPrice.trim())
        && !window.confirm('此操作会删除该大项下的所有明细，确认删除？')) return;
    setDraft(previous => ({ ...previous, sections: previous.sections.filter(group => group.id !== section.id) }));
  };
  const removeItem = (section: DocumentSection, item: DocumentItem) => {
    if ((item.name.trim() || item.unitPrice.trim()) && !window.confirm('确定删除这条明细？')) return;
    updateSection(section.id, group => ({ ...group, items: group.items.filter(row => row.id !== item.id) }));
  };
  const moveItem = (sectionId: string, index: number, offset: number) => {
    updateSection(sectionId, section => {
      const rows = [...section.items];
      const target = index + offset;
      if (target < 0 || target >= rows.length) return section;
      [rows[index], rows[target]] = [rows[target], rows[index]];
      return { ...section, items: rows };
    });
  };

  const saveJson = () => {
    // Download a local file rather than storing commercial data in localStorage.
    const blob = new Blob([JSON.stringify(draft, null, 2)], { type: 'application/json;charset=utf-8' });
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = 'hongda-draft-' + (draft.documentNo.replace(/[^a-zA-Z0-9-_]/g, '_').slice(0, 60) || 'untitled') + '.json';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(objectUrl);
  };
  const importJson = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > 1_000_000) {
      setErrors(['草稿文件超过 1 MB，请检查内容。']);
      return;
    }
    try {
      const parsed: unknown = JSON.parse(await file.text());
      if (!isDraftShape(parsed)) throw new Error('bad draft shape');
      if (!window.confirm('导入将替换当前页面尚未下载的内容，确认继续？')) return;
      setDraft(normalizeImportedDraft(parsed, userName));
      setCustomerSearchOpen(false);
      setErrors([]);
      setActiveTab('edit');
    } catch {
      setErrors(['草稿格式不正确，无法导入。']);
    }
  };
  const printPdf = async () => {
    const problems = validateForPrint(draft);
    if (problems.length) {
      setErrors(problems);
      setActiveTab('edit');
      return;
    }
    setErrors([]);
    // Print the same preview only after its static image assets are decoded.
    try {
      const images = Array.from(document.querySelectorAll<HTMLImageElement>('#commercial-print img'));
      await Promise.all(images.map(image => image.decode()));
      window.print();
    } catch {
      setErrors(['PDF 抬头图片加载失败，请检查网络后重试。']);
    }
  };
  const total = documentAmount(draft);
  const productNotices = documentProductNotices(draft);

  return (
    <div className="commercial-root space-y-4">
      <div className="commercial-top-bar flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs text-gray-500 mb-1">HongdaOS / 商务单据中心</p>
          <h1 className="text-xl font-bold text-gray-900">报价单、机器合同与对账单</h1>
          <p className="text-xs text-gray-500 mt-1">登录用户：{userName} · 所有已登录员工可使用</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button type="button" className="btn-secondary btn-sm" onClick={saveJson}>下载草稿 JSON</button>
          <button type="button" className="btn-secondary btn-sm" onClick={() => fileRef.current?.click()}>导入草稿</button>
          <input aria-label="导入报价草稿 JSON" className="hidden" type="file" ref={fileRef} accept=".json,application/json" onChange={importJson} />
          <button type="button" className="btn-primary btn-sm" onClick={printPdf}>打印 / 保存为 PDF</button>
        </div>
      </div>

      <div className="commercial-warning bg-amber-50 text-amber-900 border border-amber-200 rounded-lg p-3 text-xs leading-relaxed">
        <strong>模板试运行：</strong>本阶段仅支持页面编辑、PDF 打印和 JSON 草稿下载/导入，
        <strong>尚未接入服务器单据保存、历史版本及经财务批准的收款账户库</strong>。
        可搜索现有客户项目库（受原权限规则限制）或手动输入新客户。
        编号采用高随机度生成，但数据库唯一性登记尚未上线，手工修改编号暂不能跨员工防重。
        离开页面前请下载草稿；机器合同模板仍带草稿提示，正式合同请复核条款后签署。
      </div>

      {errors.length > 0 && (
        <div role="alert" className="commercial-errors bg-red-50 border border-red-200 rounded-lg p-3">
          <p className="font-semibold text-red-800 text-sm">请先补全以下信息，再生成 PDF：</p>
          <ul className="list-disc list-inside text-xs text-red-700 mt-2 space-y-1">
            {errors.slice(0, 20).map((error, index) => <li key={index}>{error}</li>)}
          </ul>
          {errors.length > 20 && <p className="text-xs text-red-700 mt-2">还有 {errors.length - 20} 项错误未展示。</p>}
        </div>
      )}

      <div className="commercial-tabs flex gap-2 border-b border-gray-200 lg:hidden pb-2">
        <button type="button" onClick={() => setActiveTab('edit')} className={activeTab === 'edit' ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'}>填写内容</button>
        <button type="button" onClick={() => setActiveTab('preview')} className={activeTab === 'preview' ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'}>预览版式</button>
      </div>

      <div className="commercial-workspace grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] gap-4 items-start">
        <div className={(activeTab === 'preview' ? 'hidden lg:block' : '') + ' commercial-editor space-y-4'}>

          <Panel title="01 · 单据基础信息">
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs text-gray-600">
                <span className="block mb-1 font-medium">单据类型</span>
                <select className="w-full" value={draft.kind} onChange={e => changeDocumentKind(e.target.value as CommercialDocumentDraft['kind'])}>
                  <option value="quotation">产品报价单</option>
                  <option value="machine_contract">机器销售合同</option>
                </select>
              </label>
              <label className="text-xs text-gray-600">
                <span className="block mb-1 font-medium">销售区域</span>
                <select className="w-full" value={draft.market} onChange={e => patch('market', e.target.value as CommercialDocumentDraft['market'])}>
                  <option value="domestic">国内</option>
                  <option value="export">外销</option>
                </select>
              </label>
              <label className="text-xs text-gray-600">
                <span className="block mb-1 font-medium">PDF 语言</span>
                <select className="w-full" value={draft.language} onChange={e => changeLanguage(e.target.value as CommercialDocumentDraft['language'])}>
                  <option value="zh">中文</option>
                  <option value="en">English</option>
                </select>
              </label>
              <label className="text-xs text-gray-600">
                <span className="block mb-1 font-medium">货币</span>
                <select className="w-full" value={draft.currency} onChange={e => patch('currency', e.target.value as CommercialDocumentDraft['currency'])}>
                  {CURRENCIES.map(currency => <option key={currency} value={currency}>{currency}</option>)}
                </select>
              </label>
              <div>
                <Field required label="单据编号（默认随机生成，可修改）" value={draft.documentNo}
                  onChange={value => patch('documentNo', value)} placeholder="正在自动生成编号…" />
                <button type="button" className="text-xs text-blue-700 hover:underline mt-1"
                  onClick={() => patch('documentNo', createDocumentNo(draft.kind, draft.date))}>
                  重新生成编号
                </button>
              </div>
              <Field required label="日期" type="date" value={draft.date} onChange={changeDate} />
            </div>
          </Panel>

          <Panel title="02 · 客户与业务员信息">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2 rounded-lg bg-gray-50 border border-gray-200 p-3">
                <p className="text-xs text-gray-500 mb-1">卖方正式主体（固定，不可更改）</p>
                <p className="text-sm font-bold text-gray-800">{fixedSellerName(draft.language)}</p>
              </div>
              <div className="rounded-lg bg-gray-50 border border-gray-200 p-3">
                <p className="text-xs text-gray-500 mb-1">业务员（当前登录账号）</p>
                <p className="text-sm font-semibold text-gray-800">{draft.salespersonName}</p>
              </div>
              <Field label="客户联系人" value={draft.buyerContact} onChange={value => patch('buyerContact', value)} placeholder="如：王经理" />
              <div className="sm:col-span-2 relative">
                <label htmlFor="commercial-buyer" className="block text-xs font-medium text-gray-600 mb-1">客户 / 买方全称 <span className="text-red-600">*</span></label>
                <input id="commercial-buyer" type="text" autoComplete="off" className="w-full"
                  value={draft.buyerName} placeholder="搜索已有客户，或直接输入新客户名称"
                  maxLength={300}
                  onChange={event => changeBuyerName(event.target.value)}
                  onFocus={() => { if (!draft.buyerCustomerReferenceId) setCustomerSearchOpen(true); }}
                  onBlur={() => setCustomerSearchOpen(false)} />
                {draft.buyerCustomerReferenceId && <p className="mt-1 text-xs text-green-700">已选择客户库中的现有客户；仍可编辑本单显示名称</p>}
                {customerSearchOpen && draft.buyerName.trim() && !draft.buyerCustomerReferenceId && (
                  <div role="listbox" aria-label="已有客户搜索结果"
                    className="absolute left-0 right-0 top-full z-20 bg-white border border-gray-200 rounded-lg shadow-md mt-1 max-h-60 overflow-y-auto">
                    {customerLoading && <p className="text-xs text-gray-500 p-3">正在查询客户池…</p>}
                    {!customerLoading && customerError && <p className="text-xs text-amber-700 p-3">{customerError}</p>}
                    {!customerLoading && !customerError && customerOptions.length === 0 && <p className="text-xs text-gray-500 p-3">暂无匹配客户，可直接填写新客户名称</p>}
                    {!customerLoading && customerOptions.map(option => (
                      <button key={option.id} type="button" role="option" aria-selected={false}
                        onMouseDown={event => event.preventDefault()}
                        onClick={() => selectCustomer(option)}
                        className="w-full text-left px-3 py-2 hover:bg-blue-50 text-sm text-gray-800 border-b border-gray-100 last:border-0">
                        {option.name}
                      </button>
                    ))}
                  </div>
                )}
                <p className="text-xs text-gray-500 mt-1">手动输入新客户不会自动改动或新增客户池记录。</p>
              </div>
            </div>
            <Field label="项目 / 产品用途" value={draft.projectName} onChange={value => patch('projectName', value)} />
          </Panel>

          <Panel title="03 · 报价大项及产品明细">
            <p className="text-xs text-gray-500">可自由增加、删除、重命名和排序大项。每个大项独立计算小计，底部自动计算已确定金额合计。</p>
            {draft.sections.map((section, sectionIndex) => {
              const subtotal = sectionAmount(section);
              return (
                <section key={section.id} className="border border-gray-200 rounded-lg overflow-hidden">
                  <div className="bg-gray-100 p-3 flex items-center gap-2">
                    <span className="font-bold text-sm text-gray-600">{sectionIndex + 1}.</span>
                    <input aria-label="报价大项名称" value={section.title}
                      onChange={e => updateSection(section.id, old => ({ ...old, title: e.target.value }))}
                      className="flex-1 min-w-0 bg-white font-semibold text-sm" />
                    <button type="button" title="大项上移" disabled={sectionIndex === 0} className="btn-secondary btn-sm disabled:opacity-30" onClick={() => moveSection(sectionIndex, -1)}>↑</button>
                    <button type="button" title="大项下移" disabled={sectionIndex === draft.sections.length - 1} className="btn-secondary btn-sm disabled:opacity-30" onClick={() => moveSection(sectionIndex, 1)}>↓</button>
                    <button type="button" title="删除大项" className="text-red-700 hover:text-red-800 text-xs" onClick={() => removeSection(section)}>删除</button>
                  </div>
                  <div className="p-3 space-y-3">
                    <div className="flex items-center gap-2">
                      <label htmlFor={`notice-${section.id}`} className="text-xs text-gray-600 whitespace-nowrap">对应说明</label>
                      <select id={`notice-${section.id}`} className="flex-1 min-w-0 text-xs"
                        value={section.noticeType ?? 'auto'}
                        onChange={event => updateSection(section.id, group => ({
                          ...group, noticeType: event.target.value as NoticeSelection,
                        }))}>
                        {NOTICE_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </select>
                    </div>
                    {(section.noticeType === undefined || section.noticeType === 'auto') && (
                      <p className="text-[11px] text-gray-500">
                        {sectionNoticeType(section)
                          ? '已识别：' + NOTICE_TITLES[sectionNoticeType(section)!].zh + '（PDF 会自动附上说明）'
                          : '大项名称无法识别时，请手动选择对应说明类型；不需要说明请选择“不附加”。'}
                      </p>
                    )}
                    {section.items.map((item, itemIndex) => (
                      <div key={item.id} className="border-b border-gray-100 pb-3 last:border-b-0 space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-semibold text-gray-600">产品明细 {itemIndex + 1}</p>
                          <div className="flex gap-2 items-center">
                            <button type="button" title="明细上移" disabled={itemIndex === 0} onClick={() => moveItem(section.id, itemIndex, -1)} className="text-gray-500 disabled:opacity-30 text-sm">↑</button>
                            <button type="button" title="明细下移" disabled={itemIndex === section.items.length - 1} onClick={() => moveItem(section.id, itemIndex, 1)} className="text-gray-500 disabled:opacity-30 text-sm">↓</button>
                            <button type="button" className="text-red-700 text-xs" onClick={() => removeItem(section, item)}>删除</button>
                          </div>
                        </div>
                        <Field required label="产品 / 费用名称" value={item.name} onChange={value => updateItem(section.id, item.id, { name: value })} placeholder="如 电雕版 / 常规花膜 / 全自动热转印机" />
                        <Field label="规格 / 技术参数" value={item.specification} onChange={value => updateItem(section.id, item.id, { specification: value })} placeholder="膜宽、材质、机型、配置等" />
                        <label className="block text-xs text-gray-600">
                          <span className="block mb-1 font-medium">明细模式</span>
                          <select className="w-full" value={item.mode} onChange={e => updateItem(section.id, item.id, { mode: e.target.value as DocumentItem['mode'] })}>
                            <option value="amount">按数量计算金额</option>
                            {draft.kind === 'quotation' && <option value="catalog">仅单价目录（不计入总金额）</option>}
                          </select>
                        </label>
                        <div className="grid grid-cols-3 gap-2">
                          {item.mode === 'catalog'
                            ? <div><span className="block text-xs text-gray-600 mb-1">数量</span><div className="text-xs text-gray-500 bg-gray-100 rounded-lg p-2">目录不适用</div></div>
                            : <Field label="数量" value={item.quantity} onChange={value => updateItem(section.id, item.id, { quantity: value })} placeholder="1" />}
                          <label className="block min-w-0">
                            <span className="block text-xs font-medium text-gray-600 mb-1">{draft.language === 'en' ? 'Unit' : '单位'}</span>
                            <input className="w-full" type="text" list={`unit-options-${item.id}`}
                              aria-label={draft.language === 'en' ? 'Unit' : '单位'}
                              value={item.unit} onChange={event => updateItem(section.id, item.id, { unit: event.target.value })}
                              placeholder={draft.language === 'en' ? 'Select or type a unit' : '选择或输入单位'} />
                            <datalist id={`unit-options-${item.id}`}>
                              {[...new Set(UNIT_PRESETS.map(unit => unit[draft.language]))].map(unit => <option key={unit} value={unit} />)}
                            </datalist>
                          </label>
                          <Field required label="单价" value={item.unitPrice}
                            onChange={value => updateItem(section.id, item.id, { unitPrice: value })} placeholder="0.00" />
                        </div>
                        <Field label="备注" value={item.note} onChange={value => updateItem(section.id, item.id, { note: value })} />
                        <div className="flex justify-between text-xs">
                          <span className="text-gray-500">{item.mode === 'catalog' ? '价格目录不计入小计' : '当前明细金额'}</span>
                          <strong className="text-gray-800">{itemAmountMinor(item) === null ? '—' : formatMoney(itemAmountMinor(item)!, draft.currency)}</strong>
                        </div>
                      </div>
                    ))}
                    <button type="button" onClick={() => updateSection(section.id, group => ({
                      ...group, items: [...group.items, { ...blankItem(id('item')), unit: localizeUnit('项', 'zh', draft.language) }],
                    }))} className="btn-secondary btn-sm w-full">+ 新增产品明细</button>
                    <div className="flex justify-between items-center bg-gray-100 p-3 rounded-md text-sm font-semibold">
                      <span>本大项已确定金额小计</span>
                      <span>{subtotal.amountLines ? formatMoney(subtotal.amountMinor, draft.currency) : '—'}</span>
                    </div>
                  </div>
                </section>
              );
            })}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {SECTION_PRESETS.map(preset => <button key={preset.zh} type="button" className="btn-secondary btn-sm" onClick={() => addSection(preset.zh)}>+ {preset[draft.language]}</button>)}
              <button type="button" className="btn-primary btn-sm" onClick={() => addSection(draft.language === 'en' ? 'New Section' : '新增大项')}>+ {draft.language === 'en' ? 'Custom Section' : '自定义大项'}</button>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 flex justify-between items-center gap-3">
              <span className="text-sm font-bold text-red-800">{total.catalogLines ? '已确定金额合计（单价目录除外）' : '整张单据总金额'}</span>
              <strong className="text-lg text-red-800 whitespace-nowrap">{total.amountLines ? formatMoney(total.amountMinor, draft.currency) : '—'}</strong>
            </div>
          </Panel>

          <Panel title="04 · 随大项自动生成的工艺说明">
            <p className="text-xs text-gray-600">
              根据03大项的说明类型自动匹配，每种说明只显示一次；删掉大项即自动消失。下面可以逐类修改，修改只影响当前单据。
            </p>
            {productNotices.length === 0
              ? <p className="text-xs text-gray-500">当前没有需要附加的产品说明；新增大项并填写明细后将自动出现。</p>
              : (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-gray-800">
                    本单自动附加 {productNotices.length} 类：{productNotices.map(note => note.title).join('、')}
                  </p>
                  {productNotices.map(note => (
                    <details key={note.type} className="border border-gray-200 rounded-md px-3 py-2">
                      <summary className="cursor-pointer flex justify-between gap-2 text-xs font-semibold text-gray-800">
                        <span>{note.title}</span>
                        <span className="text-gray-500 font-normal">{note.isCustomized ? '已自定义' : '采用默认说明'} · 点击修改</span>
                      </summary>
                      <div className="mt-2 space-y-2">
                        <textarea aria-label={note.title + '说明文本'} className="w-full text-xs leading-relaxed"
                          rows={note.type === 'gravure_film' ? 5 : 3} maxLength={2000}
                          value={draft.noticeOverrides?.[note.type]?.[draft.language] ?? note.text}
                          onChange={event => editProductNotice(note.type, event.target.value)} />
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] text-gray-500">正式默认中文说明已统一；修改仅作用于当前单据，机器具体配置及保修期限在产品规格或合同条款中确认。</span>
                          <button type="button" className="text-xs text-blue-700 whitespace-nowrap"
                            onClick={() => resetProductNotice(note.type)}>恢复默认</button>
                        </div>
                      </div>
                    </details>
                  ))}
                </div>
              )}
          </Panel>

          <Panel title={draft.language === 'en' && draft.kind === 'quotation' ? '05 · Business Terms' : '05 · 税务与商务条款'}>
            {draft.language === 'en' && draft.kind === 'quotation' ? null : draft.market === 'domestic'
              ? <fieldset className="space-y-2">
                  <legend className="text-xs font-medium text-gray-600 mb-2">税务说明（只显示所选条款，不自动加税或拆分税额）</legend>
                  <label className="flex gap-2 text-xs text-gray-700 items-center">
                    <input type="radio" name="tax" checked={draft.taxStatement === 'exclusive'} onChange={() => patch('taxStatement', 'exclusive')} />
                    报价未含税，发票及税务安排另行确认
                  </label>
                  <label className="flex gap-2 text-xs text-gray-700 items-center">
                    <input type="radio" name="tax" checked={draft.taxStatement === 'vat13'} onChange={() => patch('taxStatement', 'vat13')} />
                    含13%增值税专用发票
                  </label>
                </fieldset>
              : <p className="text-xs text-gray-600 bg-gray-50 p-2 rounded">外销税务及开票事宜由双方和财务确认，不自动采用国内13%专票条款。</p>}
            {draft.kind === 'quotation' && <Field label="报价有效期" value={draft.validity} onChange={value => patch('validity', value)} placeholder="如：自报价日起30天" />}
            <label className="block text-xs text-gray-600">
              <span className="block mb-1 font-medium">付款条件 · 快速选择</span>
              <select className="w-full" value={draft.paymentPreset}
                onChange={event => choosePayment(event.target.value as PaymentPreset)}>
                <option value="">请选择付款条件</option>
                {PAYMENT_PRESETS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            {draft.paymentPreset === 'credit_days' && (
              <label className="block text-xs text-gray-600">
                <span className="block mb-1 font-medium">账期（天）</span>
                <input type="number" min="1" max="365" step="1" className="w-full" value={draft.paymentDays}
                  onChange={event => setPaymentDays(event.target.value)} />
              </label>
            )}
            <Field required={draft.kind === 'machine_contract'} label="付款条件 · 最终显示文字（可修改）"
              multiline value={draft.paymentTerms} onChange={value => patch('paymentTerms', value)}
              placeholder="选择上方预设，或自行填写双方确认的付款条件" />
            <Field required={draft.kind === 'machine_contract'} label="交付条件与期限" multiline value={draft.deliveryTerms} onChange={value => patch('deliveryTerms', value)} />
            <label className="block text-xs text-gray-600">
              <span className="block mb-1 font-medium">运输方式 / 贸易术语 · 快速选择</span>
              <select className="w-full" value={draft.shippingPreset}
                onChange={event => chooseShipping(event.target.value as ShippingPreset)}>
                <option value="">请选择运输方式 / 贸易术语</option>
                {SHIPPING_PRESETS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <Field label="运输方式 / 贸易术语 · 最终显示文字（可修改）"
              multiline value={draft.shippingTerms} onChange={value => patch('shippingTerms', value)}
              placeholder="选择上方预设，或自行填写交货地点与运输安排" />
            {draft.kind === 'machine_contract' && (
              <>
                <Field required label="设备验收标准" multiline value={draft.acceptanceTerms} onChange={value => patch('acceptanceTerms', value)} placeholder="产品范围、产能、验收条件须双方明确" />
                <Field required label="保修及售后安排" multiline value={draft.warrantyTerms} onChange={value => patch('warrantyTerms', value)} />
              </>
            )}
            <Field label="其他商务条款 / 备注" multiline value={draft.additionalTerms} onChange={value => patch('additionalTerms', value)} />
          </Panel>

          <Panel title="06 · 收款账户">
            <p className="text-xs text-amber-800 leading-relaxed">
              统一收款账户库尚未开发，当前版本不会填写、推断或自动附上任何银行账户。
              后续将由管理员维护经财务批准的账户，员工通过下拉菜单选择，合同自动显示相应信息。
            </p>
            {!(draft.language === 'en' && draft.kind === 'quotation') && <p className="text-xs text-gray-500">税务选择与价格独立，系统不会自动调整业务员输入的单价。</p>}
          </Panel>

          <div className="flex justify-between gap-3 pb-8">
            <button type="button" className="btn-secondary" onClick={() => {
              if (window.confirm('清空当前内容并新建草稿？请先下载草稿文件。')) {
                const replacement = initialDraft(userName);
                replacement.date = localDateToday();
                replacement.documentNo = createDocumentNo(replacement.kind, replacement.date);
                setDraft(replacement); setCustomerSearchOpen(false); setErrors([]);
              }
            }}>重置模板</button>
            <button type="button" className="btn-primary" onClick={printPdf}>核对并生成 PDF</button>
          </div>
        </div>
        <div className={(activeTab === 'edit' ? 'hidden lg:block' : '') + ' commercial-preview-shell'}>
          <div className="commercial-preview-inner lg:sticky lg:top-4 space-y-2">
            <div className="commercial-preview-controls flex justify-between items-center">
              <h2 className="text-sm font-semibold text-gray-700">A4 PDF 排版预览</h2>
              <button type="button" className="btn-secondary btn-sm" onClick={printPdf}>保存为 PDF</button>
            </div>
            <div className="commercial-preview-scroll max-h-[78vh] overflow-auto border border-gray-200 rounded-lg bg-gray-100 p-2">
              <DocumentPreview draft={draft} />
            </div>
            <p className="commercial-preview-help text-xs text-gray-500">点击“保存为 PDF”会打开浏览器打印窗口，选择“另存为 PDF”。</p>
          </div>
        </div>
      </div>
    </div>
  );
}
