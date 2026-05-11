# 2026-05-11 云端视频成片问题 handoff

## 当前目标

记录今天在 staging 视频脚本室验证“上传素材后云端生成成片”时观察到的问题。今天先停止继续修，明天从这里接着处理。

## 验证对象

- 页面：`/dashboard/video`
- 视频 draft：`334ae379-f3c6-4838-b2ac-27b396be426e`
- 视频 variant：`80ad456a-6830-47c0-95cd-28f67b0bfdb0`
- 旧无素材 job：`da4c4290-747e-4f4c-bd48-baa6b072fadf`
- 新带素材 job：`6fd28e7b-507c-400a-bee4-c81dd7c37556`
- 服务器：腾讯云轻量 `openstoryline-test-sg`，Singapore，实例 `lhins-pw7pptl9`
- Worker 目录：`/srv/jingjing-video-worker`

## 已确认事实

1. 上传链路是通的：页面第 1 个分镜上传 `PROJECT-BROLL-TEST.MP4` 成功，页面显示大小 `2.0 MB`。
2. 带素材 job 的应用侧 payload 是对的：
   - `render_mode = asset_driven`
   - `input_assets.length = 1`
   - 输入素材类型为 `video`
   - `storage_provider = tencent_cos`
   - `materialContext.retrievalTarget = video_edit_asset`
   - `missingVideoAssetHints = []`
3. worker 已经领取新 job，并下载了 COS 输入素材：
   - `status` 曾进入 `running`
   - `currentStage = openstoryline_rendering`
   - `runtimePayload.input_assets[0].local_path = /srv/jingjing-video-worker/tmp/jobs/6fd28e7b-507c-400a-bee4-c81dd7c37556/inputs/b7a3405f-432a-4ef2-9d19-51e57f61959a-project-broll-test.mp4`
4. 云端没有成片。新 job 当前后端状态：
   - `status = failed_retryable`
   - `currentStage = openstoryline_rendering_failed`
   - `progressPct = 50`
   - `resultAssets = []`
   - `failureReason = engine_run_failed: failed to run OpenStoryline engine: Server error '500 Internal Server Error' for url 'http://openstoryline-engine:8000/v1/runs'`
5. 服务器容器状态正常但只是健康，不代表成片成功：
   - `firered-openstoryline`：Up，healthy
   - `openstoryline-engine`：Up，healthy
   - `video-worker`：Up

## 观察到的 bug / 问题

### P0：FireRed/OpenStoryline 真实出片失败

现象：新带素材 job `6fd28e7b-507c-400a-bee4-c81dd7c37556` 在 `openstoryline_rendering` 阶段失败，未生成 `final.mp4`、封面、字幕或 COS 结果资产。

服务器日志关键证据：

- `video-worker`：`POST http://openstoryline-engine:8000/v1/runs` 返回 `500 Internal Server Error`
- `openstoryline-engine`：`POST /v1/runs HTTP/1.1 500 Internal Server Error`
- `firered-openstoryline`：`ValueError: timeline result has no video track`
- `firered-openstoryline`：`[Agent tool error] ... artifact_id render_video_...`

初步判断：不是上传/COS/worker 领取问题，而是 FireRed 的自动节点编排或 adapter prompt 没有稳定产出可渲染的视频轨道。明天优先看 `workers/video-worker/openstoryline/app/engine_adapters.py` 的 FireRed payload/prompt，以及 FireRed 的 `render_video` 前置节点输出。

### P0：取消中的旧 job 会被 worker 后续失败状态覆盖

现象：旧无素材 job `da4c4290-747e-4f4c-bd48-baa6b072fadf` 曾在页面显示“任务已取消”，但之后后端查询变成：

- `status = failed_retryable`
- `currentStage = openstoryline_rendering_failed`
- `failureReason = engine_run_failed: failed to run OpenStoryline engine: timed out`

初步判断：worker 已经领取旧 job 后，取消接口只更新 DB；worker 仍在执行，最后 `mark_failed()` 无条件按 `id` 写回失败，覆盖了用户取消的终态。相关代码：

- `workers/video-worker/worker/app/db.py` 的 `mark_failed()` 仅 `where id = %s`
- `app/src/lib/db/video-edit-job-repository.ts` 的 `cancelVideoEditJob()` 可以把 in-flight job 改成 `cancelled`

明天修复方向：worker 写回阶段需要尊重终态，至少不要把 `cancelled` 覆盖成 `failed_retryable`。可选方案是 `mark_failed/mark_succeeded/update_stage` 增加状态 guard，或执行前后检查当前状态。

### P1：页面终态卡片可能停留在旧状态，刷新后才对齐

现象：用户截图里右侧卡片显示“任务已取消”。后端当时已经能查询到 job 真实状态为 `failed_retryable / openstoryline_rendering_failed`；刷新页面后，页面显示变为“任务失败，可以重试”。

