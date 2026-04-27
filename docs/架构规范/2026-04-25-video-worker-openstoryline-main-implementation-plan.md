# 2026-04-25 视频生产工具主设计实施方案

## 1. 结论

本工具的主要实施方案定为：

`作业合同先行 + 现有 video-worker 承载 + OpenStoryline adapter 接入 FireRed`

也就是说：

1. 不再新建独立 `aimaker` 工具目录。
2. 不把外部 `D:\codex work\FireRed-OpenStoryline` 直接覆盖到当前项目。
3. `workers/video-worker` 是当前视频生产工具包的正式承载目录。
4. `workers/video-worker/openstoryline` 保留为 worker 内部执行引擎包装层。
5. 完整 FireRed 后续通过 `engine adapter` 接入，而不是替换当前 `/v1/runs` 作业接口。

这个方案的核心目标不是一次性把所有视频生成能力堆进去，而是先把作业边界、状态流转、输入输出合同和接入点固定住，让后续接 FireRed、素材检索、修订闭环时不会反复推翻主链路。

## 2. 依据和优先级

设计依据按优先级排列：

1. 当前项目根目录 `AGENTS.md`：决定项目协作、记录、交接和目录归属规则。
2. 外部 `agent-handoff.md`：作为工具业务设计主依据，尤其是公域获客内容生产链路、确认门禁和分层原则。
3. 当前 V2.1 产品文档：决定内容日历、视频工作台、worker 协作契约和当前 staging 目标。
4. 当前代码事实：`workers/video-worker` 已经存在 worker、OpenStoryline skeleton、Compose、COS、Supabase job 处理框架。

发生冲突时：

- 项目协作和文件记录位置以当前项目 `AGENTS.md` 为准。
- 工具业务主链路以 `agent-handoff.md` 为准。
- 具体实现方式以当前仓库已有 worker 架构为准。

## 3. 设计目标

本工具要解决的是：

让 AI 咨询和增长判断形成可执行的视频生产作业，并通过 worker 稳定地产出可预览、可审核、可修订的视频结果。

第一阶段目标：

1. worker 能接收一个已经通过上游确认的生产作业。
2. worker 能拒绝不完整或不安全的作业。
3. worker 能把作业转换为稳定的 `/v1/runs` 执行合同。
4. OpenStoryline skeleton 能在 staging 环境产出占位视频、封面、字幕和 metadata。
5. 后续 FireRed 接入有明确 adapter 位置，不破坏 worker 合同。

非目标：

1. 不在第一阶段实现完整增长策略生成。
2. 不在第一阶段实现完整素材智能检索。
3. 不在第一阶段直接搬入完整 FireRed 源码。
4. 不把 OpenStoryline 变成增长主控。
5. 不绕过脚本确认和素材确认直接渲染。

## 4. 业务分层

按工具业务设计，完整系统分为六层：

| 层级 | 职责 | 当前落点 |
| --- | --- | --- |
| 用户层 | 选择目标、确认脚本、确认素材、审核预览、发起修订 | 主应用视频工作台，后续补齐 |
| 增长层 | 生成 GrowthBrief、HotspotMap、VideoStrategy、内容主题序列 | 主应用或咨询 Agent 链路，当前不放进 worker |
| 素材层 | 生成 AssetPlan、匹配素材、产出 AssetMatchReport | 主应用/素材服务，worker 只消费结果 |
| 制作层 | 接收 ProductionDirective，调度视频执行，产出预览 | `workers/video-worker` |
| 审核层 | 人工审核、预览、制作修订、语义修订分流 | 主应用视频工作台 |
| 项目生产审查层 | 记录作业、验收、回滚点、状态审计 | Supabase + docs/progress |

边界要求：

1. `video-worker` 只属于制作层和作业执行层。
2. `OpenStoryline` 只属于制作执行引擎。
3. `ScriptDrivenVideoRunner`、`RevisionRouter`、并发控制、存储上传都是支撑机制，不是新的业务层。
4. 语义修订不得直接在制作层内改写策略，应回到增长层。

## 5. 完整对象链路

工具设计的完整对象链路为：

```text
SourceDigest
-> EvidenceMap
-> GrowthBrief
-> HotspotMap
-> ContentThemeSequence
-> VideoStrategy
-> ScriptDrafts
-> ApprovedScript
-> AssetPlan
-> AssetMatchReport
-> ScriptBinding
-> ProductionDirective
-> ProductionRun
-> Preview
-> Revision
```

