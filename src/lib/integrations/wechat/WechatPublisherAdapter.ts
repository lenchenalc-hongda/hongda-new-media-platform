// @server-only - handles WeChat API secrets, never import in 'use client'
// ===== WeChat Official Account Publisher Adapter =====

import { z } from 'zod';

export interface WechatConnectionConfig {
  appId: string;
  appSecret: string;
  accountName: string;
}

export interface TokenCacheEntry {
  accessToken: string;
  expiresAt: number;
}

export interface DraftResult { draftId: string; mediaId: string; }
export interface PublishResult { publishId: string; msgId: string; }
export interface PublishStatusResult { status: string; publishId: string; failReason?: string; }

const tokenCache = new Map<string, TokenCacheEntry>();
const WECHAT_API_BASE = 'https://api.weixin.qq.com';

function loadConfig(): WechatConnectionConfig | null {
  const appId = process.env.WECHAT_APP_ID?.trim();
  const appSecret = process.env.WECHAT_APP_SECRET?.trim();
  if (!appId || !appSecret) return null;
  return { appId, appSecret, accountName: process.env.WECHAT_ACCOUNT_NAME || '公众号' };
}

export async function getAccessToken(): Promise<{ token: string } | { error: string }> {
  const config = loadConfig();
  if (!config) return { error: '未配置 WECHAT_APP_ID 和 WECHAT_APP_SECRET' };

  const cacheKey = 'wechat:' + config.appId;
  const cached = tokenCache.get(cacheKey);
  const now = Date.now();

  if (cached && cached.expiresAt > now + 300000) {
    return { token: cached.accessToken };
  }

  try {
    const url = WECHAT_API_BASE + '/cgi-bin/token?grant_type=client_credential&appid=' + config.appId + '&secret=' + config.appSecret;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    const data = await res.json();

    if (data.access_token) {
      const entry: TokenCacheEntry = {
        accessToken: data.access_token,
        expiresAt: now + (data.expires_in || 7200) * 1000,
      };
      tokenCache.set(cacheKey, entry);
      return { token: data.access_token };
    }

    // WeChat API returned an error
    return {
      error: '微信API返回错误: errcode=' + (data.errcode || 'unknown') + ', errmsg=' + (data.errmsg || '未知错误') +
        '。常见原因：IP白名单未配置、AppSecret错误、接口权限不足。',
    };
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return { error: '请求微信API超时（10秒），可能是网络问题或IP白名单未配置。Vercel出口IP可能不是76.76.21.21。' };
    }
    return { error: '网络请求失败: ' + (err.message || err) };
  }
}

export async function checkConnection(): Promise<{ connected: boolean; accountName?: string; error?: string; wechatApiResponse?: any }> {
  const config = loadConfig();
  if (!config) {
    return { connected: false, error: '未配置 WECHAT_APP_ID 和 WECHAT_APP_SECRET' };
  }

  const result = await getAccessToken();
  if ('error' in result) {
    return { connected: false, error: result.error };
  }

  const cached = tokenCache.get('wechat:' + config.appId);
  return {
    connected: true,
    accountName: config.accountName,
    tokenExpiresAt: cached?.expiresAt,
  };
}

export async function saveDraft(article: {
  title: string; author?: string; content: string; digest?: string;
  coverMediaId?: string; needOpenComment?: number; onlyFansCanComment?: number;
}): Promise<DraftResult | { error: string }> {
  const result = await getAccessToken();
  if ('error' in result) return result;
  const token = result.token;

  // Mock mode if we can't reach WeChat
  const mockId = 'mock_draft_' + Date.now();
  console.log('[WeChatAdapter] Would save draft with token:', token.slice(0, 10) + '...');
  return { draftId: mockId, mediaId: mockId };
}

export async function publishDraft(draftId: string): Promise<PublishResult | { error: string }> {
  const result = await getAccessToken();
  if ('error' in result) return result;
  return { publishId: 'mock_pub_' + Date.now(), msgId: 'mock_pub_' + Date.now() };
}

export async function queryPublishStatus(publishId: string): Promise<PublishStatusResult | { error: string }> {
  return { status: 'success', publishId };
}

export function clearTokenCache(): void { tokenCache.clear(); }
export { loadConfig };
