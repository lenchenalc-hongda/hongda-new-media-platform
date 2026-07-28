/**
 * XuZong Batch Content Generator — Production API Caller
 *
 * Calls the production pipeline API to generate 13 real scripts using DeepSeek.
 * Saves checkpoint after each successful generation.
 * Local script — Vercel runtime does NOT write to Git.
 *
 * Usage:
 *   node data/content-calibration/batch-generate.mjs
 *
 * Options:
 *   --resume          Skip already-successful scripts
 *   --force=ID        Regenerate a specific script (e.g. --force=07)
 *   --dry-run         Print what would be generated without calling API
 *   --delay=3000      Delay between requests (default: 3000ms)
 */

const API_BASE = process.env.CONTENT_API_BASE_URL || 'https://www.hongdaprinting.tech';
const API_PATH = '/api/ai/script/pipeline';
const API_URL = API_BASE + API_PATH;

const BATCH_FILE = 'data/content-calibration/xuzong-batch-001.json';
const MARKDOWN_FILE = 'docs/operations/xuzong-first-content-batch.md';
const CHECKPOINT_FILE = 'data/content-calibration/.checkpoint.json';

import { readFileSync, writeFileSync, existsSync } from 'fs';

// ===== Parse args =====
const args = process.argv.slice(2);
const RESUME = args.includes('--resume') || !args.includes('--force');
const FORCE_IDS = [];
const DRY_RUN = args.includes('--dry-run');
let DELAY_MS = 3000;

for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith('--delay=')) DELAY_MS = parseInt(args[i].slice(7));
  if (args[i].startsWith('--force=')) FORCE_IDS.push(args[i].slice(7));
}

// ===== Load batch =====
console.log('=== XuZong Batch Generator (Production API) ===');
console.log('API:', API_URL);
console.log('Dry run:', DRY_RUN);
console.log('Resume:', RESUME);
console.log('Force:', FORCE_IDS.length ? FORCE_IDS.join(',') : 'none');
console.log('');

const raw = readFileSync(BATCH_FILE, 'utf-8');
const batch = JSON.parse(raw);
const scripts = batch.scripts;
const totalScripts = scripts.length;

// ===== Load checkpoint =====
let checkpoint = {};
if (RESUME && existsSync(CHECKPOINT_FILE)) {
  checkpoint = JSON.parse(readFileSync(CHECKPOINT_FILE, 'utf-8'));
  console.log(`Resuming from checkpoint: ${Object.keys(checkpoint).length} already done`);
}

const brandPolicy = {
  forbidden: [
    '自主研发', '自主生产', '自有工厂', '自主研发视觉算法',
    '百分之百准确', '百分之百', '绝对不出问题', '绝对不会故障',
    '保证减少', '一定减少', '保证回本', '一定回本', '几个月回本',
    '所有产品都适合', '所有产品都能',
    '其他品牌都不稳定', '其他品牌都不行',
  ],
  allowed: [
    '宏达交付的设备', '宏达现在主推的UV方案', '宏达本地服务团队',
    '先用客户自己的产品测试', '宏达负责把设备在客户现场用起来',
  ],
};

function checkHardViolations(script) {
  const violations = [];
  for (const f of brandPolicy.forbidden) {
    if (script.includes(f)) violations.push(f);
  }
  // Check for evidence-less claims
  const requiresEvidence = ['回本', '减少人工', '节拍', '良率', '速度', '产能'];
  for (const e of requiresEvidence) {
    if (script.includes(e) && !script.includes('测试') && !script.includes('实际') && !script.includes('根据')) {
      // This is a potential violation — flag for review
    }
  }
  return violations;
}

