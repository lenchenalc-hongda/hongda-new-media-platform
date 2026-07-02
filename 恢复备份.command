#!/bin/bash
# 将备份复制到桌面
SRC="/Users/lenchen/Documents/Codex/2026-06-29/4-ai-1-2-3-4/outputs/宏达新媒体作战中台_备份_20260629"
DST="/Users/lenchen/Desktop/宏达新媒体作战中台_备份_20260629"
if [ -d "$SRC" ]; then
  cp -r "$SRC" "$DST"
  echo "✅ 备份已复制到桌面"
  open "$DST"
else
  echo "❌ 找不到备份文件"
fi
