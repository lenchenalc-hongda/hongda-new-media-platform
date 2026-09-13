import { NextRequest } from 'next/server';
import { addMemberRequestSchema, reviewIdSchema } from '@/lib/review-center/schemas';
import { addReviewMember } from '@/lib/review-center/mutation';
import { runMutationRoute } from '@/lib/review-center/mutation-route';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  return runMutationRoute(
    req,
    params,
    reviewIdSchema,
    addMemberRequestSchema,
    (client, parsedParams, body) => addReviewMember(
      client,
      parsedParams.id,
      body.expectedVersion,
      body.profileId,
      body.memberRole,
    ),
  );
}
