import { z } from 'zod';
import {
  profileDirectoryQuerySchema,
  type directoryPurposeSchema,
} from './schemas';

const directoryItemSchema = z.object({
  profile_id: z.string().uuid(),
  display_name: z.string(),
  role: z.enum(['admin', 'manager', 'operator', 'sales', 'viewer']),
  department: z.string().nullable(),
  assignment_eligible: z.boolean(),
}).strict();

export type DirectoryPurpose = z.infer<typeof directoryPurposeSchema>;

export interface ProfileDirectoryHttpResult {
  status: number;
  body: Record<string, unknown>;
}

export interface DirectoryRpcResult {
  data?: any;
  error?: { code?: string } | null;
}

export function parseProfileDirectoryQuery(
  searchParams: URLSearchParams,
): { success: true; data: { purpose: DirectoryPurpose } } | { success: false } {
  const purposes = searchParams.getAll('purpose');
  if (purposes.length !== 1) return { success: false };

  const query = Object.fromEntries(searchParams.entries());
  const parsed = profileDirectoryQuerySchema.safeParse(query);
  if (!parsed.success) return { success: false };
  return { success: true, data: parsed.data };
}

export async function callProfileDirectory(
  client: any,
  purpose: DirectoryPurpose,
): Promise<DirectoryRpcResult> {
  return client.rpc('review_profile_directory', { p_purpose: purpose });
}

export function mapProfileDirectoryResult(result: DirectoryRpcResult): ProfileDirectoryHttpResult {
  if (result.error) {
    return {
      status: 500,
      body: { ok: false, code: 'INTERNAL', message: 'Unable to load profile directory', data: null },
    };
  }

  const envelope = result.data;
  if (!envelope || typeof envelope !== 'object') {
    return {
      status: 500,
      body: { ok: false, code: 'INTERNAL', message: 'Unable to load profile directory', data: null },
    };
  }

  if (envelope.ok !== true || envelope.code !== 'OK') {
    const code = typeof envelope.code === 'string' ? envelope.code : 'UNKNOWN';
    if (code === 'INVALID_PURPOSE') {
      return {
        status: 400,
        body: { ok: false, code, message: 'Invalid directory purpose', data: null },
      };
    }
    if (code === 'FORBIDDEN') {
      return {
        status: 403,
        body: { ok: false, code, message: 'Forbidden', data: null },
      };
    }
    return {
      status: 500,
      body: { ok: false, code: 'INTERNAL', message: 'Unable to load profile directory', data: null },
    };
  }

  const items = envelope.data?.items;
  if (!Array.isArray(items)) {
    return {
      status: 500,
      body: { ok: false, code: 'INTERNAL', message: 'Unable to load profile directory', data: null },
    };
  }

  const parsedItems: unknown[] = [];
  for (const item of items) {
    const parsed = directoryItemSchema.safeParse(item);
    if (!parsed.success) {
      return {
        status: 500,
        body: { ok: false, code: 'INTERNAL', message: 'Unable to load profile directory', data: null },
      };
    }
    parsedItems.push(parsed.data);
  }

  return {
    status: 200,
    body: {
      ok: true,
      code: 'OK',
      message: typeof envelope.message === 'string' ? envelope.message : 'success',
      data: { items: parsedItems },
    },
  };
}
