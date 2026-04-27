# 2026-04-27 视频作业 Payload 合同

## 1. 定位

`video_edit_jobs.input_payload` 是主应用和视频 worker 之间唯一稳定连接点。

```text
app/
-> video_edit_jobs.input_payload
-> workers/video-worker/worker/app/directive.py
-> ProductionDirective
-> openstoryline-engine /v1/runs
```

主应用负责创建合同，worker 负责消费和拒绝不合格合同。

## 2. 状态口径

`video_edit_jobs.status` 固定为：

```text
pending | queued | preparing | running | succeeded | failed_retryable | failed_manual | cancelled
```

成功态统一使用：

```text
succeeded
```

`completed` 只能作为 `current_stage`、日志文案或自然语言描述，不作为 `video_edit_jobs.status`。

## 3. 标准 Payload

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
    "assetMatchReportId": "asset-match-report-id",
    "scriptBindingId": "script-binding-id",
    "materialIds": ["material-id"],
    "materialReferenceIds": ["material-reference-id"],
    "selectionMode": "user_confirmed",
    "fallbackMode": null
  },
  "input_assets": [
    {
      "asset_id": "asset-object-id",
      "asset_type": "video",
      "storage_provider": "tencent_cos",
      "bucket_name": "jj-content-staging-1341668543",
      "storage_key": "draft-inputs/merchant-1/draft-1/demo.mp4",
      "mime_type": "video/mp4",
      "file_size_bytes": 123456,
      "etag": "etag",
      "sort_order": 0
    }
  ]
}
```

## 4. 字段要求

| 字段 | 要求 | 默认 |
| --- | --- | --- |
| `source` | 推荐为 `video_workbench` | `video_edit_job` |
| `executionMode` | 当前为 `staging_worker` | `staging_worker` |
| `script.text` | 必填 | 无 |
| `script.locked` | 必须为 `true` | worker 内部默认 `true`，但主应用必须显式写入 |
| `script.variantId` | 应等于 `content_variant_id` | 无 |
| `productionDirective.targetPlatform` | 当前默认抖音 | `douyin` |
| `productionDirective.aspectRatio` | 当前默认竖屏 | `9:16` |
| `productionDirective.desiredOutputs` | 必须包含 `final_video` | `final_video, cover, subtitles` |
| `productionDirective.lockedFields` | 锁定脚本、CTA、用户、声明 | `script, cta, target_user, claims` |
| `materialContext` | 追溯素材计划、匹配报告、绑定 | `{}` |
| `input_assets` | worker 可下载的素材列表 | `[]` |

## 5. Worker 标准化结果

worker 会将 payload 标准化为 `ProductionDirective`：

```json
{
  "job_id": "video-edit-job-id",
  "execution_mode": "staging_worker",
  "script_text": "已确认的视频脚本或口播文案",
  "script_locked": true,
  "target_platform": "douyin",
  "aspect_ratio": "9:16",
  "desired_outputs": ["final_video", "cover", "subtitles"],
  "locked_fields": ["script", "cta", "target_user", "claims"],
  "source": "video_workbench",
  "material_context": {}
}
```

当前实现位置：

```text
workers/video-worker/worker/app/directive.py
```

## 6. 主应用创建职责

主应用创建 `video_edit_jobs` 前必须保证：

1. `contentVariantId` 存在。
2. variant 的 `variant_type = video_script`。
3. `script_text` 存在。
4. 用户已经确认脚本，或服务端显式判定脚本可执行。
5. `input_payload.script.text` 来自已确认脚本。
6. `input_payload.script.locked = true`。
7. `desiredOutputs` 包含 `final_video`。
8. 依赖素材时，素材已经选择或确认。

主应用不应把前端临时 state 当作 worker 输入。所有执行输入必须持久化到数据库。

## 7. Worker 拒绝规则

| 场景 | 状态 | 原因 |
| --- | --- | --- |
| 缺少 `script.text` | `failed_manual` | 上游合同不完整 |
| `script.locked = false` | `failed_manual` | 违反确认门禁 |
| `desiredOutputs` 不含 `final_video` | `failed_manual` | 输出目标不完整 |
| `input_assets` 结构无法解析 | `failed_manual` | 合同不可执行 |
| COS 下载失败 | `failed_retryable` | 基础设施或临时资源问题 |
| 引擎超时或 5xx | `failed_retryable` | 执行异常 |
| 输出文件缺失 | `failed_retryable` | 执行产物不完整 |
| 上传 COS 失败 | `failed_retryable` | 基础设施问题 |
| 输出上传并回写 | `succeeded` | 产物可预览 |

## 8. Result Payload 建议

worker 成功后，`result_payload` 至少记录：

```json
{
  "engine": "openstoryline-skeleton",
  "engine_adapter": "skeleton",
  "execution_mode": "staging_worker",
  "uploaded_assets": [
    {
      "asset_id": "uuid",
      "asset_type": "video",
      "storage_key": "video-outputs/merchant/draft/variant/job/final.mp4"
    }
  ],
  "outputs": {
    "final_video": "video-outputs/merchant/draft/variant/job/final.mp4",
    "cover": "video-covers/merchant/draft/variant/job/cover.jpg",
    "subtitles": "video-subtitles/merchant/draft/variant/job/subtitles.srt"
  }
}
```

## 9. 不允许的合同形态

不允许：

1. 只传 `instructionText`，不传锁定脚本。
2. 把 `desiredOutputs` 放在顶层但不放入 `productionDirective`，除非 worker 明确兼容。
3. 用 `completed` 作为 `video_edit_jobs.status`。
4. 主应用直接调用 FireRed。
5. worker 根据素材或策略自行改写已锁定脚本。

## 10. 验收标准

1. `POST /api/video-edit-jobs` 创建的 payload 符合本文标准。
2. 缺脚本、脚本未锁定、缺 `final_video` 都不能进入执行引擎。
3. worker 单测覆盖合同失败和成功路径。
4. 视频工作台刷新后能通过 `jobId` 恢复任务状态。
5. 结果资产能从 `result_payload` 和 `asset_objects` 关联回 `content_variant`。

