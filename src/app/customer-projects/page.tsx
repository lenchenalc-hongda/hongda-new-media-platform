'use client';
import AppLayout from '@/components/layout/AppLayout';
import PageHeader from '@/components/layout/PageHeader';
import ReviewCenterEmpty from '@/components/review-center/ReviewCenterEmpty';

function FoundationCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-6">
      <h2 className="text-base font-semibold text-gray-800">{title}</h2>
      {description && <p className="mt-1 text-sm text-gray-500">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export default function CustomerProjectsPage() {
  return (
    <AppLayout>
      <PageHeader
        title="客户项目中心"
        description="每天推进客户与项目，减少重复记录，让下一步更清楚。"
      />

      <div className="space-y-5">
        <FoundationCard title="今日工作">
          <ReviewCenterEmpty
            title="当前尚未接入项目任务数据。"
            description="未来这里展示客户承诺、今日到期、逾期事项、等待内部和重点项目。"
          />
        </FoundationCard>

        <FoundationCard
          title="快速记录"
          description="后续可以用一句话记录客户和项目的重要变化，AI 会先整理成草稿，确认后再写入正式项目数据。"
        >
          <div className="flex items-center gap-3">
            <button type="button" className="btn-primary" disabled>
              快速记录
            </button>
            <span className="text-sm text-gray-400">即将开放</span>
          </div>
        </FoundationCard>

        <FoundationCard title="需要关注">
          <ReviewCenterEmpty
            title="暂无可展示的项目异常。"
            description="未来这里关注长期停滞、等待内部、客户承诺到期和重点项目风险。"
          />
        </FoundationCard>

        <FoundationCard title="今天的业务摘要">
          <ReviewCenterEmpty
            title="业务数据接入后自动生成，不要求员工重复填写日报。"
          />
        </FoundationCard>
      </div>
    </AppLayout>
  );
}
