import { isSameOriginWosMutation } from './api-contract';
import {
  canWosV1Read,
  encodeWosV1Cursor,
  isWosV1RpcResult,
  parseWosV1Cursor,
  parseWosV1AppRequest,
  parseWosV1ReadQuery,
  wosV1OperationRoleAllowed,
  wosV1RpcInvocation,
  type WosV1AppRuntimeState,
  type WosV1ReadQuery,
} from './production-app-contract';

const responseHeaders = {
  'Cache-Control': 'no-store, private',
  'Content-Type': 'application/json; charset=utf-8',
} as const;
const MAX_POST_BYTES = 16384;
const BODY_READ_TIMEOUT_MS = 10000;
const LIST_PAGE_SIZE = 50;
const ACTIVE_ORDER_STATUSES = [
  'SUBMITTED',
  'WORKSHOP_REVIEW',
  'NEEDS_INFORMATION',
  'WAITING_MATERIAL',
  'READINESS_CHECK',
  'READY_TO_START',
] as const;

interface QueryResult {
  readonly data: unknown;
  readonly error: unknown;
}

interface WosV1QueryBuilder extends PromiseLike<QueryResult> {
  select(columns: string): WosV1QueryBuilder;
  eq(column: string, value: unknown): WosV1QueryBuilder;
  in(column: string, values: readonly unknown[]): WosV1QueryBuilder;
  or(expression: string): WosV1QueryBuilder;
  order(column: string, options?: {
    readonly ascending?: boolean;
    readonly nullsFirst?: boolean;
  }): WosV1QueryBuilder;
  limit(count: number): WosV1QueryBuilder;
  range(from: number, to: number): WosV1QueryBuilder;
  maybeSingle(): PromiseLike<QueryResult>;
}

export interface WosV1DataClient {
  from(table: string): WosV1QueryBuilder;
  rpc(name: string, args?: Record<string, unknown>): PromiseLike<QueryResult>;
}

export interface WosV1VerifiedIdentity {
  readonly id: string;
}

export interface WosV1HandlerDependencies {
  readonly runtime: WosV1AppRuntimeState;
  readonly client: WosV1DataClient | null;
  readonly resolveIdentity: (
    client: WosV1DataClient,
  ) => Promise<WosV1VerifiedIdentity | null>;
}

interface WosV1Actor {
  readonly profileId: string;
  readonly userId: string;
  readonly organizationId: string;
  readonly role: string;
}

interface OrderRow {
  readonly id: string;
  readonly organization_id: string;
  readonly created_by_profile_id: string;
  readonly sales_owner_profile_id: string;
  readonly project_owner_profile_id: string;
  readonly order_number: string;
  readonly customer_name_snapshot: string;
  readonly project_name_snapshot: string | null;
  readonly product_name: string;
  readonly product_material: string;
  readonly requested_quantity: number;
  readonly current_batch_quantity: number;
  readonly priority: string;
  readonly is_urgent: boolean;
  readonly version: number;
  readonly version_label: string;
  readonly workflow_status: string;
  readonly submitted_at: string | null;
  readonly updated_at: string;
}

function json(status: number, code: string, data: unknown = null): Response {
  return new Response(JSON.stringify({ ok: status === 200, code, data }), {
    status,
    headers: responseHeaders,
  });
}

