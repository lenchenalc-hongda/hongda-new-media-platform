'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  parseWosP2OfficeRevision,
  type WosP2OfficeRevision,
} from '@/lib/workshop-orders/p2-office-revision-contract';

type ReturnReason = { reason: string; code: string; openedAt: string; operatorProfileId: string };
type Returned = {
  orderId: string; orderNumber: string; customerName: string; projectName: string | null;
  productName: string; productMaterial: string;
  requestedQuantity: number; currentBatchQuantity: number;
  customerAcceptanceStandard: string | null; positionReference: string | null;
  version: number; versionLabel: string; updatedAt: string; reasons: ReturnReason[];
};
type Result = { ok: boolean; code: string; data?: { items: Returned[]; count: number } };
type Patch = WosP2OfficeRevision['patch'];
type Field = keyof Patch;
const fields: ReadonlyArray<{key:Field; label:string; numeric?:boolean}> = [
  {key:'productName',label:'产品名称'},
  {key:'productMaterial',label:'产品材质'},
  {key:'requestedQuantity',label:'订单总数量',numeric:true},
  {key:'currentBatchQuantity',label:'本批生产数量',numeric:true},
  {key:'customerAcceptanceStandard',label:'客户验收标准'},
  {key:'positionReference',label:'印刷定位 / 位置说明'},
];

function currentFields(item:Returned):Record<Field,string> {
  return {
    productName:item.productName,
    productMaterial:item.productMaterial,
    requestedQuantity:String(item.requestedQuantity),
    currentBatchQuantity:String(item.currentBatchQuantity),
    customerAcceptanceStandard:item.customerAcceptanceStandard ?? '',
    positionReference:item.positionReference ?? '',
  };
}

function Correction({item,onSaved}:{item:Returned;onSaved:()=>void}) {
  const flag=process.env.NEXT_PUBLIC_WOS_P2_QA_OFFICE_REVISION_ENABLED==='true';
  const [values,setValues]=useState<Record<Field,string>>(()=>currentFields(item));
  const [reason,setReason]=useState('');
  const [pending,setPending]=useState(false);
  const [message,setMessage]=useState('');
  const replay=useRef<{fingerprint:string;requestId:string}|null>(null);

  async function submit(action:'SAVE_CORRECTION'|'RESUBMIT_CORRECTION') {
    if (!flag || pending) return;
    const original=currentFields(item);
    const patch:Record<string,string|number>={};
    for (const f of fields) {
      const after=values[f.key].trim();
      if (after!==original[f.key]) {
        patch[f.key]=f.numeric ? Number(after) : after;
      }
    }
    // Empty patch is only allowed for a previously saved correction. The
    // database verifies the existing saved revision on the current version.
    const intent={orderId:item.orderId,expectedVersion:item.version,action,
      patch,reason:reason.trim()};
    const fingerprint=JSON.stringify(intent);
    const requestId=replay.current?.fingerprint===fingerprint
      ? replay.current.requestId : crypto.randomUUID();
    const request=parseWosP2OfficeRevision({...intent,requestId});
    if (!request) {
      setMessage('请输入至少 10 字修改原因；检查字段、数量及已保存修订状态。');
      return;
    }
    replay.current={fingerprint,requestId};
    setPending(true);
    setMessage('提交中，必须取得数据库版本回执后才会更新页面。');
    try {
      const response=await fetch('/api/workshop-orders/p2/office-revisions',{
        method:'POST',credentials:'same-origin',cache:'no-store',
        headers:{'Content-Type':'application/json','x-wos-p2-office-revision':'1',Accept:'application/json'},
        body:JSON.stringify(request),
      });
      const result:{ok?:boolean;code?:string;data?:{orderId?:string;version?:number;requestId?:string;workflowStatus?:string}}=
        await response.json();
      if (!response.ok || !result.ok
          || !['QA_OFFICE_CORRECTION_SAVED','QA_OFFICE_RESUBMITTED','QA_OFFICE_REVISION_REPLAYED'].includes(result.code??'')
          || result.data?.orderId!==item.orderId || result.data?.version!==item.version+1
          || result.data?.requestId!==requestId) {
        setMessage('保存未验证：'+(result.code??'UNKNOWN')+'；保持表单不变重试会复用同一个请求 ID。');
        return;
      }
      replay.current=null;
      setMessage(action==='SAVE_CORRECTION'
        ? '数据库已保存新的修订版本；正在重新读取订单。'
        : '已重新提交给车间复核；旧阻塞仍须由车间人员确认解除。');
      onSaved();
    } catch {
      setMessage('网络中断，无法确定是否已保存。不要修改内容；原样重试复用请求 ID。');
    } finally {setPending(false);}
  }

  return <div className="mt-3 space-y-3 border-t border-amber-200 pt-3">
    {!flag && <p role="status" className="rounded border border-amber-300 bg-amber-50 p-2 text-amber-950">
      QA 写入未授权，六项字段可供查看；保存与重提按钮保持关闭。
    </p>}
    <div className="grid gap-3 sm:grid-cols-2">
      {fields.map(f=><label key={f.key} className="block font-medium text-gray-800">
        {f.label}
        <input type={f.numeric?'number':'text'} min={f.numeric?1:undefined} step={f.numeric?1:undefined}
          value={values[f.key]} disabled={!flag||pending} maxLength={f.numeric?undefined:(f.key==='productName'||f.key==='productMaterial'?200:2000)}
          onChange={e=>{setValues(v=>({...v,[f.key]:e.target.value}));setMessage('');}}
          className="mt-1 w-full rounded border border-gray-300 px-2 py-2 text-sm disabled:bg-gray-100"/>
      </label>)}
    </div>
    <label className="block font-medium text-gray-800">
      补资料说明（10 至 500 字，写入不可变历史）
      <textarea value={reason} disabled={!flag||pending} maxLength={500}
        onChange={e=>{setReason(e.target.value);setMessage('');}}
        className="mt-1 block w-full rounded border border-gray-300 p-2 text-sm disabled:bg-gray-100"
        rows={3} placeholder="例如：已按车间反馈核实客户验收标准和印刷定位要求。"/>
    </label>
    <div className="flex flex-wrap gap-2">
      <button type="button" disabled={!flag||pending} onClick={()=>void submit('SAVE_CORRECTION')}
        className="rounded bg-blue-800 px-3 py-2 font-medium text-white disabled:opacity-40">保存修订（生成新版本）</button>
      <button type="button" disabled={!flag||pending} onClick={()=>void submit('RESUBMIT_CORRECTION')}
        className="rounded bg-emerald-800 px-3 py-2 font-medium text-white disabled:opacity-40">重新提交车间复核</button>
    </div>
    {message&&<p role="status" className="text-amber-950">{message}</p>}
    <p className="text-amber-950">原始提交回执不变；修改内容另存版本快照，重新提交不代表解除车间退回原因或准许开工。</p>
  </div>;
}

