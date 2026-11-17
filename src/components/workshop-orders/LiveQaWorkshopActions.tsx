'use client';

import { useRef, useState } from 'react';
import {
  parseWosP2Action,
  type WosP2Action,
  type WOS_P2_RESOURCE_TYPES,
} from '@/lib/workshop-orders/p2-action-contract';

interface Props {
  readonly orderId: string;
  readonly expectedVersion: number;
  readonly workflowStatus: string;
  readonly onSuccess: () => void;
}
type Resource = (typeof WOS_P2_RESOURCE_TYPES)[number];
const resourceChoices: Array<{code:Resource;label:string;statuses:string[]}> = [
  { code:'FILM',label:'花膜',statuses:['NOT_ARRIVED','PARTIALLY_ARRIVED','ARRIVED','VERSION_VERIFIED'] },
  { code:'FIXTURE',label:'夹具',statuses:['NOT_AVAILABLE','IN_PRODUCTION','ARRIVED','FIT_VERIFIED'] },
  { code:'INCOMING_MATERIAL',label:'来料及产品',statuses:['NOT_ARRIVED','PARTIALLY_ARRIVED','ARRIVED','QUANTITY_VERIFIED'] },
  { code:'SIGNED_SAMPLE',label:'客户确认样 / 大货签样',statuses:['MISSING','UPLOADED','PHYSICAL_SAMPLE_RECEIVED','VERIFIED'] },
];

