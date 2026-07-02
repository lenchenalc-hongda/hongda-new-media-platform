# 宏达新媒体作战中台

广东宏达印业内部新媒体运营管理系统。帮助团队围绕视频号和抖音账号做好账号分析、选题策划、脚本生成、爆款拆解、内容复盘和线索整理。

## 快速开始

```bash
pnpm install
pnpm dev
```

访问 http://localhost:3000

## 环境变量

复制 `.env.local` 配置：
- `OPENAI_API_KEY` - OpenAI API Key（可选，无Key时AI功能返回Mock数据）
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase URL（可选，默认使用Mock数据）
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase匿名Key

## 项目说明

- **MVP版本**：所有数据基于内存Mock数据，刷新页面重置
- **演示登录**：任意邮箱+密码，登录页自动填充演示账号
- **AI功能**：无API Key时返回Mock结果，前端可正常演示

## 文档

详见 [docs/](/docs) 目录：
- [产品框架](docs/PRODUCT_FRAMEWORK.md)
- [数据库Schema](docs/DATABASE_SCHEMA.md)
- [AI提示词](docs/AI_PROMPTS.md)
- [安装配置](docs/SETUP.md)
- [验收清单](docs/MVP_CHECKLIST.md)

## 技术栈

Next.js 14 + TypeScript + Tailwind CSS + Supabase + OpenAI
