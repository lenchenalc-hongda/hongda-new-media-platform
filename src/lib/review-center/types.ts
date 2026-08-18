export type ReviewType = 'A' | 'B' | 'C';

export type ReviewStatus =
  | 'draft'
  | 'submitted'
  | 'in_review'
  | 'action_required'
  | 'verifying'
  | 'closed'
  | 'archived'
  | 'rejected'
  | 'cancelled';

export type RiskLevel = 'RED' | 'YELLOW' | 'GREEN';

export interface ReviewListItem {
  id: string;
  review_no: string;
  review_type: ReviewType;
  title: string;
  status: ReviewStatus;
  risk_level: RiskLevel | null;
  customer_name: string | null;
  project_name: string | null;
  product_name: string | null;
  owner_id: string;
  occurred_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReviewListQuery {
  page: number;
  limit: number;
  status?: ReviewStatus;
  review_type?: ReviewType;
  risk_level?: RiskLevel;
  q?: string;
}

export interface ReviewListResponse {
  items: ReviewListItem[];
  page: number;
  limit: number;
  total: number;
}

export interface ReviewMemberItem {
  id: string;
  profile_id: string;
  member_role: string;
  is_primary: boolean;
  created_at: string;
}

export interface ReviewDetail {
  id: string;
  org_id: string;
  review_no: string;
  review_type: ReviewType;
  title: string;
  status: ReviewStatus;
  risk_level: RiskLevel | null;
  risk_reason: string | null;
  occurred_at: string | null;
  customer_name: string | null;
  order_no: string | null;
  project_name: string | null;
  product_name: string | null;
  process_name: string | null;
  description: string | null;
  impact_summary: string | null;
  created_by: string;
  owner_id: string;
  pmo_id: string | null;
  closed_at: string | null;
  closed_by: string | null;
  close_override_reason: string | null;
  report_generated_at: string | null;
  archived_at: string | null;
  version: number;
  created_at: string;
  updated_at: string;
  type_details: Record<string, unknown> | null;
  members: ReviewMemberItem[];
}

export interface CreateDraftInput {
  review_type: ReviewType;
  title: string;
  occurred_at?: string | null;
  customer_name?: string | null;
  order_no?: string | null;
  project_name?: string | null;
  product_name?: string | null;
  process_name?: string | null;
  description?: string | null;
  impact_summary?: string | null;
  risk_level?: RiskLevel | null;
  risk_reason?: string | null;
}
