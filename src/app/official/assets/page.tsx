'use client';
import AppLayout from '@/components/layout/AppLayout';
import PageHeader from '@/components/layout/PageHeader';
import EmptyState from '@/components/ui/EmptyState';

export default function OfficialPage() {
  return (
    <AppLayout>
      <PageHeader title="公众号" description="微信公众号管理模块" />
      <EmptyState title="功能开发中" description="此模块将在后续版本实现" />
    </AppLayout>
  );
}
