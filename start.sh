#!/bin/bash
# 宏达新媒体作战中台 - 生产模式启动脚本
# 先执行 pnpm build，然后 pnpm start

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
NODE_BIN="/Users/lenchen/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin"
PNPM_BIN="/Users/lenchen/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin"

export PATH="$NODE_BIN:$PNPM_BIN:$PATH"
cd "$PROJECT_DIR"

echo "📦 构建项目..."
pnpm build

echo "🚀 启动生产服务器..."
echo "🌐 http://localhost:3000"
pnpm start
