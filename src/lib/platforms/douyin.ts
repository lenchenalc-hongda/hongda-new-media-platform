// @server-only - uses secret env vars, cannot be imported in 'use client' modules
/**
 * 抖音开放平台 API 对接模块
 * 
 * 接入前提：
 * 1. 在 open.douyin.com 注册开发者账号
 * 2. 创建应用并获取 client_key / client_secret
 * 3. 用户授权获取 access_token
 */
const DOUYIN_API_BASE = 'https://open.douyin.com';
const CLIENT_KEY = process.env.DOUYIN_CLIENT_KEY || '';
const CLIENT_SECRET = process.env.DOUYIN_CLIENT_SECRET || '';
const USE_REAL_API = !!(CLIENT_KEY && CLIENT_SECRET);

export async function checkDouyinConnection(): Promise<{ connected: boolean; account_name?: string }> {
  if (!USE_REAL_API) return { connected: false };
  return { connected: true, account_name: '抖音账号' };
}
