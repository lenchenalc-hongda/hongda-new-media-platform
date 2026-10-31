import { NextRequest, NextResponse } from 'next/server';
import { draftContext, privateHeaders } from '@/lib/commercial-documents/cloud-drafts';
export const dynamic='force-dynamic';
const reply=(data:Record<string,unknown>,status=200)=>NextResponse.json(data,{status,headers:privateHeaders});
const table='commercial_supplier_order_drafts';
function parse(value:unknown):Record<string,unknown>|null {
 if(!value||typeof value!=='object'||Array.isArray(value)) return null;
 const x=value as Record<string,unknown>;
 if(!x.order||typeof x.order!=='object'||Array.isArray(x.order)||!Array.isArray(x.lines)||x.lines.length>100) return null;
 if(JSON.stringify(x).length>80000) return null;
 const o=x.order as Record<string,unknown>;
 if(typeof o.supplier!=='string'||o.supplier.length>300) return null;
 if(x.lines.some(l=>!l||typeof l!=='object'||Array.isArray(l)||typeof l.category!=='string'||typeof l.name!=='string'||typeof l.quantity!=='string'||typeof l.price!=='string')) return null;
 return x;
}
export async function GET(){
 const ctx=await draftContext();if(!ctx)return reply({ok:false,message:'请重新登录'},403);
 let q=ctx.db.from(table).select('id,supplier_name,revision,updated_at,created_at').eq('org_id',ctx.profile.org_id).eq('status','active').order('updated_at',{ascending:false}).limit(100);
 if(!['admin','manager'].includes(ctx.user.role))q=q.eq('owner_profile_id',ctx.profile.id);
 const {data,error}=await q;
 return error?reply({ok:false,message:'布产单草稿读取失败'},503):reply({ok:true,drafts:data||[]});
}
export async function POST(req:NextRequest){
 const ctx=await draftContext();if(!ctx)return reply({ok:false,message:'无权保存'},403);
 let body:Record<string,unknown>;try{body=await req.json();}catch{return reply({ok:false,message:'格式无效'},400);}
 const draft=parse(body.draft);if(!draft)return reply({ok:false,message:'布产单草稿格式无效'},422);
 const o=draft.order as Record<string,unknown>;
 const {data,error}=await ctx.db.from(table).insert({org_id:ctx.profile.org_id,owner_profile_id:ctx.profile.id,updated_by_profile_id:ctx.profile.id,draft_json:draft,supplier_name:String(o.supplier||'')}).select('id,revision,updated_at').single();
 if(error||!data)return reply({ok:false,message:'云端保存失败，请保留当前内容'},503);
 return reply({ok:true,id:data.id,revision:data.revision,updatedAt:data.updated_at},201);
}
