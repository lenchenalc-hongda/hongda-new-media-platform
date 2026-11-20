'use client';

import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  M2_MATERIAL_STATES, parseWosP2M2Action, canActOnWosP2M2, type WosP2M2Action,
} from '@/lib/workshop-orders/p2-m2-action-contract';

type Resource = keyof typeof M2_MATERIAL_STATES;
type Action = WosP2M2Action['action'];
interface Props {
 readonly orderId:string; readonly organizationId:string;
 readonly productionVersionLabel:string;readonly expectedVersion:number;
 readonly onSuccess:()=>void; readonly actorRole?:string;
}
type ImageOption={id:string;category:string;file_name:string;image_status:string;version_label:string};
type BaselineOption={id:string;status:string;version_label:string};

export default function LiveQaWorkshopM2({orderId,organizationId,productionVersionLabel,expectedVersion,onSuccess,actorRole}:Props) {
 // This flag is NOT set in any currently authorised QA Preview. Server and
 // database impose independent, stronger gates. No fallback to P2/P7.
 const enabled=process.env.NEXT_PUBLIC_WOS_P2_M2_QA_MUTATIONS_ENABLED==='true';
 const [action,setAction]=useState<Action>('MATERIAL_RECORD');
 const [resource,setResource]=useState<Resource>('FILM');
 const [status,setStatus]=useState<string>('NOT_ARRIVED');
 const [expectedAt,setExpectedAt]=useState('');
 const [arrivedAt,setArrivedAt]=useState('');
 const [expected,setExpected]=useState('');
 const [arrived,setArrived]=useState('');
 const [physicalCheck,setPhysicalCheck]=useState(false);
 const [note,setNote]=useState('');
 const [images,setImages]=useState<ImageOption[]>([]);
 const [baselines,setBaselines]=useState<BaselineOption[]>([]);
 const [selected,setSelected]=useState<string[]>([]);
 const [baselineId,setBaselineId]=useState('');
 const [loading,setLoading]=useState(false);
 const [sending,setSending]=useState(false);
 const [result,setResult]=useState('');
 const pending=useRef<{body:string;id:string}|null>(null);

 useEffect(()=>{
  if(!enabled)return;
  let active=true;
  async function load() {
   setLoading(true);
   try{
    const db=createClient();
    if(!db)throw new Error('QA_CLIENT_UNAVAILABLE');
    const [imageResult,baselineResult]=await Promise.all([
     db.from('wos_reference_images').select('id,category,file_name,image_status,version_label,organization_id,entity_id')
      .eq('organization_id',organizationId).eq('entity_id',orderId)
      .eq('entity_type','PRODUCTION_ORDER').eq('version_label',productionVersionLabel).limit(100),
     db.from('wos_visual_baselines').select('id,status,version_label,organization_id,entity_id')
      .eq('organization_id',organizationId).eq('entity_id',orderId)
      .eq('entity_type','PRODUCTION_ORDER').eq('version_label',productionVersionLabel).limit(100),
    ]);
    if(imageResult.error||baselineResult.error||!imageResult.data||!baselineResult.data||
       imageResult.data.length>=100||baselineResult.data.length>=100||
       [...imageResult.data,...baselineResult.data].some(x=>x.organization_id!==organizationId||
        x.entity_id!==orderId||x.version_label!==productionVersionLabel))
      throw new Error('QA_RLS_INCOMPLETE');
    if(active){
      setImages(imageResult.data.filter(x=>x.image_status==='READY')
       .map(x=>({id:x.id,category:x.category,file_name:x.file_name,
         image_status:x.image_status,version_label:x.version_label})));
      setBaselines(baselineResult.data.map(x=>({id:x.id,status:x.status,version_label:x.version_label})));
    }
   }catch{if(active){setImages([]);setBaselines([]);setResult('QA_RLS_READ_UNVERIFIED');}}
   finally{if(active)setLoading(false);}
  }
  void load();return()=>{active=false;};
 },[enabled,orderId,organizationId,productionVersionLabel,expectedVersion]);
 useEffect(()=>{
  if(actorRole && !canActOnWosP2M2(actorRole,action)){
   setAction(canActOnWosP2M2(actorRole,'BASELINE_SELECT')?'BASELINE_SELECT':'MATERIAL_RECORD');
  }
 },[actorRole,action]);
 if(!enabled)return null;

 const chooseStatus=(r:Resource)=>{
  setResource(r);setStatus(M2_MATERIAL_STATES[r][0]);pending.current=null;setResult('');
 };
 async function submit(){
  if(sending||loading||(actorRole&&!canActOnWosP2M2(actorRole,action)))return;
  const core={
    orderId,expectedVersion,productionVersionLabel,note:note.trim(),action,
    ...(action==='MATERIAL_RECORD'?{
      resourceType:resource,resourceStatus:status,
      expectedAt:expectedAt?new Date(expectedAt).toISOString():null,
      arrivedAt:arrivedAt?new Date(arrivedAt).toISOString():null,
      quantityExpected:resource==='INCOMING_MATERIAL'?(expected.trim()?Number(expected):null):null,
      quantityArrived:resource==='INCOMING_MATERIAL'?(arrived.trim()?Number(arrived):null):null,
      physicalCheckAttested:physicalCheck,
    }:action==='BASELINE_SELECT'?{imageIds:selected}:{baselineId}),
  };
  const body=JSON.stringify(core);
  const requestId=pending.current?.body===body?pending.current.id:crypto.randomUUID();
  const parsed=parseWosP2M2Action({...core,requestId});
  if(!parsed){setResult('请输入有效数量、时点、图片或签认资料，并填写至少十字核对说明。');return;}
  pending.current={body,id:requestId};setSending(true);setResult('QA M2 受控事务提交中。');
  try{
   const res=await fetch('/api/workshop-orders/p2/m2',{
    method:'POST',credentials:'same-origin',cache:'no-store',
    headers:{'Content-Type':'application/json','Accept':'application/json','x-wos-p2-m2':'1'},
    body:JSON.stringify(parsed),
   });
   const reply:{ok?:boolean;code?:string;data?:{
    requestId?:string;version?:number;proofStatus?:string;canStart?:boolean;
   }}=await res.json();
   if(!res.ok||!reply.ok||!['QA_M2_ACTION_APPLIED','QA_M2_REPLAY_VERIFIED'].includes(reply.code??'')||
      reply.data?.requestId!==requestId||reply.data?.version!==expectedVersion+1||
      reply.data?.proofStatus!=='UNVERIFIED'||reply.data?.canStart!==false) {
    setResult('数据库未确认保存：'+(reply.code??'UNKNOWN')+'。请保持表单不变以同 requestId 重试，不能据此开工。');
    return;
   }
   pending.current=null;
   setResult('受控 QA 回执已验证，事务版本 v'+reply.data.version+'；后续交接/签样证明仍 UNVERIFIED，不可开工。');
   onSuccess();
  }catch{
   setResult('网络中断，事务结果未知。保持所有输入不变可用同一请求编号安全核实；不可假定保存成功。');
  }finally{setSending(false);}
 }
 return <section className="mt-3 space-y-3 rounded border-2 border-amber-300 p-3 text-sm" aria-label="M2 非生产物料与图片签认">
   <h4 className="font-semibold">M2 QA 原子登记（仅另行授权的隔离 Preview）</h4>
   <p className="text-xs text-amber-900">
     此操作需要独立的 QA 客户端开关、服务器开关、数据库专用 Gate 和受审核的 M2 RPC。
     即使成功也只产生 UNVERIFIED 候选版本证明，不准自动开工。
   </p>
   <label className="block">操作
    <select className="mt-1 w-full border p-2" disabled={sending} value={action}
      onChange={e=>{setAction(e.target.value as Action);pending.current=null;}}>
     {(!actorRole||canActOnWosP2M2(actorRole,'MATERIAL_RECORD'))&&
       <option value="MATERIAL_RECORD">四项物料登记</option>}
     {(!actorRole||canActOnWosP2M2(actorRole,'BASELINE_SELECT'))&&
       <option value="BASELINE_SELECT">办公室选择待确认 CURRENT 图片候选</option>}
     {(!actorRole||canActOnWosP2M2(actorRole,'BASELINE_OFFICE_CONFIRM'))&&
       <option value="BASELINE_OFFICE_CONFIRM">办公室确认图片基准</option>}
     {(!actorRole||canActOnWosP2M2(actorRole,'BASELINE_WORKSHOP_CONFIRM'))&&
       <option value="BASELINE_WORKSHOP_CONFIRM">车间独立复核图片基准</option>}
    </select>
   </label>
   {action==='MATERIAL_RECORD'&&<div className="grid grid-cols-2 gap-2">
    <label>物料类别<select className="block w-full border p-2" value={resource} disabled={sending}
      onChange={e=>chooseStatus(e.target.value as Resource)}>
      {Object.keys(M2_MATERIAL_STATES).map(r=><option key={r} value={r}>{r}</option>)}
    </select></label>
    <label>状态<select className="block w-full border p-2" value={status} disabled={sending}
      onChange={e=>setStatus(e.target.value)}>
      {M2_MATERIAL_STATES[resource].map(x=><option key={x} value={x}>{x}</option>)}
    </select></label>
    <label>预计到位<input className="block w-full border p-2" type="datetime-local"
      value={expectedAt} disabled={sending} onChange={e=>setExpectedAt(e.target.value)}/></label>
    <label>实际到位<input className="block w-full border p-2" type="datetime-local"
      value={arrivedAt} disabled={sending} onChange={e=>setArrivedAt(e.target.value)}/></label>
    {resource==='INCOMING_MATERIAL'&&<>
      <label>应到数量<input className="block w-full border p-2" type="number" min="0"
        value={expected} disabled={sending} onChange={e=>setExpected(e.target.value)}/></label>
      <label>实到数量<input className="block w-full border p-2" type="number" min="0"
        value={arrived} disabled={sending} onChange={e=>setArrived(e.target.value)}/></label>
    </>}
    <label className="col-span-2"><input type="checkbox" checked={physicalCheck}
      disabled={sending} onChange={e=>setPhysicalCheck(e.target.checked)}/>
      已在现场实际核对，不以图片上传代替实物验证（系统仅记录责任声明）。
    </label>
   </div>}
   {action==='BASELINE_SELECT'&&<div>
    <p className="text-xs">仅选择本组织、本订单当前生产资料版本下已有的 READY 图片；独立私有对象完整性检查仍由数据库完成。</p>
    {images.map(img=><label className="mt-1 block text-xs" key={img.id}>
      <input type="checkbox" checked={selected.includes(img.id)} disabled={sending}
        onChange={e=>setSelected(a=>e.target.checked?[...a,img.id]:a.filter(x=>x!==img.id))}/>
      {img.category} · {img.file_name}
    </label>)}
    {images.length===0&&<p className="text-amber-900">没有可供选择的真实图片。</p>}
   </div>}
   {(action==='BASELINE_OFFICE_CONFIRM'||action==='BASELINE_WORKSHOP_CONFIRM')&&
      <label className="block">待确认图片基准
       <select className="mt-1 w-full border p-2" value={baselineId} disabled={sending}
        onChange={e=>setBaselineId(e.target.value)}>
        <option value="">请选择</option>
        {baselines.filter(x=>action==='BASELINE_OFFICE_CONFIRM'?x.status==='DRAFT':x.status==='CURRENT')
        .map(x=><option value={x.id} key={x.id}>{x.status} · {x.id.slice(0,8)}</option>)}
       </select>
      </label>}
   <label className="block">操作说明（至少十字）
     <textarea className="mt-1 w-full border p-2" value={note} disabled={sending}
       onChange={e=>setNote(e.target.value)}/>
   </label>
   <button type="button" disabled={sending||loading}
     className="rounded bg-amber-800 px-4 py-2 text-white disabled:opacity-50" onClick={()=>void submit()}>
     {sending?'正在核对事务…':'提交 M2 QA 事务（不涉及开工）'}
   </button>
   {result&&<p role="status" className="text-xs">{result}</p>}
 </section>;
}
