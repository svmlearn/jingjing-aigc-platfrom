# 2026-04-27 app 工作树任务书

## 1. 定位

本工作树只负责主应用业务生产侧。

目标是让主应用能把增长策略、脚本确认、素材上下文和作业创建稳定串起来，最终创建 worker 可消费的：

```text
video_edit_jobs.input_payload
```

本工作树不负责视频执行、不调用 OpenStoryline、不调用 FireRed、不改 worker 内部逻辑。

## 2. 建议工作树

建议分支：

```text
codex/app-video-production-contract
```

建议 worktree：

```text
D:\codexplan\worktrees\jingjing-content-platform-app
```

启动前必须确认：

1. 主仓当前成果已经 commit，或已经导出 patch 并明确纳入本工作树。
2. app 和 worker 两个工作树从同一个基线创建。
3. 如果共享合同要改，必须先交给审核者确认，再同步给 worker 工作树。

## 3. 负责范围

app 工作树负责：

1. 增长策略运行层。
2. 视频脚本候选生成。
3. 脚本确认门禁。
4. 素材上下文组装。
5. `video_edit_jobs.input_payload` 合同生成。
6. 视频工作台任务状态展示。
7. 预览审核和修订入口的主应用侧行为。

优先涉及目录：

```text
app/src/contracts/
app/src/server/api/
app/src/lib/db/
app/src/components/merchant/
app/src/app/api/
```

可读取但不要改动：

```text
workers/video-worker/
```

## 4. 不要碰的文件

除非审核者明确批准，不要修改：

```text
workers/video-worker/**
workers/video-worker/openstoryline/**
workers/video-worker/tests/**
```

不要新增 FireRed 调用，不要让主应用直接访问 FireRed session、chat 或 WebSocket。

## 5. 主要任务

### 5.1 作业创建合同对齐

目标：

`POST /api/video-edit-jobs` 创建的 `input_payload` 必须符合：

```text
docs/架构规范/2026-04-28-current-architecture.md
```

最低要求：

1. 从 `content_variants.script_text` 读取脚本。
2. 写入 `input_payload.script.text`。
3. 写入 `input_payload.script.locked = true`。
4. 写入 `input_payload.script.variantId`。
5. 写入 `input_payload.productionDirective.targetPlatform = douyin`。
6. 写入 `input_payload.productionDirective.aspectRatio = 9:16`。
7. 写入 `input_payload.productionDirective.desiredOutputs`，且必须包含 `final_video`。
8. 写入 `input_payload.productionDirective.lockedFields`。
9. 写入 `input_payload.materialContext`。
10. 写入 `input_payload.input_assets`。

### 5.2 脚本确认门禁

目标：

未确认脚本不能创建正式视频作业。

第一阶段可用的确认口径：

```text
content_variants.review_status = approved
```

如果当前 UI 还没有确认动作，先补最小确认动作，不要用“创建任务”隐式等同确认。

### 5.3 增长策略增强

目标：

生成视频脚本时，`content_drafts.input_snapshot.growthContext` 能解释脚本为什么这样写。

至少包含：

```text
ContextDigest
GrowthStrategy
StrategyCritique
ScriptCandidates
```

参考文档：

```text
docs/架构规范/2026-04-28-current-architecture.md
```

第一阶段不新增长期记忆表，不新增完整 Agent run 表，不做动态 skill。

### 5.4 多脚本候选

目标：

同一咨询上下文可生成 2-3 个 `video_script` variant。

建议候选：

1. `safe_conversion`：保守成交版。
2. `strong_hook`：强钩子版。
3. `trust_expert`：专业信任版。

用户选择并确认其中一个后，才能创建视频作业。

### 5.5 素材上下文

目标：

素材中心送入视频工作台后，作业创建时能追溯素材来源。

最低要求：

1. 读取 `material_workbench_references`。
2. 读取或组装 `materialContext`。
3. 从 `asset_objects` 组装 worker 可下载的 `input_assets`。
4. 如果素材不可用，要给主应用可见错误，不要把坏素材交给 worker。

### 5.6 预览审核和修订入口

目标：

主应用能展示 worker 写回的状态和结果，并区分修订类型。

最低要求：

1. `succeeded` 展示成片入口或结果资产状态。
2. `failed_retryable` 展示重试入口。
3. `failed_manual` 不展示无效重试入口。
4. 语义修订回增长层生成新脚本候选。
5. 制作修订创建新 `video_edit_jobs`，并记录 `sourceJobId`。

## 6. 共享合同

app 工作树必须遵守：

```text
video_edit_jobs.status =
pending | queued | preparing | running | succeeded | failed_retryable | failed_manual | cancelled
```

成功态只能是：

```text
succeeded
```

不得把 `completed` 写入 `video_edit_jobs.status`。

## 7. 验收命令

至少运行：

```powershell
cd app
pnpm lint
pnpm typecheck
```

如果项目脚本不存在，必须在交付说明中写明实际可运行命令和缺失原因。

如果改了 API 或服务端合同，至少补充一种验证：

1. 单元测试。
2. API route 级别测试。
3. 明确的手动验证步骤和请求/响应示例。

## 8. 交付给审核者

交付时必须提供：

1. 分支名和 worktree 路径。
2. 改动文件清单。
3. 合同字段示例。
4. 验证命令和结果。
5. 是否改了共享合同。
6. 是否需要 worker 工作树同步。
7. 未完成事项和风险。

审核者重点看：

1. 主应用是否仍然只创建 `video_edit_jobs`，没有直接调用执行引擎。
2. `input_payload` 是否符合合同。
3. 脚本确认门禁是否真实存在。
4. `succeeded` 状态口径是否一致。
5. 是否误把尚未实现能力写成已实现。
