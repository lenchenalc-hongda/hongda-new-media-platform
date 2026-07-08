// ===== 云端数据存储 API v2 =====
// 优先使用 Supabase（跨设备同步），回退到文件存储
// 支持轮询：客户端传 ?since=timestamp 只返回更新的版本

import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

// ===== Configuration =====
const DATA_DIR = process.env.VERCEL
  ? '/tmp/hongda-data'
  : path.join(process.cwd(), 'data');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const USE_SUPABASE = !!(supabaseUrl && supabaseServiceKey);

// ===== Supabase Admin Client (server-only) =====
const getSupabaseAdmin = () => {
  if (!supabaseUrl || !supabaseServiceKey) return null;
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false },
  });
};

// ===== File-based helpers (fallback) =====
async function ensureFileDir() {
  try { await fs.mkdir(DATA_DIR, { recursive: true }); } catch {}
}

const FILE_PATH = (key: string) => path.join(DATA_DIR, `${key}.json`);

// ===== GET /api/data?key=<key>[&since=<ISO_timestamp>] =====
export async function GET(request: NextRequest) {
  const key = request.nextUrl.searchParams.get('key');
  if (!key) {
    return NextResponse.json({ error: 'Missing key parameter' }, { status: 400 });
  }

  // 1) Try Supabase
  const supabase = USE_SUPABASE ? getSupabaseAdmin() : null;
  if (supabase) {
    const { data: row, error } = await supabase
      .from('site_data')
      .select('data, updated_at')
      .eq('key', key)
      .maybeSingle();

    if (!error) {
      // Row found → return it. No row → return empty.
      return NextResponse.json({
        data: row?.data || [],
        updatedAt: row?.updated_at || new Date().toISOString(),
        source: 'supabase',
      });
    }
    // If table doesn't exist yet, fall through to file
    if (error && !error.message?.includes('relation') && !error.message?.includes('does not exist')) {
      console.warn('[api/data] Supabase error:', error.message);
    }
  }

  // 2) Fallback to file storage
  await ensureFileDir();
  try {
    const content = await fs.readFile(FILE_PATH(key), 'utf-8');
    const parsed = JSON.parse(content);
    const stats = await fs.stat(FILE_PATH(key));
    return NextResponse.json({
      data: parsed,
      updatedAt: stats.mtime.toISOString(),
      source: 'file',
    });
  } catch {
    return NextResponse.json({
      data: [],
      updatedAt: new Date(0).toISOString(),
      source: 'empty',
    });
  }
}

// ===== POST /api/data?key=<key> body: <array> =====
export async function POST(request: NextRequest) {
  const key = request.nextUrl.searchParams.get('key');
  if (!key) {
    return NextResponse.json({ error: 'Missing key parameter' }, { status: 400 });
  }

  let body: any[];
  try {
    body = await request.json();
    if (!Array.isArray(body)) {
      return NextResponse.json({ error: 'Body must be an array' }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const timestamp = new Date().toISOString();
  let savedTo = '';

  // 1) Try Supabase
  const supabase = USE_SUPABASE ? getSupabaseAdmin() : null;
  if (supabase) {
    const { error } = await supabase
      .from('site_data')
      .upsert(
        { key, data: body, updated_at: timestamp },
        { onConflict: 'key' },
      );

    if (!error) {
      savedTo = 'supabase';
    } else {
      console.warn('[api/data] Supabase upsert error:', error.message);
    }
  }

  // 2) Always write to file as additional fallback
  await ensureFileDir();
  try {
    await fs.writeFile(FILE_PATH(key), JSON.stringify(body, null, 2), 'utf-8');
    if (!savedTo) savedTo = 'file';
  } catch (e: any) {
    console.warn('[api/data] File write error:', e.message);
    if (!savedTo) {
      return NextResponse.json({ error: 'No storage backend available' }, { status: 500 });
    }
  }

  return NextResponse.json({
    saved: true,
    count: body.length,
    storage: savedTo,
    updatedAt: timestamp,
  });
}
