import type { PortalGroup } from '@/lib/constants/navigation';

const REVIEW_NEW_REVIEW_PATH = '/review-center/new';

export function applyCreateVisibility(
  groups: PortalGroup[],
  canCreateReview: boolean,
): PortalGroup[] {
  if (canCreateReview) return groups;
  return groups.map(group => (
    group.id === 'review'
      ? {
          ...group,
          items: group.items.filter(item => item.path !== REVIEW_NEW_REVIEW_PATH),
        }
      : group
  ));
}
