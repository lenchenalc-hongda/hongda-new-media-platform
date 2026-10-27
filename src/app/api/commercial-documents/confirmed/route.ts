import { NextRequest, NextResponse } from 'next/server';
import { draftContext, privateHeaders, safeDraft } from '@/lib/commercial-documents/cloud-drafts';
import { documentAmount, validateForPrint } from '@/lib/commercial-documents/template';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const reply=(value:Record<string,unknown>,status=200)=>NextResponse.json(value,{status,headers:privateHeaders});
export async function GET(request:NextRequest) {
 const ctx=await draftContext();
 if(!ctx) return reply({ok:false,message:'未授权'},403);
 const search=(request.nextUrl.searchParams.get('q')||'').trim().slice(0,80).replace(/[%_,().\\]/g,'');
 let query=ctx.db.from('commercial_confirmed_quotes')
  .select('id,document_no,latest_version,owner_profile_id,created_at')
  .eq('org_id',ctx.profile.org_id).order('created_at',{ascending:false}).limit(100);
 if(!['admin','manager'].includes(ctx.user.role)) query=query.eq('owner_profile_id',ctx.profile.id);
 if(search) query=query.ilike('document_no','%'+search+'%');
 const {data,error}=await query;
 if(error) return reply({ok:false,message:'已保存报价查询失败'},503);
 return reply({ok:true,quotes:data||[]});
}
export async function POST(request:NextRequest) {
 const ctx=await draftContext();
 if(!ctx) return reply({ok:false,message:'未授权'},403);
 let data:Record<string,unknown>;
 try { data=await request.json(); } catch {return reply({ok:false,message:'请求格式错误'},400);}
 const draft=safeDraft(data?.draft,ctx.user.name);
 if(!draft) return reply({ok:false,message:'报价数据无效'},422);
 const errors=validateForPrint(draft);
 if(errors.length) return reply({ok:false,message:'正式确认前请修正报价内容',errors},422);
 const amount=documentAmount(draft);
 if(!Number.isSafeInteger(amount.amountMinor)||amount.invalidLines) return reply({ok:false,message:'金额计算错误'},422);
 const id=(value:unknown)=>typeof value==='string' && /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(value)?value:null;
 const requestId=id(data.requestId);
 if(!requestId) return reply({ok:false,message:'缺少有效的幂等请求号'},400);
 const quoteId=data.quoteId===null||data.quoteId===undefined?null:id(data.quoteId);
 const draftId=data.draftId===null||data.draftId===undefined?null:id(data.draftId);
 if(data.quoteId && !quoteId || data.draftId && !draftId) return reply({ok:false,message:'引用的单据不正确'},400);
 const expected=Number(data.expectedVersion??0);
 if(!Number.isSafeInteger(expected)||expected<0) return reply({ok:false,message:'版本号不正确'},400);
 const {data:rows,error}=await ctx.db.rpc('confirm_commercial_quote',{
  p_request_id:requestId,p_quote_id:quoteId,p_expected_version:expected,
  p_draft_id:draftId,p_snapshot:draft,p_amount_thousandths:amount.amountMinor,
 });
 if(error) return reply({ok:false,code:error.message.includes('VERSION_CONFLICT')?'VERSION_CONFLICT':'SAVE_FAILED',message:error.message.includes('VERSION_CONFLICT')?'已确认报价产生新版本，请重新核对，防止覆盖':'确认失败，数据未更新'},error.message.includes('VERSION_CONFLICT')?409:503);
 const row=Array.isArray(rows)?rows[0]:null;
 if(!row) return reply({ok:false,message:'确认返回结果缺失'},503);
 return reply({ok:true,quoteId:row.quote_id,version:row.version,versionId:row.version_id,confirmedAt:row.confirmed_at},201);
}
