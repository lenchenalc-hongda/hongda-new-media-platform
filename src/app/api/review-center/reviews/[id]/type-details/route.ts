import { NextRequest } from 'next/server';
import { reviewIdSchema, typeDetailsRequestSchema } from '@/lib/review-center/schemas';
import { upsertTypeDetails } from '@/lib/review-center/mutation';
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
    typeDetailsRequestSchema,
    (client, parsedParams, body) => upsertTypeDetails(
      client,
      parsedParams.id,
      body.expectedVersion,
      body.patch,
    ),
  );
}
