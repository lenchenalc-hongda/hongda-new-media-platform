'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';

type Entry = {
  id: string;
  date: string;
  reference: string;
  description: string;
  quantity: string;
  unit: string;
  price: string;
  receipt: string;
  remark: string;
};
type Statement = {
  customer: string;
  contact: string;
  month: string;
  documentNo: string;
  issueDate: string;
  opening: string;
  notes: string;
  entries: Entry[];
};
let entrySequence = 0;
const freshEntry = (): Entry => ({ id: 'line-' + Date.now() + '-' + ++entrySequence, date: '', reference: '', description: '', quantity: '', unit: '件', price: '', receipt: '', remark: '' });
const today = () => {
  const d = new Date();
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
};
const initialStatement = (): Statement => ({
  customer: '', contact: '', month: today().slice(0, 7), issueDate: today(),
  documentNo: 'DZ-' + today().slice(0, 7).replace('-', '') + '-' + Math.random().toString(36).slice(2, 10).toUpperCase(),
  opening: '0', notes: '', entries: [freshEntry()],
});
function toCents(value: string): number | null {
  const s = value.trim();
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(s)) return null;
  const negative = s.startsWith('-');
  const [whole, fraction = ''] = s.replace('-', '').split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(cents) ? cents * (negative ? -1 : 1) : null;
}
function quantityNumber(value: string): number | null {
  const s = value.trim();
  if (!/^\d+(?:\.\d{1,4})?$/.test(s)) return null;
  const result = Number(s);
  return Number.isFinite(result) && result > 0 ? result : null;
}
function itemCents(entry: Entry): number | null {
  const q = quantityNumber(entry.quantity);
  const price = toCents(entry.price);
  if (q === null || price === null || price < 0) return null;
  const amount = q * price;
  return Number.isSafeInteger(Math.round(amount)) ? Math.round(amount) : null;
}
const money = (cents: number) => (cents / 100).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const styles = `
@page { size: A4; margin: 12mm; }
.statement-paper { font-family: Arial, "Microsoft YaHei", "PingFang SC", sans-serif; }
.statement-paper tr { break-inside: avoid; page-break-inside: avoid; }
.statement-paper thead { display: table-header-group; }
@media print {
  html, body { background: white !important; }
  body * { visibility: hidden !important; }
  .statement-paper, .statement-paper * { visibility: visible !important; }
  .statement-paper { position: absolute !important; left: 0; top: 0; width: 100% !important; max-width: none !important; border: 0 !important; padding: 0 !important; box-shadow: none !important; }
  .statement-toolbar, aside, nav { display: none !important; }
}
`;
export default function MonthlyStatementWorkbench({ userName }: { userName: string }) {
  const [draft, setDraft] = useState<Statement>(initialStatement);
  const [error, setError] = useState('');
  const uploadRef = useRef<HTMLInputElement>(null);
  const patch = <K extends keyof Statement,>(key: K, value: Statement[K]) => setDraft(previous => ({ ...previous, [key]: value }));
  const patchEntry = (id: string, key: keyof Entry, value: string) => setDraft(previous => ({
    ...previous, entries: previous.entries.map(row => row.id === id ? { ...row, [key]: value } : row),
  }));
  const opening = toCents(draft.opening);
  const billed = draft.entries.reduce((sum, row) => sum + (itemCents(row) ?? 0), 0);
  const received = draft.entries.reduce((sum, row) => sum + (toCents(row.receipt) ?? 0), 0);
  const closing = (opening ?? 0) + billed - received;
  const input = 'w-full rounded border border-gray-300 px-2 py-2 text-sm bg-white';
  const field = (title: string, key: keyof Omit<Statement, 'entries'>, type = 'text') => (
    <label className="block text-sm text-gray-700">
      <span className="block mb-1">{title}</span>
      <input className={input} type={type} value={draft[key]} onChange={e => patch(key, e.target.value)} />
    </label>
  );
  const validate = () => {
    if (!draft.customer.trim()) return '请填写客户全称。';
    if (!/^\d{4}-\d{2}$/.test(draft.month)) return '请选择有效的对账月份。';
    if (!draft.documentNo.trim() || !draft.issueDate) return '请填写对账单编号和出单日期。';
    if (opening === null) return '期初余额应为有效金额，最多两位小数。';
    if (draft.entries.length === 0) return '请至少填写一条对账明细。';
    for (let i = 0; i < draft.entries.length; i++) {
      const row = draft.entries[i];
      if (!row.date || row.date.slice(0, 7) !== draft.month) return `第 ${i + 1} 行日期必须位于对账月份内。`;
      if (!row.description.trim()) return `请填写第 ${i + 1} 行的项目名称。`;
      if (itemCents(row) === null) return `第 ${i + 1} 行数量或单价不正确。`;
      if (row.receipt.trim() && (toCents(row.receipt) === null || (toCents(row.receipt) ?? 0) < 0)) return `第 ${i + 1} 行收款金额不正确。`;
    }
    return '';
  };
  const print = async () => {
    const issue = validate();
    if (issue) { setError(issue); return; }
    setError('');
    try {
      await Promise.all(Array.from(document.querySelectorAll<HTMLImageElement>('.statement-paper img')).map(img => img.decode()));
      window.print();
    } catch { setError('报价单中文抬头未加载，请检查网络。'); }
  };
  const save = () => {
    const blob = new Blob([JSON.stringify({ schema: 'hongda-statement-zh-v1', draft }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = (draft.documentNo.replace(/[^a-zA-Z0-9_-]/g, '_') || 'statement') + '.json';
    anchor.click();
    URL.revokeObjectURL(url);
  };
  const load = async (file?: File) => {
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const value = parsed?.draft;
      if (parsed?.schema !== 'hongda-statement-zh-v1' || typeof value?.customer !== 'string' ||
          !Array.isArray(value?.entries) || value.entries.length > 300 ||
          !value.entries.every((entry: unknown) => !!entry && typeof entry === 'object' &&
             ['id','date','reference','description','quantity','unit','price','receipt','remark'].every(k => typeof (entry as Record<string, unknown>)[k] === 'string'))) throw new Error('invalid');
      setDraft(value);
      setError('');
    } catch { setError('对账单 JSON 文件不符合本模板格式。'); }
    if (uploadRef.current) uploadRef.current.value = '';
  };
  return <div className="space-y-4">
    <style>{styles}</style>
    <div className="statement-toolbar flex flex-wrap justify-between items-start gap-3">
      <div>
        <p className="text-xs text-gray-500">HongdaOS / 商务单据中心</p>
        <h1 className="text-xl font-bold">客户月度对账单 · 中文版</h1>
        <p className="text-xs text-gray-500">操作人：{userName} · 复用中文报价单抬头</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link className="btn-secondary btn-sm" href="/commercial-documents">返回报价/合同</Link>
        <button type="button" className="btn-secondary btn-sm" onClick={save}>下载 JSON 草稿</button>
        <button type="button" className="btn-secondary btn-sm" onClick={() => uploadRef.current?.click()}>导入草稿</button>
        <input type="file" aria-label="导入对账单草稿" accept="application/json,.json" className="hidden" ref={uploadRef} onChange={e => void load(e.target.files?.[0])} />
        <button type="button" className="btn-primary btn-sm" onClick={() => void print()}>打印 / 保存 PDF</button>
      </div>
    </div>
    <p className="statement-toolbar bg-amber-50 border border-amber-200 rounded p-3 text-xs text-amber-900">
      第一版为手工编制与核对模板，尚未连接正式回款账簿；收款额必须由业务/财务核对后填写。草稿仅在当前浏览器内编辑，离开前请下载 JSON 保存。
    </p>
    {error && <div className="statement-toolbar bg-red-50 text-red-700 p-3 rounded text-sm" role="alert">{error}</div>}
    <div className="grid xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] gap-4 items-start">
      <section className="statement-toolbar space-y-4 bg-white border rounded-lg p-4">
        <h2 className="font-bold">01 · 对账基础资料</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          {field('客户全称 *', 'customer')}
          {field('客户联系人', 'contact')}
          {field('对账月份 *', 'month', 'month')}
          {field('出单日期 *', 'issueDate', 'date')}
          {field('对账单编号 *', 'documentNo')}
          {field('期初未结余额（元）', 'opening')}
        </div>
        <h2 className="font-bold">02 · 本月发生明细</h2>
        <p className="text-xs text-gray-500">每行可填写一笔出货/加工费用及该笔对应收款。无收款时留空。金额统一按人民币元计算。</p>
        {draft.entries.map((row, index) => <div key={row.id} className="rounded border p-3 space-y-2">
          <div className="flex items-center justify-between text-sm font-semibold"><span>明细 {index + 1}</span><button className="text-red-700 text-xs" type="button" disabled={draft.entries.length === 1} onClick={() => patch('entries', draft.entries.filter(e => e.id !== row.id))}>删除</button></div>
          <div className="grid sm:grid-cols-2 gap-2">
            {([['日期','date','date'],['出货单号/单据号','reference','text'],['产品 / 费用说明','description','text'],['数量','quantity','text'],['单位','unit','text'],['含税/约定单价（元）','price','text'],['本次收款（元）','receipt','text'],['备注','remark','text']] as const).map(([label,key,type]) =>
              <label key={key} className="text-xs">{label}<input className={input} type={type} value={row[key]} onChange={e => patchEntry(row.id,key,e.target.value)} /></label>)}
          </div>
          <p className="text-xs text-right">发生金额：¥{money(itemCents(row) ?? 0)}</p>
        </div>)}
        <button type="button" className="btn-secondary btn-sm w-full" onClick={() => patch('entries',[...draft.entries, freshEntry()])}>+ 新增明细</button>
        <label className="block text-sm">对账说明 / 付款备注<textarea rows={3} className={input} value={draft.notes} onChange={e => patch('notes',e.target.value)} /></label>
      </section>
      <section className="min-w-0 overflow-x-auto">
        <article className="statement-paper mx-auto w-full min-w-[520px] max-w-[810px] bg-white border shadow-sm p-7 text-gray-900">
          <img src="/document-headers/hongda-quotation-header-zh.png" width={2047} height={515} alt="宏达印业中文报价单抬头" className="block w-full h-auto" />
          <h2 className="text-center text-xl font-bold py-4">客户对账单</h2>
          <div className="grid grid-cols-2 gap-2 text-xs pb-3">
            <p><b>客户名称：</b>{draft.customer || '—'}</p>
            <p><b>对账月份：</b>{draft.month}</p>
            <p><b>联系人：</b>{draft.contact || '—'}</p>
            <p><b>出单日期：</b>{draft.issueDate}</p>
            <p className="col-span-2"><b>对账单编号：</b>{draft.documentNo}</p>
          </div>
          <table className="w-full border-collapse text-[11px] table-fixed">
            <thead><tr className="bg-gray-100 border-y border-gray-300">
              <th className="p-1 text-left w-[13%]">日期</th><th className="p-1 text-left w-[18%]">单据号</th>
              <th className="p-1 text-left w-[23%]">产品 / 费用</th><th className="p-1 text-right w-[11%]">数量</th>
              <th className="p-1 text-right w-[11%]">单价</th><th className="p-1 text-right w-[12%]">发生金额</th>
              <th className="p-1 text-right w-[12%]">收款金额</th>
            </tr></thead>
            <tbody>{draft.entries.map(row => <tr key={row.id} className="border-b align-top">
              <td className="p-1">{row.date || '—'}</td><td className="p-1 break-all">{row.reference || '—'}</td>
              <td className="p-1 break-words">{row.description || '—'}{row.remark && <p className="text-gray-500">{row.remark}</p>}</td>
              <td className="p-1 text-right">{row.quantity || '—'} {row.unit}</td>
              <td className="p-1 text-right">{row.price || '—'}</td>
              <td className="p-1 text-right">{itemCents(row) === null ? '—' : money(itemCents(row)!)}</td>
              <td className="p-1 text-right">{row.receipt.trim() ? money(toCents(row.receipt) ?? 0) : '—'}</td>
            </tr>)}</tbody>
          </table>
          <div className="mt-4 border rounded text-xs">
            <div className="flex justify-between p-2 border-b"><span>期初未结余额</span><b>¥ {opening === null ? '—' : money(opening)}</b></div>
            <div className="flex justify-between p-2 border-b"><span>本月应收发生额</span><b>¥ {money(billed)}</b></div>
            <div className="flex justify-between p-2 border-b"><span>本月已收款</span><b>¥ {money(received)}</b></div>
            <div className="flex justify-between p-3 bg-red-700 text-white font-bold text-sm"><span>期末应收余额</span><span>¥ {money(closing)}</span></div>
          </div>
          <p className="text-xs whitespace-pre-wrap mt-4"><b>对账说明：</b>{draft.notes || '请核对上述明细，如有差异请及时联系我司。'}</p>
          <div className="grid grid-cols-2 gap-8 mt-8 text-xs">
            <div className="border-t pt-2">宏达印业确认（签字/盖章）：<p className="mt-10">日期：____________</p></div>
            <div className="border-t pt-2">客户确认（签字/盖章）：<p className="mt-10">日期：____________</p></div>
          </div>
          <p className="text-[10px] text-gray-500 mt-5">本对账单依据录入数据生成，请与实际出货、收款及双方往来账核对后使用；不自动构成收款确认。</p>
        </article>
      </section>
    </div>
  </div>;
}
