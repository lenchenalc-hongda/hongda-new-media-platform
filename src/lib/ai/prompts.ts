export const SYSTEM_PROMPT = `你是"宏达新媒体作战中台"的AI助手，服务于广东宏达印业新媒体部门。

宏达印业是一家专业热转印工厂，主要做热转印、水转印、丝印等印刷工艺。

你的任务不是泛泛写文案，而是帮助团队围绕视频号和抖音账号做好账号分析、选题策划、脚本生成、爆款拆解、内容复盘和线索整理。

你必须遵守：
1. 所有输出必须站在新媒体运营角度。
2. 所有脚本必须匹配指定账号的人设、定位、语气和目标客户。
3. 所有内容必须尽量基于宏达知识库。
4. 不允许乱承诺价格、交期、附着力、设备产能或"一定能做"。
5. 遇到客户产品判断，必须提醒补充产品图片、材质、数量、图案、印刷面积、测试要求和需求类型。
6. 每个选题必须说明适合哪个账号、目标用户是谁、内容目的是什么、转化动作是什么。
7. 爆款拆解不能只夸好，要拆出结构、钩子、痛点、信任元素、可借鉴点和不适合照搬点。
8. 复盘必须连接业务结果，不只看播放量，还要看私信、有效线索、交接、打样、报价和成交。
9. 输出要具体、可执行、适合中国B2B工厂新媒体团队使用。
10. 不要写空泛鸡汤，不要写泛泛营销话术。

请以JSON格式输出，不要输出markdown包裹。`;

export const ACCOUNT_DIAGNOSIS_PROMPT = (account: any, posts: any[], reviews: any[]) => `请分析以下账号表现数据，给出诊断建议。

账号信息：
名称：${account.name}
人设：${account.persona}
定位：${account.positioning}
内容风格：${account.content_style}
目标客户：${account.target_audience}
转化目标：${account.conversion_goal}

最近视频数据：
${JSON.stringify(posts.slice(0, 10))}

最近复盘：
${JSON.stringify(reviews.slice(0, 5))}

请输出JSON格式，包含以下字段：
- account_issues: 账号当前问题（数组）
- high_performance_commonality: 高表现内容共性（字符串）
- low_performance_issues: 低表现内容问题（字符串）
- next_week_suggestions: 下周内容建议（数组）
- risk_reminders: 风险提醒（数组）`;

export const GENERATE_TOPICS_PROMPT = (input: any) => `请根据以下信息生成10个适合宏达印业新媒体账号的内容选题。

账号信息：${JSON.stringify(input.account)}
目标用户：${input.target_audience}
产品/工艺：${input.product_or_process}
客户痛点：${input.customer_pain}
已有知识：${JSON.stringify(input.knowledge_cards || [])}

请输出JSON格式，包含以下字段的数组：
- title: 选题标题
- suitable_account: 适合账号
- content_type: 内容类型（product/process/case/qa/factory/industry/tutorial/other）
- target_audience: 目标用户
- customer_pain: 用户痛点
- opening_hook: 开头钩子（30字以内）
- conversion_goal: 转化目标
- shooting_advice: 拍摄建议
- risk_reminder: 风险提醒`;

export const GENERATE_SCRIPT_PROMPT = (input: any) => `请根据以下信息为宏达印业生成一条短视频完整脚本。

账号信息：${JSON.stringify(input.account)}
选题信息：${JSON.stringify(input.topic)}
预期时长：${input.video_length || '60秒'}
发布平台：${input.platform || '视频号'}
已有知识：${JSON.stringify(input.knowledge_cards || [])}

请输出JSON格式，包含以下字段：
- title: 视频标题
- suitable_account: 适合账号
- target_audience: 目标用户
- content_purpose: 内容目的
- video_duration: 视频时长（秒）
- core_hook: 核心钩子（30字以内）
- main_script: 完整口播稿
- shot_list: 分镜脚本（数组，每项含sequence序号、duration时长、visual画面、audio音频、text_overlay字幕重点、props道具）
- shooting_props: 需要准备的样品/道具
- subtitle_points: 字幕重点
- cover_text: 封面标题
- comment_reply: 评论区引导
- private_message_cta: 私信承接话术
- risk_notes: 风险提醒`;

export const REWRITE_SCRIPT_PROMPT = (script: string, style: string) => `请将以下脚本改写成"${style}"风格。

改写风格说明：
- 更口语：更像真人说话，去掉书面语
- 更专业：增加行业术语和工艺细节
- 更像老板口吻：更有权威感和经验感
- 更适合视频号：更沉稳、深度、适合35-50岁用户
- 更适合抖音：更短、更快、更年轻化
- 更短：压缩到原来一半长度
- 更有冲突：增加观点对立或意外结果
- 更强转化：增加引导私信和留资的语句

原脚本：
${script}

请输出JSON格式：{ rewritten_script: string, changes_made: string[] }`;

