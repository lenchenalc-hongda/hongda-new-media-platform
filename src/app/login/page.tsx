'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { MOCK_AUTH_USERS, serializeUser } from '@/lib/auth/roles';

export default function LoginPage() {
  const router = useRouter();
  const [selectedUser, setSelectedUser] = useState(MOCK_AUTH_USERS[2].id); // default: operator

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const user = MOCK_AUTH_USERS.find(u => u.id === selectedUser);
    if (!user) return;

    // Store in localStorage for client-side role checks
    localStorage.setItem('nmc_user', JSON.stringify(user));

    // Set cookie for middleware (expires in 24h)
    const cookieValue = serializeUser(user);
    document.cookie = `nmc_user=${cookieValue}; path=/; max-age=86400; SameSite=Lax`;

    router.push('/workspace-home');
  };

  const getRoleBadge = (role: string) => {
    const colors: Record<string, string> = {
      admin: 'bg-red-100 text-red-700',
      manager: 'bg-blue-100 text-blue-700',
      operator: 'bg-green-100 text-green-700',
      sales: 'bg-yellow-100 text-yellow-700',
      viewer: 'bg-gray-100 text-gray-500',
    };
    return colors[role] || 'bg-gray-100';
  };

  const getRoleLabel = (role: string) => {
    const labels: Record<string, string> = {
      admin: '管理员', manager: '管理者', operator: '运营', sales: '销售', viewer: '只读',
    };
    return labels[role] || role;
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white rounded-lg shadow-md p-8 w-full max-w-md">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-gray-800">宏达新媒体作战中台</h1>
          <p className="text-sm text-gray-500 mt-1">广东宏达印业内部管理系统</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">选择测试用户（角色）</label>
            <div className="space-y-2">
              {MOCK_AUTH_USERS.map(u => (
                <label
                  key={u.id}
                  className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    selectedUser === u.id
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
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
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${getRoleBadge(u.role)}`}>
                        {getRoleLabel(u.role)}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400">{u.email}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <button type="submit" className="btn-primary w-full py-2.5">
            登录系统
          </button>

          <p className="text-xs text-gray-400 text-center mt-3 leading-relaxed">
            MVP演示模式<br />
            选择不同角色登录后，可验证页面访问权限差异
          </p>
        </form>
      </div>
    </div>
  );
}
