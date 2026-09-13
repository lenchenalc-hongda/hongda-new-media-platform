'use client';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { MOCK_AUTH_USERS, serializeUser } from '@/lib/auth/roles';
import type { AuthMode } from '@/lib/auth/types';

export default function LoginForm({ mode }: { mode: AuthMode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirect') || '/workspace-home';
  const configError = searchParams.get('error') === 'auth_config_missing';

  const [selectedUser, setSelectedUser] = useState(MOCK_AUTH_USERS[2].id);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleMockLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const user = MOCK_AUTH_USERS.find(u => u.id === selectedUser);
    if (!user) return;
    localStorage.setItem('nmc_user', JSON.stringify(user));
    const cookieValue = serializeUser(user);
    document.cookie = `nmc_user=${cookieValue}; path=/; max-age=86400; SameSite=Lax`;
    router.push(redirectTo);
  };

  const handleSupabaseLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, redirect: redirectTo }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || '登录失败，请检查邮箱和密码');
        return;
      }
      router.push(data.redirect || redirectTo);
      router.refresh();
    } catch {
      setError('网络错误，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white rounded-lg shadow-md p-8 w-full max-w-md">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-gray-800">宏达新媒体作战中台</h1>
          <p className="text-sm text-gray-500 mt-1">广东宏达印业内部管理系统</p>
          <p className="text-[10px] text-gray-400 mt-2">
            {mode === 'supabase' ? '🔐 正式认证模式（Supabase Auth）' : '🧪 开发兼容模式（Mock，非审计身份）'}
          </p>
        </div>

        {configError && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
            系统认证配置缺失：AUTH_MODE=supabase 但 Supabase 环境变量未配置，请联系管理员。
          </div>
        )}

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
            {error}
          </div>
        )}

        {mode === 'supabase' ? (
          <form onSubmit={handleSupabaseLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">邮箱</label>
              <input
                type="email"
                className="input-field"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@hongda.com"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">密码</label>
              <input
                type="password"
                className="input-field"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>
            <button type="submit" className="btn-primary w-full" disabled={loading}>
              {loading ? '登录中...' : '登录'}
            </button>
            <p className="text-xs text-gray-400 text-center">登录后系统将从服务端读取可信身份和角色。</p>
          </form>
        ) : (
          <form onSubmit={handleMockLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">选择测试用户（角色）</label>
              <div className="space-y-2">
                {MOCK_AUTH_USERS.map(u => (
                  <label
                    key={u.id}
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      selectedUser === u.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                    }`}
                    onClick={() => setSelectedUser(u.id)}
                  >
                    <input
                      type="radio"
                      name="user"
                      value={u.id}
                      checked={selectedUser === u.id}
                      onChange={() => setSelectedUser(u.id)}
                      className="w-4 h-4 text-blue-600"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-800">{u.full_name}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-gray-100 text-gray-700">
                          {u.role}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400">{u.email}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>
            <button type="submit" className="btn-primary w-full">演示登录</button>
            <p className="text-xs text-amber-600 text-center">⚠️ Mock 模式仅用于本地开发，不能作为正式审计身份。</p>
          </form>
        )}
      </div>
    </div>
  );
}
