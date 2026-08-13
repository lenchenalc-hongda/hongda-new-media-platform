// ===== Login Page (server wrapper) =====
import { Suspense } from 'react';
import { getAuthMode } from '@/lib/auth/types';
import LoginForm from './LoginForm';

export default function LoginPage() {
  const mode = getAuthMode();
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-gray-100 text-gray-400">加载中...</div>}>
      <LoginForm mode={mode} />
    </Suspense>
  );
}
