import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { text, knowledgeCardId } = body;
    if (!text) return NextResponse.json({ error: 'Missing text' }, { status: 400 });
    const { generateEmbedding } = await import('@/lib/ai/retrieval');
    const embedding = await generateEmbedding(text);
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (supabaseUrl && supabaseServiceKey && knowledgeCardId) {
      try {
        const { createClient } = await import('@supabase/supabase-js');
        const sb = createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } });
        await sb.from('knowledge_cards').update({ embedding }).eq('id', knowledgeCardId);
      } catch {}
    }
    return NextResponse.json({ embedded: true, dimensions: embedding.length });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
