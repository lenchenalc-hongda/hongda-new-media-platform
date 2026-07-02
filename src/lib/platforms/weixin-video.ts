/**
 * 微信视频号开放平台 API 对接模块
 * 
 * 接入前提：
 * 1. 企业已注册微信开放平台（open.weixin.qq.com）
 * 2. 已完成企业认证（需支付300元/年认证费）
 * 3. 视频号已绑定到开放平台账号
 * 4. 已获取合适的接口权限
 * 
 * 注意：本模块在未配置 ACCESS_TOKEN 时返回 mock 数据，
 * 配置后自动切换为真实 API 调用。
 */

// 视频号 API 基础地址
const WECHAT_API_BASE = 'https://api.weixin.qq.com';

// 从环境变量读取 Access Token（需在微信开放平台获取）
const ACCESS_TOKEN = process.env.WECHAT_VIDEO_ACCESS_TOKEN || '';
const APP_ID = process.env.WECHAT_APP_ID || '';
const APP_SECRET = process.env.WECHAT_APP_SECRET || '';

// 是否启用真实 API
const USE_REAL_API = !!(ACCESS_TOKEN && APP_ID);

/** 视频号数据接口 - 视频基础信息 */
export interface WeixinVideoInfo {
  video_id: string;
  title: string;
  cover_url: string;
  create_time: string;
  duration: number;
  url: string;
  media_type: number;
}

/** 视频号数据接口 - 视频数据指标 */
export interface WeixinVideoData {
  video_id: string;
  title: string;
  /** 播放量 */
  views: number;
  /** 点赞数 */
  likes: number;
  /** 评论数 */
  comments: number;
  /** 转发数 */
  shares: number;
  /** 收藏数 */
  favorites: number;
  /** 新增关注（来自该视频） */
  followers_gained: number;
  /** 完播率 0-1 */
  completion_rate: number;
  /** 发布日期 */
  publish_date: string;
}

/** 视频号数据接口 - 账号概览 */
export interface WeixinAccountOverview {
  fans_count: number;
  total_views: number;
  total_likes: number;
  video_count: number;
  period_type: string;
}

/**
 * 获取 Access Token
 * 正常情况下 access_token 有效期 2 小时，需要定时刷新
 */
async function getAccessToken(): Promise<string> {
  if (USE_REAL_API) {
    // 真实环境下调用微信 API 获取/刷新 token
    // const res = await fetch(`${WECHAT_API_BASE}/cgi-bin/token?grant_type=client_credential&appid=${APP_ID}&secret=${APP_SECRET}`);
    // const data = await res.json();
    // return data.access_token;
    return ACCESS_TOKEN;
  }
  return 'mock_token';
}

/**
 * 获取视频号列表
 * 返回账号下所有视频的基础信息
 */
export async function getVideoList(account_id: string, page: number = 1, pageSize: number = 20): Promise<{ videos: WeixinVideoInfo[]; total: number }> {
  if (!USE_REAL_API) {
    // Mock 数据
    return {
      videos: Array.from({ length: 5 }, (_, i) => ({
        video_id: `wx_video_${account_id}_${i + 1}`,
        title: `模拟视频 #${i + 1} - 热转印工艺展示`,
        cover_url: '',
        create_time: new Date(Date.now() - i * 86400000).toISOString(),
        duration: 45 + Math.floor(Math.random() * 60),
        url: '',
        media_type: 1,
      })),
      total: 5,
    };
  }

  const token = await getAccessToken();
  const res = await fetch(
    `${WECHAT_API_BASE}/channels/ec/video/list?access_token=${token}&page=${page}&page_size=${pageSize}`
  );
  return res.json();
}

/**
 * 获取视频数据指标
 * 返回指定视频的播放量、互动数据等
 */
export async function getVideoData(video_id: string): Promise<WeixinVideoData | null> {
  if (!USE_REAL_API) {
    // Mock 数据（与现有 MOCK_METRICS 格式对齐）
    return {
      video_id,
      title: '模拟视频数据',
      views: Math.floor(Math.random() * 10000) + 500,
      likes: Math.floor(Math.random() * 500) + 10,
      comments: Math.floor(Math.random() * 100) + 5,
      shares: Math.floor(Math.random() * 50) + 2,
      favorites: Math.floor(Math.random() * 80) + 5,
      followers_gained: Math.floor(Math.random() * 100) + 5,
      completion_rate: Math.random() * 0.5 + 0.2,
      publish_date: new Date().toISOString().split('T')[0],
    };
  }

  const token = await getAccessToken();
  const res = await fetch(
    `${WECHAT_API_BASE}/channels/ec/video/data?access_token=${token}&video_id=${video_id}`
  );
  return res.json();
}

/**
 * 拉取所有视频数据并转换为系统内部格式
 * 用于定时任务或手动同步
 */
export async function pullAccountData(account_id: string): Promise<WeixinVideoData[]> {
  const { videos } = await getVideoList(account_id);
  const results: WeixinVideoData[] = [];

  for (const video of videos) {
    const data = await getVideoData(video.video_id);
    if (data) {
      results.push(data);
    }
  }

  return results;
}

/**
 * 将微信 API 数据映射到系统的 Post + PostMetrics 格式
 */
export function mapToSystemFormat(wxData: WeixinVideoData, accountId: string, platform: string = 'weixin') {
  return {
    post: {
      account_id: accountId,
      platform,
      title: wxData.title,
      publish_date: wxData.publish_date,
      post_url: '',
      status: 'published' as const,
      content_type: 'other' as const,
    },
    metrics: {
      views: wxData.views,
      completion_rate: wxData.completion_rate,
      likes: wxData.likes,
      comments: wxData.comments,
      shares: wxData.shares,
      favorites: wxData.favorites,
      followers_gained: wxData.followers_gained,
      private_messages: 0,
      leads_count: 0,
      qualified_leads_count: 0,
      metric_date: wxData.publish_date,
    },
  };
}

/**
 * 检查平台连接状态
 */
export async function checkConnection(): Promise<{ connected: boolean; account_name?: string; fans?: number }> {
  if (!USE_REAL_API) {
    return { connected: false, account_name: '未连接', fans: 0 };
  }
  try {
    const token = await getAccessToken();
    const res = await fetch(`${WECHAT_API_BASE}/channels/ec/basics/info/get?access_token=${token}`);
    const data = await res.json();
    return {
      connected: true,
      account_name: data.nickname || '已连接',
      fans: data.fans_count || 0,
    };
  } catch {
    return { connected: false };
  }
}
