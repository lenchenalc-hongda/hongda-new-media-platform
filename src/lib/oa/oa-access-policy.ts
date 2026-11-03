export type OaRestrictedActor = {role:string;active:boolean;authSource:string} | null;
export type OaAccessDecision = {allowed:true;status:200;code:'OK'} | {allowed:false;status:401|403;code:'OA_UNAUTHENTICATED'|'OA_FORBIDDEN'|'OA_TRUSTED_AUTH_REQUIRED'};
export function evaluateOaPrivilegedAccess(authMode:string,actor:OaRestrictedActor):OaAccessDecision {
  if(authMode!=='supabase') return {allowed:false,status:403,code:'OA_TRUSTED_AUTH_REQUIRED'};
  if(!actor) return {allowed:false,status:401,code:'OA_UNAUTHENTICATED'};
  if(!actor.active||actor.authSource!=='supabase'||!['admin','manager'].includes(actor.role))
    return {allowed:false,status:403,code:'OA_FORBIDDEN'};
  return {allowed:true,status:200,code:'OK'};
}
export function isOaSimulationAllowed(vercelEnv:string|undefined,nodeEnv:string|undefined):boolean {
  return vercelEnv==='preview'||(!vercelEnv&&nodeEnv==='development');
}
