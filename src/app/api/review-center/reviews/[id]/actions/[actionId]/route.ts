import { NextRequest } from 'next/server';
import { runActionCommandRoute } from '@/lib/review-center/action-command';
import {
  actionRouteParamsSchema,
  updateActionCommandSchema,
} from '@/lib/review-center/action-command-schemas';

export const dynamic = 'force-dynamic';

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; actionId: string } },
) {
  return runActionCommandRoute(
    req,
    params,
    actionRouteParamsSchema,
    updateActionCommandSchema,
    'review_action_update',
    (routeParams, body) => ({
      p_review_id: routeParams.id,
      p_action_id: routeParams.actionId,
      p_expected_version: body.expectedVersion,
      p_title: body.title,
      p_description: body.description,
      p_action_type: body.actionType,
      p_owner_profile_id: body.ownerProfileId,
      p_due_date: body.dueDate,
    }),
    { requireActionId: true },
  );
}
