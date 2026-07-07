// @server-only - handles WeChat API secrets, never import in 'use client'
// ===== WeChat Official Account Publisher Adapter =====
// Encapsulates all WeChat API interactions behind a clean interface.
// Upper layers (pages, business logic) call only adapter methods.

import { z } from 'zod';

// ===== Types =====
export interface WechatConnectionConfig {
  appId: string;
  appSecret: string;
  accountName: string;
}

export interface TokenCacheEntry {
  accessToken: string;
  expiresAt: number; // epoch ms
}

export interface UploadMediaResult {
  mediaId: string;
  url: string;
}

export interface DraftResult {
  draftId: string;
  mediaId: string;
}

export interface PublishResult {
  publishId: string;
  msgId: string;
}

export interface PublishStatusResult {
  status: string; // 'pending' | 'success' | 'fail'
  publishId: string;
  failReason?: string;
}

// ===== In-memory token cache (per process) =====
// In production, this would be stored in DB table token_cache
const tokenCache = new Map<string, TokenCacheEntry>();

// ===== WeChat API base =====
const WECHAT_API_BASE = 'https://api.weixin.qq.com';

// ===== Schema for validating config from env =====
const ConfigSchema = z.object({
  appId: z.string().min(1, 'APP_ID is required'),
  appSecret: z.string().min(1, 'APP_SECRET is required'),
  accountName: z.string().default('公众号'),
});

// ===== Load config from environment =====
function loadConfig(): WechatConnectionConfig | null {
  const appId = process.env.WECHAT_APP_ID?.trim();
  const appSecret = process.env.WECHAT_APP_SECRET?.trim();
  if (!appId || !appSecret) return null;
  return { appId, appSecret, accountName: process.env.WECHAT_ACCOUNT_NAME || '公众号' };
}

// ===== Get access token with auto-refresh =====
export async function getAccessToken(): Promise<string | null> {
  const config = loadConfig();
  if (!config) return null;

  const cacheKey = `wechat:${config.appId}`;
  const cached = tokenCache.get(cacheKey);
  const now = Date.now();

  // Return cached token if still valid (with 5min buffer)
  if (cached && cached.expiresAt > now + 300000) {
    return cached.accessToken;
  }

  // Fetch new token
  try {
    const url = `${WECHAT_API_BASE}/cgi-bin/token?grant_type=client_credential&appid=${config.appId}&secret=${config.appSecret}`;
    const res = await fetch(url);
    const data = await res.json();

    if (data.access_token) {
      const entry: TokenCacheEntry = {
        accessToken: data.access_token,
        expiresAt: now + (data.expires_in || 7200) * 1000,
      };
      tokenCache.set(cacheKey, entry);
      console.log(`[WeChatAdapter] Token refreshed for ${config.appId}, expires in ${data.expires_in || 7200}s`);
      return data.access_token;
    }

    console.error('[WeChatAdapter] Failed to get token:', data.errmsg || data);
    return null;
  } catch (err: any) {
    console.error('[WeChatAdapter] Token request failed:', err.message);
    return null;
  }
}

// ===== Upload permanent media (cover image) =====
export async function uploadCover(
  imageUrl: string,
  title?: string
): Promise<UploadMediaResult | { error: string }> {
  const token = await getAccessToken();
  if (!token) return { error: 'No access token available. Check WECHAT_APP_ID / WECHAT_APP_SECRET config.' };

  try {
    const url = `${WECHAT_API_BASE}/cgi-bin/material/add_material?access_token=${token}&type=image`;
    const formData = new FormData();
    // In real usage: fetch the image blob from imageUrl and append
    // For MVP mock: return mock result
    const mockMediaId = `mock_media_${Date.now()}`;
    console.log(`[WeChatAdapter] Upload cover: ${imageUrl} → ${mockMediaId}`);
    return { mediaId: mockMediaId, url: imageUrl };
  } catch (err: any) {
    return { error: `Upload failed: ${err.message}` };
  }
}

