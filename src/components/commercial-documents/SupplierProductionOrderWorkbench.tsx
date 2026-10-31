'use client';

import { useMemo, useState } from 'react';

type Line = { id: number; category: string; name: string; spec: string; unit: string; quantity: string; price: string; note: string };
type Order = { supplier: string; contact: string; phone: string; address: string; orderDate: string; deliveryDate: string; project: string; receiver: string; deliveryAddress: string; quality: string; technical: string; payment: string; shipping: string; tax: string; remarks: string };
const CATEGORIES = ['机器设备','夹具与配件','热转印花膜','数码花膜','版费 / 制版','加工费用','其他费用','自定义大项'];
const today = () => new Date().toLocaleDateString('en-CA');
const emptyOrder = (): Order => ({ supplier: '', contact: '', phone: '', address: '', orderDate: today(), deliveryDate: '', project: '', receiver: '', deliveryAddress: '', quality: '', technical: '', payment: '', shipping: '', tax: '未约定', remarks: '' });
const format = (value: number) => value.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function money(line: Line): number {
  const qty = Number(line.quantity), price = Number(line.price);
  return Number.isFinite(qty) && Number.isFinite(price) && qty >= 0 && price >= 0 ? qty * price : 0;
}
function Input({ label, value, onChange, type = 'text', area = false }: { label: string; value: string; onChange: (v: string) => void; type?: string; area?: boolean }) {
  return <label className="block min-w-0"><span className="block text-xs font-medium text-gray-600 mb-1">{label}</span>{area
    ? <textarea rows={2} value={value} onChange={e => onChange(e.target.value)} maxLength={3000} className="w-full border rounded-lg p-2 text-sm" />
    : <input type={type} value={value} onChange={e => onChange(e.target.value)} maxLength={300} className="w-full border rounded-lg p-2 text-sm" />}</label>;
}
export default function SupplierProductionOrderWorkbench({ userName }: { userName: string }) {
  const [order, setOrder] = useState<Order>(emptyOrder);
  const [lines, setLines] = useState<Line[]>([]);
  const [nextId, setNextId] = useState(1);
  const [printError, setPrintError] = useState('');
  const [draftId, setDraftId] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [savedList, setSavedList] = useState<Array<{id:string;supplier_name:string;revision:number;updated_at:string}>>([]);
  const [listOpen, setListOpen] = useState(false);
  const [readOnly, setReadOnly] = useState(false);
  const [confirmedId,setConfirmedId] = useState<string|null>(null);
  const [confirmedVersion,setConfirmedVersion] = useState(0);
  const [confirmedNo,setConfirmedNo] = useState('');
  const [confirmedList,setConfirmedList] = useState<Array<{id:string;order_no:string;latest_version:number}>>([]);
  const [historyOpen,setHistoryOpen] = useState(false);
  const [confirming,setConfirming] = useState(false);
  const [confirmRequestId,setConfirmRequestId] = useState<string|null>(null);
  const loadConfirmedList = async () => {
    try {
      const res=await fetch('/api/commercial-documents/production-orders/confirmed',{cache:'no-store'});
      const data=await res.json();
      if(!res.ok||!data.ok)throw Error(data.message||'查询失败');
      setConfirmedList(data.orders);setHistoryOpen(true);setSaveMessage('');
    }catch(e){setSaveMessage(e instanceof Error?e.message:'查询失败');}
  };
  const openConfirmed = async (id:string) => {
    try {
      const res=await fetch('/api/commercial-documents/production-orders/confirmed/'+id,{cache:'no-store'});
      const data=await res.json();
      if(!res.ok||!data.ok||!data.versions?.length)throw Error(data.message||'读取失败');
      const snapshot=data.versions[0].snapshot;
      if(!snapshot?.order||!Array.isArray(snapshot.lines))throw Error('版本内容无效');
      setOrder(snapshot.order);setLines(snapshot.lines);
      setNextId(Math.max(0,...snapshot.lines.map((l:Line)=>Number(l.id)||0))+1);
      setConfirmedId(data.order.id);setConfirmedVersion(data.order.latest_version);setConfirmedNo(data.order.order_no);
      setReadOnly(Boolean(data.readOnly));setHistoryOpen(false);
      setDraftId(null);setRevision(0);setConfirmRequestId(null);
      setSaveMessage(data.readOnly?'其他业务员订单：只读预览':'已载入正式订单，可修改后保存为新版本');
    }catch(e){setSaveMessage(e instanceof Error?e.message:'读取失败');}
  };
  const saveConfirmed = async () => {
    if(confirming||readOnly)return;
    setConfirming(true);setSaveMessage('');
    const requestId=confirmRequestId||crypto.randomUUID();
    setConfirmRequestId(requestId);
    try{
      const res=await fetch('/api/commercial-documents/production-orders/confirmed',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({requestId,orderId:confirmedId,expectedVersion:confirmedVersion,snapshot:{order,lines}})
      });
      const data=await res.json();
      if(!res.ok||!data.ok)throw Error(data.message||'保存失败');
      setConfirmedId(data.orderId);setConfirmedVersion(data.version);setConfirmedNo(data.orderNo);
      setConfirmRequestId(null);
      setSaveMessage('已保存正式布产单 '+data.orderNo+' · V'+data.version+'（仅结构化数据，PDF 原件归档未完成）');
    }catch(e){setSaveMessage(e instanceof Error?e.message:'保存失败，可重试；请保留当前页面');}
    finally{setConfirming(false);}
  };
  const loadList = async () => {
    try {
      const res = await fetch('/api/commercial-documents/production-orders/drafts',{cache:'no-store'});
      const data = await res.json();
      if(!res.ok||!data.ok) throw Error(data.message||'查询失败');
      setSavedList(data.drafts);setListOpen(true);setSaveMessage('');
    } catch(e) {setSaveMessage(e instanceof Error?e.message:'读取失败');}
  };
  const openDraft = async (id:string) => {
    try {
      const res=await fetch('/api/commercial-documents/production-orders/drafts/'+id,{cache:'no-store'});
      const data=await res.json();
      if(!res.ok||!data.ok) throw Error(data.message||'打开失败');
      if(!data.draft?.order||!Array.isArray(data.draft?.lines))throw Error('草稿内容不完整');
      setOrder(data.draft.order);setLines(data.draft.lines);
      setNextId(Math.max(0,...data.draft.lines.map((l:Line)=>Number(l.id)||0))+1);
      setDraftId(data.id);setRevision(data.revision);setReadOnly(Boolean(data.readOnly));
      setListOpen(false);setSaveMessage(data.readOnly?'只读：其他负责人的草稿':'已打开云端草稿');
    } catch(e){setSaveMessage(e instanceof Error?e.message:'打开失败');}
  };
  const saveDraft = async () => {
    if(saving||readOnly)return;
    setSaving(true);setSaveMessage('');
    try {
      const isUpdate=Boolean(draftId);
      const res=await fetch('/api/commercial-documents/production-orders/drafts'+(draftId?'/'+draftId:''),{
        method:isUpdate?'PATCH':'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({draft:{order,lines},...(isUpdate?{expectedRevision:revision}:{})})
      });
      const data=await res.json();
      if(!res.ok||!data.ok)throw Error(data.message||'保存失败');
      setDraftId(data.id);setRevision(data.revision);
      setSaveMessage('云端草稿已保存 · '+new Date().toLocaleString('zh-CN'));
    }catch(e){setSaveMessage(e instanceof Error?e.message:'保存失败，请保留当前内容');}
    finally{setSaving(false);}
  };
  const [number] = useState(() => 'HD-BP-' + new Date().toISOString().slice(2,7).replace('-','') + '-' + Math.random().toString(36).slice(2,10).toUpperCase());
  const total = useMemo(() => lines.reduce((sum, line) => sum + money(line), 0), [lines]);
  const update = (field: keyof Order, value: string) => {setConfirmRequestId(null);setOrder(prev => ({ ...prev, [field]: value }));};
  const add = (category: string) => { setConfirmRequestId(null);setLines(prev => [...prev, { id: nextId, category, name: category === '自定义大项' ? '' : category, spec: '', unit: '项', quantity: '1', price: '', note: '' }]); setNextId(n => n + 1); };
  const updateLine = (id: number, field: keyof Line, value: string) => {setConfirmRequestId(null);setLines(prev => prev.map(line => line.id === id ? { ...line, [field]: value } : line));};
  const print = () => {
    if (!order.supplier.trim() || !order.deliveryDate || !lines.length || lines.some(l => !l.name.trim() || !l.quantity || !l.price || Number(l.quantity) <= 0 || Number(l.price) < 0 || !Number.isFinite(Number(l.quantity)) || !Number.isFinite(Number(l.price)))) {
      setPrintError('打印前请填写供应商、交期，以及至少一项完整的生产明细（名称、正数数量、非负单价）。'); return;
    }
    setPrintError(''); window.print();
  };
  return <div className="mx-auto max-w-[1600px] px-4 py-6">
    <style>{`@media print { body * { visibility: hidden !important; } #supplier-print, #supplier-print * { visibility: visible !important; } #supplier-print { position: absolute; left: 0; top: 0; width: 100%; box-shadow: none; border: 0; padding: 12mm; } .supplier-no-print { display: none !important; } @page { size: A4; margin: 8mm; } .supplier-row { break-inside: avoid; } }`}</style>
    <div className="supplier-no-print mb-5 flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-2xl font-bold text-gray-900">供应商布产单</h1><p className="mt-1 text-sm text-gray-500">东莞宏达外协委托生产 · 仅中文版</p></div>
      <div className="flex flex-wrap gap-2">
      <button type="button" onClick={loadConfirmedList} className="rounded-lg border px-4 py-2.5 text-sm font-semibold hover:bg-gray-50">已保存布产单</button>
      <button type="button" onClick={saveConfirmed} disabled={confirming||readOnly} className="rounded-lg border border-emerald-600 px-4 py-2.5 text-sm font-semibold text-emerald-700 disabled:opacity-50">{confirming?'保存中...':'保存正式文件'}</button>
      <button type="button" onClick={loadList} className="rounded-lg border px-4 py-2.5 text-sm font-semibold hover:bg-gray-50">云端草稿箱</button>
      <button type="button" onClick={saveDraft} disabled={saving||readOnly} className="rounded-lg border border-blue-600 px-4 py-2.5 text-sm font-semibold text-blue-700 disabled:opacity-50">{saving?'保存中...':'保存到云端草稿'}</button>
      <button type="button" onClick={print} className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">校验并打印 / 另存 PDF</button>
      </div>
    </div>
    <div className="supplier-no-print mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">当前支持云端草稿及正式结构化版本存档；PDF 原件归档、供应商发单及确认尚未上线。保存正式文件不等于已发单。</div>
    {saveMessage && <div role="status" className="supplier-no-print mb-3 rounded-lg border bg-white p-3 text-sm">{saveMessage}</div>}
    {historyOpen && <section className="supplier-no-print mb-4 rounded-xl border bg-white p-4 shadow-sm"><div className="mb-3 flex justify-between"><strong>已保存正式布产单</strong><button type="button" onClick={()=>setHistoryOpen(false)}>关闭</button></div>{confirmedList.length===0?<p className="text-sm text-gray-500">暂无记录</p>:<div className="space-y-2">{confirmedList.map(o=><button key={o.id} type="button" onClick={()=>openConfirmed(o.id)} className="block w-full rounded-lg border px-3 py-2 text-left text-sm hover:bg-blue-50">{o.order_no} · V{o.latest_version}</button>)}</div>}</section>}
    {listOpen && <section className="supplier-no-print mb-4 rounded-xl border bg-white p-4 shadow-sm">
      <div className="mb-3 flex justify-between"><strong>我的云端布产单草稿</strong><button type="button" onClick={()=>setListOpen(false)}>关闭</button></div>
      {savedList.length===0?<p className="text-sm text-gray-500">暂无草稿</p>:<div className="space-y-2">{savedList.map(d=><button key={d.id} type="button" onClick={()=>openDraft(d.id)} className="block w-full rounded-lg border px-3 py-2 text-left text-sm hover:bg-blue-50"><strong>{d.supplier_name||'未填写供应商'}</strong><span className="ml-3 text-gray-500">修订 {d.revision} · {new Date(d.updated_at).toLocaleString('zh-CN')}</span></button>)}</div>}
    </section>}
    {printError && <div role="alert" className="supplier-no-print mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{printError}</div>}
    <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"><div className="supplier-no-print min-w-0 space-y-4">
      <section className="rounded-xl border bg-white p-4 shadow-sm"><h2 className="mb-3 font-bold">01 · 布产基本信息</h2><div className="grid gap-3 md:grid-cols-3">
        <Input label="下单日期" type="date" value={order.orderDate} onChange={v=>update('orderDate',v)} />
        <Input label="要求交货日期 *" type="date" value={order.deliveryDate} onChange={v=>update('deliveryDate',v)} />
        <Input label="关联项目 / 客户参考" value={order.project} onChange={v=>update('project',v)} />
      </div></section>
      <section className="rounded-xl border bg-white p-4 shadow-sm"><h2 className="mb-3 font-bold">02 · 承制供应商</h2><div className="grid gap-3 md:grid-cols-2">
        <Input label="供应商名称 *" value={order.supplier} onChange={v=>update('supplier',v)} />
        <Input label="供应商联系人" value={order.contact} onChange={v=>update('contact',v)} />
        <Input label="联系电话" value={order.phone} onChange={v=>update('phone',v)} />
        <Input label="供应商地址" value={order.address} onChange={v=>update('address',v)} />
      </div></section>
      <section className="rounded-xl border bg-white p-4 shadow-sm"><h2 className="mb-3 font-bold">03 · 布产内容</h2>
        {lines.map((line, index) => <div key={line.id} className="mb-3 rounded-lg border bg-gray-50 p-3"><div className="mb-2 flex justify-between"><strong className="text-sm">{index+1}. {line.category}</strong><button type="button" className="text-xs text-red-600" onClick={()=>{setConfirmRequestId(null);setLines(prev=>prev.filter(x=>x.id!==line.id));}}>删除</button></div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Input label="品名 / 工序 *" value={line.name} onChange={v=>updateLine(line.id,'name',v)} />
            <Input label="规格 / 型号" value={line.spec} onChange={v=>updateLine(line.id,'spec',v)} />
            <Input label="单位" value={line.unit} onChange={v=>updateLine(line.id,'unit',v)} />
            <Input label="数量 *" type="number" value={line.quantity} onChange={v=>updateLine(line.id,'quantity',v)} />
            <Input label="单价（元）*" type="number" value={line.price} onChange={v=>updateLine(line.id,'price',v)} />
            <Input label="工艺 / 说明" value={line.note} onChange={v=>updateLine(line.id,'note',v)} />
            <div className="flex items-end text-sm font-bold text-red-700">小计：¥ {format(money(line))}</div>
          </div></div>)}
        <div className="mb-2 text-sm font-medium text-gray-700">选择布产大项（点击添加）</div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3">{CATEGORIES.map(c => <button type="button" key={c} onClick={()=>add(c)} className="flex min-h-12 items-center gap-3 rounded-xl border bg-white px-4 py-2 text-left font-semibold shadow-sm hover:border-blue-400"><span className="text-xl text-blue-600">＋</span>{c}</button>)}</div>
        <div className="mt-4 flex justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-3 font-bold text-red-700"><span>整张布产单总金额</span><span>¥ {format(total)}</span></div>
      </section>
      <section className="rounded-xl border bg-white p-4 shadow-sm"><h2 className="mb-3 font-bold">04 · 生产技术与品质要求</h2><div className="grid gap-3 md:grid-cols-2">
        <Input label="工艺、材质、尺寸、图纸版本、颜色等技术要求" area value={order.technical} onChange={v=>update('technical',v)} />
        <Input label="首件确认、验收标准、包装及品质要求" area value={order.quality} onChange={v=>update('quality',v)} />
      </div></section>
      <section className="rounded-xl border bg-white p-4 shadow-sm"><h2 className="mb-3 font-bold">05 · 付款与交付</h2><div className="grid gap-3 md:grid-cols-2">
        <Input label="收货人" value={order.receiver} onChange={v=>update('receiver',v)} />
        <Input label="交货地址" value={order.deliveryAddress} onChange={v=>update('deliveryAddress',v)} />
        <Input label="付款约定" value={order.payment} onChange={v=>update('payment',v)} />
        <Input label="运费和交货方式" value={order.shipping} onChange={v=>update('shipping',v)} />
        <label className="text-sm">税费约定<select value={order.tax} onChange={e=>update('tax',e.target.value)} className="mt-1 block w-full rounded-lg border p-2"><option>未约定</option><option>含税</option><option>不含税</option></select></label>
      </div></section>
      <section className="rounded-xl border bg-white p-4 shadow-sm"><h2 className="mb-3 font-bold">06 · 备注与确认</h2><Input label="特别说明 / 变更要求" area value={order.remarks} onChange={v=>update('remarks',v)} /></section>
    </div>
    <div className="min-w-0 xl:sticky xl:top-4"><div className="supplier-no-print mb-2 text-sm font-semibold text-gray-700">实时单据预览</div>
    <section id="supplier-print" className="rounded-xl border bg-white p-6 text-sm shadow-sm">
      <div className="mb-4 border-b pb-3 text-center"><p className="text-sm font-semibold">广东宏达印业股份有限公司</p><h2 className="mt-2 text-2xl font-bold">生产委托单（布产单）</h2></div>
      <div className="grid grid-cols-2 gap-2"><p>布产单号：{confirmedNo || number}{confirmedNo ? ' · V'+confirmedVersion : '（临时）'}</p><p>下单日期：{order.orderDate}</p><p>委托方：广东宏达印业股份有限公司</p><p>经办人：{userName}</p><p>承制供应商：{order.supplier || '—'}</p><p>供应商联系人：{order.contact || '—'}</p><p>供应商电话：{order.phone || '—'}</p><p>交付日期：{order.deliveryDate || '—'}</p><p>关联项目：{order.project || '—'}</p><p>供应商地址：{order.address || '—'}</p></div>
      <table className="mt-5 w-full border-collapse text-left text-xs"><thead><tr>{['序号','生产内容','规格 / 型号','数量','单位','单价（元）','金额（元）'].map(h=><th key={h} className="border p-2">{h}</th>)}</tr></thead><tbody>{lines.map((line,i)=><tr key={line.id} className="supplier-row">{[String(i+1),line.name,line.spec,line.quantity,line.unit,line.price,format(money(line))].map((x,j)=><td key={j} className="border p-2 align-top break-words">{x}</td>)}</tr>)}</tbody></table>
      <p className="mt-3 text-right text-lg font-bold text-red-700">合计：¥ {format(total)}</p>
      <div className="mt-5 space-y-2 whitespace-pre-wrap break-words"><p><strong>技术要求：</strong>{order.technical || '—'}</p><p><strong>验收与品质：</strong>{order.quality || '—'}</p><p><strong>付款约定：</strong>{order.payment || '—'}</p><p><strong>税费：</strong>{order.tax}</p><p><strong>运输方式：</strong>{order.shipping || '—'}</p><p><strong>收货人 / 交货地址：</strong>{order.receiver || '—'} / {order.deliveryAddress || '—'}</p><p><strong>备注：</strong>{order.remarks || '—'}</p></div>
      <div className="mt-8 grid grid-cols-2 gap-6"><p>委托方确认（签章）：________________</p><p>承制方确认（签章）：________________</p></div>
      <p className="mt-5 text-xs text-gray-500">本单据为编辑器导出稿。是否生效、订单确认及附件以双方正式确认记录为准。</p>
    </section></div></div>
  </div>;
}
