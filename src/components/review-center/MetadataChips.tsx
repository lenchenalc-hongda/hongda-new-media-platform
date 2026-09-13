import type { ReviewMetadataDto } from '@/lib/review-center/types';

interface MetadataChipsProps {
  metadata: ReviewMetadataDto | null;
}

function Chip({ label, primary = false }: { label: string; primary?: boolean }) {
  return (
    <span
      className={
        'inline-flex items-center rounded border px-2.5 py-0.5 text-xs '
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

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="mb-1.5 text-xs font-medium text-gray-500">{title}</h3>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

export default function MetadataChips({ metadata }: MetadataChipsProps) {
  if (!metadata) {
    return <p className="text-sm text-gray-500">尚未分类</p>;
  }

  const materialOther = metadata.materialOtherText;
  const processOther = metadata.processOtherText;
  const domainOther = metadata.problemDomainOtherText;
  const symptomOther = metadata.problemSymptomOtherText;

  const materialItems = metadata.materials.map(material => ({
    code: material.code,
    label: material.code === 'OTHER' && materialOther
      ? `其他：${materialOther}`
      : material.label,
    primary: material.isPrimary,
  }));

  const processItems = metadata.processes.map(item => ({
    code: item.code,
    label: item.code === 'OTHER' && processOther ? `其他：${processOther}` : item.label,
  }));

  const domainItems = metadata.problemDomains.map(item => ({
    code: item.code,
    label: item.code === 'OTHER' && domainOther ? `其他：${domainOther}` : item.label,
  }));

  const symptomItems = metadata.problemSymptoms.map(item => ({
    code: item.code,
    label: item.code === 'OTHER' && symptomOther ? `其他：${symptomOther}` : item.label,
  }));

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Section title="材质">
        {materialItems.length > 0 ? materialItems.map(item => (
          <Chip key={item.code} label={item.label} primary={item.primary} />
        )) : <span className="text-sm text-gray-400">未选择</span>}
      </Section>
      <Section title="工艺">
        {processItems.length > 0 ? processItems.map(item => (
          <Chip key={item.code} label={item.label} />
        )) : <span className="text-sm text-gray-400">未选择</span>}
      </Section>
      <Section title="问题环节">
        {domainItems.length > 0 ? domainItems.map(item => (
          <Chip key={item.code} label={item.label} />
        )) : <span className="text-sm text-gray-400">未选择</span>}
      </Section>
      <Section title="问题表现">
        {symptomItems.length > 0 ? symptomItems.map(item => (
          <Chip key={item.code} label={item.label} />
        )) : <span className="text-sm text-gray-400">未选择</span>}
      </Section>
    </div>
  );
}
