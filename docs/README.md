# docs

状态时间：`2026-05-26 00:50 CST`

这是 `小红书抖音矩阵获客平台` 的文档主入口。

当前文档原则：少而准。默认只读当前真相源，不再把早期探索稿、旧分阶段计划、旧增长 Agent 方案当作实现依据。

## 当前运行口径

截至 `2026-05-22`，当前主线已经不是 Supabase Cloud / Vercel / 新加坡 COS 口径。

- 数据库：当前主线按自建 PostgreSQL / 国内 PostgreSQL 运行；app 使用 `APP_DATABASE_URL` / `DATABASE_URL`，worker 使用 `WORKER_DATABASE_URL`。
- 部署：当前目标和已发布链路是国内云服务器自托管 Next.js / Node API、content-generation worker、video-worker、OpenStoryline / FireRed。
- 对象存储：当前 app / worker runtime 只支持 `aliyun_oss` / object storage。`tencent_cos`、COS、`supabase_storage` 只作为历史数据、历史文档、历史迁移记录或迁移 guard 语境存在。
- Supabase：这是过往架构，当前运行主线已经完全改掉，正式运行和新开发不再使用 Supabase。2026-05-26 本地 `main` 已完成 Supabase runtime / fallback / package / env 清理；如遇旧词命中，先按 `progress/2026-05-25-supabase-cos-removal-final-audit.md` 和 `progress/2026-05-26-supabase-cos-removal-main-merge.md` 区分运行面与历史资料。
- 历史索引：遇到 2026-05-20 之前的 Supabase / Vercel / COS / staging 检索结果，先看 `历史架构与非当前口径索引.md` 判断它是否只是历史流水账。

## 推荐阅读顺序

1. `../AGENTS.md`
2. `README.md`
3. `协作/W-M同学协作README.md`
4. `产品文档/V2.1-咨询驱动主链路体验补强-PRD.md`
5. `产品文档/V2.1-内容日历到图文视频工作台协作PRD.md`
6. `架构规范/2026-04-28-current-architecture.md`
7. `架构规范/2026-05-12-内容日历批量生成与Dify过渡架构决策.md`
8. `架构规范/2026-05-15-Dify主链路国内自托管方案/`
9. `架构规范/2026-05-13-国内化部署与ba-ba-ke域名备案决策.md`
10. `../app/db/README.md`
11. `progress/2026-05-20-main-domestic-infra-merge.md`
12. `progress/2026-05-19-cos-to-oss-local-migration.md`
13. `progress/2026-05-21-voice-fix-main-release.md`
14. `progress/2026-05-25-supabase-cos-removal-final-audit.md`
15. `progress/2026-05-26-supabase-cos-removal-main-merge.md`
16. `历史架构与非当前口径索引.md`
17. `架构规范/2026-05-20-Agent架构易错点.md`

如果是在接续当前未完成事项，再读 `current-task.md`。如果是在规划 V2.2 合并后的下一阶段，再读 `需求池.md` 和 `探索/2026-04-28-热点抓取与咨询Agent优化待验证事项.md`。

如果是在执行新的国内化技术验证，先读 `progress/2026-05-20-main-domestic-infra-merge.md` 和 `progress/2026-05-21-voice-fix-main-release.md`，再读具体任务相关 handoff。

如果是在追溯早期国内化代码改造计划，再读 `handoff/2026-05-13-国内化代码改造与迁移计划表.md`。

如果是在追溯 `codex/domestic-infra-migration` 历史 worktree，再读 `架构规范/2026-05-13-国内化改造分支冻结与恢复断点.md`。当前主线状态以 2026-05-20 之后的 progress / release 记录为准。

## 当前真相源

### 产品

- `产品文档/V2.1-咨询驱动主链路体验补强-PRD.md`
- `产品文档/V2.1-内容日历到图文视频工作台协作PRD.md`

这两份定义当前商家端主链路、内容日历、图文工作台、视频工作台和 worker 协作目标。

### 架构

- `架构规范/2026-04-28-current-architecture.md`
- `架构规范/2026-05-12-内容日历批量生成与Dify过渡架构决策.md`
- `架构规范/2026-05-13-国内化部署与ba-ba-ke域名备案决策.md`
- `架构规范/2026-05-20-Agent架构易错点.md`
- `架构规范/2026-05-15-Dify主链路国内自托管方案/`

这份是当前架构总说明，覆盖：

- 咨询台信息来源
- 脚本制作 agent
- app 确认和合同化
- `video_edit_jobs.input_payload`
- 对象存储媒体资产：当前 app / worker runtime 只支持 `aliyun_oss` / object storage；`tencent_cos` / COS 仅作为历史资料或迁移 guard 语境存在
- video-worker
- Docker FireRed/OpenStoryline
- 预览审核和修订分流

`2026-05-12-内容日历批量生成与Dify过渡架构决策.md` 补充定义内容日历批量生成的运行方式：Dify / 后续 LangGraph.js 只负责单条生成，系统负责批量展开、队列、限流、重试、进度和落库。

`2026-05-13-国内化部署与ba-ba-ke域名备案决策.md` 补充定义国内生产部署方向：`ba-ba-ke.com` 域名规划、ICP备案取舍、从 Vercel / Supabase Cloud / 新加坡链路迁到国内服务器、国内 PostgreSQL、国内对象存储和自有 Node API 的分阶段方案。该文档是迁移方向依据；当前落地状态以 2026-05-19 之后的 OSS / release 记录为准。

`2026-05-13-国内化改造分支冻结与恢复断点.md` 是国内化改造历史恢复入口，记录 `codex/domestic-infra-migration` 分支、worktree、冻结 commit 和当时阻塞项。它不再代表当前 main 的最新状态。

