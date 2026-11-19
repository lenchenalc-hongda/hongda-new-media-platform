'use client';

// P0-02-02 Office candidate: integrated with the existing 21-field WOS form.
// Not an alternative order system. Default-off, pinned to approved QA Preview.
// No service key, no public Storage bucket, no direct READY image insert.
import {useEffect,useMemo,useRef,useState,type ChangeEvent} from 'react';
import Link from 'next/link';
import {createClient} from '@/lib/supabase/client';
import type {ProductionOrderDraft,NormalizedProductionOrderDraft} from '@/lib/workshop-orders/office-entry';
import {buildWosPrivateImageCandidate} from '@/lib/workshop-orders/prod-p1-candidate-contract';

interface Customer {id:string;name:string}
interface Project {id:string;customerId:string;name:string;ownerProfileId:string}
interface ApiResult {ok?:boolean;code?:string;data?:Record<string,unknown>}
interface CandidateState {orderId:string;orderNumber:string;version:number;versionLabel:string}
type Phase='NEW'|'DRAFT'|'OFFICE_SAVED'|'IMAGE_REGISTERED'|'SUBMITTED';
const cap=20*1024*1024;
const control='min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900';
const button='min-h-11 rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 hover:bg-blue-800';
type Keys={draft:string;save:string;image:string;submit:string};
async function apiPost(url:string,value:unknown):Promise<ApiResult> {
 const response=await fetch(url,{method:'POST',credentials:'same-origin',
  headers:{'content-type':'application/json'},cache:'no-store',body:JSON.stringify(value)});
 const body=(await response.json()) as ApiResult;
 if(!response.ok||body.ok!==true)throw new Error(typeof body.code==='string'?body.code:'CANDIDATE_API_UNAVAILABLE');
 return body;
}
export default function WosMvpOfficeCandidatePanel({
 draft,normalized,valid,onCpcChosen,onDraftCreated,
}:{
 draft:ProductionOrderDraft;normalized:NormalizedProductionOrderDraft;valid:boolean;
 onCpcChosen:(customerName:string,projectName:string)=>void;
 onDraftCreated:(orderNumber:string)=>void;
}){
 const [customers,setCustomers]=useState<Customer[]>([]);
 const [projects,setProjects]=useState<Project[]>([]);
 const [customerId,setCustomerId]=useState('');
 const [projectId,setProjectId]=useState('');
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState(false);
 const [phase,setPhase]=useState<Phase>('NEW');
 const [saved,setSaved]=useState<CandidateState|null>(null);
 const [savedFormKey,setSavedFormKey]=useState('');
 const [imageVerifiedVersion,setImageVerifiedVersion]=useState<number|null>(null);
 const [file,setFile]=useState<File|null>(null);
 const [readinessNote,setReadinessNote]=useState('办公室确认本单资料齐全，并已核对产品图片和客户验收要求。');
 const [status,setStatus]=useState('');
 const [error,setError]=useState('');
 const keysRef=useRef<Keys|null>(null);
 const keys=()=>{
  if(!keysRef.current)keysRef.current={
   draft:crypto.randomUUID(),save:crypto.randomUUID(),
   image:crypto.randomUUID(),submit:crypto.randomUUID(),
  };
  return keysRef.current;
 };
 useEffect(()=>{
  const ctrl=new AbortController();let active=true;
  void(async()=>{
   try{
    const response=await fetch('/api/workshop-orders/production/cpc-options',
     {cache:'no-store',credentials:'same-origin',signal:ctrl.signal});
    const data=(await response.json()) as ApiResult;
    const choices=data.data as {customers?:Customer[];projects?:Project[]}|undefined;
    if(!response.ok||data.code!=='CPC_OPTIONS_RLS_VERIFIED'
      ||!Array.isArray(choices?.customers)||!Array.isArray(choices?.projects))
      throw Error('CPC_OPTIONS_UNAVAILABLE');
    if(active){setCustomers(choices.customers);setProjects(choices.projects);}
   }catch{
    if(active)setError('CPC_OPTIONS_UNAVAILABLE');
   }finally{if(active)setLoading(false);}
  })();
  return()=>{active=false;ctrl.abort();};
 },[]);
 const options=useMemo(()=>projects.filter(p=>p.customerId===customerId),
  [projects,customerId]);
 const selection=useMemo(()=>{
  const c=customers.find(x=>x.id===customerId),p=options.find(x=>x.id===projectId);
  return c&&p?{customer:c,project:p}:null;
 },[customers,customerId,projectId,options]);
 const formCurrent=!!savedFormKey&&savedFormKey===JSON.stringify(normalized)&&valid;
 const run=async(action:()=>Promise<void>)=>{
  if(busy)return;
  setBusy(true);setError('');
  try{await action();}catch(e){
   setError(e instanceof Error?e.message:'CANDIDATE_OPERATION_UNVERIFIED');
  }finally{setBusy(false);}
 };
 const createDraft=()=>run(async()=>{
  if(!selection)throw Error('请先选择有权限的 CPC 客户和项目');
  if(!normalized.productName.trim()||!normalized.productMaterial.trim()
    ||!normalized.requestedQuantity||!normalized.priority)
    throw Error('请填写产品名称、材质、数量及优先级');
  const requestId=keys().draft;
  const body=await apiPost('/api/workshop-orders/production/candidate-drafts',{
   requestId,customerId:selection.customer.id,projectId:selection.project.id,
   productName:normalized.productName,productMaterial:normalized.productMaterial,
   requestedQuantity:normalized.requestedQuantity,priority:normalized.priority,
  });
  const v=body.data;
  if(v?.orderId!==requestId||typeof v?.orderNumber!=='string'
    ||v.version!==1)throw Error('DRAFT_PERSISTENCE_UNVERIFIED');
  setSaved({orderId:requestId,orderNumber:v.orderNumber,version:1,versionLabel:'V1'});
  onDraftCreated(v.orderNumber);
  setPhase('DRAFT');setStatus('草稿已保存至隔离数据库；尚未提交车间。');
 });
 const saveOffice=()=>run(async()=>{
  if(!saved||!valid)throw Error('请先填写并检查全部生产要求');
  if(draft.orderNumber!==saved.orderNumber||draft.versionLabel!=='V1')
    throw Error('订单编号和版本必须与服务器保存的草稿一致');
  const requestId=keys().save;
  const res=await apiPost('/api/workshop-orders/production/candidate-office-document',{
   orderId:saved.orderId,requestId,expectedVersion:saved.version,form:draft,
  });
  const row=res.data;
  if(row?.orderId!==saved.orderId||row?.version!==saved.version+1
    ||row?.allOfficeFieldsSaved!==true)throw Error('OFFICE_FIELDS_SAVE_UNVERIFIED');
  setSaved({...saved,version:saved.version+1});
  setSavedFormKey(JSON.stringify(normalized));
  keys().save=crypto.randomUUID();
  keys().image=crypto.randomUUID();
  setImageVerifiedVersion(null);
  setPhase('OFFICE_SAVED');
  setStatus('完整生产要求已版本化保存，请上传私有图片进行字节验证。');
 });
 function onFile(e:ChangeEvent<HTMLInputElement>){
  setFile(e.target.files?.[0]??null);
  setImageVerifiedVersion(null);
  if(phase==='IMAGE_REGISTERED')setPhase('OFFICE_SAVED');
  if(keysRef.current)keysRef.current.image=crypto.randomUUID();
 }
 const uploadAndVerify=()=>run(async()=>{
  if(!saved||phase==='NEW'||!formCurrent)
    throw Error('请先将当前所有生产字段保存到数据库');
  if(!file||file.type!=='image/png'||file.size<60||file.size>cap)
    throw Error('目前仅接受 20MB 以内的有效 PNG 图片');
  if(typeof window==='undefined'||!(/\.vercel\.app$/.test(window.location.hostname)
    ||window.location.hostname==='localhost'))
    throw Error('仅限独立 QA Preview 进行图片验证');
  const client=createClient();if(!client)throw Error('SUPABASE_QA_CLIENT_MISSING');
  const {data:{user},error:authError}=await client.auth.getUser();
  if(authError||!user?.id)throw Error('UNAUTHENTICATED');
  const actor=await client.from('profiles').select('id,org_id,role,is_active')
    .eq('user_id',user.id).eq('is_active',true).maybeSingle();
  if(actor.error||!actor.data||!['admin','manager','sales'].includes(actor.data.role))
    throw Error('OFFICE_ROLE_DENIED');
  const bytes=new Uint8Array(await file.arrayBuffer());
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)))
    .map(v=>v.toString(16).padStart(2,'0')).join('');
  const base=(file.name.replace(/\.png$/i,'').replace(/[^A-Za-z0-9._-]/g,'_')
    .replace(/\.\./g,'_').slice(0,178)||'reference');
  const filename=base+'.png',imageId=keys().image;
  const image=buildWosPrivateImageCandidate({
   organizationId:actor.data.org_id,orderId:saved.orderId,imageId,
   category:'PRODUCT',versionLabel:saved.versionLabel,filename,
   mimeType:'image/png',byteSize:file.size,sha256Hex:hash,
  });
  if(!image)throw Error('IMAGE_PATH_NOT_VERIFIED');
  // No upsert: a repeated upload can fail if the first request succeeded.
  // Continue to Edge validation in that case; Edge accepts ONLY the exact
  // bytes/hash under user RLS, so an upload failure never creates false proof.
  await client.storage.from('wos-private').upload(image.storagePath,file,{
   upsert:false,contentType:'image/png',cacheControl:'0',
  });
  const {data:attested,error:edgeError}=await client.functions.invoke(
   'wos-mvp-verify-image-candidate',{body:{
    orderId:saved.orderId,imageId,expectedVersion:saved.version,
    storagePath:image.storagePath,sha256:hash,
   }});
  if(edgeError||attested?.code!=='WOS_PRIVATE_IMAGE_PROOF_VERIFIED'
    ||attested.data?.imageId!==imageId
    ||attested.data?.sha256!==hash||attested.data?.expectedVersion!==saved.version)
    throw Error('INDEPENDENT_EDGE_BYTE_ATTESTATION_REQUIRED');
  const result=await apiPost('/api/workshop-orders/production/candidate-image-register',{
   orderId:saved.orderId,imageId,expectedVersion:saved.version,storagePath:image.storagePath,
  });
  if(result.code!=='PRIVATE_IMAGE_REGISTERED_VERIFIED')
    throw Error('IMAGE_REGISTRATION_NOT_VERIFIED');
  setImageVerifiedVersion(saved.version);
  setPhase('IMAGE_REGISTERED');
  setStatus('私有图片字节校验及数据库 READY 登记已通过（QA 候选）。');
 });
 const submit=()=>run(async()=>{
  if(!saved||phase!=='IMAGE_REGISTERED'||!formCurrent
    ||imageVerifiedVersion!==saved.version)
    throw Error('完整资料及当前版本私有图片必须先完成验证');
  if(readinessNote.trim().length<10||readinessNote.length>2000)
    throw Error('请填写至少 10 字的办公室确认说明');
  const response=await apiPost('/api/workshop-orders/production/candidate-submit',{
   orderId:saved.orderId,expectedVersion:saved.version,
   idempotencyKey:keys().submit,readinessNote,
  });
  const v=response.data;
  if(v?.orderId!==saved.orderId||!['CREATED','REPLAYED'].includes(String(v?.result))
    ||typeof v.receiptId!=='string'||typeof v.inboxTaskId!=='string'
    ||(v.result==='CREATED'&&v.version!==saved.version+1))
    throw Error('SUBMISSION_RECEIPT_UNVERIFIED');
  setPhase('SUBMITTED');setStatus('隔离订单已提交车间 Inbox；禁止从此页面开工。');
 });
 return (
  <section aria-label="受控 CPC 订单与图片提交候选" className="rounded-lg border border-blue-200 bg-blue-50 p-4 space-y-4">
   <h2 className="text-sm font-semibold text-blue-950">CPC → 订单草稿 → 私有图片 → 车间 Inbox（仅 QA 候选）</h2>
   <p className="text-xs text-blue-900">只有在独立 QA 预览环境经过新授权后才能启用。本流程不放行生产开工、排程或完工。</p>
   <div className="grid gap-3 sm:grid-cols-2">
    <label className="text-xs font-medium text-gray-700">选择 CPC 客户
     <select aria-label="选择 CPC 客户" className={control} value={customerId}
       disabled={busy||loading||!!saved} onChange={e=>{
        const id=e.target.value;setCustomerId(id);setProjectId('');
        const customer=customers.find(x=>x.id===id);
        onCpcChosen(customer?.name??'','');
       }}>
       <option value="">请选择客户</option>{customers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
     </select>
    </label>
    <label className="text-xs font-medium text-gray-700">选择授权 CPC 项目
     <select aria-label="选择 CPC 项目" className={control} value={projectId}
       disabled={busy||loading||!customerId||!!saved} onChange={e=>{
        const id=e.target.value;setProjectId(id);
        const customer=customers.find(x=>x.id===customerId);
        const project=options.find(x=>x.id===id);
        onCpcChosen(customer?.name??'',project?.name??'');
       }}>
       <option value="">请选择项目</option>{options.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
     </select>
    </label>
   </div>
   <div className="flex flex-wrap gap-2">
    <button type="button" className={button} disabled={busy||loading||!selection||!!saved}
      onClick={()=>void createDraft()}>1. 创建 CPC 关联草稿</button>
    <button type="button" className={button} disabled={busy||!saved||!valid||phase==='SUBMITTED'}
      onClick={()=>void saveOffice()}>2. 保存全部生产字段</button>
   </div>
   {saved&&<p className="text-xs text-blue-900">订单：{saved.orderNumber} · 数据库版本 v{saved.version} · 生产版本 {saved.versionLabel}</p>}
   <div className="grid gap-3 sm:grid-cols-2">
    <label className="text-xs font-medium text-gray-700">上传产品图片（PNG，20MB 内）
     <input type="file" accept="image/png,.png" aria-label="上传私有产品图片"
      onChange={onFile} disabled={busy||!saved||phase==='SUBMITTED'}
      className="mt-1 block w-full rounded-lg border border-gray-300 bg-white p-3 text-sm"/>
    </label>
    <div className="flex items-end">
     <button type="button" className={button}
      disabled={busy||!saved||!file||!formCurrent||phase==='SUBMITTED'}
      onClick={()=>void uploadAndVerify()}>3. 上传并通过 Edge 字节核验</button>
    </div>
   </div>
   <label className="block text-xs font-medium text-gray-700">办公室资料齐套确认
    <textarea className={control+' min-h-20'} value={readinessNote}
     disabled={busy||phase==='SUBMITTED'} onChange={e=>setReadinessNote(e.target.value)}/>
   </label>
   <div className="flex flex-wrap items-center gap-3">
    <button type="button" className={button}
     disabled={busy||phase!=='IMAGE_REGISTERED'||!formCurrent||imageVerifiedVersion!==saved?.version}
     onClick={()=>void submit()}>4. 原子提交车间 Inbox</button>
    {phase==='SUBMITTED'&&<Link href="/workshop-orders/inbox" className="text-sm font-semibold text-blue-700 underline">查看车间 Inbox</Link>}
   </div>
   {loading&&<p role="status" className="text-xs text-blue-900">正在读取当前用户有权限的 CPC 客户与项目……</p>}
   {busy&&<p role="status" className="text-xs text-blue-900">正在校验数据库事务，禁止重复点击……</p>}
   {status&&<p role="status" className="text-xs text-green-800">{status}</p>}
   {error&&<p role="alert" className="text-xs font-semibold text-red-700">{error}</p>}
  </section>
 );
}
