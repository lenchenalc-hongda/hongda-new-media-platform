# 宏达新媒体作战中台 - MVP验收清单

## 基础
- [x] 项目可以 npm install 后运行
- [x] npm run dev 可以打开页面
- [x] 所有主导航页面可访问
- [x] 有基础登录页面
- [x] 无 OPENAI_API_KEY 时，AI按钮返回 mock 结果
- [x] 有 OPENAI_API_KEY 时，AI按钮调用真实 API
- [x] 所有核心页面都有新增、编辑、查看、筛选的基础能力
- [x] 数据结构清楚，方便后续接入 Supabase
- [x] UI 文案全部是中文
- [x] AI 结果符合宏达新媒体业务场景
- [x] 代码模块化，方便后续继续开发

## 页面验收
- [x] /login - 登录页
- [x] /dashboard - 战情盘首页
- [x] /accounts - 账号矩阵
- [x] /accounts/[id] - 账号详情
- [x] /topics - 选题库
- [x] /scripts - 脚本工厂
- [x] /teardowns - 爆款拆解
- [x] /calendar - 发布日历
- [x] /posts - 数据复盘
- [x] /leads - 线索中心
- [x] /knowledge - 知识库
- [x] /reports - 报表
- [x] /settings - 设置

## AI功能
- [x] 账号诊断
- [x] 选题生成
- [x] 脚本生成
- [x] 脚本改写
- [x] 爆款拆解
- [x] 复盘分析
- [x] 线索评分
- [x] 回复话术
- [x] 周报生成

## 数据库
- [x] 完整的16张表SQL
- [x] 索引策略
- [x] RLS策略模板
- [x] 种子数据
- [x] 角色字段预留
