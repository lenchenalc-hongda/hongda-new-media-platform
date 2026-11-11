// @ts-nocheck
// WOS P8 nonproduction Edge verifier candidate. NOT deployed from PR.
// Requires exact disposable branch ref + explicit TEST_ENABLED env, verify_jwt=true.
// No Production fallback and no destructive Storage operation.
import { createClient } from 'npm:@supabase/supabase-js@2.58.0';
import { pngValid } from './png-validator.ts';

const maxBytes = 20 * 1024 * 1024;
const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/;
const digest = /^[a-f0-9]{64}$/;
const headers = { 'content-type':'application/json', 'cache-control':'no-store, private' };
const reply = (status, code, data={}) => new Response(
  JSON.stringify({ok:status===200,code,...data}),{status,headers}
);
const getKey = (name, fallback) => {
  try {
    const keys = JSON.parse(Deno.env.get(name) || '{}');
    if (typeof keys.default === 'string' && keys.default.length) return keys.default;
  } catch {}
  return Deno.env.get(fallback) || '';
};
function settings() {
  const url = Deno.env.get('SUPABASE_URL') || '';
  const ref = Deno.env.get('WOS_P8_EXACT_BRANCH_REF') || '';
  if (!/^[a-z0-9]{20}$/.test(ref) || ref === 'amqpvxrurenevniilhtl'
      || url !== 'https://' + ref + '.supabase.co'
      || Deno.env.get('WOS_P8_EDGE_TEST_ENABLED') !== 'true') return null;
  const publishable = getKey('SUPABASE_PUBLISHABLE_KEYS','SUPABASE_ANON_KEY');
  const secret = getKey('SUPABASE_SECRET_KEYS','SUPABASE_SERVICE_ROLE_KEY');
  return publishable && secret ? {url,publishable,secret} : null;
}
Deno.serve(async (req) => {
  if (req.method !== 'POST') return reply(405,'METHOD_NOT_ALLOWED');
  const config = settings();
  if (!config) return reply(503,'P8_ISOLATED_BRANCH_NOT_ARMED');
  const authorization = req.headers.get('authorization') || '';
  if (!/^Bearer [^\s]+$/.test(authorization)) return reply(401,'UNAUTHENTICATED');
  if (!req.headers.get('content-type')?.startsWith('application/json'))
    return reply(400,'INVALID_CONTENT_TYPE');
  let body;
  try {
    const raw = await req.text();
    if (raw.length > 4096) return reply(413,'REQUEST_TOO_LARGE');
    body = JSON.parse(raw);
    if (!body || Array.isArray(body) || typeof body !== 'object'
      || Object.keys(body).sort().join(',') !== 'imageId,orderId,sha256,storagePath'
      || !uuid.test(body.imageId) || !uuid.test(body.orderId)
      || !digest.test(body.sha256) || typeof body.storagePath !== 'string'
      || body.storagePath.length > 600) return reply(400,'INVALID_PROOF_INPUT');
  } catch { return reply(400,'INVALID_JSON'); }
  try {
    const token = authorization.slice(7);
    const userDb = createClient(config.url,config.publishable,{
      global:{headers:{Authorization:authorization}},
      auth:{autoRefreshToken:false,persistSession:false}
    });
    const {data:{user},error:authError} = await userDb.auth.getUser(token);
    if (authError || !user?.id) return reply(401,'UNAUTHENTICATED');
    const {data:profile,error:profileError} = await userDb.from('profiles')
      .select('id,user_id,org_id,role,is_active')
      .eq('user_id',user.id).eq('is_active',true).maybeSingle();
    if (profileError || !profile || !['admin','manager','sales'].includes(profile.role))
      return reply(403,'FORBIDDEN');
    const {data:order,error:orderError} = await userDb.from('wos_production_orders')
      .select('id,organization_id,workflow_status,version_label,created_by_profile_id,sales_owner_profile_id')
      .eq('id',body.orderId).eq('organization_id',profile.org_id).maybeSingle();
    if (orderError || !order || order.workflow_status !== 'DRAFT'
      || !/^V[1-9][0-9]{0,20}$/.test(order.version_label)
      || (profile.role === 'sales' && profile.id !== order.created_by_profile_id
        && profile.id !== order.sales_owner_profile_id))
      return reply(403,'ORDER_NOT_AUTHORIZED');
    const prefix = 'organizations/' + profile.org_id
      + '/wos/production-order/' + order.id + '/images/product/versions/'
      + order.version_label + '/' + body.imageId + '/';
    if (!body.storagePath.startsWith(prefix)) return reply(400,'INVALID_IMAGE_PATH');
    const filename = body.storagePath.slice(prefix.length);
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,199}\.png$/.test(filename)
      || filename.includes('..')) return reply(400,'INVALID_IMAGE_FILENAME');

    const admin = createClient(config.url,config.secret,{
      auth:{autoRefreshToken:false,persistSession:false}
    });
    const snapshot = async () => {
      const {data,error} = await admin.rpc('wos_p7_service_storage_snapshot',
        {p_path:body.storagePath});
      if (error || !data?.id) return null;
      return data;
    };
    const first = await snapshot();
    if (!first || first.ownerId !== user.id || !uuid.test(first.id)
      || first.mimeType !== 'image/png' || !first.updatedAt
      || !Number.isSafeInteger(Number(first.byteSize))
      || Number(first.byteSize)<60 || Number(first.byteSize)>maxBytes)
      return reply(409,'PRIVATE_OBJECT_NOT_VERIFIED');
    // Use caller token, not service credential, to prove real Storage RLS applies.
    const {data:file,error:downloadError} = await userDb.storage
      .from('wos-private').download(body.storagePath);
    if (downloadError || !file || file.size !== Number(first.byteSize))
      return reply(409,'PRIVATE_FILE_NOT_READABLE');
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!await pngValid(bytes,body.sha256))
      return reply(422,'BINARY_SHA_OR_PNG_INTEGRITY_FAILED');
    const second = await snapshot();
    if (!second || second.id !== first.id
      || second.version !== first.version || second.updatedAt !== first.updatedAt
      || second.ownerId !== first.ownerId)
      return reply(409,'STORAGE_OBJECT_CHANGED_DURING_PROOF');
    const {data:result,error:proofError} = await admin.rpc('wos_p7_record_trusted_image_proof',{
      p_image_id:body.imageId,
      p_order_id:body.orderId,
      p_actor_user_id:user.id,
      p_storage_path:body.storagePath,
      p_storage_object_id:first.id,
      p_storage_object_version:first.version,
      p_storage_object_updated_at:first.updatedAt,
      p_sha256:body.sha256
    });
    if (proofError || !['VERIFIED','REPLAYED'].includes(result?.status))
      return reply(503,'TRUSTED_PROOF_PERSISTENCE_UNAVAILABLE');
    return reply(200,'P8_PRIVATE_BINARY_VERIFIED',{sha256:body.sha256});
  } catch { return reply(503,'P8_VERIFIER_FAILED_CLOSED'); }
});
