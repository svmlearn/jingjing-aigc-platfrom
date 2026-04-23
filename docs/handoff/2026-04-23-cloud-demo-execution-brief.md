# `docs/handoff/2026-04-23-cloud-demo-execution-brief.md`

## Summary
- 本文档是后续长时执行的唯一真相源。
- 最终目标不是“补几个模块”，而是交付一个**能真实跑通全流程的商家平台 demo**：
  - 商家进入平台
  - 发起咨询对话
  - 生成产品定位、卖点、目标客群、策略建议
  - 自动沉淀内容日历
  - 跳转到图文工作台继续创作并保存
  - 跳转到视频工作台继续创作并生成视频任务结果
  - 历史记录、设置页、内容中心都能读到真实数据
- 商家侧 UI 与交互流程以 `docs/designs/AI设计的原型图/` 为最高优先级真相源；现有 Next.js 仓库仅作为承接底座。原型图里已有的页面与流程必须 1:1 复刻；原型图没画全的缺口，只允许顺着同一视觉和流程逻辑补齐。
- 云端拓扑固定为四层分离：`Vercel` 承接前端与同步业务/Agent API，`Supabase` 承接 Auth/业务数据/pgvector，`腾讯云 COS` 承接媒体与文档文件，独立云主机 `Worker` 承接视频渲染与知识库异步处理。
- 连续执行停止条件不是“代码先做一半”，而是达到本文档的 Completion Gate。未达到门槛不得主动停止，除非缺少外部仓库权限或云端密钥这类硬阻塞。

## Reference Mapping
- 商家端视觉与页面流程主参考：
  - `docs/designs/AI设计的原型图/src/components/layout/MainLayout.tsx`
  - `docs/designs/AI设计的原型图/src/pages/Consultation.tsx`
  - `docs/designs/AI设计的原型图/src/pages/ArticleWorkbench.tsx`
  - `docs/designs/AI设计的原型图/src/pages/VideoWorkbench.tsx`
  - `docs/designs/AI设计的原型图/src/pages/ContentCenter.tsx`
  - `docs/designs/AI设计的原型图/src/pages/History.tsx`
  - `docs/designs/AI设计的原型图/src/pages/Settings.tsx`
  - `docs/designs/AI设计的原型图/src/index.css`
- 咨询 Agent 主参考项目：
  - `references/open-source/hermes-agent/`
  - `references/open-source/claude-code泄漏的客户端源码/claude-code-main/`
- 咨询 Agent 具体借鉴点：
  - loop、迭代预算、中断/重试：`references/open-source/hermes-agent/run_agent.py`
  - system prompt 组装、上下文文件注入、tool discipline：`references/open-source/hermes-agent/agent/prompt_builder.py`
  - tool schema、参数修复、dispatcher：`references/open-source/hermes-agent/model_tools.py`
  - 会话压缩：`references/open-source/hermes-agent/trajectory_compressor.py`
  - 会话历史持久化与回放：`references/open-source/hermes-agent/hermes_state.py`
  - Claude Code 本地副本优先借鉴“对话时像在工作的体验”和轻量过程可见，不把它作为唯一实现来源。
- AI 图文主参考项目：
  - `references/open-source/AIWriteX/`
  - 重点参考：`src/ai_write_x/core/unified_workflow.py`、`src/ai_write_x/core/content_generation.py`、`src/ai_write_x/adapters/platform_adapters.py`、`knowledge/templates/`
- AI 视频主参考项目：
  - `references/open-source/小红书AI剪辑视频/`
  - 重点参考：`src/open_storyline/agent.py`、`src/open_storyline/utils/prompts.py`、`src/open_storyline/utils/media_handler.py`、`src/open_storyline/utils/ffmpeg_utils.py`、`src/open_storyline/storage/agent_memory.py`、`src/open_storyline/mcp/`
- 发布与平台适配备用参考：
  - `references/open-source/social-auto-upload/`
- 导入与采集备用参考：
  - `references/open-source/MediaCrawler/`
- 执行要求：
  - 所有 handoff、progress、实现说明只写仓库相对路径。
  - 每个子系统最终都要在 handoff 里注明“实际采用了哪个参考项目的哪些路径”。