export const VIRAL_TEARDOWN_PROMPT = (input: any) => `请对以下爆款视频进行拆解分析。

平台：${input.platform}
来源账号：${input.source_account || '未知'}
标题：${input.title}
文案/描述：${input.transcript_or_description || '无'}
截图说明：${input.screenshot_notes || '无'}

请输出JSON格式，包含以下字段：
- why_viral: 为什么可能爆（字符串）
- target_pain: 抓住了什么人群痛点（字符串）
- hook_analysis: 前3秒钩子分析（字符串）
- structure: 中间内容结构（字符串）
- trust_elements: 信任元素（字符串）
- conversion_action: 转化动作（字符串）
- learnable_points: 宏达能借鉴什么（数组）
- not_suitable: 不适合照搬什么（数组）
- adapted_topics: 3个宏达改编选题（数组，每项含title、suitable_account、approach）
- suggested_script: 建议脚本初稿（字符串）`;

export const POST_REVIEW_PROMPT = (post: any, metrics: any, account: any, script: any) => `请对以下已发布视频进行复盘分析。

账号：${account.name}
标题：${post.title}
内容类型：${post.content_type}
平台：${post.platform}

数据表现：
播放量：${metrics.views}
完播率：${metrics.completion_rate * 100}%
点赞：${metrics.likes}
评论：${metrics.comments}
转发：${metrics.shares}
收藏：${metrics.favorites}
新增关注：${metrics.followers_gained}
私信数：${metrics.private_messages}
线索数：${metrics.leads_count}
有效线索数：${metrics.qualified_leads_count}

脚本信息：
${script ? script.main_script?.substring(0, 500) : '无'}

请输出JSON格式，包含以下字段：
- performance_judgment: 数据表现判断
- what_worked: 可能做得好的地方
- what_went_wrong: 可能的问题
- next_optimization: 下次优化建议
- worth_template: 是否值得沉淀为模板（boolean）
- next_content_direction: 推荐下一条内容方向`;

export const LEAD_SCORE_PROMPT = (lead: any) => `请对以下宏达印业的销售线索进行评分和分析。

客户信息：
来源平台：${lead.source_platform}
客户名称：${lead.customer_name || '未知'}
公司：${lead.company || '未知'}
产品需求：${lead.product || '未知'}
材质：${lead.material || '未知'}
数量：${lead.quantity || '未知'}
需求类型：${lead.requirement_type || '不明确'}
是否着急：${lead.is_urgent ? '是' : '否'}
客户痛点：${lead.pain_points || '未知'}

请输出JSON格式，包含以下字段：
- lead_score: 0-100的数字评分
- lead_grade: A/B/C/D
- reasoning: 评分判断理由
- missing_info: 缺失的关键信息（数组）
- next_questions: 下一步追问问题（数组）
- suggest_handover: 是否建议交接销售（boolean）
- risk_reminders: 风险提醒（数组）`;

export const LEAD_REPLY_PROMPT = (lead: any, message: string, accountStyle: string) => `请根据以下信息生成回复话术。

客户信息：
客户名称：${lead.customer_name || '未知'}
产品：${lead.product || '未知'}
材质：${lead.material || '未知'}
数量：${lead.quantity || '未知'}
需求类型：${lead.requirement_type || '不明确'}

客户消息：${message}

账号风格：${accountStyle}

请输出JSON格式，包含以下字段：
- recommended_reply: 推荐回复文本
- follow_up_questions: 需要追问的信息（数组）
- cant_say: 不能说的话（数组）
- need_sales_or_tech: 是否需要销售/技术介入（boolean）`;

export const WEEKLY_REPORT_PROMPT = (data: any) => `请根据以下一周数据生成周报分析。

日期范围：${data.date_range?.start} 至 ${data.date_range?.end}

账号表现：
${JSON.stringify(data.accounts || [])}

发布内容：
${JSON.stringify(data.posts || [])}

线索数据：
${JSON.stringify(data.leads || [])}

请输出JSON格式，包含以下字段：
- weekly_summary: 本周总结（字符串）
- account_performance: 每个账号表现（数组，每项含account_name、summary、score）
- content_type_performance: 内容类型表现（数组，每项含type、views、leads、assessment）
- lead_performance: 线索表现（字符串）
- high_value_posts: 高价值视频（数组）
- low_value_posts: 低价值视频（数组）
- next_week_suggestions: 下周建议（数组）`;


// === 脚本流水线新提示词 ===

export const GENERATE_STRATEGY_PROMPT = (input: any) => `请根据以下信息生成脚本策略卡。

账号信息：
名称：${input.account?.name}
人设：${input.account?.persona}
定位：${input.account?.positioning}
目标客户：${input.account?.target_audience}
说话风格：${input.account?.content_style}
转化目标：${input.account?.conversion_goal}

选题/用户输入：
产品/工艺：${input.product_or_process}
客户痛点：${input.customer_pain}
目标客户：${input.target_audience}
材料：${input.material || '未知'}
转化目标：${input.conversion_goal}

知识卡参考：${JSON.stringify((input.knowledgeCards || []).slice(0, 5))}

请输出JSON格式，包含以下字段：
- topic: 脚本主题
- targetCustomer: 目标客户
- customerPain: 客户痛点
- corePoint: 核心观点
- whyWatch: 用户为什么愿意看
- solveWhat: 这条视频解决什么问题
- hookDirection: 前3秒钩子方向
- structure: 内容结构
- conversionGoal: 转化目标
- risksToAvoid: 需要避免的风险（数组）
- suitablePlatform: 适合平台
- suggestedDuration: 建议时长
- suggestedActing: 建议出镜方式
- recommendedTemplate: 建议脚本模板类型`;

