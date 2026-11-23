import assert from 'node:assert/strict';
import { createServer, type IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  handleWosV1Request,
  type WosV1DataClient,
  type WosV1HandlerDependencies,
} from '../../src/lib/workshop-orders/production-app-handler';
import { canonicalWosV1ImagePath }
  from '../../src/lib/workshop-orders/production-app-contract';

type Row = Record<string, unknown>;
interface RpcResult { data: unknown; error: unknown }

const organizationId = '11111111-1111-4111-8111-111111111111';
const foreignOrganizationId = '22222222-2222-4222-8222-222222222222';
const officeUserId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const operatorUserId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const viewerUserId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const officeProfileId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const operatorProfileId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const viewerProfileId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const orderId = '12345678-1234-4234-8234-123456789012';
const receiptId = '22345678-1234-4234-8234-123456789012';
const inboxId = '32345678-1234-4234-8234-123456789012';
const blockerId = '42345678-1234-4234-8234-123456789012';

class QueryBuilder {
  private readonly filters: Array<(row: Row) => boolean> = [];
  private readonly orderBy: Array<{ column: string; ascending: boolean }> = [];
  private max = 1000;
  private offset = 0;
  constructor(
    private readonly rows: () => readonly Row[],
  ) {}
  select(): this { return this; }
  eq(column: string, value: unknown): this {
    this.filters.push(row => row[column] === value);
    return this;
  }
  in(column: string, values: readonly unknown[]): this {
    this.filters.push(row => values.includes(row[column]));
    return this;
  }
  or(expression: string): this {
    const match = expression.match(
      /^updated_at\.lt\.([^,]+),and\(updated_at\.eq\.([^,]+),id\.lt\.([^)]+)\)$/,
    );
    if (!match) {
      const ownership = expression.match(
        /^created_by_profile_id\.eq\.([^,]+),sales_owner_profile_id\.eq\.([^,]+)$/,
      );
      if (!ownership) throw new Error('FAKE_QUERY_OR_NOT_SUPPORTED');
      this.filters.push(row =>
        row.created_by_profile_id === ownership[1]
        || row.sales_owner_profile_id === ownership[2]);
      return this;
    }
    this.filters.push(row => {
      const rowTime = Date.parse(String(row.updated_at));
      const older = Date.parse(match[1]);
      const equal = Date.parse(match[2]);
      return rowTime < older
        || (rowTime === equal && String(row.id) < match[3]);
    });
    return this;
  }
  order(column: string, options?: { ascending?: boolean }): this {
    this.orderBy.push({ column, ascending: options?.ascending !== false });
    return this;
  }
  limit(value: number): this {
    this.max = value;
    return this;
  }
  range(from: number, to: number): this {
    this.offset = from;
    this.max = to - from + 1;
    return this;
  }
  async maybeSingle(): Promise<RpcResult> {
    const rows = this.filtered();
    return { data: rows[0] ?? null, error: null };
  }
  then<TResult1 = RpcResult, TResult2 = never>(
    onfulfilled?: ((value: RpcResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve({
      data: this.filtered().slice(this.offset, this.offset + this.max),
      error: null,
    })
      .then(onfulfilled, onrejected);
  }
  private filtered(): Row[] {
    const rows = this.rows().filter(row => this.filters.every(filter => filter(row)));
    if (this.orderBy.length > 0) {
      rows.sort((left, right) => {
        for (const { column, ascending } of this.orderBy) {
        const a = String(left[column] ?? '');
        const b = String(right[column] ?? '');
          const compared = ascending ? a.localeCompare(b) : b.localeCompare(a);
          if (compared !== 0) return compared;
        }
        return 0;
      });
    }
    return rows;
  }
}

class FakeClient implements WosV1DataClient {
  identityUserId: string | null = officeUserId;
  loseSubmitResponse = false;
  readonly profiles: Row[] = [
    {
      id: officeProfileId,
      user_id: officeUserId,
      org_id: organizationId,
      role: 'sales',
      is_active: true,
    },
    {
      id: operatorProfileId,
      user_id: operatorUserId,
      org_id: organizationId,
      role: 'operator',
      is_active: true,
    },
    {
      id: viewerProfileId,
      user_id: viewerUserId,
      org_id: organizationId,
      role: 'viewer',
      is_active: true,
    },
  ];
  readonly orders: Row[] = [{
    id: orderId,
    organization_id: foreignOrganizationId,
    created_by_profile_id: officeProfileId,
    sales_owner_profile_id: officeProfileId,
    project_owner_profile_id: officeProfileId,
    order_number: 'FOREIGN-ORDER',
    customer_name_snapshot: 'Foreign',
    project_name_snapshot: null,
    product_name: 'Foreign product',
    product_material: 'PP',
    requested_quantity: 10,
    current_batch_quantity: 10,
    priority: 'MEDIUM',
    is_urgent: false,
    version: 2,
    version_label: 'V1',
    workflow_status: 'SUBMITTED',
    submitted_at: '2026-11-23T00:00:00.000Z',
    updated_at: '2026-11-23T00:00:00.000Z',
  }];
  readonly blockers: Row[] = [];
  readonly images: Row[] = [];
  readonly resources: Row[] = [];
  readonly baselines: Row[] = [];
  readonly history: Row[] = [];
  readonly confirmations: Row[] = [];
  readonly proofs = new Set<string>();
  private readonly creates = new Map<string, Row>();
  private readonly actions = new Map<string, Row>();
  readonly submissions = new Map<string, Row>();
  readonly revisions = new Map<string, Row>();
  readonly reviews = new Map<string, Row>();
  private currentOrderId = orderId;

  from(table: string): QueryBuilder {
    const rows = () => {
      if (table === 'profiles') return this.profiles;
      if (table === 'wos_production_orders') return this.orders;
      if (table === 'wos_blockers') return this.blockers;
      if (table === 'wos_reference_images') return this.images;
      if (table === 'wos_resource_readiness') return this.resources;
      if (table === 'wos_visual_baselines') return this.baselines;
      if (table === 'wos_status_history') return this.history;
      if (table === 'wos_confirmations') return this.confirmations;
      return [];
    };
    return new QueryBuilder(rows);
  }

  async rpc(name: string, args: Record<string, unknown> = {}): Promise<RpcResult> {
    if (name === 'wos_create_production_order') {
      const requestId = String(args.p_request_id);
      const prior = this.creates.get(requestId);
      if (prior) return { data: { ...prior, status: 'REPLAYED' }, error: null };
      const payload = args.p_payload as Row;
      assert(!('organizationId' in payload) && !('role' in payload));
      this.currentOrderId = '92345678-1234-4234-8234-123456789012';
      const order: Row = {
        id: this.currentOrderId,
        organization_id: organizationId,
        created_by_profile_id: officeProfileId,
        sales_owner_profile_id: payload.salesOwnerProfileId,
        project_owner_profile_id: payload.projectOwnerProfileId,
        order_number: payload.orderNumber,
        customer_name_snapshot: payload.customerNameSnapshot,
        project_name_snapshot: payload.projectNameSnapshot ?? null,
        product_name: payload.productName,
        product_material: payload.productMaterial,
        requested_quantity: payload.requestedQuantity,
        current_batch_quantity: payload.currentBatchQuantity,
        split_delivery: Boolean(payload.splitDelivery),
        priority: payload.priority,
        is_urgent: Boolean(payload.isUrgent),
        version: 1,
        version_label: 'V1',
        workflow_status: 'DRAFT',
        submitted_at: null,
        updated_at: '2026-11-23T00:00:01.000Z',
      };
      this.orders.push(order);
      const result = {
        status: 'CREATED',
        orderId: this.currentOrderId,
        requestId,
        version: 1,
        versionLabel: 'V1',
        workflowStatus: 'DRAFT',
      };
      this.creates.set(requestId, result);
      return { data: result, error: null };
    }
    const order = this.orders.find(row =>
      row.id === (args.p_order_id ?? args.p_orderId));
    if (!order) return { data: null, error: { code: '42501' } };
    if (name === 'wos_register_uploaded_reference_image') {
      const imageId = String(args.p_image_id);
      if (!this.proofs.has(imageId)) {
        return { data: null, error: { code: '42501' } };
      }
      const prior = this.images.find(row => row.id === imageId);
      if (prior) return { data: { status: 'REPLAYED', imageId, bucket: 'wos-private' }, error: null };
      this.images.push({
        id: imageId,
        organization_id: organizationId,
        entity_type: 'PRODUCTION_ORDER',
        entity_id: order.id,
        category: args.p_category,
        file_name: 'source.png',
        mime_type: 'image/png',
        version_label: order.version_label,
        image_status: 'READY',
        superseded_at: null,
        uploaded_at: '2026-11-23T00:00:02.000Z',
      });
      return { data: { status: 'CREATED', imageId, bucket: 'wos-private' }, error: null };
    }
    if (name === 'wos_confirm_office_completeness') {
      if (this.images.length < 4 || order.version !== args.p_expected_revision) {
        return { data: null, error: { code: 'PT409' } };
      }
      const readinessId = '82345678-1234-4234-8234-123456789012';
      return { data: readinessId, error: null };
    }
    if (name === 'wos_submit_production_order') {
      const key = String(args.p_idempotency_key);
      const prior = this.submissions.get(key);
      if (prior) return { data: { ...prior, status: 'REPLAYED' }, error: null };
      if (order.version !== args.p_expected_revision
        || order.workflow_status !== 'DRAFT' || this.images.length !== 4) {
        return { data: null, error: { code: 'PT409' } };
      }
      order.version = 2;
      order.workflow_status = 'SUBMITTED';
      order.submitted_at = '2026-11-23T00:00:03.000Z';
      const result = {
        status: 'CREATED',
        orderId: order.id,
        receiptId,
        inboxTaskId: inboxId,
        sourceRevision: 1,
        canStart: false,
      };
      this.submissions.set(key, result);
      if (this.loseSubmitResponse) {
        this.loseSubmitResponse = false;
        return { data: null, error: { code: 'XX000' } };
      }
      return { data: result, error: null };
    }
    if (name === 'wos_operator_order_action') {
      const key = String(args.p_request_id);
      const prior = this.actions.get(key);
      if (prior) return { data: { ...prior, status: 'REPLAYED' }, error: null };
      if (order.version !== args.p_expected_version) {
        return { data: null, error: { code: 'PT409' } };
      }
      const action = String(args.p_action);
      if (action === 'ACCEPT' && order.workflow_status === 'SUBMITTED') {
        order.version = Number(order.version) + 1;
        order.workflow_status = 'WORKSHOP_REVIEW';
      } else if (action === 'RETURN_FOR_INFORMATION'
        && order.workflow_status === 'WORKSHOP_REVIEW') {
        order.version = Number(order.version) + 1;
        order.workflow_status = 'NEEDS_INFORMATION';
        this.blockers.push({
          id: blockerId,
          organization_id: organizationId,
          entity_type: 'PRODUCTION_ORDER',
          entity_id: order.id,
          blocker_code: 'P2_DOCUMENTS_INCOMPLETE',
          blocker_category: 'DOCUMENT',
          description: args.p_reason,
          status: 'OPEN',
          opened_at: '2026-11-23T00:00:04.000Z',
          resolved_at: null,
          resolution_note: null,
        });
      } else {
        return { data: null, error: { code: 'PT409' } };
      }
      const result = {
        status: 'APPLIED',
        orderId: order.id,
        requestId: key,
        expectedVersion: args.p_expected_version,
        version: order.version,
        versionLabel: order.version_label,
        workflowStatus: order.workflow_status,
        canStart: false,
      };
      this.actions.set(key, result);
      return { data: result, error: null };
    }
    if (name === 'wos_office_save_correction') {
      const key = String(args.p_request_id);
      const prior = this.revisions.get(key);
      if (prior) return { data: { ...prior, status: 'REPLAYED' }, error: null };
      if (order.version !== args.p_expected_version
        || order.workflow_status !== 'NEEDS_INFORMATION') {
        return { data: null, error: { code: 'PT409' } };
      }
      const patch = args.p_patch as Row;
      if (typeof patch.productName === 'string') order.product_name = patch.productName;
      order.version = Number(order.version) + 1;
      order.version_label = 'V2';
      const result = {
        status: 'SAVED',
        orderId: order.id,
        requestId: key,
        version: order.version,
        versionLabel: order.version_label,
        workflowStatus: 'NEEDS_INFORMATION',
        canStart: false,
      };
      this.revisions.set(key, result);
      return { data: result, error: null };
    }
    if (name === 'wos_office_resubmit_order') {
      const key = String(args.p_request_id);
      const prior = this.revisions.get(key);
      if (prior) return { data: { ...prior, status: 'REPLAYED' }, error: null };
      if (order.version !== args.p_expected_version
        || order.workflow_status !== 'NEEDS_INFORMATION') {
        return { data: null, error: { code: 'PT409' } };
      }
      order.version = Number(order.version) + 1;
      order.version_label = 'V3';
      order.workflow_status = 'WORKSHOP_REVIEW';
      const result = {
        status: 'RESUBMITTED',
        orderId: order.id,
        requestId: key,
        version: order.version,
        versionLabel: order.version_label,
        workflowStatus: 'WORKSHOP_REVIEW',
        canStart: false,
      };
      this.revisions.set(key, result);
      this.history.push({
        organization_id: organizationId,
        entity_type: 'PRODUCTION_ORDER',
        entity_id: order.id,
        previous_status: 'NEEDS_INFORMATION',
        next_status: 'WORKSHOP_REVIEW',
        reason_code: 'P2_OFFICE_RESUBMIT_CORRECTION',
        created_at: '2026-11-23T00:00:05.000Z',
        metadata: {
          newVersion: order.version,
          newVersionLabel: order.version_label,
        },
      });
      return { data: result, error: null };
    }
    if (name === 'wos_operator_review_correction') {
      const key = String(args.p_request_id);
      const prior = this.reviews.get(key);
      if (prior) return { data: { ...prior, status: 'REPLAYED' }, error: null };
      if (order.version !== args.p_expected_version
        || order.workflow_status !== 'WORKSHOP_REVIEW') {
        return { data: null, error: { code: 'PT409' } };
      }
      this.blockers.forEach(row => {
        if (row.status === 'OPEN') row.status = 'RESOLVED';
      });
      order.version = Number(order.version) + 1;
      order.workflow_status = 'WAITING_MATERIAL';
      const result = {
        status: 'REVIEWED',
        orderId: order.id,
        requestId: key,
        expectedVersion: args.p_expected_version,
        version: order.version,
        versionLabel: order.version_label,
        workflowStatus: 'WAITING_MATERIAL',
        resolvedBlockers: 1,
        canStart: false,
      };
      this.reviews.set(key, result);
      return { data: result, error: null };
    }
    return { data: null, error: { code: '42883' } };
  }
}

async function readRequest(request: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

const fake = new FakeClient();
const deps: WosV1HandlerDependencies = {
  runtime: {
    project: 'production',
    readsEnabled: true,
    writesEnabled: true,
  },
  client: fake,
  resolveIdentity: async () => fake.identityUserId
    ? { id: fake.identityUserId }
    : null,
};

const server = createServer(async (incoming, outgoing) => {
  const body = await readRequest(incoming);
  const request = new Request(
    `http://${incoming.headers.host}${incoming.url ?? '/'}`,
    {
      method: incoming.method,
      headers: incoming.headers as HeadersInit,
      body: incoming.method === 'GET' ? undefined : new Uint8Array(body),
    },
  );
  const response = await handleWosV1Request(request, deps);
  outgoing.statusCode = response.status;
  response.headers.forEach((value, key) => outgoing.setHeader(key, value));
  outgoing.end(Buffer.from(await response.arrayBuffer()));
});
await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
const port = (server.address() as AddressInfo).port;
const origin = `http://127.0.0.1:${port}`;

async function call(input: {
  readonly userId: string | null;
  readonly path: string;
  readonly method?: 'GET' | 'POST';
  readonly body?: unknown;
}): Promise<{ status: number; json: Record<string, unknown> }> {
  fake.identityUserId = input.userId;
  const response = await fetch(origin + input.path, {
    method: input.method ?? 'GET',
    headers: input.method === 'POST'
      ? {
          Origin: origin,
          'Content-Type': 'application/json',
          'x-wos-v1-action': '1',
        }
      : { Accept: 'application/json' },
    body: input.body === undefined ? undefined : JSON.stringify(input.body),
  });
  return {
    status: response.status,
    json: await response.json() as Record<string, unknown>,
  };
}

try {
  const disabledRead = await handleWosV1Request(
    new Request(origin + '/api/workshop-orders/v1?view=inbox'),
    {
      ...deps,
      runtime: { ...deps.runtime, readsEnabled: false, writesEnabled: false },
    },
  );
  assert.equal(disabledRead.status, 503);
  assert.equal((await disabledRead.json() as Row).code, 'WOS_V1_APP_DISABLED');

  const disabledWrite = await handleWosV1Request(
    new Request(origin + '/api/workshop-orders/v1', {
      method: 'POST',
      headers: {
        Origin: origin,
        'Content-Type': 'application/json',
        'x-wos-v1-action': '1',
      },
      body: JSON.stringify({
        operation: 'OPERATOR_ACTION',
        orderId,
        expectedVersion: 2,
        requestId: 'f2345678-1234-4234-8234-123456789012',
        action: 'ACCEPT',
        reason: 'Synthetic write must fail while server Gate is disabled.',
      }),
    }),
    {
      ...deps,
      runtime: { ...deps.runtime, writesEnabled: false },
    },
  );
  assert.equal(disabledWrite.status, 503);
  assert.equal((await disabledWrite.json() as Row).code, 'WOS_V1_WRITES_DISABLED');

  const oversized = await handleWosV1Request(
    new Request(origin + '/api/workshop-orders/v1', {
      method: 'POST',
      headers: {
        Origin: origin,
        'Content-Type': 'application/json',
        'x-wos-v1-action': '1',
      },
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('x'.repeat(20000)));
          controller.close();
        },
      }),
      duplex: 'half',
    } as RequestInit & { duplex: 'half' }),
    deps,
  );
  assert.equal(oversized.status, 400);

  const anonymous = await call({
    userId: null,
    path: '/api/workshop-orders/v1?view=inbox',
  });
  assert.equal(anonymous.status, 401);

  const viewer = await call({
    userId: viewerUserId,
    path: '/api/workshop-orders/v1?view=inbox',
  });
  assert.equal(viewer.status, 403);

  const foreign = await call({
    userId: officeUserId,
    path: `/api/workshop-orders/v1?view=office&orderId=${orderId}`,
  });
  assert.equal(foreign.status, 403);

  const createRequestId = '52345678-1234-4234-8234-123456789012';
  const create = await call({
    userId: officeUserId,
    path: '/api/workshop-orders/v1',
    method: 'POST',
    body: {
      operation: 'CREATE_ORDER',
      requestId: createRequestId,
      payload: {
        orderNumber: 'WOS-E2E-001',
        customerNameSnapshot: 'Synthetic Customer',
        projectNameSnapshot: 'Synthetic Project',
        productName: 'Synthetic Cup',
        priority: 'MEDIUM',
        requestedQuantity: 100,
        currentBatchQuantity: 80,
        productMaterial: 'PP',
      },
    },
  });
  assert.equal(create.status, 200);
  assert.equal(create.json.code, 'CREATE_ORDER_VERIFIED');
  const created = ((create.json.data as Row).result as Row);
  const createdOrderId = String(created.orderId);

  const createReplay = await call({
    userId: officeUserId,
    path: '/api/workshop-orders/v1',
    method: 'POST',
    body: {
      operation: 'CREATE_ORDER',
      requestId: createRequestId,
      payload: {
        orderNumber: 'WOS-E2E-001',
        customerNameSnapshot: 'Synthetic Customer',
        projectNameSnapshot: 'Synthetic Project',
        productName: 'Synthetic Cup',
        priority: 'MEDIUM',
        requestedQuantity: 100,
        currentBatchQuantity: 80,
        productMaterial: 'PP',
      },
    },
  });
  assert.equal(createReplay.status, 200);

  const officeDraftList = await call({
    userId: officeUserId,
    path: '/api/workshop-orders/v1?view=office',
  });
  assert.equal(officeDraftList.status, 200);
  const officeItems = ((officeDraftList.json.data as Row).items as Row[]);
  assert(officeItems.some(row =>
    row.id === createdOrderId
    && row.workflow_status === 'DRAFT'
    && row.version === 1));
  const exactDraft = await call({
    userId: officeUserId,
    path: '/api/workshop-orders/v1?view=office&orderNumber=WOS-E2E-001',
  });
  assert.equal(exactDraft.status, 200);
  assert.equal(((exactDraft.json.data as Row).items as Row[]).length, 1);

  const categories = [
    'PRODUCT',
    'FILM_PATTERN',
    'CUSTOMER_APPROVED_SAMPLE',
    'SIGNED_SAMPLE',
  ] as const;
  for (const [index, category] of categories.entries()) {
    const imageId = `7${index + 1}345678-1234-4234-8234-123456789012`;
    const storagePath = canonicalWosV1ImagePath({
      organizationId,
      orderId: createdOrderId,
      versionLabel: 'V1',
      imageId,
      category,
      fileName: 'source.png',
    });
    const blocked = await call({
      userId: officeUserId,
      path: '/api/workshop-orders/v1',
      method: 'POST',
      body: {
        operation: 'REGISTER_IMAGE',
        orderId: createdOrderId,
        imageId,
        category,
        storagePath,
      },
    });
    assert.equal(blocked.status, 403, 'direct registration must require trusted Proof');
    fake.proofs.add(imageId);
    const registered = await call({
      userId: officeUserId,
      path: '/api/workshop-orders/v1',
      method: 'POST',
      body: {
        operation: 'REGISTER_IMAGE',
        orderId: createdOrderId,
        imageId,
        category,
        storagePath,
      },
    });
    assert.equal(registered.status, 200);
  }

  const confirm = await call({
    userId: officeUserId,
    path: '/api/workshop-orders/v1',
    method: 'POST',
    body: {
      operation: 'CONFIRM_OFFICE',
      orderId: createdOrderId,
      expectedVersion: 1,
      expectedLabel: 'V1',
      note: 'Synthetic office confirms four current production images.',
    },
  });
  assert.equal(confirm.status, 200);

  fake.loseSubmitResponse = true;
  const submitRequestId = '82345678-1234-4234-8234-123456789012';
  const lost = await call({
    userId: officeUserId,
    path: '/api/workshop-orders/v1',
    method: 'POST',
    body: {
      operation: 'SUBMIT_ORDER',
      orderId: createdOrderId,
      expectedVersion: 1,
      expectedLabel: 'V1',
      requestId: submitRequestId,
    },
  });
  assert.equal(lost.status, 503, 'lost response must not be reported as HTTP success');
  const submitReplay = await call({
    userId: officeUserId,
    path: '/api/workshop-orders/v1',
    method: 'POST',
    body: {
      operation: 'SUBMIT_ORDER',
      orderId: createdOrderId,
      expectedVersion: 1,
      expectedLabel: 'V1',
      requestId: submitRequestId,
    },
  });
  assert.equal(submitReplay.status, 200);
  assert.equal(submitReplay.json.code, 'SUBMIT_ORDER_VERIFIED');

  const accept = await call({
    userId: operatorUserId,
    path: '/api/workshop-orders/v1',
    method: 'POST',
    body: {
      operation: 'OPERATOR_ACTION',
      orderId: createdOrderId,
      expectedVersion: 2,
      requestId: '92345678-1234-4234-8234-123456789012',
      action: 'ACCEPT',
      reason: 'Synthetic operator accepts the current submitted order.',
    },
  });
  assert.equal(accept.status, 200);
  const staleAccept = await call({
    userId: operatorUserId,
    path: '/api/workshop-orders/v1',
    method: 'POST',
    body: {
      operation: 'OPERATOR_ACTION',
      orderId: createdOrderId,
      expectedVersion: 2,
      requestId: 'a2345678-1234-4234-8234-123456789012',
      action: 'ACCEPT',
      reason: 'Synthetic stale concurrent operator request must fail.',
    },
  });
  assert.equal(staleAccept.status, 409);

  const returned = await call({
    userId: operatorUserId,
    path: '/api/workshop-orders/v1',
    method: 'POST',
    body: {
      operation: 'OPERATOR_ACTION',
      orderId: createdOrderId,
      expectedVersion: 3,
      requestId: 'b2345678-1234-4234-8234-123456789012',
      action: 'RETURN_FOR_INFORMATION',
      reason: 'Synthetic acceptance standard and print position are incomplete.',
    },
  });
  assert.equal(returned.status, 200);

  const saved = await call({
    userId: officeUserId,
    path: '/api/workshop-orders/v1',
    method: 'POST',
    body: {
      operation: 'SAVE_CORRECTION',
      orderId: createdOrderId,
      expectedVersion: 4,
      requestId: 'c2345678-1234-4234-8234-123456789012',
      reason: 'Synthetic office corrects product name and acceptance details.',
      patch: { productName: 'Corrected Synthetic Cup' },
    },
  });
  assert.equal(saved.status, 200);

  const resubmitted = await call({
    userId: officeUserId,
    path: '/api/workshop-orders/v1',
    method: 'POST',
    body: {
      operation: 'RESUBMIT_ORDER',
      orderId: createdOrderId,
      expectedVersion: 5,
      requestId: 'd2345678-1234-4234-8234-123456789012',
      reason: 'Synthetic office resubmits the saved current revision.',
    },
  });
  assert.equal(resubmitted.status, 200);

  const reviewed = await call({
    userId: operatorUserId,
    path: '/api/workshop-orders/v1',
    method: 'POST',
    body: {
      operation: 'REVIEW_CORRECTION',
      orderId: createdOrderId,
      expectedVersion: 6,
      requestId: 'e2345678-1234-4234-8234-123456789012',
      note: 'Synthetic operator reviews the current resubmitted revision.',
    },
  });
  assert.equal(reviewed.status, 200);
  assert.equal(
    ((reviewed.json.data as Row).result as Row).workflowStatus,
    'WAITING_MATERIAL',
  );

  const finalOrder = fake.orders.find(row => row.id === createdOrderId);
  assert.equal(finalOrder?.version, 7);
  assert.equal(finalOrder?.workflow_status, 'WAITING_MATERIAL');
  assert.equal(fake.submissions.size, 1);
  assert.equal(fake.revisions.size, 2);
  assert.equal(fake.reviews.size, 1);

  for (let index = 0; index < 55; index++) {
    fake.orders.push({
      ...finalOrder!,
      id: `a${String(index).padStart(7, '0')}-1234-4234-8234-123456789012`,
      order_number: `WOS-PAGE-${index}`,
      workflow_status: 'DRAFT',
      version: 1,
      version_label: 'V1',
      updated_at: `2026-11-23T01:${String(index).padStart(2, '0')}:00.000Z`,
    });
  }
  const firstPage = await call({
    userId: officeUserId,
    path: '/api/workshop-orders/v1?view=office',
  });
  assert.equal(firstPage.status, 200);
  assert.equal(((firstPage.json.data as Row).items as Row[]).length, 50);
  assert.equal(typeof (firstPage.json.data as Row).nextCursor, 'string');
  const secondPage = await call({
    userId: officeUserId,
    path: '/api/workshop-orders/v1?view=office&cursor='
      + encodeURIComponent(String((firstPage.json.data as Row).nextCursor)),
  });
  assert.equal(secondPage.status, 200);
  assert(((secondPage.json.data as Row).items as Row[]).length > 0);
  assert.equal((secondPage.json.data as Row).nextCursor, null);

  fake.orders.splice(0, fake.orders.length);
  for (let index = 0; index < 55; index++) {
    fake.orders.push({
      ...finalOrder!,
      id: `b${String(index).padStart(7, '0')}-1234-4234-8234-123456789012`,
      order_number: `WOS-SALES-OTHER-${index}`,
      created_by_profile_id: '99999999-9999-4999-8999-999999999999',
      sales_owner_profile_id: '99999999-9999-4999-8999-999999999999',
      workflow_status: 'DRAFT',
      updated_at: `2026-11-23T02:${String(index).padStart(2, '0')}:00.000Z`,
    });
  }
  fake.orders.push({
    ...finalOrder!,
    id: 'c0000000-1234-4234-8234-123456789012',
    order_number: 'WOS-SALES-OWNED',
    created_by_profile_id: officeProfileId,
    sales_owner_profile_id: officeProfileId,
    workflow_status: 'DRAFT',
    updated_at: '2026-11-23T01:00:00.000Z',
  });
  const salesList = await call({
    userId: officeUserId,
    path: '/api/workshop-orders/v1?view=office',
  });
  assert.equal(salesList.status, 200);
  const salesItems = (salesList.json.data as Row).items as Row[];
  assert.equal(salesItems.length, 1);
  assert.equal(salesItems[0].order_number, 'WOS-SALES-OWNED');
  assert.equal((salesList.json.data as Row).nextCursor, null);

  console.log('workshop-order-production-app-http.test.ts: PASS');
  console.log('WOS_V1_HTTP_END_TO_END=PASS');
  console.log('WOS_V1_HTTP_IDEMPOTENCY_AND_LOST_RESPONSE=PASS');
  console.log('WOS_V1_HTTP_VERSION_CAS_AND_ROLE_DENIAL=PASS');
} finally {
  await new Promise<void>((resolve, reject) =>
    server.close(error => error ? reject(error) : resolve()));
}