## Implementation Changes
### 1. 商家端 UI 与页面结构
- 现有商家后台导航、布局、色彩、信息密度全部切到 AI 原型图风格；不要保留当前浅色工作台作为主界面。
- 页面结构按原型图落齐并接到真实路由：
  - `咨询诊断`
  - `图文工作台`
  - `视频工作台`
  - `内容中心`
  - `我的内容/历史`
  - `商家设置`
- 原型图里已有的卡片、抽屉、对话区、策略资产区、日历区、脚本画布、历史详情结构都要保留；缺失状态顺着同一交互逻辑补。
- 商家端首页固定为咨询页，不再以导入页为默认首页。

### 2. 咨询 Agent 与策略沉淀
- 新增咨询会话域模型：
  - `consultation_sessions`
  - `consultation_messages`
  - `consultation_events`
- `consultation_sessions` 内固定沉淀结构化 `strategy_snapshot`，至少包含：
  - 商家定位
  - 核心卖点
  - 目标客群
  - 关键场景
  - 当前建议
  - 内容策略标签
  - 内容日历草案
- 咨询 Agent 固定放在 Next.js `nodejs` API 内执行，采用 Hermes 风格的有界工具循环：
  - 系统提示词组装
  - 最近会话 + 结构化快照 + RAG 召回拼接
  - JSON Schema 工具调用
  - 参数修复
  - 工具结果回灌
  - 会话摘要压缩
- 咨询阶段的工具面固定为：
  - 读取商家资料
  - 检索平台知识库
  - 更新策略快照
  - 更新内容日历
  - 生成图文任务草案
  - 生成视频脚本任务草案
  - 读取历史会话/历史内容
- 对话界面必须呈现“轻量可见执行”：
  - 当前阶段
  - 已调用的能力卡片
  - 关键中间结论
  - 最终答复
  - 不展示原始长日志和原始 prompt

### 3. 平台统一配置与文档 RAG
- 平台管理台新增并接真实配置：
  - `consultation_agent`
  - `knowledge_runtime`
  - 继续保留 `llm_runtime`、`import_runtime`、`membership_plans`
- 咨询 Agent 的 `system prompt`、启用工具/技能、可见执行模式、检索参数全部放平台管理台统一配置；商家不直接改 Agent policy。
- 新增平台知识库：
  - `knowledge_documents`
  - `knowledge_chunks`
  - `knowledge_ingestion_jobs`
- 第一版知识库直接做完整文档 RAG：
  - 文档上传到 COS
  - 异步解析/切块
  - embedding 入库到 Supabase pgvector
  - 会话时按 query + 商家上下文召回
- 商家设置页保留原型图结构，作为业务事实录入入口；它给咨询、图文、视频三条链路提供稳定上下文。

### 4. 图文工作台
- 当前 mock 改写逻辑必须替换为真实生成链路。
- 图文生成输入固定包括：
  - 当前咨询快照
  - 商家资料
  - 参考素材/来源内容
  - 评论摘要
  - RAG 召回结果
  - 用户补充要求
- 图文生成输出固定包括：
  - 多个标题方案
  - 正文
  - hashtags
  - CTA
  - 配图建议
  - 可选图片 prompt/brief
- 输出必须真实落到 `content_drafts / content_variants`，历史页和内容中心要能读到。
- “智能生成配图”第一版至少要返回真实的可复制/可继续执行的 brief 与 prompt；若平台 LLM/图像配置允许，再补真实预览图。

### 5. 视频工作台
- 保留当前 `video_edit_jobs + COS + worker` 架构，不把视频长任务塞回 Vercel。
- 视频工作台与原型图一致：左侧咨询式脚本协同，右侧镜头表/素材上传/任务状态。
- 视频脚本生成输入固定来自：
  - 当前咨询快照
  - 商家资料
  - RAG 召回
  - 用户补充要求
  - 上传素材元数据
