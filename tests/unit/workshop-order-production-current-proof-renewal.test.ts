import assert from 'node:assert/strict';
import { renewWosV1CurrentImageProofs } from
  '../../src/lib/workshop-orders/production-app-client';

const categories = [
  'PRODUCT',
  'FILM_PATTERN',
  'CUSTOMER_APPROVED_SAMPLE',
  'SIGNED_SAMPLE',
] as const;

function rows(overrides: Record<string, unknown> = {}) {
  return categories.map((category, index) => ({
    id: `00000000-0000-4000-8000-00000000000${index + 1}`,
    category,
    storage_bucket: 'wos-private',
    storage_path: `organizations/org/wos/production-order/order/${category}.png`,
    image_status: 'READY',
    version_label: 'V2',
    ...overrides,
  }));
}

function queryResult(data: readonly unknown[]) {
  const query = {
    select: () => query,
    eq: () => query,
    is: () => query,
    then: (
      resolve: (value: { data: readonly unknown[]; error: null }) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => Promise.resolve({ data, error: null }).then(resolve, reject),
  };
  return query;
}

function client(input: {
  readonly data: readonly unknown[];
  readonly edgeCode?: string;
  readonly edgeProofStatus?: string;
}) {
  const invocations: {
    readonly name: string;
    readonly body: Record<string, unknown>;
  }[] = [];
  return {
    invocations,
    value: {
      from: () => queryResult(input.data),
      functions: {
        invoke: async (
          name: string,
          options: { readonly body: Record<string, unknown> },
        ) => {
          invocations.push({ name, body: options.body });
          return {
            error: null,
            data: {
              ok: input.edgeCode === undefined
                || input.edgeCode === 'WOS_V1_TRUSTED_IMAGE_PROOF_ISSUED',
              code: input.edgeCode ?? 'WOS_V1_TRUSTED_IMAGE_PROOF_ISSUED',
              data: {
                sha256: 'a'.repeat(64),
                proofStatus: input.edgeProofStatus ?? 'REPLAYED',
                reverifiedExistingProof: true,
              },
            },
          };
        },
      },
    },
  };
}

const happy = client({ data: rows() });
assert.deepEqual(
  await renewWosV1CurrentImageProofs({
    client: happy.value as never,
    orderId: '11111111-1111-4111-8111-111111111111',
    versionLabel: 'V2',
  }),
  { ok: true, verifiedCount: 4 },
);
assert.equal(happy.invocations.length, 4);
assert.deepEqual(
  new Set(happy.invocations.map(value => value.body.category)),
  new Set(categories),
);
assert(happy.invocations.every(value =>
  value.body.reverifyExistingProof === true
  && !('sha256' in value.body)
  && !('storagePath' in value.body)));

const incomplete = client({ data: rows().slice(0, 3) });
assert.deepEqual(
  await renewWosV1CurrentImageProofs({
    client: incomplete.value as never,
    orderId: '11111111-1111-4111-8111-111111111111',
    versionLabel: 'V2',
  }),
  { ok: false, code: 'CURRENT_FOUR_IMAGE_SET_INCOMPLETE' },
);
assert.equal(incomplete.invocations.length, 0);

const wrongBucket = client({
  data: rows({ storage_bucket: 'public' }),
});
assert.deepEqual(
  await renewWosV1CurrentImageProofs({
    client: wrongBucket.value as never,
    orderId: '11111111-1111-4111-8111-111111111111',
    versionLabel: 'V2',
  }),
  { ok: false, code: 'CURRENT_IMAGE_IDENTITY_INVALID' },
);
assert.equal(wrongBucket.invocations.length, 0);

const denied = client({
  data: rows(),
  edgeCode: 'WOS_V1_EDGE_WRITES_DISABLED',
});
assert.deepEqual(
  await renewWosV1CurrentImageProofs({
    client: denied.value as never,
    orderId: '11111111-1111-4111-8111-111111111111',
    versionLabel: 'V2',
  }),
  { ok: false, code: 'WOS_V1_EDGE_WRITES_DISABLED' },
);
assert.equal(denied.invocations.length, 1);

console.log('workshop-order-production-current-proof-renewal.test.ts: PASS');
