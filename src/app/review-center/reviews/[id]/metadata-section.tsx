import { useState } from 'react';
import MetadataChips from '@/components/review-center/MetadataChips';
import MetadataEditor from '@/components/review-center/MetadataEditor';
import { canEditMetadata } from '@/lib/review-center/metadata-editor';
import type { ReviewDetail, ReviewMetadataDto } from '@/lib/review-center/types';

interface MetadataSectionProps {
  review: ReviewDetail;
  me: { role: string | null; profile_id: string | null } | null;
  onMetadataUpdated: (version: number, metadata: ReviewMetadataDto) => void;
}

export default function MetadataSection({
  review,
  me,
  onMetadataUpdated,
}: MetadataSectionProps) {
  const [editing, setEditing] = useState(false);
  const canCorrect = (
    review.status === 'submitted' || review.status === 'closed'
  ) && canEditMetadata({
    status: review.status,
    role: me?.role ?? null,
    currentProfileId: me?.profile_id ?? null,
    ownerId: review.owner_id,
    pmoId: review.pmo_id,
  });

  return (
    <section id="metadata" className="mb-5 rounded-lg border border-gray-200 bg-white p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-800">项目分类</h2>
          <p className="mt-1 text-xs text-gray-500">材质、工艺、问题环节与问题表现</p>
        </div>
        {canCorrect && !editing && (
          <button type="button" className="btn-secondary" onClick={() => setEditing(true)}>
            修正分类
          </button>
        )}
      </div>

      {editing && canCorrect ? (
        <MetadataEditor
          reviewId={review.id}
          initialMetadata={review.metadata}
          status={review.status}
          reviewType={review.review_type}
          expectedVersion={review.version}
          currentRole={me?.role ?? null}
          currentProfileId={me?.profile_id ?? null}
          ownerId={review.owner_id}
          pmoId={review.pmo_id}
          onSaved={(version, metadata) => {
            setEditing(false);
            onMetadataUpdated(version, metadata);
          }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <MetadataChips metadata={review.metadata} />
      )}
    </section>
  );
}
