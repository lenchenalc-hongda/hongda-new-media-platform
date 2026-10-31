import { NextRequest, NextResponse } from 'next/server';
import { draftContext, privateHeaders } from '@/lib/commercial-documents/cloud-drafts';
export const dynamic='force-dynamic';
const table='commercial_supplier_order_drafts';
const reply=(data:Record<string,unknown>,status=200)=>NextResponse.json(data,{status,headers:privateHeaders});
const uuid=(s:string)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
export async function GET(_req:NextRequest,{params}:{params:{id:string}}){
 const ctx=await draftContext();if(!ctx)return reply({ok:false,message:'无权访问'},403);
 if(!uuid(params.id))return reply({ok:false,message:'ID错误'},400);
 let q=ctx.db.from(table).select('id,draft_json,revision,updated_at,owner_profile_id').eq('org_id',ctx.profile.org_id).eq('id',params.id).eq('status','active');
 if(!['admin','manager'].includes(ctx.user.role))q=q.eq('owner_profile_id',ctx.profile.id);
 const {data,error}=await q.maybeSingle();return error?reply({ok:false,message:'读取失败'},503):!data?reply({ok:false,message:'草稿不存在或无权限'},404):reply({ok:true,draft:data.draft_json,id:data.id,revision:data.revision,updatedAt:data.updated_at,readOnly:data.owner_profile_id!==ctx.profile.id});
}
export async function PATCH(req:NextRequest,{params}:{params:{id:string}}){
 const ctx=await draftContext();if(!ctx)return reply({ok:false,message:'无权访问'},403);
 if(!uuid(params.id))return reply({ok:false,message:'ID错误'},400);
 let body:Record<string,unknown>;try{body=await req.json();}catch{return reply({ok:false,message:'格式无效'},400);}
 const rev=body.expectedRevision;if(!Number.isSafeInteger(rev)||Number(rev)<1)return reply({ok:false,message:'版本无效'},422);
 const draft=body.draft;
 if(!draft||typeof draft!=='object'||Array.isArray(draft))return reply({ok:false,message:'草稿格式无效'},422);
 const d=draft as Record<string,unknown>,o=d.order;
 if(!o||typeof o!=='object'||Array.isArray(o)||!Array.isArray(d.lines)||d.lines.length>100||typeof (o as Record<string,unknown>).supplier!=='string'||JSON.stringify(d).length>80000) return reply({ok:false,message:'草稿格式无效'},422);
 const {data,error}=await ctx.db.from(table).update({draft_json:d,supplier_name:String((o as Record<string,unknown>).supplier).slice(0,300),revision:Number(rev)+1,updated_by_profile_id:ctx.profile.id,updated_at:new Date().toISOString()})
  .eq('id',params.id).eq('org_id',ctx.profile.org_id).eq('owner_profile_id',ctx.profile.id).eq('revision',rev).eq('status','active').select('revision,updated_at').maybeSingle();
 if(error)return reply({ok:false,message:'保存失败，请保留当前内容'},503);
 if(!data)return reply({ok:false,code:'VERSION_CONFLICT',message:'草稿已经被其他页面更新，请重新打开后核对'},409);
 return reply({ok:true,id:params.id,revision:data.revision,updatedAt:data.updated_at});
}
