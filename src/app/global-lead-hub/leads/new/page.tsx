import Link from 'next/link';
import { redirect } from 'next/navigation';
import AppLayout from '@/components/layout/AppLayout';
import PageHeader from '@/components/layout/PageHeader';
import LeadForm from '@/components/global-lead-hub/LeadForm';
import ProductionManualLeadForm from '@/components/global-lead-hub/ProductionManualLeadForm';
import {
  loadGlhAssignableProfiles,
  resolveGlhAccessContext,
} from '@/lib/global-lead-hub/server';
import { getGlhManualCreationGuard } from '@/lib/global-lead-hub/validation';

export const dynamic = 'force-dynamic';

export default async function GlobalLeadHubNewLeadPage() {
  const access = await resolveGlhAccessContext();
  if (!access.ok) {
    if (access.code === 'UNAUTHENTICATED') {
      redirect('/login?redirect=%2Fglobal-lead-hub%2Fleads%2Fnew');
    }
    redirect('/dashboard?error=global_lead_hub_access_denied');
  }

  const guard = getGlhManualCreationGuard();
  const canAssign = access.context.role === 'ADMIN' || access.context.role === 'MANAGER';
  const profiles = canAssign
    ? await loadGlhAssignableProfiles(access.context)
    : { ok: true as const, data: [] };
  const assignableProfiles = profiles.ok ? profiles.data : [];

  return (
    <AppLayout>
      <PageHeader
        title="新增外贸线索"
        description="内部手工建档 · 保留客户来源、负责人和操作记录，绝不自动发送消息。"
      />

      <nav aria-label="Global Lead Hub sections" className="mb-4 flex gap-3 text-xs">
        <Link href="/global-lead-hub" className="text-gray-500 hover:text-gray-900">Today</Link>
        <Link href="/global-lead-hub/leads" className="text-gray-500 hover:text-gray-900">Leads</Link>
        <Link href="/global-lead-hub/tasks" className="text-gray-500 hover:text-gray-900">My Tasks</Link>
      </nav>

      {!profiles.ok ? (
        <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          负责人列表暂时无法读取；请稍后再试。不会在权限资料缺失时提交归属。
        </div>
      ) : (
        <ProductionManualLeadForm assignableProfiles={assignableProfiles} />
      )}

      {guard.allowed && (
        <details className="mt-8 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <summary className="cursor-pointer text-xs font-semibold text-amber-900">
            开发环境专用：旧版测试线索入口
          </summary>
          <p className="my-3 text-xs text-amber-900">
            此入口仍受原有的 test/dev API 和 PostgreSQL 双重保护，Production 永不启用。
          </p>
          <LeadForm assignableProfiles={assignableProfiles} />
        </details>
      )}
    </AppLayout>
  );
}
