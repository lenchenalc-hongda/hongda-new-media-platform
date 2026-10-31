import { NextRequest,NextResponse } from 'next/server';
import { draftContext,privateHeaders } from '@/lib/commercial-documents/cloud-drafts';
export const dynamic='force-dynamic';
const reply=(data:Record<string,unknown>,status=200)=>NextResponse.json(data,{status,headers:privateHeaders});
export async function GET(_req:NextRequest,{params}:{params:{id:string}}){
 const ctx=await draftContext();if(!ctx)return reply({ok:false,message:'未授权'},403);
 if(!/^[a-f0-9]{8}-[a-f0-9-]{27,}$/i.test(params.id))return reply({ok:false,message:'编号无效'},400);
 let q=ctx.db.from('commercial_supplier_orders').select('id,order_no,latest_version,owner_profile_id').eq('id',params.id).eq('org_id',ctx.profile.org_id);
 if(!['admin','manager'].includes(ctx.user.role))q=q.eq('owner_profile_id',ctx.profile.id);
 const {data:order,error}=await q.maybeSingle();
 if(error)return reply({ok:false,message:'查询失败'},503);
 if(!order)return reply({ok:false,message:'未找到单据'},404);
 const {data:versions,error:err}=await ctx.db.from('commercial_supplier_order_versions').select('version,snapshot,saved_at').eq('org_id',ctx.profile.org_id).eq('order_id',order.id).order('version',{ascending:false}).limit(100);
 if(err)return reply({ok:false,message:'历史版本读取失败'},503);
 return reply({ok:true,order,versions:versions||[],readOnly:order.owner_profile_id!==ctx.profile.id});
}
