import { NextRequest } from 'next/server';
import { expectedVersionRequestSchema, reviewMemberIdSchema } from '@/lib/review-center/schemas';
import { setPrimaryMember } from '@/lib/review-center/mutation';
import { runMutationRoute } from '@/lib/review-center/mutation-route';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string; memberId: string } },
) {
  return runMutationRoute(
    req,
    params,
    reviewMemberIdSchema,
    expectedVersionRequestSchema,
    (client, parsedParams, body) => setPrimaryMember(
      client,
      parsedParams.id,
      body.expectedVersion,
      parsedParams.memberId,
    ),
  );
}
