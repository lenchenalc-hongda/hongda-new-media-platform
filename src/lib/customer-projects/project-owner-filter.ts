/**
 * Ephemeral owner filter keys. Project ownership is keyed by profile ID on the
 * server, but no profile IDs need to be serialized to the project-list UI.
 */
export function buildProjectOwnerFilterKeys(
  projects: ReadonlyArray<{ ownerProfileId: string }>,
): Map<string, string> {
  const ownerIds = Array.from(new Set(projects.map(project => project.ownerProfileId))).sort();
  return new Map(ownerIds.map((id, index) => [id, `owner-${index + 1}`]));
}

export interface OwnerFilterableProject {
  ownerFilterKey?: string | null;
  ownerName: string | null;
}

export interface ProjectOwnerFilterOption {
  key: string;
  name: string;
  label: string;
  count: number;
}

export function buildProjectOwnerFilterOptions(
  projects: ReadonlyArray<OwnerFilterableProject>,
): ProjectOwnerFilterOption[] {
  const counts = new Map<string, { name: string; count: number }>();

  for (const project of projects) {
    if (!project.ownerFilterKey) continue;
    const existing = counts.get(project.ownerFilterKey);
    if (existing) {
      existing.count += 1;
    } else {
      counts.set(project.ownerFilterKey, {
        name: project.ownerName?.trim() || '姓名待确认',
        count: 1,
      });
    }
  }

  const sorted = Array.from(counts.entries())
    .map(([key, value]) => ({ key, ...value }))
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN') || a.key.localeCompare(b.key));

  // Two users can share a display name. Keep their filters separate.
  const totalByName = new Map<string, number>();
  for (const item of sorted) totalByName.set(item.name, (totalByName.get(item.name) ?? 0) + 1);
  const indexByName = new Map<string, number>();

  return sorted.map(item => {
    const ordinal = (indexByName.get(item.name) ?? 0) + 1;
    indexByName.set(item.name, ordinal);
    return {
      ...item,
      label: (totalByName.get(item.name) ?? 0) > 1
        ? `${item.name}（同名账号 ${ordinal}）`
        : item.name,
    };
  });
}

export function matchesProjectOwnerFilter(
  project: Pick<OwnerFilterableProject, 'ownerFilterKey'>,
  ownerKey: string,
): boolean {
  return ownerKey === 'all' || project.ownerFilterKey === ownerKey;
}
