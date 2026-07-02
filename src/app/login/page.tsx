'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('xiaochen@hongda.com');
  const [password, setPassword] = useState('123456');

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    // MVP: Simple mock login - in production, use Supabase Auth
    localStorage.setItem('nmc_user', JSON.stringify({
      id: 'u1', full_name: '小陈', role: 'operator', email, org_id: 'org_001'
    }));
    router.push('/dashboard');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white rounded-lg shadow-md p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-800">宏达新媒体作战中台</h1>
          <p className="text-sm text-gray-500 mt-2">广东宏达印业内部管理系统</p>
        </div>
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">邮箱</label>
            <input
              type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              className="input-field" placeholder="请输入邮箱" required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">密码</label>
            <input
              type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              className="input-field" placeholder="请输入密码" required
            />
          </div>
          <button type="submit" className="btn-primary w-full py-2.5">
            登录
          </button>
          <p className="text-xs text-gray-400 text-center mt-4">
            MVP版本 • 演示模式 • 点击即可登录
          </p>
        </form>
      </div>
    </div>
  );
}
