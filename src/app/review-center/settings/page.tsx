'use client';
import { useEffect, useState } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import PageHeader from '@/components/layout/PageHeader';
import ReviewCenterEmpty from '@/components/review-center/ReviewCenterEmpty';

interface AuthUser {
  id: string;
  full_name: string;
  email: string;
  role: string;
}

export default function ReviewSettingsPage() {
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('nmc_user');
      setUser(raw ? JSON.parse(raw) : null);
    } catch {}
  }, []);

  const isAdmin = user?.role === 'admin';

  return (
    <AppLayout>
      <PageHeader title="项目复盘与改善中心系统设置" description="管理严重等级、损失阈值、问题类型、审核规则和系统配置。" />
      {isAdmin ? (
        <ReviewCenterEmpty
          title="当前阶段暂不开放配置"
          description="后续用于管理严重等级、损失阈值、问题类型、审核规则和系统配置。"
        />
      ) : (
        <ReviewCenterEmpty
          title="无权限"
          description="系统设置仅管理员可访问。"
        />
      )}
    </AppLayout>
  );
}
