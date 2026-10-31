import { NextRequest, NextResponse } from 'next/server';
import { draftContext, privateHeaders } from '@/lib/commercial-documents/cloud-drafts';
export const runtime='nodejs';export const dynamic='force-dynamic';
const reply=(data:Record<string,unknown>,status=200)=>NextResponse.json(data,{status,headers:privateHeaders});
const uuid=(x:unknown):x is string=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(x);
function validate(snapshot:unknown):{ok:boolean;amount:number;error:string} {
 if(!snapshot||typeof snapshot!=='object'||Array.isArray(snapshot))return {ok:false,amount:0,error:'无效单据'};
 const x=snapshot as Record<string,unknown>;
 if(!x.order||typeof x.order!=='object'||Array.isArray(x.order)||!Array.isArray(x.lines)||!x.lines.length||x.lines.length>100||JSON.stringify(x).length>80000)return {ok:false,amount:0,error:'订单内容不完整'};
 const o=x.order as Record<string,unknown>;
 if(typeof o.supplier!=='string'||!o.supplier.trim()||o.supplier.length>300||typeof o.deliveryDate!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(o.deliveryDate))return {ok:false,amount:0,error:'供应商和交期必填'};
 let total=0;
 for(const item of x.lines) {
  if(!item||typeof item!=='object'||Array.isArray(item))return {ok:false,amount:0,error:'无效明细'};
  const l=item as Record<string,unknown>;
  if(typeof l.name!=='string'||!l.name.trim()||typeof l.quantity!=='string'||typeof l.price!=='string'||!/^\d+(?:\.\d{1,3})?$/.test(l.quantity)||!/^\d+(?:\.\d{1,3})?$/.test(l.price)||Number(l.quantity)<=0)return {ok:false,amount:0,error:'明细数量和单价必须是最多三位小数的有效数值'};
  const milli=Math.round(Number(l.quantity)*1000)*Math.round(Number(l.price)*1000);
  if(!Number.isSafeInteger(milli))return {ok:false,amount:0,error:'金额超出范围'};
  total+=Math.round(milli/1000);
  if(!Number.isSafeInteger(total))return {ok:false,amount:0,error:'金额超出范围'};
 }
 return {ok:true,amount:total,error:''};
}
export async function GET(request:NextRequest){
 const ctx=await draftContext();if(!ctx)return reply({ok:false,message:'未授权'},403);
 const query=ctx.db.from('commercial_supplier_orders').select('id,order_no,latest_version,created_at,owner_profile_id').eq('org_id',ctx.profile.org_id).order('created_at',{ascending:false}).limit(80);
 if(!['admin','manager'].includes(ctx.user.role))query.eq('owner_profile_id',ctx.profile.id);
 const {data,error}=await query;if(error)return reply({ok:false,message:'查询正式布产单失败'},503);
 return reply({ok:true,orders:data||[]});
}
export async function POST(req:NextRequest){
 const ctx=await draftContext();if(!ctx)return reply({ok:false,message:'无权保存'},403);
 let body:Record<string,unknown>;try{body=await req.json();}catch{return reply({ok:false,message:'请求格式错误'},400);}
 const requestId=body.requestId,orderId=body.orderId??null,expected=body.expectedVersion;
 if(!uuid(requestId)||(orderId!==null&&!uuid(orderId))||!Number.isSafeInteger(expected)||Number(expected)<0)return reply({ok:false,message:'版本或请求编号错误'},400);
 const checked=validate(body.snapshot);if(!checked.ok)return reply({ok:false,message:checked.error},422);
 const {data,error}=await ctx.db.rpc('save_supplier_order_version',{p_request_id:requestId,p_order_id:orderId,p_expected_version:expected,p_snapshot:body.snapshot,p_total_thousandths:checked.amount});
 if(error)return reply({ok:false,code:error.message.includes('VERSION_CONFLICT')?'VERSION_CONFLICT':'SAVE_FAILED',message:error.message.includes('VERSION_CONFLICT')?'订单已有更新版本，请重新打开核对':'正式订单归档失败'},error.message.includes('VERSION_CONFLICT')?409:503);
 const row=Array.isArray(data)?data[0]:null;if(!row)return reply({ok:false,message:'归档响应异常'},503);
 return reply({ok:true,orderId:row.order_id,version:row.version,orderNo:row.order_no,savedAt:row.saved_at},201);
}
