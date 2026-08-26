// ===== Review Center Draft Mutation RPC Bridge =====
// Routes parse/auth first, then call these functions with the authenticated
// Supabase client. No service role is used here.

const MUTATION_STATUS: Record<string, number> = {
  OK: 200,
  INVALID_PATCH: 400,
  INVALID_MEMBER: 400,
  INVALID_METADATA: 400,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  DRAFT_ONLY: 409,
  VERSION_CONFLICT: 409,
  INVALID_TRANSITION: 409,
  TYPE_MISMATCH: 409,
  UNIQUE_CONFLICT: 409,
};

interface RpcErrorLike {
  code?: string;
}

export interface MutationRpcResult {
  data?: any;
  error?: RpcErrorLike | null;
}

export interface MutationHttpResult {
  status: number;
  body: Record<string, unknown>;
}

export function mapReviewMutationResult(result: MutationRpcResult): MutationHttpResult {
  if (result.error) {
    console.error('[review-center] mutation rpc error', result.error.code ?? 'UNKNOWN');
    return {
      status: 500,
      body: { ok: false, code: 'INTERNAL', message: '服务异常', data: null },
    };
  }

  const envelope = result.data;
  if (!envelope || typeof envelope !== 'object') {
    return {
      status: 500,
      body: { ok: false, code: 'INTERNAL', message: '服务异常', data: null },
    };
  }

  if (envelope.ok === true && envelope.code === 'OK') {
    return { status: 200, body: envelope };
  }

  const code = typeof envelope.code === 'string' ? envelope.code : 'UNKNOWN';
  const status = MUTATION_STATUS[code] ?? 500;
  if (status === 500) {
    return {
      status: 500,
      body: { ok: false, code: 'INTERNAL', message: '服务异常', data: null },
    };
  }
  return {
    status,
    body: {
      ok: false,
      code,
      message: typeof envelope.message === 'string' ? envelope.message : '请求失败',
      data: envelope.data ?? null,
    },
  };
}

export async function updateDraftReview(
  client: any,
  reviewId: string,
  expectedVersion: number,
  patch: Record<string, unknown>,
): Promise<MutationRpcResult> {
  return client.rpc('review_update_draft_public', {
    p_review_id: reviewId,
    p_expected_version: expectedVersion,
    p_patch: patch,
  });
}

export async function upsertTypeDetails(
  client: any,
  reviewId: string,
  expectedVersion: number,
  patch: Record<string, unknown>,
): Promise<MutationRpcResult> {
  return client.rpc('review_upsert_type_details', {
    p_review_id: reviewId,
    p_expected_version: expectedVersion,
    p_patch: patch,
  });
}

export async function updateReviewMetadata(
  client: any,
  reviewId: string,
  expectedVersion: number,
  metadata: Record<string, unknown>,
): Promise<MutationRpcResult> {
  return client.rpc('review_upsert_metadata', {
    p_review_id: reviewId,
    p_expected_version: expectedVersion,
    p_metadata: metadata,
  });
}

export async function addReviewMember(
  client: any,
  reviewId: string,
  expectedVersion: number,
  profileId: string,
  memberRole: string,
): Promise<MutationRpcResult> {
  return client.rpc('review_add_member', {
    p_review_id: reviewId,
    p_expected_version: expectedVersion,
    p_profile_id: profileId,
    p_member_role: memberRole,
  });
}

export async function removeReviewMember(
  client: any,
  reviewId: string,
  expectedVersion: number,
  memberId: string,
): Promise<MutationRpcResult> {
  return client.rpc('review_remove_member', {
    p_review_id: reviewId,
    p_expected_version: expectedVersion,
    p_member_id: memberId,
  });
}

export async function setPrimaryMember(
  client: any,
  reviewId: string,
  expectedVersion: number,
  memberId: string,
): Promise<MutationRpcResult> {
  return client.rpc('review_set_primary_member', {
    p_review_id: reviewId,
    p_expected_version: expectedVersion,
    p_member_id: memberId,
  });
}

export async function setDraftAssignments(
  client: any,
  reviewId: string,
  expectedVersion: number,
  ownerProfileId: string,
  pmoProfileId: string | null,
): Promise<MutationRpcResult> {
  return client.rpc('review_set_draft_assignments', {
    p_review_id: reviewId,
    p_expected_version: expectedVersion,
    p_owner_profile_id: ownerProfileId,
    p_pmo_profile_id: pmoProfileId,
  });
}
