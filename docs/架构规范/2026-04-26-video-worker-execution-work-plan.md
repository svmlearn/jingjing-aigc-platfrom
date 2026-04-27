# 2026-04-26 视频执行工具板块工作文档

## 1. 定位

本文件只定义 `workers/video-worker/` 负责的视频执行工作。

视频执行工具板块的职责是：

```text
消费已经确认好的视频作业，并产出可预览的视频结果。
```

它不负责增长策略、脚本创作、素材业务判断和人工审核。

## 2. 所属目录

```text
workers/
  video-worker/
    worker/
    openstoryline/
    tests/
    docker-compose.yml
```

## 3. 负责范围

### 3.1 作业调度

负责：

- 从 Supabase claim 最旧的 `pending` 作业
- 控制 worker 并发
- 处理 stale job
- 按状态机推进作业

### 3.2 作业合同校验

负责：

- 读取 `video_edit_jobs.input_payload`
- 标准化为 `ProductionDirective`
- 校验脚本是否存在
- 校验脚本是否锁定
- 校验输出要求是否包含 `final_video`

合同不合格时：

```text
failed_manual
```

### 3.3 素材执行准备

负责：

- 解析 `input_assets`
- 从 COS 下载输入素材
- 建立本地 workspace
- 准备 engine 请求

不负责判断素材是否业务上合适。

### 3.4 执行引擎调用

负责：

- 调用 `openstoryline-engine /v1/runs`
- 默认使用 `skeleton` adapter
- 后续通过 `fire_red` adapter 接完整 FireRed
- 处理 engine 超时、失败和异常响应

### 3.5 产物处理

负责：

- 检查输出文件存在
- 上传 final video
- 上传 cover
- 上传 subtitles
- 写入或关联 `asset_objects`
- 更新 `video_edit_jobs.result_payload`

### 3.6 执行状态

负责写回：

| 场景 | 状态 |
| --- | --- |
| 合同失败 | `failed_manual` |
| 运行失败 | `failed_retryable` |
| 输出缺失 | `failed_retryable` |
| 上传失败 | `failed_retryable` |
| 成功 | `succeeded` |

## 4. 输入

视频执行工具板块只接受一个业务输入：

```text
video_edit_jobs.pending
```

其中必须包含：

| 字段 | 要求 |
| --- | --- |
| `input_payload.script.text` | 必填 |
| `input_payload.script.locked` | 必须为 true |
| `input_payload.productionDirective.desiredOutputs` | 必须包含 `final_video` |
| `input_payload.input_assets` | 可为空，但必须结构可解析 |

## 5. 输出

视频执行工具板块输出：

```text
final.mp4
cover.jpg
subtitles.srt
run-metadata.json
video_edit_jobs.status
video_edit_jobs.result_payload
asset_objects
```

输出路径规则：

```text
video-outputs/{merchantId}/{draftId}/{variantId}/{jobId}/final.mp4
video-covers/{merchantId}/{draftId}/{variantId}/{jobId}/cover.jpg
video-subtitles/{merchantId}/{draftId}/{variantId}/{jobId}/subtitles.srt
```

## 6. OpenStoryline engine 边界

稳定入口：

```text
GET /health
POST /v1/runs
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

`fire_red` adapter 未完成前必须返回 HTTP 501。

## 7. FireRed 接入边界

完整 FireRed 只能通过 `engine adapter` 接入。

不允许：

1. 不允许用 FireRed 直接覆盖当前 `workers/video-worker/openstoryline`。
2. 不允许让主应用直接调用 FireRed session/chat。
3. 不允许绕过 `/v1/runs`。
4. 不允许把本地 FireRed 真实 key 带入仓库。

后续接入 FireRed 时，adapter 内部负责：

- 创建 FireRed session
- 上传或引用输入素材
- 将 `ProductionDirective` 转成 FireRed chat prompt
- 等待执行完成
- 收集输出文件
- 映射为 `RunResponse`
- 映射失败原因

## 8. 不负责范围

视频执行工具板块不负责：

1. 不生成 `GrowthBrief`。
2. 不生成 `VideoStrategy`。
3. 不生成脚本草稿。
4. 不决定脚本内容。
5. 不决定素材是否适合获客。
6. 不做人工作业审核。
7. 不判断真实发布账号。
8. 不处理语义修订的增长策略回流。
9. 不创建业务上游的 `video_edit_jobs`。

## 9. 和主应用业务生产板块的连接

唯一连接点：

```text
video_edit_jobs.input_payload
-> ProductionDirective
```

worker 可以拒绝作业，但不重新设计作业。

worker 只消费主应用创建的 `pending` 作业，不主动生成业务作业。

## 10. 任务清单

### 阶段 1：保持 skeleton 稳定

- 保持 `skeleton` adapter 可运行
- 保持 Compose 单服务 smoke 可跑通
- 保持 `/health` 返回 adapter 信息

### 阶段 2：worker 执行链路补强

- 增强输出文件检查
- 增强上传失败映射
- 增强 result payload
- 增加更多失败测试

### 阶段 3：FireRed adapter 设计

- 定义 `/v1/runs` 到 FireRed session 的映射
- 定义 input assets 上传方式
- 定义 prompt 模板
- 定义输出收集方式
- 定义超时和错误映射

### 阶段 4：FireRed adapter 实现

- 引入 FireRed 独立服务或受控 vendor 方案
- 实现 adapter
- 增加集成测试
- 记录镜像大小、冷启动和资源下载时间

## 11. 验收标准

验收时看：

1. 合法 `pending` 作业能被 claim。
2. 合同不合格作业不会调用执行引擎。
3. `skeleton` adapter 能通过 Compose 跑通。
4. `/health` 能返回当前 `engine_adapter`。
5. `/v1/runs` 能返回 final video、cover、subtitle、metadata 路径。
6. 容器内包含 `ffmpeg`。
7. `fire_red` adapter 未完成前返回 HTTP 501。
8. 执行成功后能上传产物并回写状态。
9. worker 不生成增长策略，不改写已锁定脚本。

## 12. 相关文档

- `docs/架构规范/2026-04-25-video-worker-openstoryline-main-implementation-plan.md`
- `docs/架构规范/2026-04-26-app-business-production-work-plan.md`
- `docs/progress/2026-04-25-openstoryline-container-smoke.md`
- `docs/handoff/2026-04-25-video-worker-openstoryline-handoff.md`
