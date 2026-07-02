#!/bin/bash
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
NODE_BIN="/Users/lenchen/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"

echo "========================================="
echo "  宏达新媒体作战中台 - 启动脚本"
echo "========================================="
echo ""

# Kill any old server on port 3000
OLD_PID=$(/usr/sbin/lsof -ti :3000 2>/dev/null)
if [ -n "$OLD_PID" ]; then
  echo "🔄 正在停止旧服务进程 (PID: $OLD_PID)..."
  kill -9 $OLD_PID 2>/dev/null
  sleep 1
  echo "✅ 旧服务已停止"
  echo ""
fi

cd "$PROJECT_DIR"

# Verify node exists
if [ ! -f "$NODE_BIN" ]; then
  echo "❌ 找不到 Node.js"
  read -p "按回车退出..."
  exit 1
fi

# Verify build exists
if [ ! -f ".next/BUILD_ID" ]; then
  echo "📦 构建文件不完整，正在重新构建..."
  $NODE_BIN node_modules/next/dist/bin/next build
  echo "✅ 构建完成"
  echo ""
fi

echo "✅ Node.js: $($NODE_BIN -v)"
echo "✅ 项目目录: $(pwd)"
echo ""
echo "🌐 请打开浏览器访问:"
echo "   http://localhost:3000"
echo ""
echo "按 Ctrl+C 停止服务器"
echo "========================================="
echo ""

$NODE_BIN node_modules/next/dist/bin/next dev -p 3000
echo ""
echo "服务器已停止"
read -p "按回车关闭..."
