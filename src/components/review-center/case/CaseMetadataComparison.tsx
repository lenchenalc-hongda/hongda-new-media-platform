'use client';
import type { CaseAdminDetail } from '@/lib/review-center/case-schemas';
import { groupCurrentSourceMetadata } from '@/lib/review-center/case-manage';

interface CaseMetadataComparisonProps {
  admin: CaseAdminDetail;
}

function Tag({ label, primary = false }: { label: string; primary?: boolean }) {
  return (
    <span
      className={
        'inline-flex items-center rounded border px-2 py-0.5 text-xs '
        + (primary
          ? 'border-blue-200 bg-blue-50 text-blue-700'
          : 'border-gray-200 bg-gray-50 text-gray-700')
      }
    >
      {label}
      {primary && <span className="ml-1 text-[10px] text-blue-500">主要</span>}
    </span>
  );
}

function Group({ title, tags }: { title: string; tags: Array<{ label: string; primary?: boolean }> }) {
  return (
    <div>
      <h4 className="mb-1.5 text-xs font-medium text-gray-500">{title}</h4>
      <div className="flex flex-wrap gap-1.5">
        {tags.length > 0 ? tags.map((tag, index) => (
          <Tag key={`${title}:${tag.label}:${index}`} label={tag.label} primary={tag.primary} />
        )) : <span className="text-sm text-gray-400">未选择</span>}
      </div>
    </div>
  );
}

export default function CaseMetadataComparison({ admin }: CaseMetadataComparisonProps) {
  const current = groupCurrentSourceMetadata(admin.currentSourceMetadata);
  const snapshot = admin.caseSnapshotMetadata;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <section className="rounded-lg border border-gray-200 bg-white p-6">
        <h3 className="mb-4 font-medium text-gray-800">案例当前快照</h3>
        <div className="space-y-4">
          <Group
            title="材质"
            tags={snapshot.materials.map(item => ({ label: item.label, primary: item.isPrimary }))}
          />
          <Group title="工艺" tags={snapshot.processes.map(item => ({ label: item.label }))} />
          <Group title="问题环节" tags={snapshot.problemDomains.map(item => ({ label: item.label }))} />
          <Group title="问题表现" tags={snapshot.problemSymptoms.map(item => ({ label: item.label }))} />
        </div>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-6">
        <h3 className="mb-4 font-medium text-gray-800">来源复盘当前分类</h3>
        <div className="space-y-4">
          <Group
            title="材质"
            tags={current.materials.map(item => ({ label: item.label, primary: item.isPrimary }))}
          />
          <Group title="工艺" tags={current.processes.map(item => ({ label: item.label }))} />
          <Group title="问题环节" tags={current.problemDomains.map(item => ({ label: item.label }))} />
          <Group title="问题表现" tags={current.problemSymptoms.map(item => ({ label: item.label }))} />
        </div>
      </section>
    </div>
  );
}
