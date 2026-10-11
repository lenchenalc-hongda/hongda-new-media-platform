import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import {
  GlhMutationError,
  assignGlhLead,
  queueGlhHumanMessage,
  takeOverGlhConversation,
} from '@/lib/global-lead-hub/mutations';
import { resolveGlhAccessContext } from '@/lib/global-lead-hub/server';

export const dynamic = 'force-dynamic';

const actionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('TAKE_OVER'),
    conversationId: z.string().uuid(),
    leadId: z.string().uuid(),
    expectedMode: z.enum(['AI_ACTIVE', 'HANDOFF_PENDING']),
    expectedLeadVersion: z.number().int().positive(),
    reason: z.string().trim().max(500).nullable().optional(),
  }).strict(),
  z.object({
    action: z.literal('TRANSFER'),
    leadId: z.string().uuid(),
    assigneeProfileId: z.string().uuid(),
    expectedVersion: z.number().int().positive(),
    reason: z.string().trim().min(1).max(500),
  }).strict(),
  z.object({
    action: z.literal('QUEUE_HUMAN_MESSAGE'),
    conversationId: z.string().uuid(),
    leadId: z.string().uuid(),
    conversationMode: z.literal('HUMAN_ACTIVE'),
    text: z.string().trim().min(1).max(4000),
    idempotencyKey: z.string().trim().min(8).max(200),
  }).strict(),
]);

function jsonError(message: string, status: number, code: string) {
  return NextResponse.json({ ok: false, error: message, code }, { status });
}

export async function POST(request: NextRequest) {
  const access = await resolveGlhAccessContext();
  if (!access.ok) {
    return access.code === 'UNAUTHENTICATED'
      ? jsonError('Authentication required', 401, access.code)
      : jsonError('Access denied', 403, access.code);
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return jsonError('Request body must be valid JSON', 400, 'INVALID_JSON');
  }
  const parsed = actionSchema.safeParse(raw);
  if (!parsed.success) return jsonError('Inbox action is invalid', 400, 'INVALID_INPUT');

  const client = await createClient();
  if (!client) return jsonError('Database unavailable', 500, 'DATABASE_UNAVAILABLE');

  try {
    const action = parsed.data;
    const data = action.action === 'TAKE_OVER'
      ? await takeOverGlhConversation(client, access.context, action)
      : action.action === 'TRANSFER'
        ? await assignGlhLead(client, access.context, action.leadId, {
          assigneeProfileId: action.assigneeProfileId,
          expectedVersion: action.expectedVersion,
          reason: action.reason,
        })
        : await queueGlhHumanMessage(client, access.context, action);
    return NextResponse.json({ ok: true, data });
  } catch (error) {
    if (error instanceof GlhMutationError) {
      return jsonError(error.message, error.status, error.code);
    }
    return jsonError('Inbox action failed closed', 500, 'MUTATION_FAILED');
  }
}
