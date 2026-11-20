'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import LiveQaWorkshopM2 from './LiveQaWorkshopM2';
import { canActOnWosP2M2 } from '@/lib/workshop-orders/p2-m2-action-contract';

type Verified = {
 orderId:string;organizationId:string;expectedVersion:number;
 productionVersionLabel:string;workflowStatus:string;role:string;
};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export default function LiveQaM2OrderPicker(){
 const [orderId,setOrderId]=useState('');
 const [selected,setSelected]=useState<Verified|null>(null);
 const [status,setStatus]=useState('');
 const [loading,setLoading]=useState(false);
 useEffect(()=>{
  const db=createClient();
  if(!db)return;
  const {data:{subscription}}=db.auth.onAuthStateChange(()=>{
   setSelected(null);setStatus('登录身份发生变化，请重新验证当前组织与订单。');
  });
  return()=>{subscription.unsubscribe();};
 },[]);
 async function load(){
  setSelected(null);setStatus('正在使用当前登录账号读取指定 QA 订单 RLS 数据…');
  if(!uuid.test(orderId)){setStatus('QA_ORDER_DENIED_OR_UNVERIFIED');return;}
  setLoading(true);
  try{
   const db=createClient();
   if(!db)throw new Error('NO_DB');
   const auth=await db.auth.getUser();
   if(auth.error||!auth.data.user)throw new Error('NO_AUTH');
   const profiles=await db.from('profiles')
      .select('id,user_id,org_id,role,is_active')
      .eq('user_id',auth.data.user.id).eq('is_active',true).limit(2);
   if(profiles.error||profiles.data?.length!==1)throw new Error('PROFILE');
   const p=profiles.data[0];
   if(p.user_id!==auth.data.user.id||p.is_active!==true||
      !(['MATERIAL_RECORD','BASELINE_SELECT','BASELINE_OFFICE_CONFIRM','BASELINE_WORKSHOP_CONFIRM'] as const)
       .some(action=>canActOnWosP2M2(p.role,action)))throw new Error('ROLE');
   const order=await db.from('wos_production_orders')
     .select('id,organization_id,order_number,workflow_status,version,version_label')
     .eq('id',orderId).eq('organization_id',p.org_id).maybeSingle();
   const o=order.data;
   if(order.error||!o||o.id!==orderId||o.organization_id!==p.org_id||
      typeof o.order_number!=='string'||!o.order_number.startsWith('QA-')||
      !['WAITING_MATERIAL','READINESS_CHECK'].includes(o.workflow_status)||
      !Number.isSafeInteger(o.version)||o.version<1||
      typeof o.version_label!=='string'||!o.version_label.trim())
     throw new Error('ORDER');
   setSelected({
     orderId:o.id,organizationId:p.org_id,
     expectedVersion:o.version,productionVersionLabel:o.version_label,
     workflowStatus:o.workflow_status,role:p.role,
   });
   setStatus('当前 Supabase Auth + 组织 RLS + QA 订单身份已验证。操作仍须分别经过服务器与数据库 M2 Gate。');
  }catch{
   setSelected(null);
   // Keep same denial for viewer, foreign org, missing or unavailable order.
   setStatus('QA_ORDER_DENIED_OR_UNVERIFIED');
  }finally{setLoading(false);}
 }
 return <section className="space-y-4">
   <p className="rounded border p-3 text-xs text-amber-900">
     只能使用具有授权身份的合成订单。请勿对真实客户订单执行测试。
     当前事务版本不等于生产资料版本；任何成功记录均需独立复核，不能放行开工。
   </p>
   <label className="block text-sm">QA 合成订单 UUID
    <input value={orderId} onChange={e=>{setOrderId(e.target.value.trim());setSelected(null);}}
      placeholder="经 Owner 审批的新 QA 订单 UUID" className="mt-1 w-full rounded border p-2"/>
   </label>
   <button type="button" className="rounded border p-2 text-sm" disabled={loading}
     onClick={()=>void load()}> {loading?'核验中…':'按当前账号核验订单'} </button>
   {status&&<p role="status" className="text-xs">{status}</p>}
   {selected&&<section className="rounded border p-3">
     <h3 className="text-sm font-semibold">已核验的 QA 订单 · 生产资料 {selected.productionVersionLabel}</h3>
     <p className="text-xs">事务版本 v{selected.expectedVersion} · {selected.workflowStatus} ·
       当前授权角色 {selected.role}。严禁自动开工。</p>
     <LiveQaWorkshopM2
       orderId={selected.orderId} organizationId={selected.organizationId}
       productionVersionLabel={selected.productionVersionLabel}
       expectedVersion={selected.expectedVersion} actorRole={selected.role}
       onSuccess={()=>void load()}/>
   </section>}
 </section>;
}
