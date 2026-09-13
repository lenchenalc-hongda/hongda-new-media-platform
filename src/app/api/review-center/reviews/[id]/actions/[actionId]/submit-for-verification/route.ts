import { NextRequest } from 'next/server';
import { runActionCommandRoute } from '@/lib/review-center/action-command';
import {
  actionRouteParamsSchema,
  submitActionCommandSchema,
} from '@/lib/review-center/action-command-schemas';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string; actionId: string } },
) {
  return runActionCommandRoute(
    req,
    params,
    actionRouteParamsSchema,
    submitActionCommandSchema,
    'review_action_submit_for_verification',
    (routeParams, body) => ({
      p_review_id: routeParams.id,
      p_action_id: routeParams.actionId,
      p_expected_version: body.expectedVersion,
      p_completion_note: body.completionNote,
    }),
    { requireActionId: true },
  );
}
