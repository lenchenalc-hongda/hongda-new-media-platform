import { NextRequest } from 'next/server';
import { getAllPublishJobs, getPublishLogs } from '@/lib/oa/publish-queue';
import { guardOaPrivilegedRequest, oaJson, oaWechatWriteLocked } from '@/lib/oa/oa-api-safety';

export const dynamic = 'force-dynamic';

// The client cannot supply an approval status, risk score or content that authorizes publishing.
// This route is deliberately read-only until server-side review + HUMAN_GATE are implemented.
export async function POST(req:NextRequest) {
  const denied=await guardOaPrivilegedRequest(req);
  if(denied) return denied;
  if(req.headers.get('content-type')?.split(';')[0].trim()!=='application/json')
    return oaJson({ok:false,code:'OA_JSON_REQUIRED'},415);
  let body:Record<string,unknown>;
  try {
    const raw=await req.text();
    if(raw.length>4096) return oaJson({ok:false,code:'OA_REQUEST_TOO_LARGE'},413);
    const parsed:unknown=JSON.parse(raw);
    if(!parsed||typeof parsed!=='object'||Array.isArray(parsed)) return oaJson({ok:false,code:'OA_INVALID_REQUEST'},400);
    body=parsed as Record<string,unknown>;
  } catch {return oaJson({ok:false,code:'OA_INVALID_JSON'},400);}
  switch(body.action) {
    case 'publish':
    case 'save_draft':
    case 'retry':
      return oaWechatWriteLocked();
    case 'list_jobs': {
      const jobs=getAllPublishJobs().map(({payload:_payload,...job})=>({...job,simulation:true,durable:false}));
      return oaJson({jobs,total:jobs.length,simulation:true,durable:false});
    }
    case 'logs': {
      const logs=getPublishLogs(50).map(({result,...entry})=>({
        ...entry,result:{success:result.success,mock:result.mock===true,externalStatus:result.externalStatus},
      }));
      return oaJson({logs,total:logs.length,simulation:true,durable:false});
    }
    case 'status':
      return oaJson({job:null,simulation:true,durable:false,code:'OA_NO_DURABLE_PUBLISH_STATUS'});
    default:
      return oaJson({ok:false,code:'OA_UNKNOWN_ACTION'},400);
  }
}
