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
  scope?: 'all' | 'mine';
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

export interface ReviewParticipant {
  profile_id: string;
  display_name: string;
  role: 'admin' | 'manager' | 'operator' | 'sales' | 'viewer';
  department: string | null;
  is_active: boolean;
}

export interface ReviewMetadataMaterialDto {
  code: string;
  label: string;
  isPrimary: boolean;
}

export interface ReviewMetadataCodeDto {
  code: string;
  label: string;
}

export interface ReviewMetadataDto {
  materials: ReviewMetadataMaterialDto[];
  processes: ReviewMetadataCodeDto[];
  problemDomains: ReviewMetadataCodeDto[];
  problemSymptoms: ReviewMetadataCodeDto[];
  materialOtherText: string | null;
  processOtherText: string | null;
  problemDomainOtherText: string | null;
  problemSymptomOtherText: string | null;
}

export interface MetadataOptionDto {
  code: string;
  label: string;
  description: string | null;
  sortOrder: number;
}

export interface MetadataOptionsDto {
  materials: MetadataOptionDto[];
  processes: MetadataOptionDto[];
  problemDomains: MetadataOptionDto[];
  problemSymptoms: MetadataOptionDto[];
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
  submitted_at: string | null;
  submitted_by_profile_id: string | null;
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
  participants: ReviewParticipant[];
  metadata: ReviewMetadataDto | null;
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
