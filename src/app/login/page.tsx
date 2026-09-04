// ===== Login Page (server wrapper) =====
import { Suspense } from 'react';
import { AuthError, getAuthMode } from '@/lib/auth/types';
import LoginForm from './LoginForm';

export default function LoginPage() {
  let mode: 'mock' | 'supabase';
  try {
    mode = getAuthMode();
  } catch (err) {
    if (err instanceof AuthError && err.code === 'AUTH_CONFIG_MISSING') {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-100 px-4">
          <div className="bg-white rounded-lg shadow-md p-8 w-full max-w-md text-center">
            <h1 className="text-lg font-semibold text-gray-800">认证配置不可用</h1>
            <p className="text-sm text-gray-600 mt-2">
              请检查 AUTH_MODE 配置后重试。此页面不会提供演示身份登录。
            </p>
          </div>
        </div>
      );
    }
    throw err;
  }
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-gray-100 text-gray-400">加载中...</div>}>
      <LoginForm mode={mode} />
    </Suspense>
  );
}
