'use client';
import AppLayout from '@/components/layout/AppLayout';
import PageHeader from '@/components/layout/PageHeader';

export default function OaPage() {
  return (
    <AppLayout>
      <PageHeader title="公众号" description="微信公众号管理模块 — 开发中" />
      <div className="flex items-center justify-center py-20 text-gray-400 text-sm">
        <div className="text-center">
          <p className="text-5xl mb-4">🚧</p>
          <p className="text-gray-500">此页面将在后续版本完善</p>
        </div>
      </div>
    </AppLayout>
  );
}