async function readWithDeadline(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  remainingMs: number,
): Promise<ReadableStreamReadResult<Uint8Array>> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      reader.read(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('BODY_READ_TIMEOUT')), remainingMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function readBoundedRequestBody(
  request: Request,
  maxBytes: number,
): Promise<string | null> {
  if (!request.body) return '';
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  const deadline = Date.now() + BODY_READ_TIMEOUT_MS;
  let bytesRead = 0;
  let text = '';
  try {
    while (true) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        await reader.cancel();
        return null;
      }
      const read = await readWithDeadline(reader, remaining);
      if (read.done) {
        text += decoder.decode();
        return text;
      }
      bytesRead += read.value.byteLength;
      if (bytesRead > maxBytes) {
        await reader.cancel();
        return null;
      }
      text += decoder.decode(read.value, { stream: true });
    }
  } catch {
    await reader.cancel().catch(() => undefined);
    return null;
  }
}

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function orderRow(value: unknown): OrderRow | null {
  const row = object(value);
  if (!row
    || typeof row.id !== 'string'
    || typeof row.organization_id !== 'string'
    || typeof row.created_by_profile_id !== 'string'
    || typeof row.sales_owner_profile_id !== 'string'
    || typeof row.project_owner_profile_id !== 'string'
    || typeof row.order_number !== 'string'
    || typeof row.customer_name_snapshot !== 'string'
    || typeof row.product_name !== 'string'
    || typeof row.product_material !== 'string'
    || !Number.isSafeInteger(row.requested_quantity)
    || !Number.isSafeInteger(row.current_batch_quantity)
    || typeof row.priority !== 'string'
    || typeof row.is_urgent !== 'boolean'
    || !Number.isSafeInteger(row.version)
    || typeof row.version_label !== 'string'
    || typeof row.workflow_status !== 'string'
    || typeof row.updated_at !== 'string') return null;
  return row as unknown as OrderRow;
}

function salesOwnsOrder(actor: WosV1Actor, order: OrderRow): boolean {
  return actor.role !== 'sales'
    || actor.profileId === order.created_by_profile_id
    || actor.profileId === order.sales_owner_profile_id;
}

function profileFrom(
  identity: WosV1VerifiedIdentity,
  value: unknown,
): WosV1Actor | null {
  const profile = object(value);
  if (!profile
    || profile.user_id !== identity.id
    || profile.is_active !== true
    || typeof profile.id !== 'string'
    || typeof profile.org_id !== 'string'
    || typeof profile.role !== 'string'
    || !canWosV1Read(profile.role)) return null;
  return {
    profileId: profile.id,
    userId: identity.id,
    organizationId: profile.org_id,
    role: profile.role,
  };
}

async function authenticatedActor(
  deps: WosV1HandlerDependencies,
): Promise<
  | { readonly ok: true; readonly client: WosV1DataClient; readonly actor: WosV1Actor }
  | { readonly ok: false; readonly response: Response }
> {
  if (!deps.runtime.readsEnabled) {
    return { ok: false, response: json(503, 'WOS_V1_APP_DISABLED') };
  }
  if (!deps.client) {
    return { ok: false, response: json(503, 'WOS_V1_DATABASE_UNAVAILABLE') };
  }
  let identity: WosV1VerifiedIdentity | null;
  try {
    identity = await deps.resolveIdentity(deps.client);
  } catch {
    return { ok: false, response: json(503, 'WOS_V1_AUTH_UNAVAILABLE') };
  }
  if (!identity) {
    return { ok: false, response: json(401, 'UNAUTHENTICATED') };
  }
  const profile = await deps.client.from('profiles')
    .select('id,user_id,org_id,role,is_active')
    .eq('user_id', identity.id)
    .eq('is_active', true)
    .maybeSingle();
  const actor = profile.error ? null : profileFrom(identity, profile.data);
  if (!actor) {
    return { ok: false, response: json(403, 'FORBIDDEN') };
  }
  return { ok: true, client: deps.client, actor };
}

async function queryRows(
  client: WosV1DataClient,
  table: string,
  columns: string,
  configure: (query: WosV1QueryBuilder) => WosV1QueryBuilder,
): Promise<{ readonly rows: readonly unknown[] } | null> {
  const result = await configure(client.from(table).select(columns)).limit(101);
  if (result.error || !Array.isArray(result.data) || result.data.length > 100) {
    return null;
  }
  return { rows: result.data };
}

function orderScope(query: WosV1ReadQuery): readonly string[] {
  if (query.view === 'returned') return ['NEEDS_INFORMATION'];
  if (query.view === 'office') return ['DRAFT', ...ACTIVE_ORDER_STATUSES];
  return ACTIVE_ORDER_STATUSES;
}

