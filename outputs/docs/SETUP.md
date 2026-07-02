# 宏达新媒体作战中台 - 安装配置

## 环境要求
- Node.js 18+
- pnpm
- Supabase 项目（可选，MVP用mock数据即可运行）
- OpenAI API Key（可选，无Key时返回mock数据）

## 安装步骤

### 1. 安装依赖
```bash
pnpm install
```

### 2. 配置环境变量
复制 `.env.local` 文件并填写：
```
NEXT_PUBLIC_SUPABASE_URL=你的Supabase项目URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=你的Supabase匿名Key
SUPABASE_SERVICE_ROLE_KEY=你的Supabase Service Role Key
OPENAI_API_KEY=你的OpenAI API Key
OPENAI_MODEL=gpt-4o
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 3. 初始化数据库（使用Supabase时）
在Supabase SQL Editor中执行：
1. `supabase/migrations/001_initial_schema.sql` - 创建表结构
2. 可选：`supabase/seed.sql` - 插入种子数据

### 4. 启动开发服务器
```bash
pnpm dev
```

### 5. 访问系统
打开 http://localhost:3000
默认演示账号：admin@hongda.com / 任意密码

## 部署
```bash
pnpm build
pnpm start
```

## 注意事项
- 无OpenAI Key时，所有AI功能返回mock数据
- 无Supabase时，所有数据基于内存mock数据
- 第一版所有数据状态保存在内存中，刷新页面会重置
- 正式使用前请配置Supabase数据库和Auth
