'use client';
import AppLayout from '@/components/layout/AppLayout';
import PageHeader from '@/components/layout/PageHeader';
import { MOCK_ACCOUNTS } from '@/lib/constants/mock-data';

export default function ScriptsPage() {
  const scripts: any[] = [];
  const accounts = MOCK_ACCOUNTS;
  
  return (
    <AppLayout>
      <PageHeader title="脚本工厂" description="新媒体脚本生产工作台" />
      <div className="p-4">
        <p>脚本数量: {scripts.length}</p>
        <p>账号数量: {accounts.length}</p>
      </div>
    </AppLayout>
  );
}