async function readOrderDetail(
  client: WosV1DataClient,
  actor: WosV1Actor,
  order: OrderRow,
  runtime: WosV1AppRuntimeState,
): Promise<Response> {
  const [blockers, images, resources, baselines, history, confirmations] =
    await Promise.all([
      queryRows(client, 'wos_blockers',
        'id,organization_id,entity_type,entity_id,blocker_code,blocker_category,description,status,opened_at,resolved_at,resolution_note',
        query => query.eq('organization_id', actor.organizationId)
          .eq('entity_type', 'PRODUCTION_ORDER')
          .eq('entity_id', order.id)
          .order('opened_at', { ascending: false })),
      queryRows(client, 'wos_reference_images',
        'id,organization_id,entity_type,entity_id,category,file_name,mime_type,version_label,image_status,superseded_at,uploaded_at',
        query => query.eq('organization_id', actor.organizationId)
          .eq('entity_type', 'PRODUCTION_ORDER')
          .eq('entity_id', order.id)
          .order('uploaded_at', { ascending: false })),
      queryRows(client, 'wos_resource_readiness',
        'organization_id,entity_type,entity_id,resource_type,status,version_label,quantity_expected,quantity_arrived,expected_at,arrived_at,confirmed_at,note',
        query => query.eq('organization_id', actor.organizationId)
          .eq('entity_type', 'PRODUCTION_ORDER')
          .eq('entity_id', order.id)),
      queryRows(client, 'wos_visual_baselines',
        'id,organization_id,entity_type,entity_id,version_label,status,confirmed_by_office_profile_id,confirmed_by_workshop_profile_id,office_confirmed_at,workshop_confirmed_at,created_at,superseded_at,office_proof_set_digest,office_post_order_version,workshop_proof_set_digest,workshop_post_order_version',
        query => query.eq('organization_id', actor.organizationId)
          .eq('entity_type', 'PRODUCTION_ORDER')
          .eq('entity_id', order.id)),
      queryRows(client, 'wos_status_history',
        'organization_id,entity_type,entity_id,previous_status,next_status,actor_profile_id,actor_role,reason_code,note,created_at,metadata',
        query => query.eq('organization_id', actor.organizationId)
          .eq('entity_type', 'PRODUCTION_ORDER')
          .eq('entity_id', order.id)
          .order('created_at', { ascending: true })),
      queryRows(client, 'wos_confirmations',
        'organization_id,entity_type,entity_id,confirmation_type,decision,role_snapshot,note,confirmed_at',
        query => query.eq('organization_id', actor.organizationId)
          .eq('entity_type', 'PRODUCTION_ORDER')
          .eq('entity_id', order.id)),
    ]);
  if (!blockers || !images || !resources || !baselines || !history || !confirmations) {
    return json(503, 'WOS_V1_DETAIL_READ_UNAVAILABLE');
  }
  const allRows = [
    ...blockers.rows,
    ...images.rows,
    ...resources.rows,
    ...baselines.rows,
    ...history.rows,
    ...confirmations.rows,
  ];
  if (allRows.some(value => {
    const row = object(value);
    return !row || row.organization_id !== actor.organizationId
      || row.entity_type !== 'PRODUCTION_ORDER' || row.entity_id !== order.id;
  })) {
    return json(409, 'WOS_V1_DETAIL_SCOPE_MISMATCH');
  }
  const currentVersion = await client.from('wos_production_orders')
    .select('id,organization_id,version,version_label,workflow_status')
    .eq('id', order.id)
    .eq('organization_id', actor.organizationId)
    .maybeSingle();
  const current = object(currentVersion.data);
  if (currentVersion.error
    || current?.version !== order.version
    || current.version_label !== order.version_label
    || current.workflow_status !== order.workflow_status) {
    return json(409, 'WOS_V1_DETAIL_VERSION_CHANGED');
  }
  const returnReasons = blockers.rows
    .map(object)
    .filter((row): row is Record<string, unknown> =>
      row?.blocker_code === 'P2_DOCUMENTS_INCOMPLETE'
      && row.blocker_category === 'DOCUMENT'
      && row.status === 'OPEN')
    .map(row => ({
      reason: row.description,
      code: row.blocker_code,
      openedAt: row.opened_at,
      operatorProfileId: null,
    }));
  return json(200, 'OK', {
    mode: 'WOS_V1_PRODUCTION_READ',
    source: 'SUPABASE_RLS',
    detail: {
      order,
      blockers: blockers.rows,
      returnReasons,
      images: images.rows,
      resources: resources.rows,
      baselines: baselines.rows,
      history: history.rows,
      confirmations: confirmations.rows,
      currentPrivateProofState: 'UNVERIFIED',
      reviewReady: false,
      canStart: false,
    },
    capabilities: {
      officeWriteEnabled: runtime.writesEnabled
        && ['admin', 'manager', 'sales'].includes(actor.role),
      operatorWriteEnabled: runtime.writesEnabled
        && ['admin', 'manager', 'operator'].includes(actor.role),
      m2Adapter: runtime.m2Adapter ?? null,
      m2WriteEnabled: runtime.m2WritesEnabled === true,
      canStart: false,
    },
  });
}