`2026-05-20-Agent架构易错点.md` 记录编写 Agent runtime、RAG、工具调用和 workflow 输入组装时容易犯的分层错误：不要把模型判断、业务判断或创意判断写死在代码默认值里；代码负责传递真实事实和 trace，prompt/LLM 负责基于事实做生成判断。

`2026-05-15-Dify主链路国内自托管方案/` 补充定义 Dify 作为内容生成主链路时的工作流、落库合同、单队列消费、用户点击 AI 剪辑后的 `video_edit_jobs` 边界、国内自托管部署边界和硬门禁。

旧的增长 Agent 文档、旧 skeleton 默认路径、旧分阶段 worker / FireRed work-plan 不再作为当前依据。

### 数据库、存储和部署状态

- `../app/db/README.md`
- `progress/2026-05-20-main-domestic-infra-merge.md`
- `progress/2026-05-19-cos-to-oss-local-migration.md`
- `progress/2026-05-21-voice-fix-main-release.md`
- `progress/2026-05-25-supabase-cos-removal-final-audit.md`
- `progress/2026-05-26-supabase-cos-removal-main-merge.md`

当前主线口径：

- `app/db/README.md` 和 `app/db/migrations/` 是普通 PostgreSQL baseline 和后续自托管 schema 的当前入口。
- `2026-05-20-main-domestic-infra-merge.md` 记录国内化迁移内容合入 main 的事实和验证结果。
- `2026-05-19-cos-to-oss-local-migration.md` 记录从 COS 口径切到 Aliyun OSS 默认值的本地改造、验证和已知 caveat。
- `2026-05-21-voice-fix-main-release.md` 记录服务器 release 后 health check：`database=postgres`、`storage=aliyun_oss`。
- `2026-05-25-supabase-cos-removal-final-audit.md` 记录 Supabase / COS 运行面清理后的最终审计。
- `2026-05-26-supabase-cos-removal-main-merge.md` 记录清理分支本地合并回 `main`、follow-up 修复和合并后验证。

历史追溯时再读：

- `progress/2026-04-25-supabase-migration-current-state.md`：旧 Supabase staging / migration 状态。
- `progress/2026-05-13-staging-server-resource-log-analysis.md`：早期 staging 服务器资源分析。
- `handoff/2026-05-13-国内化技术验证采购与迁移执行计划.md`：采购和迁移早期计划。
- `handoff/2026-05-13-国内化代码改造与迁移计划表.md`：国内化改造分支早期任务表。

处理数据库、对象存储、部署和登录问题时，不要再优先读取旧 Supabase migration 文档。除非任务明确要求追溯旧 staging，否则先看 PostgreSQL / Aliyun OSS / 国内服务器 release 记录。

如果模型或协作者通过搜索命中了 2026-05-20 之前的 Supabase / Vercel / COS / staging 文档，先按 `历史架构与非当前口径索引.md` 判定其历史层级，再决定是否继续阅读。`progress/` 和 `handoff/` 中的旧记录默认表示“当时发生过什么”，不自动代表当前真相源。

### 协作

- `协作/W-M同学协作README.md`

这份定义 W 同学、M 同学和 AI Agent 如何交接、冻结、验收、避免互相覆盖。

### 后续任务池

- `需求池.md`
- `探索/2026-04-28-热点抓取与咨询Agent优化待验证事项.md`

这两份记录 V2.2 合并后下一阶段要做的事项：先跑通全链路，再验证 TikHub 等抓取 API、内容资产复利工程、咨询 Agent RAG 方法论和 runtime/tools/skills 优化。它们是待验证任务，不是当前已实现状态。

## 目录说明

- `产品文档/`：PRD、页面流程、验收标准。
- `架构规范/`：当前架构说明、接口约束、状态机、数据结构、Agent runtime、发布链路规则。
- `协作/`：协作规则、面向产品/开发/AI 的说明。
- `progress/`：当前状态、执行日志和验证事实。
- `handoff/`：交接文档和任务冻结说明。
- `可复用方案/`：反复出现的问题诊断、改动方案和验证清单。
- `探索/`：历史探索资料和待验证事项，默认不作为真相源。
- `designs/`：历史 UI 原型和视觉参考。
- `test/`：历史测试清单和点击验证记录。
- `需求池.md`：后续想法、待验证事项和可进入下一阶段的需求池。

## 历史文档使用规则

默认不要把以下内容作为当前开发依据：

- 旧 `探索/`
- 旧 `handoff/`
- 旧 `progress/`
- 旧 V0.1 文档
- 旧增长 Agent / GrowthBrief / VideoStrategy 文档
- 旧 skeleton-only worker 计划

需要追溯历史时可以回 Git 历史查。日常接手只读当前真相源。

## 最小上下文建议

给新 Agent 或协作者时，优先只给：

- `AGENTS.md`
- `docs/README.md`
- `docs/协作/W-M同学协作README.md`
- 两份 V2.1 产品文档
- `docs/架构规范/2026-04-28-current-architecture.md`
- `docs/架构规范/2026-05-13-国内化部署与ba-ba-ke域名备案决策.md`
- `docs/架构规范/2026-05-15-Dify主链路国内自托管方案/`
- `app/db/README.md`
- `docs/progress/2026-05-20-main-domestic-infra-merge.md`
- `docs/progress/2026-05-21-voice-fix-main-release.md`
- `docs/progress/2026-05-25-supabase-cos-removal-final-audit.md`
- `docs/progress/2026-05-26-supabase-cos-removal-main-merge.md`
- `docs/历史架构与非当前口径索引.md`
- `docs/架构规范/2026-05-13-国内化改造分支冻结与恢复断点.md`，仅当追溯历史国内化分支时提供
- `docs/current-task.md`，仅当任务正在接续时提供
