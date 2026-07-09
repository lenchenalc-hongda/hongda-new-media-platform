// ===== 发布适配器层 =====
// 抽象发布接口，业务代码不直接调用平台 API
// 先实现 MockAdapter，预留 WeChatMpAdapter

export interface PublishRequest {
  articleId: string;
  title: string;
  bodyHtml: string;
  bodyMarkdown: string;
  summary: string;
  coverImage?: string;
  author?: string;
  scheduledAt?: string;
}

export interface PublishResult {
  success: boolean;
  externalId?: string;
  externalStatus?: string;
  publishedAt?: string;
  articleUrl?: string;
  error?: string;
  mock?: boolean;
}

export interface PublishStatus {
  externalId: string;
  status: string;
  publishedAt?: string;
  articleUrl?: string;
  error?: string;
  attempts: number;
}

/** 发布适配器接口 */
export interface IPublishAdapter {
  readonly name: string;
  readonly available: boolean;
  /** 发布文章（定时或立即） */
  publish(request: PublishRequest): Promise<PublishResult>;
  /** 保存草稿到平台 */
  saveDraft(request: PublishRequest): Promise<PublishResult>;
  /** 查询发布状态 */
  getPublishStatus(externalId: string): Promise<PublishStatus>;
  /** 重试发布 */
  retryPublish(externalId: string): Promise<PublishResult>;
}

/** Mock 发布适配器（始终可用） */
export class MockPublishAdapter implements IPublishAdapter {
  readonly name = 'mock';
  readonly available = true;
  private published: Map<string, PublishStatus> = new Map();

  async publish(request: PublishRequest): Promise<PublishResult> {
    const externalId = 'mock_pub_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    const delay = Math.random() * 2000;
    await new Promise(r => setTimeout(r, delay));

    const result: PublishResult = {
      success: true,
      externalId,
      externalStatus: 'published_mock',
      publishedAt: request.scheduledAt || new Date().toISOString(),
      articleUrl: 'https://mp.weixin.qq.com/mock/' + externalId,
      mock: true,
    };

    this.published.set(externalId, {
      externalId, status: 'published_mock',
      publishedAt: result.publishedAt,
      articleUrl: result.articleUrl,
      attempts: 1,
    });

    return result;
  }

  async saveDraft(request: PublishRequest): Promise<PublishResult> {
    const externalId = 'mock_draft_' + Date.now();
    this.published.set(externalId, { externalId, status: 'draft_mock', attempts: 1 });
    return { success: true, externalId, externalStatus: 'draft_mock', mock: true };
  }

  async getPublishStatus(externalId: string): Promise<PublishStatus> {
    const cached = this.published.get(externalId);
    if (cached) return cached;
    return { externalId, status: 'unknown', attempts: 0 };
  }

  async retryPublish(externalId: string): Promise<PublishResult> {
    const cached = this.published.get(externalId);
    if (cached) {
      cached.attempts++;
      cached.status = 'published_mock';
    }
    return { success: true, externalId, externalStatus: 'published_mock', mock: true };
  }
}

/** 真实微信发布适配器（预留，待联调） */
export class WeChatMpPublishAdapter implements IPublishAdapter {
  readonly name = 'wechat_mp';
  readonly available = !!(process.env.WECHAT_APP_ID && process.env.WECHAT_APP_SECRET);

  async publish(request: PublishRequest): Promise<PublishResult> {
    return { success: false, error: '微信发布适配器待联调' };
  }
  async saveDraft(request: PublishRequest): Promise<PublishResult> {
    return { success: false, error: '微信草稿适配器待联调' };
  }
  async getPublishStatus(externalId: string): Promise<PublishStatus> {
    return { externalId, status: 'unknown', attempts: 0 };
  }
  async retryPublish(externalId: string): Promise<PublishResult> {
    return { success: false, error: '微信发布适配器待联调' };
  }
}

/** 获取当前启用的适配器（先 mock，后续可切换到 wechat_mp） */
export function getPublishAdapter(): IPublishAdapter {
  const adapterType = process.env.OA_PUBLISH_ADAPTER || 'mock';
  if (adapterType === 'wechat_mp' && !!(process.env.WECHAT_APP_ID && process.env.WECHAT_APP_SECRET)) {
    return new WeChatMpPublishAdapter();
  }
  return new MockPublishAdapter();
}