初步判断：`video-workbench` 只轮询 `pending/queued/preparing/running`，进入 `cancelled` 这类终态后不再自动刷新。如果后端终态后来被 worker 覆盖，页面不会自动知道。这个问题和 P0 的取消覆盖 bug 叠加后，会让用户误判“到底取消了还是失败了”。

明天修复方向：先修 P0 状态覆盖；如果仍需要，应在取消/失败后的短时间内做一次确认刷新，或在页面上明确显示 job id / 更新时间。

### P1：失败原因对用户和开发都不够可诊断

现象：应用侧只看到 `openstoryline-engine /v1/runs 500`，必须进 `firered-openstoryline` 日志才能看到真正原因 `timeline result has no video track`。

明天修复方向：

- `OpenStorylineClient.run_job()` 捕获 `httpx.HTTPStatusError` 时，把 `response.text` 的安全截断版写入 `EngineRunError`。
- `openstoryline-engine` 调 FireRed 失败时，返回结构化错误 detail，避免只给上游一个泛化 500。
- 注意不要把 provider key、COS key 等密钥写进日志。

### P1：失败后现场目录被清理，排查证据不足

现象：`logPayload` 写了 `retained_output_dir`，但服务器实际检查：

- `outputs/jobs/6fd28e7b-507c-400a-bee4-c81dd7c37556` 为空
- `tmp/jobs/6fd28e7b-507c-400a-bee4-c81dd7c37556` 已不存在

代码原因：`workers/video-worker/worker/app/processor.py` 的 `finally` 会无条件 `shutil.rmtree(workspace_dir)` 和 `shutil.rmtree(output_dir)`。

明天修复方向：失败时保留 workspace/output 一段时间，或增加 `WORKER_RETAIN_FAILED_ARTIFACTS` 配置；成功后再清理。否则后续排查很难复现。

### P2：首次真实运行会下载大模型，页面和文档没有提示

现象：终端看到 `Downloading [model.pt]: ... 290M/1.05G ... 160KB/s`。这不是用户上传素材，用户上传测试素材只有约 `2.0 MB`。

2026-05-11 复查服务器后确认：

- 1.05G 的 `model.pt` 不是素材，也不是 TransNetV2 镜头切分模型，而是 ModelScope 标点模型：`/root/.cache/modelscope/hub/models/iic/punc_ct-transformer_cn-en-common-vocab471067-large/model.pt`
- ModelScope ASR 模型也已缓存：`speech_seaco_paraformer_large_asr_nat-zh-cn-16k-common-vocab8404-pytorch`，目录约 `953M`
- ModelScope VAD 模型也已缓存：`speech_fsmn_vad_zh-cn-16k-common-pytorch`，目录约 `3.9M`
- FireRed 视频切镜模型已存在：`/app/.storyline/models/transnetv2-pytorch-weights.pth`，约 `30M`
- 当前未发现仍在运行的 `wget/curl/modelscope` 下载进程

影响：轻量新加坡服务器首次真实出片冷启动会很慢，并可能让用户误以为上传了超大素材。当前这批模型已经在容器里缓存完成，但 ModelScope 缓存在容器 `/root/.cache/modelscope`，不是显式挂载的宿主机目录；如果后续重建容器，仍可能重新下载。

明天修复方向：部署时预热/预下载模型，并把 `/root/.cache/modelscope` 挂到宿主机持久目录，例如 `${VIDEO_WORKER_HOST_ROOT}/firered/modelscope-cache:/root/.cache/modelscope`。页面侧可在后台冷启动时展示“正在准备视频模型”，但不要把它误写成用户素材上传进度。

## 明天建议顺序

1. 先修 worker 状态写回 guard，防止 `cancelled` 被后续失败覆盖。
2. 增强 OpenStoryline / FireRed 失败错误透传，至少能在 job `failureReason` 中看到 `timeline result has no video track`。
3. 修改失败现场保留策略，保留 failed job 的 input/output/metadata。
4. 针对 FireRed `timeline result has no video track` 修 adapter prompt 或做保底剪辑链路。
5. 预热并持久化 FireRed / ModelScope 模型缓存，避免下一次真实链路被大模型下载拖住。
6. 最后再重试带素材 job，验收标准是生成 `final.mp4` 并回写 `resultAssets`。

## 本轮没有继续做的事

- 没有重启远端容器。
- 没有继续触发新的 AI 剪辑任务。
- 没有修改 worker 代码或前端代码。
- 没有读取或输出服务器 `.env` 密钥。

## Branch / 状态

- Branch：`codex/rag-material-retrieval-prd`
- 当前状态：问题已记录，待明天修复
- Merge：未 merge
