import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { article_id, schedule_at } = body;

  const mockId = 'mock_pub_' + Date.now();
  const publishedAt = schedule_at || new Date().toISOString();

  return NextResponse.json({
    mock_publish_id: mockId,
    published_at: publishedAt,
    status: 'published_mock',
    message: '✅ Mock 发布成功（未接入真实微信API，仅记录发布事件）',
    article_url: `https://mp.weixin.qq.com/mock/${mockId}`,
    stats: {
      mock_views: Math.floor(Math.random() * 500) + 50,
      mock_likes: Math.floor(Math.random() * 30) + 3,
    },
  });
}
