'use client';
import { useEffect, useRef, useState } from 'react';
type Result = {ok:true;inputArea:number;billableArea:number;amountCny:number;scheduleVersion:string};
const money = (n:number) => '¥' + n.toLocaleString('zh-CN');
export default function DigitalTransferCalculator() {
  const [area, setArea] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [message, setMessage] = useState('输入面积后自动查询，不足1.5 m²及超过200 m²需人工核价');
  const [loading, setLoading] = useState(false);
  const counter = useRef(0);
  useEffect(() => {
    const requestNo = ++counter.current;
    setResult(null);
    setLoading(false);
    if (!area.trim()) { setMessage('请输入实际核算面积'); return; }
    const parsed = Number(area);
    if (!Number.isFinite(parsed) || parsed <= 0) { setMessage('请输入大于0的有效面积'); return; }
    if (parsed < 1.5 || parsed > 200) { setMessage(parsed < 1.5 ? '不足1.5 m²，请人工核价' : '超过200 m²，请人工核价'); return; }
    const timer = window.setTimeout(async () => {
      if (requestNo !== counter.current) return;
      setLoading(true); setMessage('');
      try {
        const response = await fetch('/api/digital-transfer-quote', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({area:parsed}), cache:'no-store', credentials:'same-origin' });
        const data: unknown = await response.json();
        if (requestNo !== counter.current) return;
        if (response.ok && data && typeof data === 'object' && (data as Result).ok === true) setResult(data as Result);
        else setMessage((data as {message?:string})?.message || '查询失败，请稍后重试');
      } catch { if(requestNo === counter.current) setMessage('查询失败，请检查网络连接'); }
      finally { if(requestNo === counter.current) setLoading(false); }
    }, 250);
    return () => { window.clearTimeout(timer); };
  }, [area]);
  const copy = async () => {
    if (!result) return;
    const text = `数码热转印膜：实际面积 ${result.inputArea} m²，按 ${result.billableArea} m²档计价，参考订单金额 ${money(result.amountCny)}。`;
    try { await navigator.clipboard.writeText(text); setMessage('结果已复制'); }
    catch { setMessage('复制失败，请手动复制结果'); }
  };
  return <section className="rounded-xl border border-blue-100 bg-white p-4 shadow-sm" aria-labelledby="dt-price-title">
    <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
      <div><h2 id="dt-price-title" className="text-base font-bold text-gray-800">数码热转印膜报价速算</h2><p className="text-xs text-gray-500 mt-1">按原始面积向上匹配最近有效档位；内部参考价（人民币）</p></div>
      <span className="text-[11px] text-blue-700 bg-blue-50 border border-blue-100 rounded-full px-2 py-1">仅供内部核价</span>
    </div>
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <label className="text-sm text-gray-700 sm:w-1/3">实际核算面积（m²）
        <input aria-label="实际核算面积（平方米）" className="mt-1 w-full border border-gray-300 rounded-lg p-2 text-base focus:outline-none focus:ring-2 focus:ring-blue-400" type="number" min="0" step="any" placeholder="例如 19.2" value={area} onChange={e => setArea(e.target.value)} />
      </label>
      <div className="rounded-lg bg-gray-50 p-3 sm:flex-1"><p className="text-xs text-gray-500">计价档位</p><p aria-live="polite" className="text-xl font-bold text-gray-800">{result ? `${result.billableArea} m²` : '—'}</p></div>
      <div className="rounded-lg bg-blue-50 p-3 sm:flex-1"><p className="text-xs text-blue-800">对应订单金额</p><p aria-live="polite" className="text-2xl font-bold text-blue-800">{result ? money(result.amountCny) : '—'}</p></div>
      <button type="button" onClick={copy} disabled={!result} className="px-4 py-2 rounded-lg text-sm bg-blue-600 text-white disabled:bg-gray-200 disabled:text-gray-500">复制结果</button>
    </div>
    <p role="status" aria-live="polite" className="text-xs mt-2 text-gray-500">{loading ? '正在查询价格…' : message || (result ? `实际${result.inputArea} m² → 计价${result.billableArea} m²，版本${result.scheduleVersion}` : '—')}</p>
    <p className="text-[11px] text-gray-400 mt-1">不含其他附加项目；不生成正式报价单，不保存客户、订单或计算记录。</p>
  </section>;
}
