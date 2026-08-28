'use client';
import type { CaseAdminDetail } from '@/lib/review-center/case-schemas';
import { staleReasonLabel } from '@/lib/review-center/case-presentation';

interface CaseStaleWarningProps {
  admin: CaseAdminDetail;
}

export default function CaseStaleWarning({ admin }: CaseStaleWarningProps) {
  if (!admin.isStale) return null;

  return (
    <div className="mb-5 rounded-md border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800">
      <p className="font-medium">来源复盘已发生变化</p>
      <ul className="mt-2 list-disc pl-5">
        {admin.staleReasons.length > 0 ? (
          admin.staleReasons.map((reason, index) => (
            <li key={`${reason}:${index}`}>{staleReasonLabel(reason)}</li>
          ))
        ) : (
          <li>{staleReasonLabel(null)}</li>
        )}
      </ul>
      <p className="mt-2 text-xs text-yellow-700">
        案例快照来源版本 {admin.caseSourceReviewVersion}
        {admin.sourceCurrentVersion !== null ? ` · 当前来源版本 ${admin.sourceCurrentVersion}` : ''}
      </p>
    </div>
  );
}
