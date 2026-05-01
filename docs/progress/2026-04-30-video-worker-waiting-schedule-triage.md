# 2026-04-30 视频任务“等待调度”线上排查

## 背景

用户反馈：

- 本地运行时使用 COS，并使用本地模拟 / 本地真链路 DB。
- 线上目前能确定 COS 可用，但不确定是否有 Supabase。
- 视频任务卡在“等待调度”阶段。

## 排查时间

- `2026-04-30 19:03:38 CST`

## 已确认事实

### Vercel app 环境

通过 `vercel env ls production` 只读确认，staging Vercel Production 环境存在：

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `COS_SECRET_ID`
- `COS_SECRET_KEY`
- `COS_BUCKET`
- `COS_REGION`
- `SILICONFLOW_API_KEY`

结论：

- 线上 app 不是“完全没有 Supabase env”的状态。
- 单从 env 名称看，app 具备写入 Supabase 和签发 COS 上传凭证的基础条件。

### worker 服务器

服务器：

- `43.160.208.189`
- 目录：`/srv/jingjing-video-worker`

使用 `ubuntu` 账号和 `sudo -n docker` 只读查看：

```text
firered-openstoryline   Up 22 hours (healthy)
openstoryline-engine    Up 20 hours (healthy)
video-worker            Up 20 hours
```

`video-worker` 日志显示：

- 已启动轮询：`Starting poll loop with interval=10s concurrency=1`
- 已连接 `openstoryline-engine`
- `engine_adapter=fire_red`
- `fire_red_provider_key_configured=true`
- 最近曾成功 claim 并完成任务：
  - `a8c904a2-2608-4521-9fa5-0fbcbabb84bb`
  - `410b37f5-ecde-4ce3-8b31-7e6e30b52c32`
  - `74af3a92-2b2a-4a58-92c3-3fab0756664a`
- 最近有 1 条任务在 `openstoryline-engine /v1/runs` 返回 500 后被标记失败：
  - `a9d7afef-fcf1-491e-aa09-f2b1e6e062ef`

结论：

- 线上 worker 不是停机状态。
- COS 下载、FireRed 调用、COS 上传、DB 回写在最近任务里实际跑通过。

### worker 正在轮询的 DB

在 `video-worker` 容器内用其自身 `SUPABASE_DB_URL` 查询 `video_edit_jobs`：

```text
STATUS_COUNTS
failed_retryable  1
succeeded         3
```

最新任务：

```text
2026-04-30 03:24:03+00  74af3a92-2b2a-4a58-92c3-3fab0756664a  succeeded        completed                     100
2026-04-30 02:39:55+00  a9d7afef-fcf1-491e-aa09-f2b1e6e062ef  failed_retryable openstoryline_rendering_failed 50
2026-04-30 02:05:30+00  410b37f5-ecde-4ce3-8b31-7e6e30b52c32  succeeded        completed                     100
2026-04-29 12:22:20+00  a8c904a2-2608-4521-9fa5-0fbcbabb84bb  succeeded        completed                     100
```

结论：

- worker 当前轮询的 DB 中没有 `pending` 任务。
- 如果用户页面此刻仍显示“等待调度”，那条页面上的任务大概率没有写入 worker 正在轮询的这套 `video_edit_jobs`，或页面/部署还在读旧状态。

## 当前判断

“等待调度”在代码中对应：

- `video_edit_jobs.status = pending`
- `current_stage = null`

worker claim 成功后会立即改为：

- `status = queued`
- `current_stage = claimed`

因此长期停在“等待调度”的最可能原因不是 COS，而是以下之一：

1. app 创建的视频任务没有写进 worker 当前连接的 Supabase Postgres。
2. 用户看到的是前端旧状态，实际 DB 中该任务已完成或失败，但页面没有刷新到新结果。
3. Vercel 当前部署读取的 Supabase 项目与 worker 的 `SUPABASE_DB_URL` 指向不一致。
4. 任务创建请求没有真正成功入库，前端保留了乐观 UI 状态或旧响应。

## 用户补充 jobId 后的复核

用户通过浏览器控制台提供 3 条失败任务：

```text
4b4727a3-b874-4e21-973c-960c7a58caa6  failed_retryable  stale_timeout
7bb23188-f519-44b5-bfa4-f1a5c3a18d11  failed_retryable  stale_timeout
c78973de-e588-451b-a7f8-d5a5c82ba7db  failed_retryable  stale_timeout
```