async function handleGet(
  request: Request,
  deps: WosV1HandlerDependencies,
): Promise<Response> {
  const auth = await authenticatedActor(deps);
  if (!auth.ok) return auth.response;
  const query = parseWosV1ReadQuery(request.url);
  if (!query) return json(400, 'INVALID_READ_QUERY');
  if (query.view === 'office' || query.view === 'returned') {
    if (!['admin', 'manager', 'sales'].includes(auth.actor.role)) {
      return json(403, 'FORBIDDEN');
    }
  } else if (!['admin', 'manager', 'operator'].includes(auth.actor.role)) {
    return json(403, 'FORBIDDEN');
  }

  const columns = 'id,organization_id,created_by_profile_id,sales_owner_profile_id,project_owner_profile_id,order_number,customer_name_snapshot,project_name_snapshot,product_name,product_material,requested_quantity,current_batch_quantity,planned_ship_date,split_delivery,priority,is_urgent,surface_treatment,pattern_scope,seam_tolerance,position_reference,customer_acceptance_standard,packaging_method,carton_quantity,label_marking_rule,version,version_label,workflow_status,submitted_at,updated_at';
  let orderQuery = auth.client.from('wos_production_orders')
    .select(columns)
    .eq('organization_id', auth.actor.organizationId)
    .in('workflow_status', orderScope(query));
  if (auth.actor.role === 'sales') {
    orderQuery = orderQuery.or(
      'created_by_profile_id.eq.' + auth.actor.profileId
      + ',sales_owner_profile_id.eq.' + auth.actor.profileId,
    );
  }
  const exactLookup = Boolean(query.orderId || query.orderNumber);
  if (query.orderId) orderQuery = orderQuery.eq('id', query.orderId);
  if (query.orderNumber) orderQuery = orderQuery.eq('order_number', query.orderNumber);
  if (exactLookup) {
    orderQuery = orderQuery.limit(2);
  } else {
    orderQuery = orderQuery
      .order('updated_at', { ascending: false })
      .order('id', { ascending: false });
    const cursor = query.cursor ? parseWosV1Cursor(query.cursor) : null;
    if (query.cursor && !cursor) return json(400, 'INVALID_READ_QUERY');
    if (cursor) {
      orderQuery = orderQuery.or(
        'updated_at.lt.' + cursor.updatedAt
        + ',and(updated_at.eq.' + cursor.updatedAt + ',id.lt.' + cursor.id + ')',
      );
    }
    orderQuery = orderQuery.range(0, LIST_PAGE_SIZE);
  }
  const result = await orderQuery;
  if (result.error || !Array.isArray(result.data)
    || result.data.length > (exactLookup ? 1 : LIST_PAGE_SIZE + 1)) {
    return json(503, 'WOS_V1_ORDER_READ_UNAVAILABLE');
  }
  const hasMore = !exactLookup && result.data.length > LIST_PAGE_SIZE;
  const rows = result.data.slice(0, LIST_PAGE_SIZE).map(orderRow);
  if (rows.some(row => !row)) return json(409, 'WOS_V1_ORDER_ROW_INVALID');
  const orders = (rows as OrderRow[]).filter(row =>
    row.organization_id === auth.actor.organizationId
    && salesOwnsOrder(auth.actor, row));
  if (query.orderId) {
    if (orders.length !== 1) return json(403, 'FORBIDDEN');
    return readOrderDetail(auth.client, auth.actor, orders[0], deps.runtime);
  }
  return json(200, 'OK', {
    mode: 'WOS_V1_PRODUCTION_LIST',
    source: 'SUPABASE_RLS',
    view: query.view,
    items: orders,
    count: orders.length,
    nextCursor: hasMore && orders.length > 0
      ? encodeWosV1Cursor({
          updatedAt: orders[orders.length - 1].updated_at,
          id: orders[orders.length - 1].id,
        })
      : null,
    capabilities: {
      writeEnabled: deps.runtime.writesEnabled,
      m2Adapter: deps.runtime.m2Adapter ?? null,
      m2WriteEnabled: deps.runtime.m2WritesEnabled === true,
      canStart: false,
    },
  });
}