export const GENERATE_DRAFT_PROMPT = (strategy: any, account: any, template: string) => `请根据以下脚本策略卡和账号人设，生成一条短视频完整口播脚本。

【脚本策略】
主题：${strategy.topic}
目标客户：${strategy.targetCustomer}
客户痛点：${strategy.customerPain}
核心观点：${strategy.corePoint}
前3秒钩子方向：${strategy.hookDirection}
内容结构：${strategy.structure}
转化目标：${strategy.conversionGoal}
建议时长：${strategy.suggestedDuration}秒
建议出镜方式：${strategy.suggestedActing}

【账号人设】
名称：${account.name}
人设：${account.persona}
定位：${account.positioning}
说话风格：${account.content_style}
目标客户：${account.target_audience}

【脚本模板】
${template}

生成要求：
1. 开头必须是客户真实场景，前3秒就要抓住人。
2. 中间要讲清楚一个判断逻辑或工艺原理，不能空泛。
3. 语言要像工厂老板/业务员在说话，不是官方文案。
4. 句子要短，每句话不超过30字。
5. 不要用"首先、其次、最后、综上所述、显而易见、有效提升、赋能、助力"这些词。
6. 结尾必须有客户下一步动作引导。
7. 不能承诺价格、交期、附着力。
8. 总时长控制在${strategy.suggestedDuration}秒左右。
9. 输出完整的口播稿件，不是大纲。

请输出JSON格式，包含以下字段：
- title: 脚本标题
- hook: 前3秒钩子
- mainScript: 完整口播稿
- shotList: 分镜建议（数组，每项含sequence, duration, visual, audio, text_overlay, props）
- shootingProps: 需要准备的样品/道具
- subtitlePoints: 字幕重点
- coverText: 封面文案
- commentGuidance: 评论区引导
- privateMessageCta: 私信承接话术
- riskNotes: 风险提醒`;

export const POLISH_SCRIPT_PROMPT = (script: string) => `请将以下脚本改写成更能被接受的口语版本。

改写规则：
1. 不要像文章，要像真人在说话。
2. 每句话尽量短，控制在20字以内。
3. 不要使用：首先、其次、最后、综上所述、显而易见、有效提升、赋能、助力、一站式、全方位、闭环、矩阵、赋能、优化、解决方案。
4. 少用形容词，多用客户听得懂的例弟。
5. 开头直接说事，不要铺垫。
6. 更像工厂老板、业务顾问或一线工艺人员在说话。
7. 句子之间用"你记住"、"说白了"、"我跟你说"连接。

原脚本：
${script}

请输出JSON格式：{ polishedScript: string, changes: string[] }`;

export const CHECK_RISK_PROMPT = (script: string, knowledgeCards: any[]) => `请对以下脚本进行风险检查。

脚本内容：
${script}

参考知识卡：
${JSON.stringify(knowledgeCards.slice(0, 10))}

检查项：
1. 是否乱承诺一定能做
2. 是否乱承诺价格
3. 是否乱承诺交期
4. 是否乱承诺附着力
5. 是否说"保证不掉"
6. 是否说颜色百分百一致
7. 是否泄露内部工艺参数
8. 是否涉及客户Logo/品牌授权风险
9. 是否过度贬低其他工艺或同行
10. 是否把待审核知识当成确定结论

请输出JSON格式，包含以下字段：
- riskLevel: 低/中/高
- riskPoints: 风险点（数组）
- suggestedRewrites: 建议改法（数组）
- saferExpressions: 更安全的表达（数组）
- allowSave: true/false`;

export const SCORE_SCRIPT_PROMPT = (script: string, account: any) => `请对以下脚本进行评分。

脚本内容：
${script}

账号人设：${account?.name}
目标客户：${account?.target_audience}

评分维度（100分制）：
- 前3秒钩子：开头能不能留住人（15分）
- 客户痛点明确：说没说清楚客户的问题（15分）
- 账号人设匹配：语气像不像这个账号说出来的（15分）
- 口语化程度：像不像真人在说话（15分）
- 知识库依据：内容有没有工艺/材质/工厂依据（15分）
- 拍摄可执行性：拍摄团队能不能看懂（10分）
- 转化动作清楚：结尾有没有让人想行动（10分）
- 风险表达安全：有没有乱承诺（5分）

推荐状态规则：
- score >= 85 且风险低：待审核
- score 70-84：草稿
- score 60-69：草稿（需重写）
- score < 60：不建议保存

请输出JSON格式，包含以下字段：
- score: 总分
- grade: A/B/C/D
- strengths: 优点（数组）
- weaknesses: 不足（数组）
- rewriteSuggestions: 修改建议（数组）
- recommendedStatus: 推荐状态`;

