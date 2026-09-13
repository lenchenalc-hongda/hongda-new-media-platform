'use client';
import AppLayout from '@/components/layout/AppLayout';
import PageHeader from '@/components/layout/PageHeader';
import ReviewCenterEmpty from './ReviewCenterEmpty';

interface ReviewSectionPageProps {
  title: string;
  description?: string;
  emptyTitle: string;
  emptyDescription?: string;
  action?: { label: string; href: string };
}

export default function ReviewSectionPage({
  title, description, emptyTitle, emptyDescription, action,
}: ReviewSectionPageProps) {
  return (
    <AppLayout>
      <PageHeader title={title} description={description} />
      <ReviewCenterEmpty title={emptyTitle} description={emptyDescription} action={action} />
    </AppLayout>
  );
}
