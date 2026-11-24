// @ts-ignore Deno requires the explicit .ts extension for local imports.
import { evaluateWosV1ReadOnlyAccess, orderSnapshotStable, preflightWosV1ReadOnlyImage, safeReadOnlyVerification, verifyWosV1ReadOnlyImage, type WosV1ReadOnlyOrder, type WosV1ReadOnlyProfile, type WosV1ReadOnlyProof, type WosV1ReadOnlyVerificationBody } from './core.ts';
// @ts-ignore Deno requires the explicit .ts extension for local imports.
import { canonicalWosV1ImagePath, type WosV1ObjectSnapshot } from '../wos-v1-verify-image/core.ts';

export interface WosV1ReadOnlyRequestDependencies {
  readonly readOnlyEnabled: boolean;
  readonly qaRuntimeBound: boolean;
  readonly authenticate: (
    authorization: string,
  ) => Promise<{ readonly userId: string } | null>;
  readonly profileFor: (
    userId: string,
  ) => Promise<WosV1ReadOnlyProfile | null>;
  readonly orderFor: (
    orderId: string,
    organizationId: string,
  ) => Promise<WosV1ReadOnlyOrder | null>;
  readonly proofFor: (
    imageId: string,
    order: WosV1ReadOnlyOrder,
  ) => Promise<WosV1ReadOnlyProof | null>;
  readonly snapshotFor: (
    path: string,
  ) => Promise<WosV1ObjectSnapshot | null>;
  readonly download: (path: string) => Promise<Uint8Array | null>;
  readonly currentOrder: (
    orderId: string,
    organizationId: string,
  ) => Promise<WosV1ReadOnlyOrder | null>;
  readonly now: () => string;
  readonly renewProof?: (imageId: string) => Promise<void>;
  readonly recordProof?: (imageId: string) => Promise<void>;
  readonly databaseWrite?: (operation: string) => Promise<void>;
}

export interface WosV1ReadOnlyRequestResult {
  readonly status: number;
  readonly code: string;
  readonly data: Record<string, unknown> | null;
}

export async function executeWosV1ReadOnlyRequest(input: {
  readonly authorization: string;
  readonly body: WosV1ReadOnlyVerificationBody;
  readonly dependencies: WosV1ReadOnlyRequestDependencies;
}): Promise<WosV1ReadOnlyRequestResult> {
  const deps = input.dependencies;
  if (!deps.qaRuntimeBound) {
    return { status: 503, code: 'RUNTIME_DENIED', data: null };
  }
  if (!deps.readOnlyEnabled) {
    return {
      status: 503,
      code: 'READONLY_VERIFY_DISABLED',
      data: null,
    };
  }
  if (!/^Bearer [^\s]+$/.test(input.authorization)) {
    return { status: 401, code: 'UNAUTHENTICATED', data: null };
  }

  const actor = await deps.authenticate(input.authorization);
  if (!actor) {
    return { status: 401, code: 'UNAUTHENTICATED', data: null };
  }
  const profile = await deps.profileFor(actor.userId);
  const order = await deps.orderFor(
    input.body.orderId,
    profile?.org_id ?? '',
  );
  const access = evaluateWosV1ReadOnlyAccess({
    readOnlyEnabled: deps.readOnlyEnabled,
    qaRuntimeBound: deps.qaRuntimeBound,
    profile,
    order,
    expectedVersion: input.body.expectedVersion,
    expectedVersionLabel: input.body.expectedVersionLabel,
  });
  if (!access.allowed || !order) {
    return {
      status: access.code === 'ORDER_VERSION_MISMATCH' ? 409 : 403,
      code: access.code,
      data: null,
    };
  }

  const prepared: Array<{
    readonly image: (typeof input.body.images)[number];
    readonly proof: WosV1ReadOnlyProof;
    readonly snapshot: WosV1ObjectSnapshot;
    readonly checkedAt: string;
  }> = [];

  // No bytes may be downloaded until all four proof/object identities pass.
  for (const image of input.body.images) {
    const expectedPath = canonicalWosV1ImagePath({
      organizationId: order.organization_id,
      orderId: order.id,
      versionLabel: order.version_label,
      imageId: image.imageId,
      category: image.category,
    });
    if (expectedPath !== image.storagePath) {
      return { status: 400, code: 'INVALID_IMAGE_PATH', data: null };
    }
    const proof = await deps.proofFor(image.imageId, order);
    const snapshot = await deps.snapshotFor(expectedPath);
    if (!proof || !snapshot) {
      return {
        status: 409,
        code: 'PROOF_METADATA_MISMATCH',
        data: null,
      };
    }
    const checkedAt = deps.now();
    const preflight = preflightWosV1ReadOnlyImage({
      image,
      order,
      proof,
      snapshot,
      checkedAt,
    });
    if (!preflight.ok) {
      return { status: 409, code: preflight.code, data: null };
    }
    prepared.push({ image, proof, snapshot, checkedAt });
  }

  const orderBeforeDownload = await deps.currentOrder(
    order.id,
    order.organization_id,
  );
  if (!orderBeforeDownload || !orderSnapshotStable(order, orderBeforeDownload)) {
    return {
      status: 409,
      code: 'ORDER_CHANGED_DURING_VERIFICATION',
      data: null,
    };
  }

  for (const item of prepared) {
    const bytes = await deps.download(item.image.storagePath);
    if (!bytes) {
      return {
        status: 409,
        code: 'PRIVATE_BINARY_UNAVAILABLE',
        data: null,
      };
    }
    const secondProof = await deps.proofFor(item.image.imageId, order);
    const secondSnapshot = await deps.snapshotFor(item.image.storagePath);
    const secondCheckedAt = deps.now();
    if (!secondProof || !secondSnapshot) {
      return {
        status: 409,
        code: 'PROOF_METADATA_MISMATCH',
        data: null,
      };
    }
    const verified = await verifyWosV1ReadOnlyImage({
      image: item.image,
      order,
      firstProof: item.proof,
      secondProof,
      firstSnapshot: item.snapshot,
      secondSnapshot,
      bytes,
      firstCheckedAt: item.checkedAt,
      secondCheckedAt,
    });
    if (!verified.ok) {
      return { status: 409, code: verified.code, data: null };
    }
  }

  const finalOrder = await deps.currentOrder(
    order.id,
    order.organization_id,
  );
  if (!finalOrder || !orderSnapshotStable(order, finalOrder)) {
    return {
      status: 409,
      code: 'ORDER_CHANGED_DURING_VERIFICATION',
      data: null,
    };
  }
  return {
    status: 200,
    code: 'WOS_V1_READONLY_IMAGE_PROOF_VERIFIED',
    data: safeReadOnlyVerification({
      order,
      categories: input.body.images.map(image => image.category),
    }),
  };
}
