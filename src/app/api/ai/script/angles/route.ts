import { NextRequest, NextResponse } from 'next/server';
import { generateAngles } from '@/lib/ai/angle-generator';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { account, platform, productOrProcess, customerPain, material, knowledgeCards, recentScripts } = body;
    if (!customerPain && !productOrProcess) {
      return NextResponse.json({ error: '需要至少提供 customerPain 或 productOrProcess' }, { status: 400 });
    }
    const result = await generateAngles({ account, platform, productOrProcess, customerPain, material, knowledgeCards, recentScripts });
    return NextResponse.json({ angles: result.angles, total: result.angles.length, method: result.method });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