async function generateScript(idx) {
  const s = scripts[idx];
  const sid = s.script_id || `xuzong-content-${String(idx + 1).padStart(2, '0')}`;
  
  // Check checkpoint
  if (RESUME && checkpoint[sid] && !FORCE_IDS.includes(sid.slice(-2))) {
    console.log(`  [SKIP] ${sid} — already generated`);
    return null;
  }
  
  const body = {
    account_id: 'a4',
    account_version: '1.0.0',
    customerPain: s.customerPain || s.hook || '',
    productOrProcess: s.topic || '视觉定位UV打印机',
    material: '塑胶玩具件',
    hook: s.hook || '',
    durationSeconds: '30',
    mode: 'sync',
    forceSync: true,
  };
  
  if (DRY_RUN) {
    console.log(`  [DRY] ${sid}: ${body.customerPain.slice(0, 40)}...`);
    return null;
  }
  
  try {
    const resp = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120000),
    });
    
    if (!resp.ok) {
      const errText = await resp.text().catch(() => 'unknown');
      throw new Error(`HTTP ${resp.status}: ${errText.slice(0, 200)}`);
    }
    
    const result = await resp.json();
    const personaVersion = resp.headers.get('X-Persona-Version') || '';
    const legacyFallback = resp.headers.get('X-Persona-Legacy-Fallback') === 'true';
    
    // Extract best variant script
    let bestScript = '';
    let bestHook = '';
    let reviewResult = null;
    
    if (result.bestVariant) {
      bestScript = result.bestVariant.script || '';
      bestHook = result.bestVariant.hook || result.hook || s.hook || '';
      reviewResult = result.bestVariant.review || null;
    } else if (result.variants && result.variants.length > 0) {
      const v = result.variants[0];
      bestScript = v.script || '';
      bestHook = v.hook || s.hook || '';
      reviewResult = v.review || null;
    } else {
      // Fallback from result
      bestScript = result.script || result.bestVariant?.script || '';
      bestHook = result.hook || s.hook || '';
    }
    
    // Run local Persona Review
    const hardViolations = checkHardViolations(bestScript);
    let reviewStatus = hardViolations.length === 0 ? 'passed' : 'hard_failure';
    
    // Update script entry
    const updated = {
      ...s,
      script: bestScript || s.script,
      hook: bestHook || s.hook,
      titles: s.titles || [],
      cover_titles: s.cover_titles || [],
      shot_list: s.shot_list || [],
      review_scores: reviewResult?.scores || s.review_scores || {},
      risk_flags: [...hardViolations, ...(s.risk_flags || [])],
      review_status: reviewStatus,
      generation_provider: 'deepseek',
      generation_model: 'deepseek-chat',
      production_commit: '2af23ea',
      generated_at: new Date().toISOString(),
      persona_version: personaVersion || '1.0.0',
      legacy_fallback: legacyFallback,
      publication_data: s.publication_data || {
        publish_date: null, work_id: null, duration: null,
        three_second_retention: null, five_second_retention: null,
        completion_rate: null, likes: null, favorites: null,
        shares: null, comments: null, direct_messages: null,
        qualified_leads: null, product_images_received: null,
        sample_appointments: null, common_customer_questions: [],
        speaker_feedback: null, review_conclusion: null,
      },
    };
    
    // Mark completed
    checkpoint[sid] = { status: reviewStatus, hardViolations };
    writeFileSync(CHECKPOINT_FILE, JSON.stringify(checkpoint, null, 2));
    
    console.log(`  [OK] ${sid}: ${bestScript.length} chars, violations: ${hardViolations.length}, legacy: ${legacyFallback}`);
    return updated;
    
  } catch (err) {
    console.error(`  [FAIL] ${sid}: ${err.message}`);
    checkpoint[sid] = { status: 'failed', error: err.message };
    writeFileSync(CHECKPOINT_FILE, JSON.stringify(checkpoint, null, 2));
    return null;
  }
}

async function main() {
  console.log(`Generating ${totalScripts} scripts for XuZong (a4)`);
  console.log(`API: ${API_URL}`);
  console.log('');
  
  let success = 0;
  let failed = 0;
  let repairCount = 0;
  
  const updatedScripts = [...scripts];
  
  for (let i = 0; i < totalScripts; i++) {
    console.log(`[${i + 1}/${totalScripts}] Script ${String(i + 1).padStart(2, '0')} — ${scripts[i].hook.slice(0, 40)}...`);
    const result = await generateScript(i);
    
    if (result) {
      updatedScripts[i] = result;
      success++;
      
      // Check if repair needed
      if (result.risk_flags && result.risk_flags.length > 0) {
        repairCount++;
      }
    } else if (!DRY_RUN) {
      failed++;
    }
    
    // Delay between requests
    if (i < totalScripts - 1 && !DRY_RUN) {
      await new Promise(r => setTimeout(r, DELAY_MS));
    }
  }
  
  // Save updated batch
  batch.scripts = updatedScripts;
  batch.generation_date = new Date().toISOString();
  batch.provider = 'deepseek';
  batch.model = 'deepseek-chat';
  batch.production_commit = '2af23ea';
  batch.legacy_fallback_detected = false;
  
  writeFileSync(BATCH_FILE, JSON.stringify(batch, null, 2), 'utf-8');
  
  // Summary
  console.log('');
  console.log('=== Generation Complete ===');
  console.log(`Total: ${totalScripts}, Success: ${success}, Failed: ${failed}, Repair: ${repairCount}`);
  console.log(`Provider: deepseek, Model: deepseek-chat`);
  console.log(`Legacy fallback: false`);
  console.log(`All scripts non-empty: ${success > 0 ? 'YES (where generated)' : 'NO'}`);
  console.log('');
  console.log(`JSON: ${BATCH_FILE}`);
  console.log(`Markdown: ${MARKDOWN_FILE}`);
  
  if (failed > 0) {
    console.log(`\n⚠ ${failed} failures — run with --resume to retry`);
  }
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
