'use client';
import { useEffect, useState } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import PageHeader from '@/components/layout/PageHeader';
import AnalyticsSection from '@/app/review-center/analytics/analytics-section';
import { canViewManagementAnalytics } from '@/lib/review-center/analytics-presentation';

export default function AnalyticsPage() {
  const [meRole, setMeRole] = useState<string | null>(null);
  const [meReady, setMeReady] = useState(false);

  useEffect(() => {
    let active = true;
    fetch('/api/review-center/me')
      .then(response => response.json())
      .then(data => {
        if (active) setMeRole(typeof data.role === 'string' ? data.role : null);
      })
      .catch(() => {
        if (active) setMeRole(null);
      })
      .finally(() => {
        if (active) setMeReady(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const canView = meReady && canViewManagementAnalytics(meRole);

  return (
    <AppLayout>
      <PageHeader
        title="分析中心"
        description="查看复盘流转、改善行动和验证周期的历史变化"
      />

      {!meReady ? (
        <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-gray-500">
          加载中...
        </div>
      ) : canView ? (
        <AnalyticsSection />
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg p-8 text-center">
          <p className="text-gray-600 font-medium">分析中心仅向管理角色开放</p>
        </div>
      )}
    </AppLayout>
  );
}
