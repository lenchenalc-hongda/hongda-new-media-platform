import type {
  CreateDraftInput,
  ReviewDetail,
  ReviewListItem,
  ReviewListQuery,
  ReviewListResponse,
  ReviewParticipant,
} from './types';
import { nextReviewNumber } from './review-number';
import { normalizeSearchQuery } from './search';
import { ParticipantReadError, parseParticipantDirectoryResult } from './participant';

export class ReviewServiceError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ReviewServiceError';
    this.status = status;
  }
}

export interface CurrentProfile {
  id: string;
  org_id: string;
}

export async function getCurrentProfile(
  client: any,
  authUserId: string,
): Promise<CurrentProfile | null> {
  const { data, error } = await client
    .from('profiles')
    .select('id,org_id')
    .eq('user_id', authUserId)
    .maybeSingle();
  if (error || !data) return null;
  return { id: data.id, org_id: data.org_id };
}

async function findMaxReviewNo(
  client: any,
  orgId: string,
  year: number,
): Promise<string | null> {
  const prefix = `REV-${year}-`;
  const { data, error } = await client
    .from('review_cases')
    .select('review_no')
    .eq('org_id', orgId)
    .like('review_no', `${prefix}%`)
    .order('review_no', { ascending: false })
    .limit(1);
  if (error) throw new ReviewServiceError('无法读取复盘编号', 500);
  return data && data.length > 0 ? data[0].review_no : null;
}

export async function listReviewCases(
  client: any,
  orgId: string,
  query: ReviewListQuery,
): Promise<ReviewListResponse> {
  let builder = client
    .from('review_cases')
    .select(
      'id,review_no,review_type,title,status,risk_level,customer_name,project_name,product_name,owner_id,occurred_at,created_at,updated_at',
      { count: 'exact' },
    )
    .eq('org_id', orgId);

  if (query.status) builder = builder.eq('status', query.status);
  if (query.review_type) builder = builder.eq('review_type', query.review_type);
  if (query.risk_level) builder = builder.eq('risk_level', query.risk_level);
  const safeQ = normalizeSearchQuery(query.q);
  if (safeQ) {
    builder = builder.or(
      `review_no.ilike.%${safeQ}%,title.ilike.%${safeQ}%,customer_name.ilike.%${safeQ}%,order_no.ilike.%${safeQ}%,project_name.ilike.%${safeQ}%,product_name.ilike.%${safeQ}%`,
    );
  }

  const from = (query.page - 1) * query.limit;
  const to = from + query.limit - 1;
  builder = builder
    .range(from, to)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false });

  const { data, error, count } = await builder;
  if (error) throw new ReviewServiceError('复盘列表读取失败', 500);

  return {
    items: (data || []) as ReviewListItem[],
    page: query.page,
    limit: query.limit,
    total: count ?? 0,
  };
}

export async function createDraftReview(
  client: any,
  orgId: string,
  profileId: string,
  input: CreateDraftInput,
): Promise<ReviewDetail> {
  const year = new Date().getFullYear();
  const maxAttempts = 5;
  const occurredAt = input.occurred_at ? new Date(input.occurred_at).toISOString() : null;
  const riskReason = input.risk_level ? (input.risk_reason ?? null) : null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const maxReviewNo = await findMaxReviewNo(client, orgId, year);
    const reviewNo = nextReviewNumber(maxReviewNo, year);

    const { data, error } = await client
      .from('review_cases')
      .insert({
        org_id: orgId,
        review_no: reviewNo,
        review_type: input.review_type,
        title: input.title,
        occurred_at: occurredAt,
        customer_name: input.customer_name ?? null,
        order_no: input.order_no ?? null,
        project_name: input.project_name ?? null,
        product_name: input.product_name ?? null,
        process_name: input.process_name ?? null,
        description: input.description ?? null,
        impact_summary: input.impact_summary ?? null,
        risk_level: input.risk_level ?? null,
        risk_reason: riskReason,
        created_by: profileId,
        owner_id: profileId,
        status: 'draft',
        version: 1,
        pmo_id: null,
        closed_at: null,
        closed_by: null,
        close_override_reason: null,
        archived_at: null,
        report_generated_at: null,
      })
      .select('*')
      .maybeSingle();

    if (!error && data) {
      return {
        ...(data as ReviewDetail),
        type_details: null,
        members: [],
        participants: [],
      };
    }
    if (error?.code === '23505' && attempt < maxAttempts) continue;
    if (error?.code === '23505') {
      throw new ReviewServiceError('复盘编号冲突，请重试', 409);
    }
    throw new ReviewServiceError('复盘创建失败', 500);
  }

  throw new ReviewServiceError('复盘编号冲突，请重试', 409);
}

export async function getReviewDetail(
  client: any,
  orgId: string,
  reviewId: string,
): Promise<ReviewDetail> {
  const { data: review, error } = await client
    .from('review_cases')
    .select('*')
    .eq('id', reviewId)
    .eq('org_id', orgId)
    .maybeSingle();
  if (error || !review) throw new ReviewServiceError('复盘不存在或不可见', 404);

  const typeResult = await client
    .from('review_type_details')
    .select('*')
    .eq('review_id', reviewId)
    .eq('org_id', orgId)
    .maybeSingle();
  if (typeResult.error) throw new ReviewServiceError('复盘详情读取失败', 500);

  const membersResult = await client
    .from('review_members')
    .select('id,profile_id,member_role,is_primary,created_at')
    .eq('review_id', reviewId)
    .eq('org_id', orgId)
    .order('created_at', { ascending: true });
  if (membersResult.error) throw new ReviewServiceError('复盘成员读取失败', 500);

  let participants: ReviewParticipant[] = [];
  try {
    const participantResult = await client.rpc('review_participant_directory', {
      p_review_id: reviewId,
    });
    participants = parseParticipantDirectoryResult(participantResult);
  } catch (err) {
    if (err instanceof ParticipantReadError) {
      throw new ReviewServiceError('复盘详情读取失败', err.status);
    }
    throw new ReviewServiceError('复盘详情读取失败', 500);
  }

  return {
    ...(review as ReviewDetail),
    type_details: typeResult.data ?? null,
    members: membersResult.data ?? [],
    participants,
  };
}