export default function LiveQaWorkshopActions({orderId,expectedVersion,workflowStatus,onSuccess}:Props) {
  // IMPORTANT: This opt-in must remain off until the QA-only SQL has been
  // independently approved and installed. The server has its OWN check.
  const canAttempt = process.env.NEXT_PUBLIC_WOS_P2_QA_MUTATIONS_ENABLED === 'true';
  const [action,setAction] = useState<'ACCEPT'|'RETURN_FOR_INFORMATION'|'CONFIRM_MATERIAL'|'REVIEW_CORRECTION'>('ACCEPT');
  const [resource,setResource] = useState<Resource>('FILM');
  const [status,setStatus] = useState('NOT_ARRIVED');
  const [quantityExpected,setQuantityExpected] = useState('');
  const [quantityArrived,setQuantityArrived] = useState('');
  const [note,setNote] = useState('');
  const [sending,setSending] = useState(false);
  const [feedback,setFeedback] = useState('');
  const pendingRef=useRef<{key:string;requestId:string}|null>(null);

  const legal = action==='ACCEPT'
      ? workflowStatus==='SUBMITTED'
      : action==='RETURN_FOR_INFORMATION'
        ? ['SUBMITTED','WORKSHOP_REVIEW'].includes(workflowStatus)
        : action==='REVIEW_CORRECTION'
          ? workflowStatus==='WORKSHOP_REVIEW'
          : ['WORKSHOP_REVIEW','WAITING_MATERIAL','READINESS_CHECK'].includes(workflowStatus);
  const choices=resourceChoices.find(x=>x.code===resource)!;

  async function submit() {
    if (sending || !canAttempt || !legal) return;
    const core = {
      orderId, expectedVersion, action, note:note.trim(),
      ...(action==='CONFIRM_MATERIAL' ? {
        resourceType:resource,
        resourceStatus:status,
        quantityExpected:resource==='INCOMING_MATERIAL'
          ? (quantityExpected.trim()==='' ? Number.NaN : Number(quantityExpected)) : null,
        quantityArrived:resource==='INCOMING_MATERIAL'
          ? (quantityArrived.trim()==='' ? Number.NaN : Number(quantityArrived)) : null,
      } : {}),
    };
    const key=JSON.stringify(core);
    const requestId=pendingRef.current?.key===key
      ? pendingRef.current.requestId : crypto.randomUUID();
    const request=parseWosP2Action({...core,requestId});
    if (!request) {
      setFeedback('请检查确认内容、10 至 500 字的操作原因，以及来料数量。');
      return;
    }
    pendingRef.current={key,requestId};
    setSending(true);
    setFeedback('正在提交受限 QA 事务，请勿重复点击。');
    try {
      const response=await fetch('/api/workshop-orders/p2/actions',{
        method:'POST',
        cache:'no-store',
        credentials:'same-origin',
        headers:{'Content-Type':'application/json','x-wos-p2-action':'1','Accept':'application/json'},
        body:JSON.stringify(request satisfies WosP2Action),
      });
      const data: {ok?:boolean;code?:string;data?:{version?:number;workflowStatus?:string;requestId?:string}}=await response.json();
      if (!response.ok||!data.ok||!['QA_P2_ACTION_APPLIED','QA_P2_REPLAY_VERIFIED'].includes(data.code??'')
          ||data.data?.requestId!==requestId||data.data?.version!==expectedVersion+1) {
        setFeedback('没有确认数据库保存：'+(data.code??'UNKNOWN')+
          '。如果是网络中断，保持内容不变重试将使用同一个请求编号。');
        return;
      }
      pendingRef.current=null;
      setFeedback('已从真实事务确认操作：'+data.code+'，订单版本 '+data.data.version+'。');
      onSuccess();
    } catch {
      setFeedback('网络断开，结果未核实。请不要修改内容后重试；系统会复用请求编号校验是否已保存。');
    } finally { setSending(false); }
  }

  return (
    <section className="mt-4 space-y-3 rounded-md border border-slate-300 bg-slate-50 p-3" aria-label="车间受控操作">
      <h4 className="text-sm font-semibold text-gray-900">车间接单、资料退回、修订复核与物料核对</h4>
      {!canAttempt && <p role="status" className="rounded border border-amber-200 p-2 text-xs text-amber-900">
        当前只读。QA 事务 RPC 尚未单独授权安装，不能执行真实接单、退回或物料确认。
      </p>}
      <label className="block text-xs font-medium text-gray-800">
        操作类型
        <select className="mt-1 w-full rounded border p-2" value={action} onChange={e=>{
          setAction(e.target.value as typeof action);pendingRef.current=null;setFeedback('');
        }} disabled={sending}>
          <option value="ACCEPT">确认接单（仅进入车间审阅，不代表开工）</option>
          <option value="RETURN_FOR_INFORMATION">资料不完整，退回办公室</option>
          <option value="CONFIRM_MATERIAL">登记花膜 / 夹具 / 来料 / 签样的实际状态</option>
          <option value="REVIEW_CORRECTION">复核办公室的最新修订并解除对应资料阻塞（不准许开工）</option>
        </select>
      </label>
      {action==='CONFIRM_MATERIAL' && (
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="text-xs font-medium">物料类别
            <select className="mt-1 w-full rounded border p-2" value={resource}
              disabled={sending} onChange={e=>{
                const newType=e.target.value as Resource;
                setResource(newType);
                setStatus(resourceChoices.find(x=>x.code===newType)?.statuses[0]??'');
                pendingRef.current=null;setFeedback('');
              }}>{resourceChoices.map(c=><option key={c.code} value={c.code}>{c.label}</option>)}</select>
          </label>
          <label className="text-xs font-medium">实测状态
            <select className="mt-1 w-full rounded border p-2" value={status}
              disabled={sending} onChange={e=>{setStatus(e.target.value);pendingRef.current=null;}}>
              {choices.statuses.map(v=><option key={v} value={v}>{v}</option>)}
            </select>
          </label>
          {resource==='INCOMING_MATERIAL' && (
            <>
              <label className="text-xs font-medium">应到数量
                <input inputMode="numeric" type="number" min="0" step="1" value={quantityExpected}
                  disabled={sending} onChange={e=>setQuantityExpected(e.target.value)} className="mt-1 w-full rounded border p-2"/>
              </label>
              <label className="text-xs font-medium">实到数量
                <input inputMode="numeric" type="number" min="0" step="1" value={quantityArrived}
                  disabled={sending} onChange={e=>setQuantityArrived(e.target.value)} className="mt-1 w-full rounded border p-2"/>
              </label>
            </>
          )}
        </div>
      )}
      {action==='REVIEW_CORRECTION' && <p className="rounded border border-amber-300 bg-white p-2 text-xs text-amber-950">
        请先核对订单最新字段与对应图片版本；审核仅解除资料退回阻塞，不会继承旧签样、花膜确认或放行生产。
      </p>}
      <label className="block text-xs font-medium">操作依据 / 不齐套原因（10–500 字）
        <textarea value={note} maxLength={500} rows={3} disabled={sending} className="mt-1 w-full rounded border p-2"
          placeholder="请写明实际核对结果；退回时写清需补齐的资料"
          onChange={e=>setNote(e.target.value)} />
      </label>
      {!legal && <p role="alert" className="text-xs text-red-800">
        当前订单状态为 {workflowStatus}，此操作不符合允许的状态流转。
      </p>}
      <button type="button" onClick={()=>void submit()} disabled={!canAttempt||!legal||sending}
        className="rounded bg-slate-900 px-4 py-2 text-xs text-white disabled:cursor-not-allowed disabled:opacity-50">
        {sending?'受控事务校验中...':'提交到 QA 原子事务'}
      </button>
      {feedback && <p role="status" className="text-xs text-gray-800">{feedback}</p>}
      <p className="text-xs text-red-800">**禁止开工：** 本功能不包含开工权限；即使物料登记齐套也必须另行签样核查与放行。</p>
    </section>
  );
}