在 worker 当前连接的 DB 内按 ID 查询，3 条均存在：

```text
4b4727a3-b874-4e21-973c-960c7a58caa6  started_at=2026-04-29 04:08:27+00  finished_at=2026-04-29 06:08:27+00
7bb23188-f519-44b5-bfa4-f1a5c3a18d11  started_at=2026-04-28 15:57:25+00  finished_at=2026-04-28 17:57:34+00
c78973de-e588-451b-a7f8-d5a5c82ba7db  started_at=2026-04-28 15:57:15+00  finished_at=2026-04-28 17:57:24+00
```

结论更新：

- app 和 worker 不是两套 DB。
- 这 3 条旧任务都是被 worker stale sweep 标记失败。
- `started_at -> finished_at` 基本正好 120 分钟，对应 `VIDEO_JOB_STALE_MINUTES=120`。
- 这 3 条的 `runtime_payload` 和 `log_payload` 为空，说明当时只完成了 claim，没进入 `downloading_inputs / openstoryline_rendering / uploading_outputs` 这些后续阶段。
- 更像是当时 worker 部署、重启、崩溃或旧版本运行中断导致 claim 后没有继续写进度，而不是 COS 上传失败。

## 当前最新任务

当前最新任务：

```text
ca9b9d5a-ca6e-4e72-b3ae-c1d32b62ed46
status=running
current_stage=openstoryline_rendering
progress_pct=50
input_assets=1
```

该任务已完成：

- directive validation
- COS 输入素材下载

卡点在 FireRed/OpenStoryline 渲染阶段。

任务 `productionConfig`：

```json
{
  "voiceover": {
    "enabled": true,
    "provider": "bytedance_bigtts",
    "volume": 2
  },
  "bgm": {
    "enabled": true,
    "volume": 0.25
  },
  "subtitles": {
    "enabled": true,
    "style": "platform_default"
  },
  "render": {
    "aspectRatio": "9:16",
    "includeOriginalAudio": false
  }
}
```

FireRed 日志出现：

```text
TTS 服务：bytedance_bigtts
provider=bytedance_bigtts missing required field: appid
TTS service fallback to: bytedance
```

容器 env 只读检查：

```text
TTS_BYTEDANCE_BIGTTS_APPID=EMPTY
TTS_BYTEDANCE_BIGTTS_ACCESS_KEY=EMPTY
TTS_BYTEDANCE_BIGTTS_RESOURCE_ID=EMPTY
TTS_BYTEDANCE_BIGTTS_SPEAKER=EMPTY
TTS_MINIMAX_API_KEY=SET
```

当前更具体的判断：

- app 默认把配音打开，并默认选择 `bytedance_bigtts`。
- 服务器真实可用 TTS 配置与默认 provider 不匹配。
- 这可能导致当前任务长时间停在 `openstoryline_rendering`，最终再次被 stale sweep 标记为 `failed_retryable / stale_timeout`。

## 下一步建议

1. 让用户提供页面上显示的 `jobId`，用该 ID 在 worker DB 查询。
2. 如果 worker DB 查不到该 `jobId`，优先核对 Vercel `NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY` 对应的项目是否与 worker `SUPABASE_DB_URL` 是同一个 Supabase staging 项目。
3. 如果 worker DB 查得到且状态仍是 `pending`，再看 worker 日志是否在该 job 创建后出现 claim 记录。
4. 如果 worker DB 查得到且已是 `succeeded / failed_retryable`，则排查页面轮询、缓存、或前端展示未刷新问题。
5. 对 `a9d7afef-fcf1-491e-aa09-f2b1e6e062ef` 单独看 `openstoryline-engine` / `firered-openstoryline` 对应时间段日志，定位 FireRed 500 原因。
6. 短期 smoke 建议用 `voiceover.enabled=false` 创建新任务，先验证视频剪辑、COS 上传、结果回写。
7. 如果要保留配音，优先把 app 默认 TTS provider 改成服务器已配置的 provider，或补齐 `bytedance_bigtts` 所需 env。

## 本轮未做

- 未修改服务器 `.env`。
- 未重启 worker。
- 未修改数据库记录。
- 未输出或落盘任何 Supabase / COS / provider 密钥。
