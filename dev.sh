#!/bin/bash
# 宏达新媒体作战中台 - 开发服务器启动脚本
# Usage: bash dev.sh

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
NODE_BIN="/Users/lenchen/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin"
PNPM_BIN="/Users/lenchen/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin"

echo "🚀 启动宏达新媒体作战中台..."
echo "📂 项目目录: $PROJECT_DIR"

# 设置 PATH 以包含 bundled node 和 pnpm
export PATH="$NODE_BIN:$PNPM_BIN:$PATH"

cd "$PROJECT_DIR"

# 检查 node
if ! command -v node &> /dev/null; then
  echo "❌ 错误: 找不到 Node.js"
  echo "请安装 Node.js 18+ 或使用 Codex 环境"
  exit 1
fi

echo "✅ Node.js: $(node -v)"
echo "✅ pnpm: $(pnpm -v)"
echo ""
echo "🌐 打开浏览器访问: http://localhost:3000"
echo ""

# 启动开发服务器
pnpm dev
echo "请在终端执行: cd $(pwd) && node node_modules/next/dist/bin/next dev -p 3000"
