'use client';
import AppLayout from '@/components/layout/AppLayout';
import PageHeader from '@/components/layout/PageHeader';

export default function TestPage() {
  const x = 5;
  return (<AppLayout>
    <PageHeader title="test" />
    <div>hello</div>
  </AppLayout>);
}