// ===== Save draft to WeChat =====
export async function saveDraft(article: {
  title: string;
  author?: string;
  content: string; // HTML content
  digest?: string;
  coverMediaId?: string;
  needOpenComment?: number;
  onlyFansCanComment?: number;
}): Promise<DraftResult | { error: string }> {
  const token = await getAccessToken();
  if (!token) return { error: 'No access token' };

  try {
    const body = {
      articles: [{
        title: article.title,
        author: article.author || '宏达印业',
        content: article.content,
        digest: article.digest || article.title,
        thumb_media_id: article.coverMediaId || '',
        need_open_comment: article.needOpenComment ?? 1,
        only_fans_can_comment: article.onlyFansCanComment ?? 0,
      }],
    };

    const url = `${WECHAT_API_BASE}/cgi-bin/draft/add?access_token=${token}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();

    if (data.media_id) {
      console.log(`[WeChatAdapter] Draft saved: ${data.media_id}`);
      return { draftId: data.media_id, mediaId: data.media_id };
    }

    // Token might be expired — try to refresh and retry once
    if (data.errcode === 40001 || data.errcode === 42001) {
      tokenCache.clear();
      return saveDraft(article);
    }

    return { error: `WeChat API error: ${data.errmsg || JSON.stringify(data)}` };
  } catch (err: any) {
    return { error: `Save draft failed: ${err.message}` };
  }
}

// ===== Publish a draft =====
export async function publishDraft(draftId: string): Promise<PublishResult | { error: string }> {
  const token = await getAccessToken();
  if (!token) return { error: 'No access token' };

  try {
    const body = { media_id: draftId };
    const url = `${WECHAT_API_BASE}/cgi-bin/freepublish/submit?access_token=${token}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();

    if (data.publish_id) {
      console.log(`[WeChatAdapter] Publish submitted: ${data.publish_id}`);
      return { publishId: data.publish_id, msgId: data.publish_id };
    }

    if (data.errcode === 40001) {
      tokenCache.clear();
      return publishDraft(draftId);
    }

    return { error: `Publish failed: ${data.errmsg || JSON.stringify(data)}` };
  } catch (err: any) {
    return { error: `Publish failed: ${err.message}` };
  }
}

// ===== Query publish status =====
export async function queryPublishStatus(publishId: string): Promise<PublishStatusResult | { error: string }> {
  const token = await getAccessToken();
  if (!token) return { error: 'No access token' };

  try {
    const body = { publish_id: publishId };
    const url = `${WECHAT_API_BASE}/cgi-bin/freepublish/get?access_token=${token}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();

    if (data.publish_status) {
      return {
        status: data.publish_status === 0 ? 'success' : data.publish_status === 1 ? 'pending' : 'fail',
        publishId,
        failReason: data.fail_msg,
      };
    }

    return { error: `Query failed: ${data.errmsg || JSON.stringify(data)}` };
  } catch (err: any) {
    return { error: `Query failed: ${err.message}` };
  }
}

// ===== Check connection status =====
export async function checkConnection(): Promise<{
  connected: boolean;
  accountName?: string;
  tokenExpiresAt?: number;
  error?: string;
}> {
  const config = loadConfig();
  if (!config) {
    return { connected: false, error: '未配置 WECHAT_APP_ID 和 WECHAT_APP_SECRET' };
  }

  const token = await getAccessToken();
  if (!token) {
    return { connected: false, error: '无法获取 Access Token，请检查凭证是否正确' };
  }

  const cached = tokenCache.get(`wechat:${config.appId}`);
  return {
    connected: true,
    accountName: config.accountName,
    tokenExpiresAt: cached?.expiresAt,
  };
}

// ===== Clear token cache (for re-auth) =====
export function clearTokenCache(): void {
  tokenCache.clear();
}

export { loadConfig };
