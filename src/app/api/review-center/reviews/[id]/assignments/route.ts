import { NextRequest } from 'next/server';
import { assignmentsRequestSchema, reviewIdSchema } from '@/lib/review-center/schemas';
import { setDraftAssignments } from '@/lib/review-center/mutation';
import { runMutationRoute } from '@/lib/review-center/mutation-route';

export const dynamic = 'force-dynamic';

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  return runMutationRoute(
    req,
    params,
    reviewIdSchema,
    assignmentsRequestSchema,
    (client, parsedParams, body) => setDraftAssignments(
      client,
      parsedParams.id,
      body.expectedVersion,
      body.ownerId,
      body.pmoId ?? null,
    ),
  );
}
