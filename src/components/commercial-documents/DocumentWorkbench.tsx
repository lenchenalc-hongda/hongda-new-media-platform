'use client';

import { useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import DocumentPreview from './DocumentPreview';
import {
  blankItem, documentAmount, formatMoney, initialDraft, isDraftShape,
  itemAmountMinor, sectionAmount, validateForPrint,
  type CommercialDocumentDraft, type DocumentItem, type DocumentSection,
} from '@/lib/commercial-documents/template';

const SECTION_PRESETS = ['版费', '热转印花膜', '数码花膜', '机器设备', '夹具与配件', '加工费用', '其他费用'];
const CURRENCIES = ['CNY', 'USD', 'EUR'] as const;
let sequence = 1;
function id(prefix: string) { return prefix + '-' + Date.now() + '-' + sequence++; }

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
  const [draft, setDraft] = useState<CommercialDocumentDraft>(initialDraft);
  const [errors, setErrors] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<'edit' | 'preview'>('edit');
  const fileRef = useRef<HTMLInputElement>(null);

  const patch = <K extends keyof CommercialDocumentDraft>(key: K, value: CommercialDocumentDraft[K]) => {
    setDraft(previous => ({ ...previous, [key]: value }));
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
  const addSection = (title: string) => {
    setDraft(previous => ({
      ...previous, sections: [
        ...previous.sections,
        { id: id('section'), title, items: [blankItem(id('item'))] },
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
      setDraft({ ...parsed, accountLabel: '', accountDetails: '' });
      setErrors([]);
      setActiveTab('edit');
    } catch {
      setErrors(['草稿格式不正确，无法导入。']);
    }
  };
  const printPdf = () => {
    const problems = validateForPrint(draft);
    if (problems.length) {
      setErrors(problems);
      setActiveTab('edit');
      return;
    }
    setErrors([]);
    // Uses the browser's built-in print-to-PDF so CJK fonts render accurately.
    window.print();
  };
  const total = documentAmount(draft);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs text-gray-500 mb-1">HongdaOS / 商务单据中心</p>
          <h1 className="text-xl font-bold text-gray-900">报价单与机器合同模板</h1>
          <p className="text-xs text-gray-500 mt-1">登录用户：{userName} · 所有已登录员工可使用</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button type="button" className="btn-secondary btn-sm" onClick={saveJson}>下载草稿 JSON</button>
          <button type="button" className="btn-secondary btn-sm" onClick={() => fileRef.current?.click()}>导入草稿</button>
          <input aria-label="导入报价草稿 JSON" className="hidden" type="file" ref={fileRef} accept=".json,application/json" onChange={importJson} />
          <button type="button" className="btn-primary btn-sm" onClick={printPdf}>打印 / 保存为 PDF</button>
        </div>
      </div>

      <div className="bg-amber-50 text-amber-900 border border-amber-200 rounded-lg p-3 text-xs leading-relaxed">
        <strong>模板试运行：</strong>本阶段仅支持页面编辑、PDF 打印和 JSON 草稿下载/导入，
        <strong>尚未接入服务器保存、历史版本、客户库或经财务批准的收款账户库</strong>。
        离开页面前请下载草稿；生成文件始终带“模板草稿”提示，正式合同请复核条款后签署。
      </div>

      {errors.length > 0 && (
        <div role="alert" className="bg-red-50 border border-red-200 rounded-lg p-3">
          <p className="font-semibold text-red-800 text-sm">请先补全以下信息，再生成 PDF：</p>
          <ul className="list-disc list-inside text-xs text-red-700 mt-2 space-y-1">
            {errors.slice(0, 20).map((error, index) => <li key={index}>{error}</li>)}
          </ul>
          {errors.length > 20 && <p className="text-xs text-red-700 mt-2">还有 {errors.length - 20} 项错误未展示。</p>}
        </div>
      )}

      <div className="flex gap-2 border-b border-gray-200 lg:hidden pb-2">
        <button type="button" onClick={() => setActiveTab('edit')} className={activeTab === 'edit' ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'}>填写内容</button>
        <button type="button" onClick={() => setActiveTab('preview')} className={activeTab === 'preview' ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'}>预览版式</button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] gap-4 items-start">
        <div className={(activeTab === 'preview' ? 'hidden lg:block' : '') + ' commercial-editor space-y-4'}>

          <Panel title="01 · 单据基础信息">
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs text-gray-600">
                <span className="block mb-1 font-medium">单据类型</span>
                <select className="w-full" value={draft.kind} onChange={e => {
                  const kind = e.target.value as CommercialDocumentDraft['kind'];
                  setDraft(previous => ({ ...previous, kind, sections: previous.sections.map(group => ({
                    ...group, items: group.items.map(item => kind === 'machine_contract' && item.mode === 'catalog'
                      ? { ...item, mode: 'amount', quantity: item.quantity || '1' } : item),
                  })) }));
                  setErrors([]);
                }}>
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
                <select className="w-full" value={draft.language} onChange={e => patch('language', e.target.value as CommercialDocumentDraft['language'])}>
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
              <Field required label="单据编号" value={draft.documentNo} onChange={value => patch('documentNo', value)} placeholder="如 HD-Q-2026-001（人工编号）" />
              <Field required label="日期" type="date" value={draft.date} onChange={value => patch('date', value)} />
            </div>
          </Panel>

          <Panel title="02 · 买卖双方 / 客户信息">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field required label="卖方 / 报价主体（正式公司全称）" value={draft.sellerName} onChange={value => patch('sellerName', value)} />
              <Field required label="客户 / 买方全称" value={draft.buyerName} onChange={value => patch('buyerName', value)} />
              <Field label="卖方地址" value={draft.sellerAddress} onChange={value => patch('sellerAddress', value)} />
              <Field label="客户地址" value={draft.buyerAddress} onChange={value => patch('buyerAddress', value)} />
              <Field label="卖方联系方式" value={draft.sellerContact} onChange={value => patch('sellerContact', value)} />
              <Field label="客户联系人" value={draft.buyerContact} onChange={value => patch('buyerContact', value)} />
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
                          <Field label="单位" value={item.unit} onChange={value => updateItem(section.id, item.id, { unit: value })} placeholder="支/㎡/台" />
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
                      ...group, items: [...group.items, blankItem(id('item'))],
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
              {SECTION_PRESETS.map(name => <button key={name} type="button" className="btn-secondary btn-sm" onClick={() => addSection(name)}>+ {name}</button>)}
              <button type="button" className="btn-primary btn-sm" onClick={() => addSection('新增大项')}>+ 自定义大项</button>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 flex justify-between items-center gap-3">
              <span className="text-sm font-bold text-red-800">{total.catalogLines ? '已确定金额合计（单价目录除外）' : '整张单据总金额'}</span>
              <strong className="text-lg text-red-800 whitespace-nowrap">{total.amountLines ? formatMoney(total.amountMinor, draft.currency) : '—'}</strong>
            </div>
          </Panel>

          <Panel title="04 · 税务与商务条款">
            {draft.market === 'domestic'
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
            <Field required={draft.kind === 'machine_contract'} label="付款条件" multiline value={draft.paymentTerms} onChange={value => patch('paymentTerms', value)} placeholder="请填写双方已经确认的付款节点，不自动生成条款" />
            <Field required={draft.kind === 'machine_contract'} label="交付条件与期限" multiline value={draft.deliveryTerms} onChange={value => patch('deliveryTerms', value)} />
            <Field label="运输方式 / 贸易术语" value={draft.shippingTerms} onChange={value => patch('shippingTerms', value)} placeholder="如 EXW / FOB / 物流送货，按实际约定" />
            {draft.kind === 'machine_contract' && (
              <>
                <Field required label="设备验收标准" multiline value={draft.acceptanceTerms} onChange={value => patch('acceptanceTerms', value)} placeholder="产品范围、产能、验收条件须双方明确" />
                <Field required label="保修及售后安排" multiline value={draft.warrantyTerms} onChange={value => patch('warrantyTerms', value)} />
              </>
            )}
            <Field label="其他商务条款 / 备注" multiline value={draft.additionalTerms} onChange={value => patch('additionalTerms', value)} />
          </Panel>

          <Panel title="05 · 收款账户">
            <p className="text-xs text-amber-800 leading-relaxed">
              统一收款账户库尚未开发，当前版本不会填写、推断或自动附上任何银行账户。
              后续将由管理员维护经财务批准的账户，员工通过下拉菜单选择，合同自动显示相应信息。
            </p>
            <p className="text-xs text-gray-500">税务选择与价格独立，系统不会自动调整业务员输入的单价。</p>
          </Panel>

          <div className="flex justify-between gap-3 pb-8">
            <button type="button" className="btn-secondary" onClick={() => {
              if (window.confirm('清空当前内容并新建草稿？请先下载草稿文件。')) {
                setDraft(initialDraft()); setErrors([]);
              }
            }}>重置模板</button>
            <button type="button" className="btn-primary" onClick={printPdf}>核对并生成 PDF</button>
          </div>
        </div>
        <div className={(activeTab === 'edit' ? 'hidden lg:block' : '') + ' commercial-preview-shell'}>
          <div className="lg:sticky lg:top-4 space-y-2">
            <div className="flex justify-between items-center">
              <h2 className="text-sm font-semibold text-gray-700">A4 PDF 排版预览</h2>
              <button type="button" className="btn-secondary btn-sm" onClick={printPdf}>保存为 PDF</button>
            </div>
            <div className="commercial-preview-scroll max-h-[78vh] overflow-auto border border-gray-200 rounded-lg bg-gray-100 p-2">
              <DocumentPreview draft={draft} />
            </div>
            <p className="text-xs text-gray-500">点击“保存为 PDF”会打开浏览器打印窗口，选择“另存为 PDF”。</p>
          </div>
        </div>
      </div>
    </div>
  );
}