当前 MVP 压缩为：

```text
GrowthBrief or fixed template
-> VideoStrategy
-> ApprovedScript
-> AssetPlan
-> AssetMatchReport
-> ScriptBinding or temporary ProductionPackage
-> ProductionDirective
-> /v1/runs
-> Preview
-> Revision
```

MVP 允许上游临时使用 mock、固定模板或人工填写，但进入 worker 前必须形成 `ProductionDirective`。

## 6. 主流程

```mermaid
flowchart LR
  A["GrowthBrief / VideoStrategy"] --> B["ApprovedScript"]
  B --> C["AssetPlan / AssetMatchReport"]
  C --> D["ProductionDirective"]
  D --> E["video_edit_jobs"]
  E --> F["video-worker"]
  F --> G["openstoryline-engine /v1/runs"]
  G --> H["engine adapter"]
  H --> I["skeleton 或 FireRed"]
  I --> J["Preview 输出"]
  J --> K["Revision 分流"]
```

关键门禁：

1. 没有锁定脚本，不得进入 worker。
2. 没有 `final_video` 输出要求，不得进入 worker。
3. 素材确认未完成时，不得默认生成正式渲染任务。
4. OpenStoryline 或 FireRed 不得静默改写已锁定脚本。
5. 无输出路径或输出文件缺失时，不得标记为成功。
6. 修订必须追加记录，不覆盖历史。

## 7. 作业合同

`video_edit_jobs.input_payload` 是 worker 当前最重要的输入合同。

建议标准形态：

```json
{
  "source": "video_workbench",
  "executionMode": "staging_worker",
  "script": {
    "text": "已确认的视频脚本或口播文案",
    "locked": true,
    "variantId": "content-variant-id"
  },
  "productionDirective": {
    "targetPlatform": "douyin",
    "aspectRatio": "9:16",
    "desiredOutputs": ["final_video", "cover", "subtitles"],
    "lockedFields": ["script", "cta", "target_user", "claims"]
  },
  "materialContext": {
    "assetPlanId": "asset-plan-id",
    "assetMatchReportId": "asset-match-report-id"
  },
  "input_assets": [
    {
      "asset_type": "video",
      "bucket_name": "jj-content-staging-1341668543",
      "storage_key": "draft-inputs/merchant-1/draft-1/demo.mp4",
      "file_name": "demo.mp4"
    }
  ]
}
```

worker 内部会标准化为 `ProductionDirective`：

| 字段 | 要求 |
| --- | --- |
| `job_id` | 来自 `video_edit_jobs.id` |
| `execution_mode` | 默认 `staging_worker` |
| `script_text` | 必填，来自锁定脚本 |
| `script_locked` | 必须为 true，默认 true，但显式 false 必须拒绝 |
| `target_platform` | 默认 `douyin` |
| `aspect_ratio` | 默认 `9:16` |
| `desired_outputs` | 必须包含 `final_video` |
| `locked_fields` | 默认 `script, cta, target_user, claims` |
| `source` | 默认 `video_edit_job` |
| `material_context` | 透传素材上下文 |

## 8. worker 执行职责

`workers/video-worker/worker` 的职责：

1. 从 Supabase 中 claim 最旧的 `pending` 作业。
2. 在下载素材前校验 `ProductionDirective`。
3. 将合同类失败标记为 `failed_manual`。
4. 下载 COS 输入素材到本地 workspace。
5. 调用 `openstoryline-engine` 的 `/v1/runs`。
6. 检查输出文件路径和文件存在性。
7. 上传视频、封面、字幕到 COS。
8. 写回 `video_edit_jobs` 状态。
9. 插入输出 `asset_objects`。

worker 不负责：

1. 生成增长策略。
2. 自动改写已锁定脚本。
3. 选择真实发布账号。
4. 判断真实投放效果。
5. 在失败后自动无限重试。

## 9. OpenStoryline engine adapter

`workers/video-worker/openstoryline` 是 worker 内部的执行引擎包装层。

稳定入口：

```text
POST /v1/runs
GET /health
```

当前 adapter：

| adapter | 状态 | 用途 |
| --- | --- | --- |
| `skeleton` | 已可运行 | staging 验证合同，生成占位视频、封面、字幕、metadata |
| `fire_red` | 预留，fail closed | 后续完整 FireRed 接入点 |

环境变量：

```text
OPENSTORYLINE_ENGINE_ADAPTER=skeleton
FIRERED_OPENSTORYLINE_BASE_URL=
```

