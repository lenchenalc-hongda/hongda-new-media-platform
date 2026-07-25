// ===== 公众号文章版式引擎 V1 =====
// 根据文章类型生成结构化版式，渲染为微信兼容 HTML
import { OAArticleDraft, OAArticleStrategy, OAArticleTemplate, OAArticleType,
  OALayoutPlan, OALayoutSection, OALayoutSectionType, OAImageSuggestion, OALayoutQualityCheck } from './types';

import { OA_THEMES } from './oa-themes';
function now(): string { return new Date().toISOString(); }
function uid(): string { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

// ===== Default layout section sequences per article type =====

const DEFAULT_LAYOUTS: Record<string, OALayoutSectionType[]> = {
  technical_guide: [
    'hero_title', 'intro_lead', 'core_conclusion', 'numbered_chapter',
    'material_matrix', 'tech_tip', 'warning_note', 'process_timeline',
    'case_snapshot', 'cta_checklist',
  ],
  faq_answer: [
    'hero_title', 'intro_lead', 'core_conclusion', 'numbered_chapter',
    'checklist_panel', 'warning_note', 'cta_checklist',
  ],
  machine_selection: [
    'hero_title', 'intro_lead', 'core_conclusion', 'numbered_chapter',
    'comparison_grid', 'checklist_panel', 'process_timeline', 'cta_checklist',
  ],
  case_study: [
    'hero_title', 'intro_lead', 'case_snapshot', 'numbered_chapter',
    'numbered_chapter', 'process_timeline', 'comparison_grid',
    'quote_highlight', 'cta_checklist',
  ],
  troubleshooting: [
    'hero_title', 'intro_lead', 'core_conclusion', 'numbered_chapter',
    'risk_matrix', 'process_timeline', 'tech_tip', 'warning_note', 'cta_checklist',
  ],
  brand_story: [
    'hero_title', 'intro_lead', 'quote_highlight', 'process_timeline',
    'numbered_chapter', 'numbered_chapter', 'brand_transition', 'cta_checklist',
  ],
  sales_enablement: [
    'hero_title', 'core_conclusion', 'checklist_panel', 'warning_note', 'cta_checklist',
  ],
};

// ===== Map blocks to sections =====

export function mapBodyBlocksToLayoutSections(draft: OAArticleDraft, articleType: OAArticleType): OALayoutSection[] {
  var blocks = draft.bodyBlocks || [];
  var sections: OALayoutSection[] = [];
  var seq = DEFAULT_LAYOUTS[articleType] || DEFAULT_LAYOUTS.technical_guide;

  var blockIdx = 0;
  for (var i = 0; i < seq.length; i++) {
    var type = seq[i];
    var block = blocks[blockIdx];
    var section: OALayoutSection = {
      id: 'sec_' + uid(),
      type: type,
      title: block ? block.content : '',
      subtitle: '',
      content: block ? block.content : '',
      items: block ? block.items : undefined,
      data: {},
      sourceBlockIds: block ? [block.id] : [],
      order: i,
      editable: true,
    };
    sections.push(section);
    if (block && type !== 'numbered_chapter' && type !== 'case_snapshot') {
      blockIdx++;
    }
  }
  return sections;
}

// ===== Image suggestions per article type =====

function generateImageSuggestions(sections: OALayoutSection[], articleType: string): OAImageSuggestion[] {
  var suggestions: OAImageSuggestion[] = [];
  var typeImageMap: Record<string, { type: string; desc: string; ratio: string }[]> = {
    technical_guide: [
      { type: 'material_comparison', desc: '材质对比图（PE/PP/ABS）', ratio: '16:9' },
      { type: 'process_diagram', desc: '工艺流程图或花膜结构图', ratio: '16:9' },
    ],
    machine_selection: [
      { type: 'machine_photo', desc: 'UV机器或设备实拍图', ratio: '16:9' },
      { type: 'product_photo', desc: '客户产品应用场景图', ratio: '4:3' },
    ],
    case_study: [
      { type: 'case_photo', desc: '客户产品/案例照片', ratio: '4:3' },
      { type: 'before_after', desc: '处理前 vs 处理后对比图', ratio: '16:9' },
    ],
    brand_story: [
      { type: 'factory_photo', desc: '工厂现场或设备照片', ratio: '16:9' },
      { type: 'brand_asset', desc: '品牌形象图', ratio: '16:9' },
    ],
  };

  var imgs = typeImageMap[articleType] || [];
  for (var i = 0; i < imgs.length; i++) {
    suggestions.push({
      id: 'img_' + uid(),
      sectionId: sections[i]?.id || '',
      imageType: imgs[i].type as any,
      description: imgs[i].desc,
      recommendedRatio: imgs[i].ratio as any,
      required: i === 0,
    });
  }
  return suggestions;
}

// ===== Quality check =====

export function checkLayoutQuality(plan: OALayoutPlan): OALayoutQualityCheck {
  var types = plan.sections.map(function(s) { return s.type; });
  var check: OALayoutQualityCheck = {
    hasClearAudience: types.includes('intro_lead'),
    hasIntroLead: types.includes('intro_lead'),
    hasCoreConclusion: types.includes('core_conclusion') || types.includes('quote_highlight'),
    hasStructuredSections: types.filter(function(t) {
      return ['comparison_grid', 'process_timeline', 'checklist_panel', 'material_matrix', 'risk_matrix'].includes(t);
    }).length >= 2,
    hasVisualModule: plan.imageSuggestions.length > 0,
    hasRiskReminder: types.includes('warning_note'),
    hasCaseOrExample: types.includes('case_snapshot') || types.includes('quote_highlight'),
    hasActionChecklist: types.includes('cta_checklist'),
    hasBrandClose: types.includes('brand_transition'),
    notes: [],
    publishReady: false,
  };

  var notes: string[] = [];
  if (!check.hasIntroLead) notes.push('缺少导读模块 intro_lead');
  if (!check.hasCoreConclusion) notes.push('缺少核心结论或引用高亮');
  if (!check.hasStructuredSections) notes.push('需要至少2个结构化模块（对比/流程/清单/矩阵）');
  if (!check.hasVisualModule) notes.push('缺少图片建议');
  if (!check.hasRiskReminder) notes.push('缺少风险提醒模块');
  if (!check.hasActionChecklist) notes.push('缺少行动引导模块');
  check.notes = notes;
  check.publishReady = notes.length === 0;
  return check;
}

// ===== Generate layout plan =====

export function generateLayoutPlan(
  draft: OAArticleDraft,
  strategy: OAArticleStrategy,
  template?: OAArticleTemplate,
): OALayoutPlan {
  var sections = mapBodyBlocksToLayoutSections(draft, strategy.articleType || "technical_guide");
  var imageSuggestions = generateImageSuggestions(sections, strategy.articleType || "technical_guide");
  var qualityCheck = checkLayoutQuality({
    id: '', draftId: '', articleType: strategy.articleType || "technical_guide",
    templateId: template?.id || '',
    themeId: 'hongda_blue',
    sections: sections,
    imageSuggestions: imageSuggestions,
    qualityCheck: null as any,
    createdAt: now(), updatedAt: now(),
  });
  return {
    id: 'plan_' + uid(),
    draftId: draft.id,
    articleType: strategy.articleType || "technical_guide",
    templateId: template?.id || '',
    themeId: 'hongda_blue',
    sections: sections,
    imageSuggestions: imageSuggestions,
    qualityCheck: qualityCheck,
    createdAt: now(),
    updatedAt: now(),
  };
}

// ===== Render section to HTML =====

function renderHeroTitle(s: OALayoutSection): string {
  return '<div style="margin-bottom:24px;">' +
    '<h1 style="font-size:22px;font-weight:700;color:#1F2937;margin:0;line-height:1.5;">' + (s.title || '') + '</h1>' +
    (s.subtitle ? '<p style="font-size:13px;color:#D71920;margin:8px 0 0;font-weight:500;">' + s.subtitle + '</p>' : '') +
    '</div>';
}

function renderIntroLead(s: OALayoutSection): string {
  return '<div style="background:#FFFFFF;border:1px solid #E5E7EB;border-radius:12px;padding:20px;margin:22px 0;">' +
    '<span style="display:inline-block;background:#D71920;color:white;font-size:11px;font-weight:600;padding:2px 10px;border-radius:4px;margin-bottom:10px;">导读</span>' +
    '<p style="font-size:15px;color:#374151;line-height:1.75;margin:0;">' + (s.content || '') + '</p>' +
    '</div>';
}

function renderCoreConclusion(s: OALayoutSection): string {
  var html = '<div style="background:#FFFFFF;border:1px solid #E5E7EB;border-radius:12px;padding:20px;margin:22px 0;">' +
    '<span style="display:inline-block;background:#D71920;color:white;font-size:11px;font-weight:600;padding:2px 10px;border-radius:4px;margin-bottom:10px;">核心结论</span>' +
    '<p style="font-size:15px;color:#1F2937;font-weight:600;line-height:1.6;margin:0 0 10px;">' + (s.content || '') + '</p>';
  if (s.items && s.items.length > 0) {
    html += '<ul style="margin:0;padding:0;list-style:none;">';
    for (var i = 0; i < s.items.length; i++) {
      html += '<li style="font-size:14px;color:#374151;margin:6px 0;padding-left:16px;">&bull; ' + s.items[i] + '</li>';
    }
    html += '</ul>';
  }
  html += '</div>';
  return html;
}

function renderNumberedChapter(s: OALayoutSection, idx: number): string {
  var num = String(idx + 1).padStart(2, '0');
  return '<div style="margin:28px 0 16px;">' +
    '<div style="display:flex;align-items:center;gap:10px;margin-bottom:4px;">' +
    '<span style="font-size:22px;font-weight:800;color:#D71920;line-height:1;">' + num + '</span>' +
    '<h2 style="font-size:20px;font-weight:700;color:#1F2937;margin:0;line-height:1.4;">' + (s.title || '') + '</h2>' +
    '</div>' +
    (s.subtitle ? '<p style="font-size:14px;color:#6B7280;margin:4px 0 0;">' + s.subtitle + '</p>' : '') +
    '<div style="width:40px;height:3px;background:#D71920;border-radius:2px;margin-top:6px;"></div>' +
    (s.content ? '<p style="font-size:15px;color:#374151;line-height:1.75;margin:12px 0 0;">' + s.content + '</p>' : '') +
    '</div>';
}

function renderTextParagraph(s: OALayoutSection): string {
  return '<p style="font-size:15px;margin:14px 0;line-height:1.85;color:#1F2937;">' + (s.content || '') + '</p>';
}

function renderTechTip(s: OALayoutSection): string {
  var html = '<div style="background:#F3F7FA;border:1px solid #D9E3EA;border-radius:12px;padding:18px;margin:22px 0;">' +
    '<p style="font-size:13px;font-weight:600;color:#1E40AF;margin:0 0 8px;">💡 技术提示</p>' +
    '<p style="font-size:15px;margin:0;line-height:1.75;color:#374151;">' + (s.content || '') + '</p>';
  if (s.items && s.items.length > 0) {
    html += '<div style="margin-top:10px;border-top:1px solid #E5E7EB;padding-top:10px;">';
    for (var i = 0; i < s.items.length; i++) {
      html += '<div style="font-size:14px;color:#4B5563;margin:4px 0;padding-left:12px;">&rarr; ' + s.items[i] + '</div>';
    }
    html += '</div>';
  }
  html += '</div>';
  return html;
}

function renderWarningNote(s: OALayoutSection): string {
  return '<div style="background:#FFF4F4;border:1px solid #FECACA;border-radius:12px;padding:18px;margin:22px 0;">' +
    '<p style="font-size:13px;font-weight:600;color:#DC2626;margin:0 0 6px;">⚠️ 风险提示</p>' +
    '<p style="font-size:15px;margin:0;line-height:1.75;color:#374151;">' + (s.content || '') + '</p>' +
    '</div>';
}

function renderCaseSnapshot(s: OALayoutSection): string {
  var lines = (s.content || '').split('\n').filter(function(l) { return l.trim(); });
  var fields = ['产品', '问题', '处理', '结果'];
  var html = '<div style="background:#FFFFFF;border:1px solid #E5E7EB;border-radius:12px;padding:20px;margin:22px 0;">' +
    '<span style="display:inline-block;background:#D71920;color:white;font-size:11px;font-weight:600;padding:2px 10px;border-radius:4px;margin-bottom:12px;">📌 客户案例</span><div>';
  for (var i = 0; i < fields.length && i < lines.length; i++) {
    html += '<div style="margin:6px 0;font-size:14px;color:#374151;">' +
      '<span style="font-weight:600;">' + fields[i] + '：</span>' + lines[i] + '</div>';
  }
  html += '</div></div>';
  return html;
}

function renderQuoteHighlight(s: OALayoutSection): string {
  return '<div style="background:#F8FAFC;border-left:3px solid #D71920;border-radius:0 10px 10px 0;padding:18px 20px;margin:22px 0;">' +
    '<p style="font-size:17px;font-weight:500;margin:0;line-height:1.7;color:#1F2937;font-style:italic;">"' + (s.content || '') + '"</p>' +
    (s.title ? '<p style="font-size:13px;color:#6B7280;margin:8px 0 0;">—— ' + s.title + '</p>' : '') +
    '</div>';
}

function renderCtaChecklist(s: OALayoutSection): string {
  var items = s.items && s.items.length > 0 ? s.items : ['产品图片', '产品材质', '数量范围', '测试要求'];
  var html = '<div style="background:#FFFFFF;border:1px solid #E5E7EB;border-radius:12px;padding:20px;margin:24px 0;">' +
    '<p style="font-size:16px;font-weight:600;color:#1F2937;margin:0 0 4px;line-height:1.5;">' + (s.title || '想判断适不适合？') + '</p>' +
    '<p style="font-size:13px;color:#6B7280;margin-bottom:12px;">' + (s.content || '准备好以下信息，联系宏达技术顾问') + '</p>' +
    '<div style="margin:12px 0;">';
  for (var i = 0; i < items.length; i++) {
    html += '<div style="font-size:14px;color:#4B5563;margin:5px 0;display:flex;align-items:center;gap:6px;">' +
      '<span style="color:#D71920;">✔</span>' + items[i] + '</div>';
  }
  html += '</div>' +
    '<div style="text-align:center;margin-top:14px;">' +
    '<span style="display:inline-block;background:#D71920;color:white;font-size:14px;font-weight:500;padding:8px 24px;border-radius:8px;">联系顾问 →</span>' +
    '</div></div>';
  return html;
}

function renderProcessTimeline(s: OALayoutSection): string {
  var steps = s.items && s.items.length > 0 ? s.items : [s.content || '步骤'];
  var html = '<div style="margin:22px 0;">' +
    '<p style="font-size:15px;font-weight:600;color:#1F2937;margin:0 0 14px;">' + (s.title || '操作流程') + '</p>';
  for (var i = 0; i < steps.length; i++) {
    html += '<div style="display:flex;gap:12px;margin-bottom:' + (i < steps.length - 1 ? '0' : '0') + ';">' +
      '<div style="display:flex;flex-direction:column;align-items:center;">' +
      '<div style="width:28px;height:28px;border-radius:50%;background:#D71920;color:white;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;flex-shrink:0;">' + (i + 1) + '</div>';
    if (i < steps.length - 1) {
      html += '<div style="width:2px;flex:1;background:#E5E7EB;margin:4px auto;"></div>';
    }
    html += '</div>' +
      '<div style="font-size:15px;color:#374151;line-height:1.6;padding-bottom:' + (i < steps.length - 1 ? '20px' : '0') + ';padding-top:4px;">' + steps[i] + '</div>' +
      '</div>';
  }
  html += '</div>';
  return html;
}

function renderChecklistPanel(s: OALayoutSection): string {
  var items = s.items && s.items.length > 0 ? s.items : [];
  var html = '<div style="background:#FFFFFF;border:1px solid #E5E7EB;border-radius:12px;padding:18px;margin:22px 0;">' +
    '<p style="font-size:15px;font-weight:600;color:#1F2937;margin:0 0 10px;">' + (s.title || s.content || '清单') + '</p>';
  for (var i = 0; i < items.length; i++) {
    html += '<div style="font-size:14px;color:#374151;margin:6px 0;display:flex;align-items:flex-start;gap:8px;">' +
      '<span style="color:#D71920;font-size:13px;">☐</span><span>' + items[i] + '</span></div>';
  }
  html += '</div>';
  return html;
}

function renderComparisonGrid(s: OALayoutSection): string {
  var items = s.items && s.items.length > 0 ? s.items : [];
  var html = '<div style="background:#FFFFFF;border:1px solid #E5E7EB;border-radius:12px;padding:20px;margin:22px 0;">' +
    '<p style="font-size:14px;font-weight:600;color:#1F2937;margin:0 0 10px;">' + (s.title || '对比分析') + '</p>';
  for (var i = 0; i < items.length; i++) {
    var parts = items[i].split('|');
    html += '<div style="' + (i > 0 ? 'border-top:1px solid #F3F4F6;padding-top:10px;margin-top:10px;' : '') + 'font-size:14px;color:#374151;">';
    if (parts[0]) html += '<span style="font-weight:600;">' + parts[0] + '</span>';
    if (parts.length > 1) html += '<span style="color:#6B7280;margin-left:4px;">' + parts.slice(1).join(' · ') + '</span>';
    html += '</div>';
  }
  html += '</div>';
  return html;
}

function renderRiskMatrix(s: OALayoutSection): string {
  var items = s.items && s.items.length > 0 ? s.items : [];
  var html = '<div style="background:#FFFFFF;border:1px solid #E5E7EB;border-radius:12px;padding:20px;margin:22px 0;">' +
    '<p style="font-size:14px;font-weight:600;color:#1F2937;margin:0 0 10px;">' + (s.title || '可能原因分析') + '</p>';
  for (var i = 0; i < items.length; i++) {
    html += '<div style="background:#FFF4F4;border:1px solid #FECACA;border-radius:8px;padding:12px;margin:8px 0;font-size:14px;color:#991B1B;">' +
      '⚠️ ' + items[i] + '</div>';
  }
  html += '</div>';
  return html;
}

function renderBrandTransition(s: OALayoutSection): string {
  return '<div style="background:#F8FAFC;border:1px solid #E5E7EB;border-radius:12px;padding:20px;margin:22px 0;">' +
    '<p style="font-size:14px;font-weight:600;color:#D71920;margin:0 0 8px;">宏达经验</p>' +
    '<p style="font-size:15px;color:#374151;line-height:1.75;margin:0;">' + (s.content || '') + '</p>' +
    '</div>';
}

function renderImagePlaceholder(s: OALayoutSection): string {
  return '<div style="background:#F7F8FA;border:1px solid #E5E7EB;border-radius:12px;margin:22px 0;text-align:center;padding:40px 16px;">' +
    '<p style="font-size:13px;color:#9CA3AF;margin:0;">📷 图片建议</p>' +
    '<p style="font-size:11px;color:#D1D5DB;margin:8px 0 0;">' + (s.subtitle || '建议图片尺寸: 16:9') + '</p>' +
    '<p style="font-size:11px;color:#D1D5DB;margin:4px 0 0;">' + (s.content || '请上传相关图片') + '</p>' +
    '</div>';
}

// ===== Render layout plan to HTML =====

export function renderLayoutHtml(plan: OALayoutPlan, draft: OAArticleDraft, themeId?: string): string {
  var theme = OA_THEMES.find(function(t) { return t.id === (themeId || plan.themeId); }) || OA_THEMES[0];
  var headerHtml = theme.headerImage
    ? '<div style="margin-bottom:16px;text-align:center;"><img src="' + theme.headerImage + '" alt="宏达印业" style="max-width:100%;border-radius:12px;display:block;" /></div>'
    : '';
  var sectionsHtml = '';
  var sectionIdx: Record<string, number> = {};

  for (var i = 0; i < plan.sections.length; i++) {
    var s = plan.sections[i];
    var idx = sectionIdx[s.type] || 0;
    sectionIdx[s.type] = idx + 1;
    switch (s.type) {
      case 'hero_title': sectionsHtml += renderHeroTitle(s); break;
      case 'intro_lead': sectionsHtml += renderIntroLead(s); break;
      case 'core_conclusion': sectionsHtml += renderCoreConclusion(s); break;
      case 'numbered_chapter': sectionsHtml += renderNumberedChapter(s, idx); break;
      case 'text_paragraph': sectionsHtml += renderTextParagraph(s); break;
      case 'tech_tip': sectionsHtml += renderTechTip(s); break;
      case 'warning_note': sectionsHtml += renderWarningNote(s); break;
      case 'case_snapshot': sectionsHtml += renderCaseSnapshot(s); break;
      case 'quote_highlight': sectionsHtml += renderQuoteHighlight(s); break;
      case 'cta_checklist': sectionsHtml += renderCtaChecklist(s); break;
      case 'process_timeline': sectionsHtml += renderProcessTimeline(s); break;
      case 'checklist_panel': sectionsHtml += renderChecklistPanel(s); break;
      case 'comparison_grid': sectionsHtml += renderComparisonGrid(s); break;
      case 'risk_matrix': sectionsHtml += renderRiskMatrix(s); break;
      case 'brand_transition': sectionsHtml += renderBrandTransition(s); break;
      case 'image_placeholder': sectionsHtml += renderImagePlaceholder(s); break;
      default: sectionsHtml += renderTextParagraph(s); break;
    }
  }

  var footerHtml = theme.qrCode
    ? '<div style="text-align:center;padding:16px 20px;">' +
      '<img src="' + theme.qrCode + '" alt="宏达印业公众号" style="width:120px;height:auto;margin:0 auto 12px;display:block;border-radius:8px;" />' +
      '<div style="border-top:1px solid #e5e7eb;padding-top:12px;margin-top:12px;">' +
      '<p style="font-size:12px;color:#888;margin:4px 0;">广东宏达印业有限公司</p>' +
      '<p style="font-size:11px;color:#aaa;margin:4px 0;">热转印 · UV打印 · 整体方案</p>' +
      '<p style="font-size:10px;color:#ccc;margin:8px 0 0;">长按识别二维码 · 关注宏达印业公众号</p>' +
      '</div></div>'
    : '';

  return '<div style="max-width:375px;margin:0 auto;font-family:-apple-system,\'Noto Sans SC\',\'PingFang SC\',sans-serif;background:#FFFFFF;overflow:hidden;">' +
    headerHtml +
    '<div style="padding:12px 20px;">' + sectionsHtml + '</div>' +
    footerHtml +
    '</div>';
}
