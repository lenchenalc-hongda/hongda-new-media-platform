import AppLayout from '@/components/layout/AppLayout';
import PageHeader from '@/components/layout/PageHeader';
import IntegrationStatusPanel from '@/components/customer-projects/IntegrationStatusPanel';

export default function CustomerProjectSettingsPage() {
  return (
    <AppLayout>
      <PageHeader
        title="客户项目中心设置"
        description="只读查看 CPC 与现有权威来源之间的可用性、边界和待接入项。"
      />
      <IntegrationStatusPanel />
    </AppLayout>
  );
}