`fire_red` adapter 当前必须返回 HTTP 501。只有完成以下映射后才能启用：

1. `/v1/runs` 到 FireRed session 创建的映射。
2. input assets 到 FireRed media upload 的映射。
3. `ProductionDirective` 到 FireRed chat prompt 的映射。
4. FireRed 输出文件到 `RunResponse` 的映射。
5. 运行日志、metadata、失败原因的映射。
6. provider key 和 config 的环境变量化、脱敏和校验。

## 10. FireRed 接入策略

完整 FireRed 项目不应直接覆盖当前 `openstoryline/` 目录，原因：

1. FireRed 是 session/chat/WebSocket 型应用，当前 worker 是同步作业型接口。
2. FireRed 本地配置可能包含真实 key，不能原样进入仓库。
3. 当前 worker 已依赖 `/v1/runs`，覆盖会破坏已有合同。
4. FireRed 镜像、模型资源、运行时依赖更重，需要单独验收。

推荐接入方式：

```text
video-worker
-> openstoryline-engine /v1/runs
-> FireRedEngineAdapter
-> FireRed Web/MCP service
-> output collector
-> RunResponse
```

FireRed 可以有三种部署形态：

| 形态 | 优点 | 风险 | 建议 |
| --- | --- | --- | --- |
| 独立容器服务 | 边界清楚，方便替换 | Compose 和网络更复杂 | 推荐 |
| vendor snapshot 到 openstoryline/vendor | 单仓可部署 | 仓库膨胀，密钥和资源风险高 | 暂不推荐 |
| Git submodule 或外部引用 | 来源清晰 | 协作复杂，部署要额外处理 | 二阶段再评估 |

## 11. 状态和失败映射

建议状态语义：

| 场景 | 状态 | 原因 |
| --- | --- | --- |
| 缺少脚本 | `failed_manual` | 上游内容合同不完整 |
| 脚本未锁定 | `failed_manual` | 违反确认门禁 |
| 缺少 `final_video` | `failed_manual` | 输出目标不完整 |
| COS 下载失败 | `failed_retryable` | 基础设施或临时资源问题 |
| engine 5xx | `failed_retryable` | 执行引擎异常 |
| `fire_red` adapter 未实现 | `failed_retryable` 或阻止创建作业 | 不应进入正式生产 |
| 输出文件缺失 | `failed_retryable` | 执行产物不完整 |
| 上传 COS 失败 | `failed_retryable` | 基础设施问题 |
| 成功上传并回写 | `succeeded` | 产物可预览 |

后续补 retry API 时，应由 API 将 `failed_retryable` 作业重置为 `pending`，并递增 `retry_count`。worker 不自动 claim `failed_retryable`。

## 12. 数据落点

当前建议：

1. `video_edit_jobs` 是生产作业状态源。
2. `input_payload` 保存上游生产合同。
3. `result_payload` 保存 worker 运行摘要、输出路径、adapter 信息。
4. `asset_objects` 保存视频、封面、字幕等输出资产。
5. COS 保存实际媒体文件。
6. `docs/progress/` 保存验证和阶段事实。
7. `docs/handoff/` 保存接手说明和待验收状态。

注意：当前 `.gitignore` 会忽略 `docs/handoff/` 和大部分 `docs/progress/`。如果这些记录需要进入远端，应单独调整 `.gitignore` 或复制到可追踪的架构文档中。

## 13. 实施阶段

### 阶段 1：作业合同固化

目标：

- 固化 `ProductionDirective`。
- 拒绝不完整作业。
- 保持 `/v1/runs` 合同稳定。

交付：

- worker 合同校验。
- 作业 payload 文档。
- 单元测试覆盖缺脚本、脚本未锁定、输出目标缺失。

当前状态：

- 已完成最小实现。

### 阶段 2：OpenStoryline skeleton 可运行

目标：

- 当前 staging 环境能通过 Compose 跑通。
- 能生成占位视频、封面、字幕和 metadata。

交付：

- `openstoryline-engine` Docker 镜像可构建。
- 容器内包含 `ffmpeg`。
- `/health` 和 `/v1/runs` 可验证。

当前状态：

- 已完成。

### 阶段 3：adapter 边界固化

目标：

- `skeleton` 和 `fire_red` 的边界清晰。
- FireRed 未完成前不得误启用。

交付：

- `engine_adapters.py`。
- `OPENSTORYLINE_ENGINE_ADAPTER` 环境变量。
- `fire_red` adapter fail closed。
- adapter 测试。

