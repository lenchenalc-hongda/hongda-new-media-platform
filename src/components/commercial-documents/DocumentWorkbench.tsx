'use client';


import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import DocumentPreview from './DocumentPreview';
import {
  methodLabel,
  qrCodeLabel,
  type CommercialPaymentMethod,
} from '@/lib/commercial-documents/payment-methods';
import {
  blankItem, documentAmount, formatMoney, initialDraft, isDraftShape,
  itemAmountMinor, sectionAmount, validateForPrint, formatDocumentNumber,
  isGeneratedDocumentNumber, fixedSellerName, PAYMENT_PRESETS,
  SHIPPING_PRESETS, INCOTERMS_2020, paymentPresetText, shippingPresetText, normalizeImportedDraft,
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

export default function DocumentWorkbench({ userName, userRole, initialCloudListOpen = false }: {
  userName: string; userRole: string; initialCloudListOpen?: boolean;
}) {
  const [draft, setDraft] = useState<CommercialDocumentDraft>(() => initialDraft(userName));
  const [errors, setErrors] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<'edit' | 'preview'>('edit');
  const [customerSearchOpen, setCustomerSearchOpen] = useState(false);
  const [customerOptions, setCustomerOptions] = useState<CustomerOption[]>([]);
  const [customerError, setCustomerError] = useState('');
  const [customerLoading, setCustomerLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [cloudId, setCloudId] = useState('');
  const [cloudRevision, setCloudRevision] = useState(0);
  const [lastSavedSnapshot, setLastSavedSnapshot] = useState('');
  const [confirmedId,setConfirmedId] = useState('');
  const [confirmedVersion,setConfirmedVersion] = useState(0);
  const [readOnlyConfirmed,setReadOnlyConfirmed] = useState(false);
  const [confirmRequestId,setConfirmRequestId] = useState('');
  const hasUnsavedChanges = !!cloudId && !!lastSavedSnapshot && JSON.stringify(draft) !== lastSavedSnapshot;
  const [cloudStatus, setCloudStatus] = useState('');
  const [cloudBusy, setCloudBusy] = useState(false);
  const [cloudListOpen, setCloudListOpen] = useState(initialCloudListOpen);
  const [cloudList, setCloudList] = useState<Array<{
    id: string; revision: number; document_no: string; buyer_name: string;
    project_name: string; language: string; updated_at: string;
    owner_profile_id: string;
  }>>([]);
  const [cloudSearch, setCloudSearch] = useState('');
  const [cloudHistoryDraftId, setCloudHistoryDraftId] = useState('');
  const [cloudHistory, setCloudHistory] = useState<Array<{
    revision: number; status: string; snapshot: CommercialDocumentDraft;
    recorded_at: string; editor_profile_id: string;
  }>>([]);
  const [paymentMethods, setPaymentMethods] = useState<CommercialPaymentMethod[]>([]);
  const [paymentLoadError, setPaymentLoadError] = useState('');
  const [historicalPaymentSnapshot, setHistoricalPaymentSnapshot] = useState<Record<string, unknown> | null>(null);
  const currentMethod = paymentMethods.find(method => method.id === draft.paymentMethodId) ?? null;
  const historicalBank: CommercialPaymentMethod | null = readOnlyConfirmed && historicalPaymentSnapshot?.kind === 'bank'
    ? {
        id: draft.paymentMethodId ?? '',
        methodKey: String(historicalPaymentSnapshot.methodKey ?? ''),
        kind: 'bank', labelZh: String(historicalPaymentSnapshot.labelZh ?? ''),
        labelEn: String(historicalPaymentSnapshot.labelEn ?? ''),
        beneficiary: String(historicalPaymentSnapshot.beneficiary ?? ''),
        bankName: String(historicalPaymentSnapshot.bankName ?? ''),
        accountNo: String(historicalPaymentSnapshot.accountNo ?? ''),
        notes: String(historicalPaymentSnapshot.notes ?? ''),
        approved: true, sourceCell: '', sourceNumeric: false, qrSha256: null, qrUrl: null,
      } : null;
  // Read-only historical bank details must never be replaced by a newly edited catalog account.
  const selectedMethod = historicalBank ?? currentMethod;
  const archivedQrChanged = readOnlyConfirmed && historicalPaymentSnapshot?.kind === 'qr_pair'
    && (!currentMethod || currentMethod.kind !== 'qr_pair'
      || (historicalPaymentSnapshot.members as Array<{methodKey:string;qrSha256:string}> | undefined)?.some(
        archived => !currentMethod.qrCodes?.some(current =>
          current.methodKey === archived.methodKey && current.qrSha256 === archived.qrSha256),
      ));

  async function loadPaymentMethods() {
    try {
      const response = await fetch('/api/commercial-documents/payment-methods', { cache: 'no-store' });
      const json: { ok?: boolean; methods?: CommercialPaymentMethod[]; message?: string } = await response.json();
      if (!response.ok || !json.ok || !Array.isArray(json.methods)) {
        setPaymentMethods([]);
        setPaymentLoadError(json.message || '暂时无法读取收款账户');
        return;
      }
      setPaymentMethods(json.methods);
      setPaymentLoadError('');
    } catch {
      setPaymentMethods([]);
      setPaymentLoadError('网络异常：无法读取收款账户');
    }
  }

  useEffect(() => { void loadPaymentMethods(); }, []);

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
      const previousShippingPreset = shippingPresetText(previous.shippingPreset, previous.language, previous.kind === 'quotation' && previous.language === 'en');
      return {
        ...previous,
        language,
        sections: previous.sections.map(section => ({ ...section, title: localizeSectionTitle(section.title, language), items: section.items.map(item => ({ ...item, unit: localizeUnit(item.unit, previous.language, language) })) })),
        paymentTerms: previousPaymentPreset && previous.paymentTerms === previousPaymentPreset
          ? paymentPresetText(previous.paymentPreset, previous.paymentDays, language) : previous.paymentTerms,
        shippingTerms: previousShippingPreset && previous.shippingTerms === previousShippingPreset
          ? shippingPresetText(previous.shippingPreset, language, previous.kind === 'quotation' && language === 'en') : previous.shippingTerms,
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
      shippingTerms: preset === 'other' ? '' : shippingPresetText(preset, previous.language, previous.kind === 'quotation' && previous.language === 'en'),
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

  const loadCloudDrafts = async (search = '') => {
    setCloudBusy(true);
    try {
      const r = await fetch('/api/commercial-documents/drafts?search=' + encodeURIComponent(search),
        { cache: 'no-store' });
      const v = await r.json();
      if (!r.ok || !v.ok) throw new Error(v.message || '无法读取草稿');
      setCloudList(v.drafts ?? []);
      setCloudStatus('');
    } catch (e) {
      setCloudStatus(e instanceof Error ? e.message : '草稿箱读取失败');
    } finally { setCloudBusy(false); }
  };

  useEffect(() => {
    if (initialCloudListOpen) void loadCloudDrafts();
    // Route flag is immutable for the mounted workbench instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCloudListOpen]);

  // Dedicated draft management page routes here with an ID. Load the record
  // directly instead of prompting to replace a blank newly mounted editor.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('draftId') || '';
    const historyVersion = Number(params.get('restoreRevision') || 0);
    if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id)) return;
    let cancelled = false;
    void (async () => {
      setCloudBusy(true);
      try {
        const r = await fetch('/api/commercial-documents/drafts/' + encodeURIComponent(id), { cache: 'no-store' });
        const v = await r.json();
        if (!r.ok || !v.ok || !isDraftShape(v.draft)) throw new Error(v.message || '草稿读取失败');
        let source = v.draft;
        if (Number.isSafeInteger(historyVersion) && historyVersion > 0) {
          const h = await fetch('/api/commercial-documents/drafts/' + encodeURIComponent(id) + '/revisions',
            { cache: 'no-store' });
          const j = await h.json();
          if (!h.ok || !j.ok) throw new Error(j.message || '历史版本读取失败');
          const revision = (j.revisions ?? []).find((item: { revision: number }) => item.revision === historyVersion);
          if (!revision || !isDraftShape(revision.snapshot)) throw new Error('所选历史版本不存在或不可恢复');
          source = revision.snapshot;
        }
        if (cancelled) return;
        const restored = normalizeImportedDraft(source, userName);
        setDraft(restored);
        setCloudId(v.canEdit ? v.id : '');
        setCloudRevision(v.canEdit ? v.revision : 0);
        // A modification draft keeps its original confirmed-quote parent across logout.
        if (v.canEdit && typeof restored.sourceConfirmedQuoteId === 'string'
          && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(restored.sourceConfirmedQuoteId)
          && Number.isSafeInteger(restored.sourceConfirmedVersion)) {
          setConfirmedId(restored.sourceConfirmedQuoteId);
          setConfirmedVersion(restored.sourceConfirmedVersion || 0);
        }
        setLastSavedSnapshot(historyVersion || !v.canEdit ? '' : JSON.stringify(restored));
        setCloudStatus(historyVersion
          ? '已载入历史 V' + historyVersion + ' · 下一次保存会新增修订，不覆盖旧记录'
          : v.canEdit ? '已载入草稿 V' + v.revision : '只读查看他人草稿；可另存为自己的新草稿');
        setActiveTab('edit');
      } catch (e) {
        if (!cancelled) setCloudStatus('读取草稿失败：' + (e instanceof Error ? e.message : '网络异常'));
      } finally { if (!cancelled) setCloudBusy(false); }
    })();
    return () => { cancelled = true; };
  }, [userName]);

  // An existing confirmed quotation opens as a working copy, never modifies the archived snapshot.
  useEffect(()=>{
    const params=new URLSearchParams(window.location.search);
    const id=params.get('confirmedId');
    if(!id || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id)) return;
    let cancelled=false;
    void (async()=>{
      setCloudBusy(true);
      try {
        const url='/api/commercial-documents/confirmed/'+encodeURIComponent(id)+
          (params.get('version')?'?version='+encodeURIComponent(params.get('version')||''):'');
        const r=await fetch(url,{cache:'no-store'});const data=await r.json();
        if(!r.ok||!data.ok||!isDraftShape(data.selected?.snapshot)) throw Error(data.message||'已确认报价读取失败');
        if(cancelled)return;
        const restored=normalizeImportedDraft(data.selected.snapshot,userName);
        restored.sourceConfirmedQuoteId=data.canEdit?data.quote.id:'';
        restored.sourceConfirmedVersion=data.quote.latest_version;
        setDraft(restored);
        setHistoricalPaymentSnapshot(data.selected.payment_snapshot ?? null);
        setConfirmedId(data.canEdit ? data.quote.id : '');
        setConfirmedVersion(data.quote.latest_version);
        setReadOnlyConfirmed(params.get('readonly')==='1'||!data.canEdit);
        setCloudId('');setCloudRevision(0);setLastSavedSnapshot('');
        setCloudStatus('已载入已确认报价 V'+data.selected.version+(data.canEdit?' · 修改需再次确认才会新增正式版本':' · 只读查看'));
      }catch(e){if(!cancelled)setCloudStatus(e instanceof Error?e.message:'读取失败');}
      finally{if(!cancelled)setCloudBusy(false);}
    })();
    return ()=>{cancelled=true;};
  },[userName]);
  const confirmQuote = async () => {
    if(readOnlyConfirmed){setCloudStatus('只读报价不可确认；请返回已保存报价库');return;}
    const problems=validateForPrint(draft);
    if(problems.length){setErrors(problems);setActiveTab('edit');return;}
    if(!window.confirm('确认并保存报价？系统会新增不可覆盖的正式版本，草稿将从草稿箱移出。'))return;
    const id=confirmRequestId||crypto.randomUUID();setConfirmRequestId(id);
    setCloudBusy(true);
    try{
      const r=await fetch('/api/commercial-documents/confirmed',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({requestId:id,quoteId:confirmedId||null,expectedVersion:confirmedVersion,
          draftId:cloudId||null,draft}),cache:'no-store',
      });
      const v=await r.json();
      if(!r.ok||!v.ok)throw Error(v.message||'正式保存失败');
      setConfirmedId(v.quoteId);setConfirmedVersion(v.version);
      setDraft(prev=>({...prev,sourceConfirmedQuoteId:v.quoteId,sourceConfirmedVersion:v.version}));
      setCloudId('');setCloudRevision(0);setLastSavedSnapshot('');
      setConfirmRequestId('');
      setCloudStatus('正式报价已确认并保存 V'+v.version+' · 历史版本不会被覆盖');
    }catch(e){setCloudStatus('确认未完成，页面内容已保留：'+(e instanceof Error?e.message:'未知错误'));}
    finally{setCloudBusy(false);}
  };
  const saveCloudDraft = async () => {
    if (draft.kind !== 'quotation') {
      setCloudStatus('当前云端草稿只支持产品报价单，机器合同请继续使用原有文件保存方式。');
      return;
    }
    if(readOnlyConfirmed){setCloudStatus('只读模式不可保存草稿');return;}
    setCloudBusy(true);
    try {
      const url = cloudId
        ? '/api/commercial-documents/drafts/' + encodeURIComponent(cloudId)
        : '/api/commercial-documents/drafts';
      const r = await fetch(url, {
        method: cloudId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draft, revision: cloudRevision }),
        cache: 'no-store',
      });
      const v = await r.json();
      if (!r.ok || !v.ok) throw new Error(v.message || '草稿保存失败');
      setCloudId(v.id); setCloudRevision(v.revision);
      setLastSavedSnapshot(JSON.stringify(draft));
      setConfirmRequestId('');
      setCloudStatus('已保存云端草稿 · V' + v.revision +
        ' · ' + new Date(v.updatedAt).toLocaleString('zh-CN'));
    } catch (e) {
      setCloudStatus('保存未成功，页面内容已保留：' +
        (e instanceof Error ? e.message : '网络错误'));
    } finally { setCloudBusy(false); }
  };
  const openCloudDraft = async (draftId: string) => {
    if (!window.confirm('打开云端草稿将替换当前表单内容。若尚未保存，请先取消并保存。是否继续？')) return;
    setCloudBusy(true);
    try {
      const r = await fetch('/api/commercial-documents/drafts/' + encodeURIComponent(draftId),
        { cache: 'no-store' });
      const v = await r.json();
      if (!r.ok || !v.ok || !isDraftShape(v.draft)) throw new Error(v.message || '草稿格式无效');
      setDraft(normalizeImportedDraft(v.draft, userName));
      setCloudId(v.id); setCloudRevision(v.revision);
      setCloudListOpen(false); setActiveTab('edit');
      setCloudStatus('已打开云端草稿 V' + v.revision +
        (v.canEdit ? '' : ' · 仅查看；请复制为自己的草稿后修改'));
      setErrors([]);
    } catch (e) {
      setCloudStatus(e instanceof Error ? e.message : '草稿打开失败');
    } finally { setCloudBusy(false); }
  };
  const loadCloudHistory = async (draftId: string) => {
    setCloudBusy(true);
    try {
      const r = await fetch('/api/commercial-documents/drafts/' + encodeURIComponent(draftId) + '/revisions',
        { cache: 'no-store' });
      const v = await r.json();
      if (!r.ok || !v.ok) throw new Error(v.message || '无法读取历史版本');
      setCloudHistory(v.revisions ?? []); setCloudHistoryDraftId(draftId);
      setCloudStatus('已读取此草稿的历史快照；打开旧版本时不会覆盖原历史。');
    } catch (e) { setCloudStatus(e instanceof Error ? e.message : '历史读取失败'); }
    finally { setCloudBusy(false); }
  };
  const restoreCloudVersion = async (draftId: string, snapshot: CommercialDocumentDraft, oldRevision: number) => {
    if (!isDraftShape(snapshot)) {
      setCloudStatus('历史快照格式无效，已停止恢复');
      return;
    }
    if (!window.confirm('以历史 V' + oldRevision + ' 内容继续编辑？原历史版本保持不变，下一次保存将创建新修订。')) return;
    setCloudBusy(true);
    try {
      const r = await fetch('/api/commercial-documents/drafts/' + encodeURIComponent(draftId),
        { cache: 'no-store' });
      const v = await r.json();
      if (!r.ok || !v.ok) throw new Error(v.message || '无法核对最新修订');
      setDraft(normalizeImportedDraft(snapshot, userName));
      setCloudId(v.canEdit ? v.id : '');
      setCloudRevision(v.canEdit ? v.revision : 0);
      setCloudListOpen(false); setCloudHistoryDraftId(''); setCloudHistory([]);
      setActiveTab('edit'); setErrors([]);
      setCloudStatus(v.canEdit
        ? '已恢复历史 V' + oldRevision + ' 的内容；保存将形成新修订 V' + (v.revision + 1)
        : '已复制历史 V' + oldRevision + ' 为新草稿；点击保存创建自己的记录。');
    } catch (e) { setCloudStatus(e instanceof Error ? e.message : '历史恢复失败'); }
    finally { setCloudBusy(false); }
  };
  const copyToNewCloudDraft = () => {
    setCloudId(''); setCloudRevision(0); setLastSavedSnapshot(''); setCloudListOpen(false);
    setConfirmedId('');setConfirmedVersion(0);
    setDraft(previous=>({...previous,sourceConfirmedQuoteId:'',sourceConfirmedVersion:0,
      documentNo:createDocumentNo(previous.kind,previous.date)}));
    setCloudStatus('已作为新草稿开始编辑；点击「保存到草稿箱」将创建独立记录。');
  };
  const deleteCloudDraft = async (entry: { id: string; revision: number }) => {
    if (!window.confirm('将这份草稿移入回收状态？本操作不会删除本地正在编辑的内容。')) return;
    setCloudBusy(true);
    try {
      const r = await fetch('/api/commercial-documents/drafts/' + encodeURIComponent(entry.id), {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ revision: entry.revision }),
      });
      const v = await r.json();
      if (!r.ok || !v.ok) throw new Error(v.message || '删除失败');
      if (cloudId === entry.id) { setCloudId(''); setCloudRevision(0); }
      await loadCloudDrafts(cloudSearch);
      setCloudStatus('已将草稿移入回收状态');
    } catch (e) { setCloudStatus(e instanceof Error ? e.message : '删除失败'); }
    finally { setCloudBusy(false); }
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
      setCloudId(''); setCloudRevision(0); setLastSavedSnapshot('');
      setCloudStatus('JSON 已导入到表单；如需跨设备保存，请点击「保存到草稿箱」。');
      setCustomerSearchOpen(false);
      setErrors([]);
      setActiveTab('edit');
    } catch {
      setErrors(['草稿格式不正确，无法导入。']);
    }
  };
  const printPdf = async () => {
    const problems = validateForPrint(draft);
    if (archivedQrChanged) {
      problems.push('历史二维码已经与当前收款账户不同，无法原样重新生成 PDF，请核对原始记录');
    }
    if (draft.paymentMethodId && !selectedMethod) {
      problems.push('所选收款方式已失效或账户库未加载，不能输出错误账户');
    }
    const expectedQrCount = selectedMethod?.kind === 'qr_pair'
      ? selectedMethod.qrCodes?.length ?? 0
      : selectedMethod?.kind === 'qr' && selectedMethod.qrUrl ? 1 : 0;
    if (selectedMethod?.kind === 'qr_pair' && expectedQrCount !== 2) {
      problems.push('微信及支付宝收款二维码不完整，不能生成 PDF');
    }
    if (selectedMethod?.kind === 'qr' && !selectedMethod.qrUrl) {
      problems.push('收款二维码不存在或无法读取');
    }
    if (problems.length) {
      setErrors(problems);
      setActiveTab('edit');
      return;
    }
    setErrors([]);
    // Print the same preview only after every header and payment image is decoded.
    try {
      const printRoot = document.querySelector('#commercial-print');
      const images = Array.from(printRoot?.querySelectorAll<HTMLImageElement>('img') ?? []);
      const paymentImages = Array.from(
        printRoot?.querySelectorAll<HTMLImageElement>('[data-payment-qr]') ?? [],
      );
      if (paymentImages.length !== expectedQrCount) {
        throw new Error('payment QR image count mismatch');
      }
      await Promise.all(images.map(image => image.decode()));
      if (images.some(image => image.naturalWidth <= 0 || image.naturalHeight <= 0)) {
        throw new Error('decoded image has no pixels');
      }
      window.print();
    } catch {
      setErrors(['PDF 图片（报价抬头或原始收款二维码）加载失败，已阻止输出；请刷新后重试。']);
      setActiveTab('edit');
    }
  };
  const total = documentAmount(draft);
  const productNotices = documentProductNotices(draft);

  return (
    <div className="commercial-root space-y-4">
      <div className="commercial-top-bar flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs text-gray-500 mb-1">HongdaOS / 商务单据中心</p>
          <h1 className="text-xl font-bold text-gray-900">报价 / 合同编辑器</h1>
          <p className="text-xs text-gray-500 mt-1">登录用户：{userName} · 所有已登录员工可使用</p>
        </div>
        <div className="flex gap-2 flex-wrap">

          <button type="button" className="btn-primary btn-sm" disabled={cloudBusy || readOnlyConfirmed || draft.kind !== 'quotation'}
            onClick={saveCloudDraft}>{cloudBusy ? '处理中…' : '保存到草稿箱 / Save Draft'}</button>
          <button type="button" className="btn-primary btn-sm" disabled={cloudBusy || readOnlyConfirmed || draft.kind !== 'quotation'}
            onClick={confirmQuote}>确认并保存报价</button>
          {cloudId && <button type="button" className="btn-secondary btn-sm" onClick={copyToNewCloudDraft}>复制为新草稿</button>}
          <button type="button" className="btn-secondary btn-sm" onClick={saveJson}>下载草稿 JSON</button>
          <button type="button" className="btn-secondary btn-sm" disabled={readOnlyConfirmed} onClick={() => fileRef.current?.click()}>导入草稿</button>
          <input aria-label="导入报价草稿 JSON" className="hidden" type="file" ref={fileRef} accept=".json,application/json" onChange={importJson} />
          <button type="button" className="btn-primary btn-sm" onClick={printPdf}>打印 / 保存为 PDF</button>
        </div>
      </div>


      {confirmedId && <p className="text-xs text-gray-700">已确认报价 V{confirmedVersion} · 修改需再次确认生成新版本</p>}
      {readOnlyConfirmed && <p role="status" className="text-xs text-amber-800">正在查看历史已确认报价 · 不可覆盖原版本</p>}
      {cloudId && <p role="status" className="text-xs font-medium text-gray-600">
        {hasUnsavedChanges ? '● 有未保存的修改' : '✓ 已与云端草稿同步'} · 当前 V{cloudRevision}
      </p>}
      {cloudStatus && <p role="status" className="rounded bg-blue-50 border border-blue-200 text-blue-900 text-xs p-3">{cloudStatus}</p>}
      {cloudListOpen && (
        <section className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
          <div className="flex gap-2 flex-wrap">
            <input className="flex-1 min-w-0" value={cloudSearch} onChange={e => setCloudSearch(e.target.value)}
              placeholder="搜索报价编号 / 客户名称" />
            <button type="button" className="btn-secondary btn-sm" disabled={cloudBusy}
              onClick={() => void loadCloudDrafts(cloudSearch)}>搜索</button>
          </div>
          <div className="space-y-2">
            {cloudList.length === 0 && <p className="text-xs text-gray-500">暂无草稿记录。</p>}
            {cloudList.map(entry => (
              <div key={entry.id} className="flex flex-wrap items-center justify-between gap-2 border-b pb-2 text-xs">
                <div><strong>{entry.document_no || '未编号'}</strong> · {entry.buyer_name || '未填写客户'} ·
                  {entry.project_name || '未填写项目'} · {entry.language.toUpperCase()} · V{entry.revision}
                  <div className="text-gray-500">最近保存：{new Date(entry.updated_at).toLocaleString('zh-CN')}</div>
                </div>
                <div className="flex gap-2">
                  <button type="button" className="btn-secondary btn-sm" onClick={() => void openCloudDraft(entry.id)}>打开</button>

                  <button type="button" className="btn-secondary btn-sm" disabled={cloudBusy}
                    onClick={() => void loadCloudHistory(entry.id)}>历史修订</button>
                  <button type="button" className="btn-secondary btn-sm" disabled={cloudBusy}
                    onClick={() => void deleteCloudDraft(entry)}>移入回收</button>
                </div>
              </div>
            ))}
          </div>
          {cloudHistoryDraftId && (
            <div className="rounded border border-gray-200 bg-gray-50 p-3 space-y-2">
              <p className="text-xs font-bold">历史修订记录（只读，最近30次）</p>
              {cloudHistory.map(version => (
                <div key={version.revision} className="flex flex-wrap justify-between items-center gap-2 border-b py-1 text-xs">
                  <span>V{version.revision} · {version.status} ·
                    {new Date(version.recorded_at).toLocaleString('zh-CN')}</span>
                  <button type="button" className="btn-secondary btn-sm" disabled={cloudBusy}
                    onClick={() => void restoreCloudVersion(cloudHistoryDraftId, version.snapshot, version.revision)}>
                    基于此版本继续修改
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <div className="commercial-warning bg-amber-50 text-amber-900 border border-amber-200 rounded-lg p-3 text-xs leading-relaxed">

        <strong>存档状态：</strong>产品报价支持云端草稿；正式 PDF 归档与不可变历史版本仍在开发，
        <strong>打印 / 保存为 PDF 不等于已完成云端正式归档</strong>。
        可搜索现有客户项目库（受原权限规则限制）或手动输入新客户。
        编号采用高随机度生成，但数据库唯一性登记尚未上线，手工修改编号暂不能跨员工防重。
        尚未保存的页面修改不会自动同步，离开前请点击「保存到草稿箱」；机器合同暂不支持云端草稿。
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
        <fieldset disabled={readOnlyConfirmed} className={(activeTab === 'preview' ? 'hidden lg:block' : '') + ' commercial-editor min-w-0 space-y-4'}>

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
                          <Field required label={draft.language === 'en' ? 'Unit price (up to 3 decimals)' : '单价（最多3位小数）'} value={item.unitPrice}
                            onChange={value => updateItem(section.id, item.id, { unitPrice: value })} placeholder="0.000" />
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
              <span className="block mb-1 font-medium">{draft.language === 'en' && draft.kind === 'quotation' ? 'Terms of Sale · Quick Select' : '运输方式 / 贸易术语 · 快速选择'}</span>
              <select className="w-full" value={draft.shippingPreset}
                onChange={event => chooseShipping(event.target.value as ShippingPreset)}>
                <option value="">{draft.language === 'en' && draft.kind === 'quotation' ? 'Select Terms of Sale (Incoterms® 2020)' : '请选择运输方式 / 贸易术语'}</option>
                {draft.language === 'en' && draft.kind === 'quotation' ? (
                  <>
                    {INCOTERMS_2020.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                    {draft.shippingPreset && !INCOTERMS_2020.some(option => option.value === draft.shippingPreset) && draft.shippingPreset !== 'other' && (
                      <option value={draft.shippingPreset}>{SHIPPING_PRESETS.find(option => option.value === draft.shippingPreset)?.label ?? draft.shippingPreset} (previous selection)</option>
                    )}
                    <option value="other">Other (enter manually)</option>
                  </>
                ) : SHIPPING_PRESETS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <Field label={draft.language === 'en' && draft.kind === 'quotation' ? 'Terms of Sale · Final Text (editable)' : '运输方式 / 贸易术语 · 最终显示文字（可修改）'}
              multiline value={draft.shippingTerms} onChange={value => patch('shippingTerms', value)}
              placeholder={draft.language === 'en' && draft.kind === 'quotation' ? 'Confirm the named delivery place or port before sending the quotation' : '选择上方预设，或自行填写交货地点与运输安排'} />
            {draft.kind === 'machine_contract' && (
              <>
                <Field required label="设备验收标准" multiline value={draft.acceptanceTerms} onChange={value => patch('acceptanceTerms', value)} placeholder="产品范围、产能、验收条件须双方明确" />
                <Field required label="保修及售后安排" multiline value={draft.warrantyTerms} onChange={value => patch('warrantyTerms', value)} />
              </>
            )}
            <Field label="其他商务条款 / 备注" multiline value={draft.additionalTerms} onChange={value => patch('additionalTerms', value)} />
          </Panel>

          <Panel title={draft.language === 'en' ? '06 · Payment Method' : '06 · 收款方式'}>
            <p className="text-xs text-gray-600 leading-relaxed">
              {draft.language === 'en'
                ? 'Select one payment method. The original beneficiary and account strings are never translated or edited.'
                : '选择一种收款方式；户名、银行账号均从经核对的账户库原文读取，业务员不可修改。'}
            </p>
            <label className="block text-xs text-gray-700">
              <span className="block mb-1 font-medium">
                {draft.language === 'en' ? 'Payment account · Select' : '收款账户 · 选择'}
              </span>
              <select className="w-full" aria-label="选择收款账户" value={draft.paymentMethodId ?? ''}
                onChange={event => patch('paymentMethodId', event.target.value)}>
                <option value="">{draft.language === 'en' ? 'Do not include payment details' : '不附加收款账户'}</option>
                {paymentMethods.map(method => (
                  <option value={method.id} key={method.id}>
                    {methodLabel(method, draft.language)}{!method.approved ? ' · 待审核' : ''}
                  </option>
                ))}
              </select>
            </label>
            {paymentLoadError && <p role="alert" className="text-xs text-amber-800">{paymentLoadError}</p>}
            {selectedMethod && (
              <div className="border rounded-lg bg-gray-50 px-3 py-3 space-y-1 text-xs text-gray-800">
                {!selectedMethod.approved && <p className="font-bold text-red-700">待审核 / INTERNAL REVIEW ONLY — 不得向客户发送</p>}
                {selectedMethod.kind === 'bank' ? (
                  <>
                    <p><strong>{draft.language === 'en' ? 'Beneficiary / Account name' : '收款人 / 户名'}：</strong>
                      <span className="whitespace-pre-wrap break-all">{selectedMethod.beneficiary}</span></p>
                    <p><strong>{draft.language === 'en' ? 'Bank' : '开户行'}：</strong>
                      <span className="whitespace-pre-wrap break-all">{selectedMethod.bankName}</span></p>
                    {selectedMethod.notes.startsWith('ADD:') && (
                      <p><strong>{draft.language === 'en' ? 'Bank address / SWIFT' : '银行地址 / SWIFT'}：</strong>
                        <span className="whitespace-pre-wrap break-words">{selectedMethod.notes}</span></p>
                    )}
                    <p><strong>{draft.language === 'en' ? 'Account number' : '银行账号'}：</strong>
                      <span className="whitespace-pre-wrap break-all font-mono">{selectedMethod.accountNo}</span></p>
                  </>
                ) : selectedMethod.kind === 'qr_pair' && selectedMethod.qrCodes?.length === 2 ? (
                  <div className="document-payment-qr-grid pt-1">
                    {selectedMethod.qrCodes.map(code => (
                      <figure key={code.id} className="document-payment-qr">
                        <img src={code.qrUrl} width={175} height={219} data-payment-qr="true"
                          alt={qrCodeLabel(code, draft.language) + '原始收款二维码'}
                          className="w-full max-w-[175px] h-auto border border-gray-200 rounded bg-white" />
                        <figcaption className="font-semibold text-gray-800">
                          {qrCodeLabel(code, draft.language)}
                        </figcaption>
                      </figure>
                    ))}
                  </div>
                ) : selectedMethod.qrUrl ? (
                  <img src={selectedMethod.qrUrl} width={175} height={219} data-payment-qr="true"
                    alt={methodLabel(selectedMethod, draft.language) + '原始收款二维码'}
                    className="w-full max-w-[175px] h-auto border border-gray-200 rounded bg-white" />
                ) : <p className="text-red-700">收款二维码不完整或不可用</p>}
                {selectedMethod.notes && !selectedMethod.notes.startsWith('ADD:') && <p><strong>{draft.language === 'en' ? 'Original source notes' : '原始备注'}：</strong>
                  <span className="whitespace-pre-wrap break-all">{selectedMethod.notes}</span></p>}
                {selectedMethod.sourceNumeric && <p className="font-bold text-red-700">
                  原始资料曾采用数值格式存储，请核对是否存在前导零风险。
                </p>}
                {userRole === 'admin' && (
                  <p className="text-gray-500">校验来源：{selectedMethod.sourceCell}
                    {selectedMethod.qrSha256 ? ' · PNG SHA-256: ' + selectedMethod.qrSha256 : ''}
                    {selectedMethod.qrCodes?.length
                      ? ' · ' + selectedMethod.qrCodes.map(code => qrCodeLabel(code, 'en') + ': ' + code.qrSha256).join(' · ')
                      : ''}</p>
                )}
                {draft.currency !== 'CNY' && <p className="text-amber-700">
                  {draft.language === 'en' ? 'Finance must confirm that this account supports the selected currency.' : '请财务确认该收款方式支持当前报价币种。'}
                </p>}
              </div>
            )}
            {userRole === 'admin' && paymentMethods.some(method => !method.approved) && (
              <p className="text-xs text-amber-800">
                这批账号已录入独立测试库，仅供管理人员核对，正式开放前需审核确认。
              </p>
            )}
            {paymentMethods.length === 0 && !paymentLoadError && (
              <p className="text-xs text-gray-500">
                {draft.language === 'en' ? 'No payment methods available yet.' : '暂无可选择的收款方式。'}
              </p>
            )}
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
        </fieldset>
        <div className={(activeTab === 'edit' ? 'hidden lg:block' : '') + ' commercial-preview-shell'}>
          <div className="commercial-preview-inner lg:sticky lg:top-4 space-y-2">
            <div className="commercial-preview-controls flex justify-between items-center">
              <h2 className="text-sm font-semibold text-gray-700">A4 PDF 排版预览</h2>
              <button type="button" className="btn-secondary btn-sm" onClick={printPdf}>保存为 PDF</button>
            </div>
            <div className="commercial-preview-scroll max-h-[78vh] overflow-auto border border-gray-200 rounded-lg bg-gray-100 p-2">
              <DocumentPreview draft={draft} selectedMethod={selectedMethod} />
            </div>
            <p className="commercial-preview-help text-xs text-gray-500">点击“保存为 PDF”会打开浏览器打印窗口，选择“另存为 PDF”。</p>
          </div>
        </div>
      </div>
    </div>
  );
}
