import type { GlhLifecycleState, GlhPriorityGrade } from './domain';

export interface GlhLeadListFilters {
  lifecycle?: GlhLifecycleState;
  grade?: GlhPriorityGrade;
  ownerProfileId?: string;
  country?: string;
  due?: 'TODAY' | 'OVERDUE' | 'UPCOMING';
}

export interface GlhTodaySummary {
  newLeads: number;
  waitingForHuman: number;
  dueToday: number;
  newlyQualified: number;
  quotationFollowups: number;
  sampleFollowups: number;
  overdue: number;
  dormant: number;
}

export interface GlhLeadListItem {
  id: string;
  organizationId: string;
  ownerProfileId: string | null;
  lifecycle: GlhLifecycleState;
  grade: GlhPriorityGrade | null;
  country: string | null;
  nextFollowupAt: string | null;
}
