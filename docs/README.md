# docs

这个目录是 `小红书抖音矩阵获客平台` 的文档主入口。

当前项目已经从 2026-04-19 的早期探索，进入 `staging 可运行 + V2.1 协作开发` 阶段。因此默认不要再把早期探索稿当作当前真相源。

## 当前推荐阅读顺序

新 Agent、W 同学、M 同学或双方各自的 AI 进入项目前，建议按下面顺序读：

1. `../AGENTS.md`
2. `README.md`
3. `协作/W-M同学协作README.md`
4. `产品文档/V2.1-咨询驱动主链路体验补强-PRD.md`
5. `产品文档/V2.1-内容日历到图文视频工作台协作PRD.md`
6. `架构规范/2026-04-25-AI视频图文数据与系统架构补充决策.md`
7. `架构规范/2026-04-24-consultation-agent-runtime-rag-spec.md`
8. `progress/2026-04-25-supabase-migration-current-state.md`

如果是接续某个未完成任务，再读对应 `handoff/` 或 `progress/`。不要一上来全量读历史文档。

## 当前最重要的文档

### 协作

- `协作/W-M同学协作README.md`

说明 W 同学（产品）和 M 同学（开发）如何协作，哪些内容可以口头聊，哪些接口、表结构、worker 输入输出必须写文档。

### 产品

- `产品文档/V2.1-咨询驱动主链路体验补强-PRD.md`
- `产品文档/V2.1-内容日历到图文视频工作台协作PRD.md`

这两份是当前产品主线。V0.1 系列属于历史资料，不再作为默认开发依据。

### 架构

- `架构规范/2026-04-25-AI视频图文数据与系统架构补充决策.md`
- `架构规范/2026-04-24-consultation-agent-runtime-rag-spec.md`

这两份说明当前 AI 视频、图文数据、咨询 Agent runtime、RAG 和上下文调度的约定。

### 当前执行状态

- `progress/2026-04-25-supabase-migration-current-state.md`

这份记录 staging Supabase migration 当前状态。涉及数据库、worker、视频任务时优先读它。

## 目录说明

- `协作/`：W-M 协作说明，给产品、开发和各自 AI 读的沟通约定。
- `产品文档/`：PRD、页面流程、用户故事、验收标准。
- `架构规范/`：接口约束、状态机、数据结构、Agent runtime、发布链路规则。
- `progress/`：执行日志、验证记录、部署和迁移事实。
- `handoff/`：交接文档、冻结说明、任务书。
- `探索/`：早期方案探索、竞品拆解、外部项目研究。
- `designs/`：历史 UI 原型和视觉参考。
- `test/`：历史测试清单和点击验证记录。

## 历史文档怎么使用

以下目录默认不要作为当前开发真相源：

- `探索/`
- 旧的 `handoff/`
- 旧的 `progress/`
- `designs/`
- `test/`
- `产品文档/V0.1-*`
- `架构规范/V0.1-*`

这些文档可以保留在 GitHub 历史和本地仓库里，用来追溯思路；但如果要给 M 同学或新 AI 一个干净上下文，建议只提供当前 V2.1 文档和必要架构/进度文件。

## 外部参考项目

外部开源项目本地副本放在：

```text
../references/
```

`references/` 已在根目录 `.gitignore` 中忽略，不提交到 GitHub / Gitee。需要参考时在本地读取，不要把参考项目代码 vendor 到当前仓库。

## 给 M 同学的最小上下文建议

如果要把代码同步到 Gitee 给 M 同学，建议 docs 只保留：

- `README.md`
- `协作/W-M同学协作README.md`
- `产品文档/V2.1-咨询驱动主链路体验补强-PRD.md`
- `产品文档/V2.1-内容日历到图文视频工作台协作PRD.md`
- `架构规范/2026-04-25-AI视频图文数据与系统架构补充决策.md`
- `架构规范/2026-04-24-consultation-agent-runtime-rag-spec.md`
- `progress/2026-04-25-supabase-migration-current-state.md`

其他历史文档先不要给默认上下文，避免 M 同学的 AI 被早期方案或旧部署日志带偏。
