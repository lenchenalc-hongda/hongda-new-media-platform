'use client';

import { useCallback, useEffect, useState } from 'react';
type ReturnReason={reason:string;code:string;openedAt:string;operatorProfileId:string};
type Returned={
  orderId:string;orderNumber:string;customerName:string;projectName:string|null;
  productName:string;version:number;versionLabel:string;updatedAt:string;
  reasons:ReturnReason[];
};
type Result={ok:boolean;code:string;data?:{items:Returned[];count:number}};

export default function LiveQaReturnedOrders() {
  const [items,setItems]=useState<Returned[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const load=useCallback(async()=>{
    setLoading(true);
    setError('');
    setItems([]);
    try {
      const r=await fetch('/api/workshop-orders/p2/returns',{
        credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'},
      });
      const v:Result=await r.json();
      if(!r.ok || !v.ok || v.code!=='QA_RETURNED_ORDERS_READ_ONLY'
        || !Array.isArray(v.data?.items)
        || v.data?.count!==v.data?.items.length) {
        throw new Error('QA_RETURNED_ORDER_UNVERIFIED');
      }
      setItems(v.data.items);
    } catch {
      setItems([]);
      setError('退回订单读取失败或无权限，不能显示旧数据。');
    } finally { setLoading(false); }
  },[]);
  useEffect(()=>{void load();},[load]);
  return <section className="mb-6 rounded-lg border border-amber-300 bg-amber-50 p-4"
      aria-label="办公室退回补资料任务">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 className="text-sm font-semibold text-amber-950">车间退回资料（仅 QA 真实查询）</h2>
        <p className="mt-1 text-xs text-amber-900">
          这里显示车间真实退回的生产单及必须补齐的项目。仅查看，当前不支持对已提交版本静默修改。
        </p>
      </div>
      <button type="button" onClick={()=>void load()} disabled={loading}
        className="rounded border border-amber-400 bg-white px-3 py-2 text-xs disabled:opacity-50">
        {loading?'读取中...':'刷新退回任务'}
      </button>
    </header>
    {error&&<p role="alert" className="mt-3 text-xs text-red-800">{error}</p>}
    {!loading&&!error&&items.length===0&&
      <p role="status" className="mt-3 text-xs text-amber-950">当前账号没有可查看的真实退回订单。</p>}
    {!loading&&!error&&items.length>0&&
      <div className="mt-3 space-y-3">
        <p className="text-xs text-amber-950">待补齐订单：{items.length}</p>
        {items.map(o=><article key={o.orderId} className="rounded border border-amber-200 bg-white p-3 text-xs">
          <p className="font-semibold">{o.orderNumber} · {o.productName}</p>
          <p className="mt-1 text-gray-700">
            {o.customerName} · {o.projectName||'无关联项目'} · {o.versionLabel} · 数据版本 {o.version}
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-4 text-red-800">
            {o.reasons.map((r,i)=><li key={i}>
              {r.reason} · {r.openedAt} · 车间操作人 {r.operatorProfileId}
            </li>)}
          </ul>
          <p className="mt-2 text-amber-900">
            补资料及再次提交正在开发，未单独授权前不会编辑原提交、清除阻断项或标记为已完成。
          </p>
        </article>)}
      </div>}
  </section>;
}
