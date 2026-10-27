'use client';
import { useEffect,useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatMoney } from '@/lib/commercial-documents/template';
type Item={id:string;document_no:string;latest_version:number;owner_profile_id:string;created_at:string;
 buyer_name?:string;project_name?:string;currency?:string;amount_thousandths?:number;confirmed_at?:string;};
type Version={id:string;version:number;amount_thousandths:number;currency:string;buyer_name:string;project_name:string;confirmed_at:string};
export default function ConfirmedQuoteLibrary({profileId}:{profileId:string}) {
 const router=useRouter();
 const [rows,setRows]=useState<Item[]>([]);
 const [search,setSearch]=useState('');
 const [loading,setLoading]=useState(false);
 const [error,setError]=useState('');
 const [selected,setSelected]=useState('');
 const [versions,setVersions]=useState<Version[]>([]);
 const [canEdit,setCanEdit]=useState(false);
 async function load(q=''){
  setLoading(true);setError('');
  try{
   const r=await fetch('/api/commercial-documents/confirmed?q='+encodeURIComponent(q),{cache:'no-store'});
   const j=await r.json();if(!r.ok||!j.ok) throw Error(j.message||'获取报价失败');setRows(j.quotes||[]);
  }catch(e){setError(e instanceof Error?e.message:'网络失败');}finally{setLoading(false);}
 }
 useEffect(()=>{void load();},[]);
 async function detail(id:string){
  setSelected(id);setError('');
  const r=await fetch('/api/commercial-documents/confirmed/'+encodeURIComponent(id),{cache:'no-store'});
  const j=await r.json();if(!r.ok||!j.ok){setError(j.message||'无法读取历史');return;}
  setVersions(j.versions||[]);setCanEdit(j.canEdit===true);
 }
 return <div className="space-y-5">
  <div className="flex flex-wrap justify-between items-start gap-3">
   <div><p className="text-xs text-gray-500">HongdaOS / 商务单据</p><h1 className="text-2xl font-bold">已保存报价</h1>
    <p className="text-sm text-gray-500">只显示已确认的报价；草稿和正式版本严格分开。可以查询历史并基于原报价修改。</p></div>
   <button className="btn-primary btn-sm" onClick={()=>router.push('/commercial-documents')}>新建报价</button>
  </div>
  <div className="rounded-xl border bg-white p-4 space-y-3">
   <div className="flex gap-2"><input className="flex-1" value={search} onChange={e=>setSearch(e.target.value)}
    onKeyDown={e=>{if(e.key==='Enter') void load(search);}} placeholder="搜索编号、客户或项目"/>
    <button className="btn-secondary btn-sm" onClick={()=>void load(search)}>搜索</button></div>
   {error&&<p role="alert" className="text-red-700 text-sm">{error}</p>}
   {loading&&<p role="status" className="text-sm">加载中…</p>}
   <div className="overflow-x-auto"><table className="min-w-full text-sm">
    <thead><tr className="border-b bg-gray-50"><th className="p-3 text-left">报价编号 / 客户</th><th className="p-3 text-left">项目</th><th className="p-3 text-left">金额</th><th className="p-3 text-left">版本 / 确认时间</th><th className="p-3 text-left">操作</th></tr></thead>
    <tbody>{rows.map(row=><tr key={row.id} className="border-b">
     <td className="p-3"><strong>{row.document_no}</strong><div className="text-xs text-gray-500">{row.buyer_name||'客户未填写'}</div></td>
     <td className="p-3">{row.project_name||'—'}</td>
     <td className="p-3">{row.amount_thousandths!==undefined?formatMoney(row.amount_thousandths,row.currency||'CNY'):'—'}</td>
     <td className="p-3">V{row.latest_version}<div className="text-xs text-gray-500">{new Date(row.confirmed_at||row.created_at).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'})}</div></td>
     <td className="p-3 flex flex-wrap gap-2">
      <button className="btn-secondary btn-sm" onClick={()=>void detail(row.id)}>历史与详情</button>
      {row.owner_profile_id===profileId&&<button className="btn-secondary btn-sm" onClick={()=>router.push('/commercial-documents?confirmedId='+encodeURIComponent(row.id))}>编辑修改</button>}
     </td></tr>)}</tbody></table>
    {rows.length===0&&!loading&&<p className="text-center p-8 text-gray-500">暂无已确认报价</p>}
   </div>
   {selected&&<section className="border rounded-lg p-4 bg-gray-50 space-y-2">
    <div className="flex items-center justify-between"><h2 className="font-medium">历史确认版本</h2><button className="btn-secondary btn-sm" onClick={()=>setSelected('')}>收起</button></div>
    {versions.map(v=><div key={v.id} className="flex flex-wrap gap-3 items-center justify-between border-b py-2 text-sm">
     <span>V{v.version} · {v.buyer_name} · {formatMoney(v.amount_thousandths,v.currency)} · {new Date(v.confirmed_at).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'})}</span>
     <div className="flex gap-2">
      <button className="btn-secondary btn-sm" onClick={()=>router.push('/commercial-documents?confirmedId='+selected+'&version='+v.version+'&readonly=1')}>查看原报价</button>
      {canEdit&&<button className="btn-secondary btn-sm" onClick={()=>router.push('/commercial-documents?confirmedId='+selected+'&version='+v.version)}>基于此版修改</button>}
     </div>
    </div>)}
   </section>}
  </div>
 </div>;
}