function rpcErrorResponse(error: unknown): Response {
  const value = object(error);
  const code = typeof value?.code === 'string' ? value.code : '';
  const message = typeof value?.message === 'string' ? value.message : '';
  if (code === '42501' && [
    'CPC_LINK_REQUIRED',
    'CUSTOMER_ORGANIZATION_MISMATCH',
    'PROJECT_CUSTOMER_MISMATCH',
    'INVALID_PROJECT_OWNER',
  ].includes(message)) {
    return json(403, 'CPC_LINK_DENIED');
  }
  if (code === '42501') return json(403, 'FORBIDDEN');
  if (code === 'PT409' || code === '23505') {
    return json(409, 'VERSION_OR_IDEMPOTENCY_CONFLICT');
  }
  if (code === '22023') return json(400, 'INVALID_INPUT');
  if (code === 'PGRST202' || code === '42883') {
    return json(503, 'WOS_V1_RPC_NOT_INSTALLED');
  }
  return json(503, 'WOS_V1_TRANSACTION_UNAVAILABLE');
}

async function handlePost(
  request: Request,
  deps: WosV1HandlerDependencies,
): Promise<Response> {
  if (!deps.runtime.writesEnabled) {
    return json(503, 'WOS_V1_WRITES_DISABLED');
  }
  if (!isSameOriginWosMutation(
    request.url,
    request.headers.get('origin'),
    request.headers.get('referer'),
    request.headers.get('host'),
    request.headers.get('x-forwarded-proto'),
  ) || request.headers.get('x-wos-v1-action') !== '1'
    || !request.headers.get('content-type')?.startsWith('application/json')) {
    return json(403, 'ORIGIN_OR_HEADER_DENIED');
  }
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (!Number.isFinite(declared) || declared < 0 || declared > MAX_POST_BYTES) {
    return json(400, 'INVALID_INPUT');
  }
  let body: unknown;
  try {
    const text = await readBoundedRequestBody(request, MAX_POST_BYTES);
    if (text === null) return json(400, 'INVALID_INPUT');
    body = JSON.parse(text);
  } catch {
    return json(400, 'INVALID_INPUT');
  }
  const parsed = parseWosV1AppRequest(body);
  if (!parsed) return json(400, 'INVALID_INPUT');

  const auth = await authenticatedActor(deps);
  if (!auth.ok) return auth.response;
  if (!wosV1OperationRoleAllowed(parsed, auth.actor.role)) {
    return json(403, 'FORBIDDEN');
  }
  const invocation = wosV1RpcInvocation(parsed);
  if (parsed.operation === 'CREATE_ORDER') {
    invocation.args.p_payload = {
      ...parsed.payload,
      salesOwnerProfileId: auth.actor.profileId,
      projectOwnerProfileId: auth.actor.profileId,
    };
  }
  const result = await auth.client.rpc(invocation.rpc, invocation.args);
  if (result.error) return rpcErrorResponse(result.error);
  if (!isWosV1RpcResult(parsed, result.data)) {
    return json(503, 'WOS_V1_UNVERIFIED_TRANSACTION_RESULT');
  }
  return json(200, parsed.operation + '_VERIFIED', {
    operation: parsed.operation,
    result: result.data,
    canStart: false,
  });
}

export async function handleWosV1Request(
  request: Request,
  deps: WosV1HandlerDependencies,
): Promise<Response> {
  if (request.method === 'GET') return handleGet(request, deps);
  if (request.method === 'POST') return handlePost(request, deps);
  return json(405, 'METHOD_NOT_ALLOWED');
}