- 当前 worker 中的 `openstoryline-engine` stub 必须替换成真实适配层，优先借鉴 `references/open-source/小红书AI剪辑视频/`。
- 为确保 demo 一定跑通，视频执行必须双轨：
  - 正常轨：按参考项目做素材理解、脚本、时间线、字幕、封面、导出。
  - 保底轨：若完整流程失败，自动退化为 `ffmpeg` 模板混剪，仍产出 MP4、封面、字幕并回写任务状态。
- 最终页面上必须能看到真实任务推进、失败原因、重试、取消、结果预览。

### 6. 内容中心与历史
- 内容中心不再只是导入/草稿列表，要能承接咨询产出的图文与视频内容资产。
- 历史页要统一展示：
  - 咨询会话
  - 图文草稿
  - 视频脚本
  - 视频成片任务
- 历史详情页必须能进入具体会话、草稿或视频任务详情，不保留纯 mock。

## Public Interfaces
- 平台设置接口新增：
  - `consultationAgent`
  - `knowledgeRuntime`
- 新增咨询接口：
  - 创建会话
  - 列出会话
  - 获取会话详情
  - 流式响应
  - 历史读取
  - 策略快照读取
- 新增知识库接口：
  - 文档创建/上传
  - 文档列表/详情
  - 入库任务状态
  - 重试/删除
- 新增内容生成接口：
  - 图文生成
  - 配图建议生成
  - 视频脚本生成
- 新增类型：
  - 咨询会话/消息/事件
  - 策略快照
  - 知识文档/切块/入库任务
- 所有新增接口都必须优先复用当前仓库已有 contract/repository/API 分层风格。

## Completion Gate
- 只有当以下全部成立，执行才允许停止：
  - 商家端主界面视觉与流程已切换到 AI 原型图风格，主页面不再是旧浅色后台。
  - 商家可以真实发起咨询，对话至少 3 轮，并看到卖点、定位、客群、建议、内容日历被沉淀。
  - 商家可以从咨询页进入图文工作台，生成真实草稿并保存。
  - 商家可以从咨询页进入视频工作台，上传素材、创建真实视频任务并看到结果或保底结果。
  - 历史页与内容中心能读到真实生成数据。
  - 平台管理台能修改咨询 Agent 配置与知识库，并影响下一轮咨询结果。
  - 至少有 1 条端到端录屏或等价的完整验收记录可以证明全流程能跑。
- 如果某一环完整实现受外部依赖阻塞，必须提供同路径保底方案，不能只留 TODO。

## Test Plan
- 商家链路：
  - 注册/登录
  - 进入咨询页
  - 连续 3 轮对话
  - 看到策略资产与内容日历更新
  - 分别进入图文/视频页继续执行
- RAG 链路：
  - 平台上传文档
  - 入库完成
  - 咨询与内容生成都能命中文档内容
- 图文链路：
  - 生成 2 个版本
  - 重新生成
  - 保存草稿
  - 历史可见
- 视频链路：
  - 上传素材
  - 创建任务
  - 状态推进
  - 成片、封面、字幕至少有一套真实产物
  - 完整轨失败时保底轨仍成功
- 管理台链路：
  - 修改 prompt、技能开关、检索参数、知识文档后，下一轮咨询立即生效
- 技术验证：
  - `pnpm lint`
  - `pnpm build`
  - 主要 API smoke check
  - worker Python compile
  - compose 配置检查
  - 至少 1 条真实视频任务验证
- 文档验证：
  - 最终 handoff 必须包含“参考项目采用情况”和“全流程验收结果”两节。

## Assumptions
- 这份内容就是目标文档正文。
- 当前仍处于 Plan Mode，所以我不能直接把它写入仓库文件；退出 Plan Mode 后第一步就应写入 `docs/handoff/2026-04-23-cloud-demo-execution-brief.md`。
- 平台统一拥有咨询 Agent 配置权；商家设置只提供业务事实，不直接配置 system prompt / skill。
- 第一版向量检索后端默认使用 Supabase pgvector，文档文件默认落 COS。
- `references/open-source/hermes-agent/` 是咨询 Agent 的实现主参考；Claude Code 是体验主参考。
- 真正推到云端时，只要 GitHub 仓库访问与 Vercel/Supabase/COS/Worker 所需密钥具备，就按本文档连续执行到底，直到满足 Completion Gate。