当前状态：

- 已完成最小实现。

### 阶段 4：主应用作业创建侧对齐

目标：

- 主应用创建 `video_edit_jobs` 时写入标准 `input_payload`。
- 视频工作台只允许确认后的脚本进入 worker。

交付：

- API schema 更新。
- repository/service payload 组装。
- 前端或服务端校验。
- 作业创建测试。

当前状态：

- 待实施。

### 阶段 5：完整 FireRed adapter

目标：

- 在不改变 `/v1/runs` 的前提下接入完整 FireRed。

交付：

- FireRed 独立服务或受控 vendor 方案。
- session 创建。
- media 上传。
- chat prompt 生成。
- 运行等待和超时控制。
- 输出收集。
- metadata 映射。
- 错误映射。

当前状态：

- 待设计和实施。

### 阶段 6：修订闭环

目标：

- Preview 之后支持制作修订和语义修订分流。

交付：

- Revision 类型定义。
- RevisionRouter。
- 制作修订回 `/v1/runs`。
- 语义修订回增长层。
- 追加式 revision 日志。

当前状态：

- 待实施。

## 14. 验收标准

第一阶段验收：

1. 合法作业可以通过 worker 调用 `/v1/runs`。
2. 缺少脚本的作业进入 `failed_manual`。
3. 脚本显式未锁定的作业进入 `failed_manual`。
4. `desired_outputs` 不含 `final_video` 的作业进入 `failed_manual`。
5. skeleton engine 能在容器内产出四类文件：
   - `final.mp4`
   - `cover.jpg`
   - `subtitles.srt`
   - `run-metadata.json`
6. `/health` 能返回当前 `engine_adapter`。
7. `fire_red` adapter 未实现前返回 HTTP 501。
8. 验证记录必须写入 progress 或架构文档。

第二阶段验收：

1. 主应用创建的 `video_edit_jobs.input_payload` 符合本文合同。
2. 输出资产可在 COS 和 `asset_objects` 中追踪。
3. worker 失败状态可被人工判断是内容问题还是运行问题。

FireRed 接入验收：

1. 不改变 worker 对 `/v1/runs` 的调用方式。
2. FireRed provider key 不进入仓库。
3. FireRed 输出能稳定映射为 `RunResponse`。
4. FireRed 执行失败能给出可诊断错误。
5. 冷启动、镜像体积、资源下载时间有记录。

## 15. 当前已完成事实

截至 2026-04-25：

1. `workers/video-worker/openstoryline` 本机 Python 调用通过。
2. Uvicorn HTTP 调用通过。
3. Docker 容器缺少 `ffmpeg` 的问题已修复。
4. Compose 单服务 `openstoryline-engine` 可构建和运行。
5. `/v1/runs` 可生成占位视频、封面、字幕和 metadata。
6. `ProductionDirective` 最小合同校验已落地。
7. `skeleton` adapter 已可运行。
8. `fire_red` adapter 已预留并 fail closed。
9. 当前相关 Python 测试为 8 个，通过。

## 16. 风险和控制

| 风险 | 影响 | 控制方式 |
| --- | --- | --- |
| 直接覆盖 FireRed | 破坏 `/v1/runs` 合同，带入敏感配置 | 禁止覆盖，通过 adapter 接入 |
| 上游 payload 松散 | worker 执行不可控 | `ProductionDirective` 校验前置 |
| OpenStoryline 静默改脚本 | 破坏确认门禁 | locked fields 进入 directive 和 prompt |
| 输出缺失仍成功 | 用户看到空预览 | worker 必须检查文件存在和上传结果 |
| FireRed 镜像过重 | 部署不可控 | 单独记录镜像大小、下载时间、冷启动 |
| 语义修订进制作层 | 增长策略和制作执行混乱 | RevisionRouter 分流 |
| 文档记录被忽略 | 后续接手断层 | 关键决策进入 `docs/架构规范/` |

## 17. 下一步执行建议

推荐下一步进入阶段 4：

`主应用作业创建侧对齐`

具体任务：

1. 检查 `app/src/server/api/video-edit-jobs-service.ts` 当前 payload 生成。
2. 对齐 `script.text`、`script.locked`、`productionDirective`。
3. 增加服务端 schema 校验。
4. 增加 job 创建测试。
5. 确认视频工作台的脚本确认状态如何映射到 `ApprovedScript`。

阶段 4 完成后，再进入完整 FireRed adapter 设计，不要提前搬入 FireRed 源码。
