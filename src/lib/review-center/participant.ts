import { z } from 'zod';
import type { ReviewParticipant } from './types';

export const reviewParticipantSchema = z.object({
  profile_id: z.string().uuid(),
  display_name: z.string(),
  role: z.enum(['admin', 'manager', 'operator', 'sales', 'viewer']),
  department: z.string().nullable(),
  is_active: z.boolean(),
}).strict();

export class ParticipantReadError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ParticipantReadError';
    this.status = status;
  }
}

export function parseParticipantDirectoryResult(result: {
  data?: any;
  error?: { code?: string } | null;
}): ReviewParticipant[] {
  if (result.error) {
    throw new ParticipantReadError('复盘参与人读取失败', 500);
  }

  const envelope = result.data;
  if (!envelope || typeof envelope !== 'object') {
    throw new ParticipantReadError('复盘参与人读取失败', 500);
  }

  if (envelope.ok !== true || envelope.code !== 'OK') {
    const code = typeof envelope.code === 'string' ? envelope.code : 'UNKNOWN';
    if (code === 'FORBIDDEN') {
      throw new ParticipantReadError('复盘参与人读取失败', 403);
    }
    throw new ParticipantReadError('复盘参与人读取失败', 500);
  }

  const items = envelope.data?.items;
  if (!Array.isArray(items)) {
    throw new ParticipantReadError('复盘参与人读取失败', 500);
  }

  const participants: ReviewParticipant[] = [];
  for (const item of items) {
    const parsed = reviewParticipantSchema.safeParse(item);
    if (!parsed.success) {
      throw new ParticipantReadError('复盘参与人读取失败', 500);
    }
    participants.push(parsed.data);
  }

  return participants;
}
