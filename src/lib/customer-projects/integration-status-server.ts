import type { CpcProfile } from './api';
import {
  buildCpcIntegrationStatusSnapshot,
  canReadIntegrationStatus,
  type CpcIntegrationReuseStatus,
  type CpcIntegrationStatusSnapshot,
} from './integration-registry';

export type CpcIntegrationStatusResult =
  | {
      ok: true;
      snapshot: CpcIntegrationStatusSnapshot;
    }
  | {
      ok: false;
      status: number;
      message: string;
    };

async function probeInternalReadAvailability(
  client: any,
  table: 'review_cases' | 'knowledge_cards',
  orgId: string,
  reuseKind: 'review_center' | 'knowledge',
): Promise<CpcIntegrationReuseStatus> {
  try {
    const result = await client
      .from(table)
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId);

    if (result?.error) {
      return {
        kind: reuseKind,
        state: 'unknown',
        readOnly: true,
        detail: 'Same-organization availability could not be verified.',
      };
    }

    return {
      kind: reuseKind,
      state: 'available',
      readOnly: true,
      detail: typeof result?.count === 'number'
        ? `${result.count} same-organization records are readable.`
        : 'The same-organization read boundary is available.',
    };
  } catch {
    return {
      kind: reuseKind,
      state: 'unknown',
      readOnly: true,
      detail: 'Same-organization availability could not be verified.',
    };
  }
}

export async function readCpcIntegrationStatus(
  client: any,
  profile: CpcProfile,
  generatedAt = new Date().toISOString(),
): Promise<CpcIntegrationStatusResult> {
  if (!canReadIntegrationStatus(profile.role)) {
    return {
      ok: false,
      status: 403,
      message: '无权查看集成状态',
    };
  }

  const [reviewCenter, knowledge] = await Promise.all([
    probeInternalReadAvailability(
      client,
      'review_cases',
      profile.orgId,
      'review_center',
    ),
    probeInternalReadAvailability(
      client,
      'knowledge_cards',
      profile.orgId,
      'knowledge',
    ),
  ]);

  const internalReuse: CpcIntegrationReuseStatus[] = [
    {
      kind: 'profiles_org_identity',
      state: 'available',
      readOnly: true,
      detail: 'profiles.id and profiles.org_id were resolved server-side.',
    },
    reviewCenter,
    knowledge,
  ];

  return {
    ok: true,
    snapshot: buildCpcIntegrationStatusSnapshot({
      generatedAt,
      internalReuse,
    }),
  };
}
