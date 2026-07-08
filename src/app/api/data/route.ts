// ===== 云端数据存储 API =====
// 读取/保存 JSON 数据到服务器文件系统
// 本地开发写入 ./data/ 目录
// Vercel 环境写入 /tmp/ 目录
// 数据在所有设备间同步

import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

const DATA_DIR = process.env.VERCEL ? '/tmp/hongda-data' : path.join(process.cwd(), 'data');

// Ensure the data directory exists
async function ensureDir() {
  try { await fs.mkdir(DATA_DIR, { recursive: true }); } catch {}
}

// GET /api/data?key=scripts → 返回该 key 的存储数据
export async function GET(request: NextRequest) {
  const key = request.nextUrl.searchParams.get('key');
  if (!key) return NextResponse.json({ error: 'Missing key parameter' }, { status: 400 });

  await ensureDir();
  const filePath = path.join(DATA_DIR, `${key}.json`);
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return NextResponse.json(JSON.parse(content));
  } catch {
    return NextResponse.json([]); // 文件不存在返回空数组
  }
}

// POST /api/data?key=scripts  body: [...data]  → 保存数据并返回
export async function POST(request: NextRequest) {
  const key = request.nextUrl.searchParams.get('key');
  if (!key) return NextResponse.json({ error: 'Missing key parameter' }, { status: 400 });

  await ensureDir();
  const filePath = path.join(DATA_DIR, `${key}.json`);
  try {
    const body = await request.json();
    await fs.writeFile(filePath, JSON.stringify(body, null, 2), 'utf-8');
    return NextResponse.json({ saved: true, count: Array.isArray(body) ? body.length : 1 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