export default function LiveQaReturnedOrders() {
  const [items,setItems]=useState<Returned[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const load=useCallback(async()=>{
    setLoading(true);setError('');setItems([]);
    try {
      const response=await fetch('/api/workshop-orders/p2/returns',{
        credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'},
      });
      const value:Result=await response.json();
      if(!response.ok||!value.ok||value.code!=='QA_RETURNED_ORDERS_READ_ONLY'
        ||!Array.isArray(value.data?.items)||value.data?.count!==value.data.items.length){
        throw new Error('QA_RETURNED_ORDERS_UNVERIFIED');
      }
      setItems(value.data.items);
    } catch {
      setError('退回订单读取失败或无权限，不能显示旧数据。');
    } finally {setLoading(false);}
  },[]);
  useEffect(()=>{void load();},[load]);
  return <section className="mb-6 rounded-lg border border-amber-300 bg-amber-50 p-4"
    aria-label="办公室退回补资料任务">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 className="text-sm font-semibold text-amber-950">车间退回资料（QA 当前版本）</h2>
        <p className="mt-1 text-xs text-amber-900">按退回原因修改六项允许字段。所有写入使用受控 RPC，保留历史快照；不覆盖原始提交。</p>
      </div>
      <button type="button" onClick={()=>void load()} disabled={loading}
        className="rounded border border-amber-400 bg-white px-3 py-2 text-xs disabled:opacity-50">
        {loading?'读取中...':'刷新退回任务'}
      </button>
    </header>
    {error&&<p role="alert" className="mt-3 text-xs text-red-800">{error}</p>}
    {!loading&&!error&&!items.length&&<p role="status" className="mt-3 text-xs text-amber-950">当前账号没有待补资料订单。</p>}
    {!loading&&!error&&items.length>0&&<div className="mt-3 space-y-3">
      <p className="text-xs text-amber-950">待补齐订单：{items.length}</p>
      {items.map(o=><article key={o.orderId+':'+o.version}
        className="rounded border border-amber-200 bg-white p-3 text-xs">
        <p className="font-semibold">{o.orderNumber} · {o.productName}</p>
        <p className="mt-1 text-gray-700">{o.customerName} · {o.projectName||'无关联项目'} · {o.versionLabel} · 数据版本 {o.version}</p>
        <ul className="mt-2 list-disc space-y-1 pl-4 text-red-800">
          {o.reasons.map((r,i)=><li key={i}>{r.reason} · {r.openedAt} · 操作人 {r.operatorProfileId}</li>)}
        </ul>
        <Correction item={o} onSaved={()=>void load()}/>
      </article>)}
    </div>}
  </section>;
}
