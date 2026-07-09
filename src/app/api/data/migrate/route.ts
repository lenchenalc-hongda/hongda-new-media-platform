// POST /api/data/migrate
// One-time data migration: upgrades knowledge cards, topics, and scripts
// to have all required new fields. Reports what was changed.

import { NextRequest, NextResponse } from 'next/server';
import { scoreScript } from '@/lib/ai/script-scoring';
import { checkScriptRisk } from '@/lib/ai/script-pipeline';
import { promises as fs } from 'fs';
import path from 'path';

const DATA_DIR = process.env.VERCEL ? '/tmp/hongda-data' : path.join(process.cwd(), 'data');
const FILE = (key: string) => path.join(DATA_DIR, `${key}.json`);

async function ensure() { try { await fs.mkdir(DATA_DIR, { recursive: true }); } catch {} }

async function readData(key: string): Promise<any[]> {
  await ensure();
  try {
    const c = await fs.readFile(FILE(key), 'utf-8');
    return JSON.parse(c);
  } catch { return []; }
}

async function writeData(key: string, data: any[]): Promise<void> {
  await ensure();
  await fs.writeFile(FILE(key), JSON.stringify(data, null, 2), 'utf-8');
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { mode } = body; // 'dry_run' | 'execute'
    const isDryRun = mode !== 'execute';
    const report: Record<string, any> = { dryRun: isDryRun, timestamp: new Date().toISOString(), knowledge: { total: 0, fixed: 0, errors: [] }, topics: { total: 0, fixed: 0, errors: [] }, scripts: { total: 0, scored: 0, graded: 0, errors: [] } };

    // === 1. Knowledge Cards Migration ===
    const knowledgeCards = await readData('hongda_knowledge');
    report.knowledge.total = knowledgeCards.length;
    const migratedKc = knowledgeCards.map((kc: any) => {
      if (!kc) return kc;
      const changes: string[] = [];
      if (!kc.card_type) { kc.card_type = kc.category || '工艺知识卡'; changes.push('card_type'); }
      if (!kc.content_scope) { kc.content_scope = kc.content_scope || '可对外'; changes.push('content_scope'); }
      if (!kc.knowledge_status) { kc.knowledge_status = '等待审核'; changes.push('knowledge_status'); }
      if (!kc.core_conclusion) { kc.core_conclusion = kc.summary || kc.title || ''; changes.push('core_conclusion'); }
      if (!kc.forbidden_expressions) { kc.forbidden_expressions = kc.forbidden_expressions || []; changes.push('forbidden_expressions'); }
      if (!kc.risky_expressions) { kc.risky_expressions = kc.risky_expressions || []; changes.push('risky_expressions'); }
      if (!kc.safer_alternatives) { kc.safer_alternatives = kc.safer_alternatives || []; changes.push('safer_alternatives'); }
      if (typeof kc.usage_count !== 'number') { kc.usage_count = 0; changes.push('usage_count'); }
      if (!kc.linked_topic_ids) { kc.linked_topic_ids = kc.linked_topic_ids || []; changes.push('linked_topic_ids'); }
      if (!kc.linked_script_ids) { kc.linked_script_ids = kc.linked_script_ids || []; changes.push('linked_script_ids'); }
      if (changes.length > 0) report.knowledge.fixed++;
      return kc;
    });

    // === 2. Topics Migration ===
    const topics = await readData('hongda_topics');
    report.topics.total = topics.length;
    const migratedTopics = topics.map((t: any) => {
      if (!t) return t;
      const changes: string[] = [];
      if (!t.topic_source) { t.topic_source = t.source || 'manual'; changes.push('topic_source'); }
      if (!t.target_customer) { t.target_customer = t.target_audience || ''; changes.push('target_customer'); }
      if (!t.product_process) { t.product_process = t.product_or_process || ''; changes.push('product_process'); }
      if (!t.conversion_goal) { t.conversion_goal = t.conversion_goal || t.content_purpose || ''; changes.push('conversion_goal'); }
      if (!t.script_status) { t.script_status = t.linked_script_id ? '已生成' : '未生成'; changes.push('script_status'); }
      if (!t.last_action) { t.last_action = '数据迁移'; changes.push('last_action'); }
      // Extract material from title if missing
      if (!t.material) {
        const matMap = ['PE', 'PP', 'ABS', 'PET', '不锈钢', '玻璃', 'PC', '亚克力'];
        const found = matMap.find(m => t.title?.includes(m));
        if (found) { t.material = found; changes.push('material'); }
      }
      if (changes.length > 0) report.topics.fixed++;
      return t;
    });

    // === 3. Scripts Migration ===
    const scripts = await readData('hongda_scripts');
    report.scripts.total = scripts.length;
    const migratedScripts = scripts.map((s: any) => {
      if (!s) return s;
      const changes: string[] = [];
      const meta = s.ai_meta || {};

      // Extract score to top level
      if (typeof s.score !== 'number') {
        s.score = typeof meta.quality_score === 'number' ? meta.quality_score :
                  meta.score_detail?.totalScore || 0;
        changes.push('score');
      }
      // Extract grade
      if (!s.grade) {
        s.grade = meta.score_detail?.grade || (s.score >= 80 ? 'A' : s.score >= 70 ? 'B' : s.score >= 60 ? 'C' : 'D');
        changes.push('grade');
        report.scripts.graded++;
      }
      // Extract risk info
      if (!s.risk_level) { s.risk_level = meta.risk_level || '低'; changes.push('risk_level'); }
      if (!s.risk_points) { s.risk_points = meta.risk_points || []; changes.push('risk_points'); }
      // Recommended status
      if (!s.recommended_status) {
        if (typeof s.score === 'number') {
          if (s.score >= 85 && s.risk_level !== '高') s.recommended_status = 'pending_review';
          else if (s.score >= 70) s.recommended_status = 'draft';
          else if (s.score >= 60) s.recommended_status = 'needs_rewrite';
          else s.recommended_status = 'discard';
        } else {
          s.recommended_status = 'draft';
        }
        changes.push('recommended_status');
        report.scripts.scored++;
      }
      // Source fields
      if (!s.source_type) { s.source_type = s.source || 'manual'; changes.push('source_type'); }
      if (!s.source_topic_id && s.topic_id) { s.source_topic_id = s.topic_id; changes.push('source_topic_id'); }
      if (!s.script_template_type) {
        const hook = s.hook || '';
        if (hook.includes('多少钱') || hook.includes('报价')) s.script_template_type = 'pre_quote';
        else if (hook.includes('材质') || hook.includes('PE') || hook.includes('PP')) s.script_template_type = 'material';
        else if (hook.includes('掉') || hook.includes('测试')) s.script_template_type = 'test';
        else if (hook.includes('颜色')) s.script_template_type = 'color';
        else if (hook.includes('打样')) s.script_template_type = 'sample';
        else s.script_template_type = 'pre_quote';
        changes.push('script_template_type');
      }

      if (changes.length > 0) report.scripts.scored++;
      return s;
    });

    // === Save if not dry run ===
    if (!isDryRun) {
      await writeData('hongda_knowledge', migratedKc);
      await writeData('hongda_topics', migratedTopics);
      await writeData('hongda_scripts', migratedScripts);
    }

    return NextResponse.json({ success: true, report, suggestion: isDryRun ? 'Dry run completed. Run with mode="execute" to apply changes.' : 'Migration completed successfully.' });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
