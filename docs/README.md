# docs

状态时间：`2026-05-13 18:37:02 CST`

这是 `小红书抖音矩阵获客平台` 的文档主入口。

当前文档原则：少而准。默认只读当前真相源，不再把早期探索稿、旧分阶段计划、旧增长 Agent 方案当作实现依据。

## 推荐阅读顺序

1. `../AGENTS.md`
2. `README.md`
3. `协作/W-M同学协作README.md`
4. `产品文档/V2.1-咨询驱动主链路体验补强-PRD.md`
5. `产品文档/V2.1-内容日历到图文视频工作台协作PRD.md`
6. `架构规范/2026-04-28-current-architecture.md`
7. `架构规范/2026-05-12-内容日历批量生成与Dify过渡架构决策.md`
8. `架构规范/2026-05-13-国内化部署与ba-ba-ke域名备案决策.md`
9. `progress/2026-04-25-supabase-migration-current-state.md`
10. `progress/2026-05-13-staging-server-resource-log-analysis.md`

如果是在接续当前未完成事项，再读 `current-task.md`。如果是在规划 V2.2 合并后的下一阶段，再读 `需求池.md` 和 `探索/2026-04-28-热点抓取与咨询Agent优化待验证事项.md`。

如果是在执行国内化技术验证，先读 `handoff/2026-05-13-国内化技术验证采购与迁移执行计划.md`。

如果是在开分支做国内化代码改造，先读 `handoff/2026-05-13-国内化代码改造与迁移计划表.md`。

## 当前真相源

### 产品

- `产品文档/V2.1-咨询驱动主链路体验补强-PRD.md`
- `产品文档/V2.1-内容日历到图文视频工作台协作PRD.md`

这两份定义当前商家端主链路、内容日历、图文工作台、视频工作台和 worker 协作目标。

### 架构

- `架构规范/2026-04-28-current-architecture.md`
- `架构规范/2026-05-12-内容日历批量生成与Dify过渡架构决策.md`
- `架构规范/2026-05-13-国内化部署与ba-ba-ke域名备案决策.md`

这份是当前架构总说明，覆盖：

- 咨询台信息来源
- 脚本制作 agent
- app 确认和合同化
- `video_edit_jobs.input_payload`
- COS 媒体资产
- video-worker
- Docker FireRed/OpenStoryline
- 预览审核和修订分流

`2026-05-12-内容日历批量生成与Dify过渡架构决策.md` 补充定义内容日历批量生成的运行方式：Dify / 后续 LangGraph.js 只负责单条生成，系统负责批量展开、队列、限流、重试、进度和落库。

`2026-05-13-国内化部署与ba-ba-ke域名备案决策.md` 补充定义国内生产部署方向：`ba-ba-ke.com` 域名规划、ICP备案取舍、从 Vercel / Supabase Cloud / 新加坡链路迁到国内服务器、国内 PostgreSQL、国内 COS 和自有 Node API 的分阶段方案。

旧的增长 Agent 文档、旧 skeleton 默认路径、旧分阶段 worker / FireRed work-plan 不再作为当前依据。

### 数据库和部署状态

- `progress/2026-04-25-supabase-migration-current-state.md`
- `progress/2026-05-13-staging-server-resource-log-analysis.md`
- `handoff/2026-05-13-国内化技术验证采购与迁移执行计划.md`
- `handoff/2026-05-13-国内化代码改造与迁移计划表.md`

Supabase migration 当前状态记录涉及数据库、worker 表结构、资产表和作业表，处理这些内容时优先读取。

staging 服务器资源日志分析记录了当前 2 核 4G 服务器的 CPU / 内存峰值、worker 单并发事实、FireRed / OpenStoryline 资源判断，以及第一阶段建议购买 1 台国内 8 核 16G 单机混跑服务器的依据。

国内化技术验证采购与迁移执行计划记录第一批国内资源采购清单、迁移范围、D0-D5 执行路线、IP 验证边界和验收标准。执行国内服务器 / 国内 PostgreSQL / 国内 COS 验证时优先读取。

国内化代码改造与迁移计划表记录后续独立分支改造范围：迁移哪些模块、如何替换 Supabase/Vercel、如何接国内 PostgreSQL 和 COS、如何处理 Auth、worker、PWA、验收和回滚。

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
- `docs/progress/2026-04-25-supabase-migration-current-state.md`
- `docs/current-task.md`，仅当任务正在接续时提供
