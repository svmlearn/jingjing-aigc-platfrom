# 2026-04-27 worker 工作树任务书

## 1. 定位

本工作树只负责视频执行工具侧。

目标是让 `workers/video-worker/` 稳定消费主应用创建的 `video_edit_jobs.pending` 作业，并产出可预览的视频结果。

本工作树不负责增长策略、不生成脚本、不判断素材业务质量、不做人审、不直接处理语义修订。

## 2. 建议工作树

建议分支：

```text
codex/worker-video-execution-contract
```

建议 worktree：

```text
D:\codexplan\worktrees\jingjing-content-platform-worker
```

启动前必须确认：

1. 主仓当前成果已经 commit，或已经导出 patch 并明确纳入本工作树。
2. app 和 worker 两个工作树从同一个基线创建。
3. 共享合同以 `docs/架构规范/2026-04-27-video-job-payload-contract.md` 为准。
4. 如需改共享合同，先交给审核者确认，不要单边改。

## 3. 负责范围

worker 工作树负责：

1. `ProductionDirective` 合同校验。
2. pending 作业 claim 和状态推进。
3. COS 输入素材下载。
4. `/v1/runs` 请求 payload。
5. OpenStoryline skeleton 稳定性。
6. 输出文件检查。
7. 输出上传和 `asset_objects` 回写。
8. `result_payload`、`log_payload`、`failure_reason` 可诊断性。
9. FireRed adapter 的 fail closed 边界。

优先涉及目录：

```text
workers/video-worker/
workers/video-worker/worker/
workers/video-worker/openstoryline/
workers/video-worker/tests/
```

可读取但不要改动：

```text
app/
```

## 4. 不要碰的文件

除非审核者明确批准，不要修改：

```text
app/src/**
app/supabase/migrations/**
```

不要在 worker 中生成增长策略、改写已锁定脚本、读取前端临时状态或直接决定真实发布账号。

## 5. 主要任务

### 5.1 合同消费稳定

目标：

worker 从 `video_edit_jobs.input_payload` 标准化出 `ProductionDirective`。

必须继续拒绝：

1. 缺少 `script.text`。
2. `script.locked = false`。
3. `desiredOutputs` 不包含 `final_video`。

合同失败写：

```text
failed_manual
```

### 5.2 状态口径统一

目标：

worker 写回状态必须和主应用一致。

允许状态：

```text
pending | queued | preparing | running | succeeded | failed_retryable | failed_manual | cancelled
```

成功态必须是：

```text
succeeded
```

`completed` 只能作为 `current_stage`、日志文案或自然语言描述。

### 5.3 OpenStoryline skeleton 稳定

目标：

保持当前 staging 默认 adapter 可运行。

必须保持：

1. `/health` 返回 adapter 信息。
2. `/v1/runs` 生成 `final.mp4`、`cover.jpg`、`subtitles.srt`、`run-metadata.json`。
3. Docker 镜像包含 `ffmpeg`。
4. Compose 单服务 smoke 可跑。

### 5.4 输出检查和回写

目标：

worker 不能在输出缺失时标记成功。

最低要求：

1. 检查 final video 文件存在。
2. 按 `desired_outputs` 检查 cover / subtitles。
3. 上传输出到 COS。
4. 写入 `asset_objects`。
5. `result_payload` 记录上传资产、storage key、adapter、execution mode。
6. 上传失败或输出缺失写 `failed_retryable`。

### 5.5 FireRed adapter 边界

目标：

FireRed 未正式接入前必须 fail closed。

必须保持：

```text
OPENSTORYLINE_ENGINE_ADAPTER=fire_red
```

时 `/v1/runs` 返回 HTTP 501 或等价可诊断错误，不得静默 fallback 到 skeleton。

不要在本工作树直接搬入外部 FireRed 源码。FireRed 实现必须等 app payload 合同跑稳后再进入单独阶段。

## 6. 共享合同

worker 工作树只消费主应用已持久化合同：

```text
video_edit_jobs.input_payload.script
video_edit_jobs.input_payload.productionDirective
video_edit_jobs.input_payload.materialContext
video_edit_jobs.input_payload.input_assets
```

worker 可以拒绝不合格作业，但不能自行重新设计作业。

## 7. 验收命令

至少运行：

```powershell
$env:PYTHONPATH='D:\codexplan\work\jingjing-content-platform\workers\video-worker'
python -m unittest discover -s workers\video-worker\tests -v
```

如果在独立 worktree 中运行，`PYTHONPATH` 要替换为对应 worktree 路径。

如果修改 OpenStoryline 或 Docker：

```powershell
docker compose -f workers\video-worker\docker-compose.yml build openstoryline-engine
```

如能启动环境，还应补 Compose 单服务 smoke 结果。

## 8. 交付给审核者

交付时必须提供：

1. 分支名和 worktree 路径。
2. 改动文件清单。
3. worker 输入 payload 示例。
4. worker 输出 `result_payload` 示例。
5. 验证命令和结果。
6. 是否改了共享合同。
7. 是否需要 app 工作树同步。
8. 未完成事项和风险。

审核者重点看：

1. worker 是否仍然只消费 `pending` 作业。
2. 合同失败和运行失败是否分流正确。
3. 成功态是否统一为 `succeeded`。
4. 输出缺失是否不会误判成功。
5. FireRed adapter 是否仍 fail closed。
6. 是否误把增长、素材业务判断或审核逻辑放进 worker。
