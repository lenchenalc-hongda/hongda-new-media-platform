import { NextRequest,NextResponse } from 'next/server';
import { draftContext,privateHeaders } from '@/lib/commercial-documents/cloud-drafts';
export const dynamic='force-dynamic';
const uuid=/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
export async function GET(request:NextRequest,{params}:{params:{id:string}}) {
 if(!uuid.test(params.id)) return NextResponse.json({ok:false},{status:400,headers:privateHeaders});
 const ctx=await draftContext();
 if(!ctx) return NextResponse.json({ok:false},{status:403,headers:privateHeaders});
 let q=ctx.db.from('commercial_confirmed_quotes')
 .select('id,owner_profile_id,document_no,latest_version,created_at')
 .eq('id',params.id).eq('org_id',ctx.profile.org_id);
 if(!['admin','manager'].includes(ctx.user.role)) q=q.eq('owner_profile_id',ctx.profile.id);
 const {data:quote,error}=await q.maybeSingle();
 if(error||!quote) return NextResponse.json({ok:false,message:'找不到报价或无权限'},{status:404,headers:privateHeaders});
 const {data:versions,error:e}=await ctx.db.from('commercial_confirmed_quote_versions')
  .select('id,version,amount_thousandths,currency,buyer_name,project_name,confirmed_at')
  .eq('quote_id',quote.id).eq('org_id',ctx.profile.org_id).order('version',{ascending:false});
 if(e) return NextResponse.json({ok:false,message:'读取历史版本失败'},{status:503,headers:privateHeaders});
 const v=Number(request.nextUrl.searchParams.get('version')||quote.latest_version);
 if(!Number.isSafeInteger(v)||v<1) return NextResponse.json({ok:false},{status:400,headers:privateHeaders});
 const {data:row,error:detailError}=await ctx.db.from('commercial_confirmed_quote_versions')
 .select('version,snapshot,confirmed_at,amount_thousandths')
 .eq('quote_id',quote.id).eq('org_id',ctx.profile.org_id).eq('version',v).maybeSingle();
 if(detailError||!row) return NextResponse.json({ok:false,message:'找不到历史版本'},{status:404,headers:privateHeaders});
 return NextResponse.json({ok:true,quote,versions:versions||[],selected:row,canEdit:quote.owner_profile_id===ctx.profile.id},{headers:privateHeaders});
}
