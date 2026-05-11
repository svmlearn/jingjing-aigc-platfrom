# 2026-05-11 云端视频成片问题 handoff

## 当前目标

记录今天在 staging 视频脚本室验证“上传素材后云端生成成片”时观察到的问题和二次校验结果。2026-05-11 13:05 CST 复测后，带素材 job 已成功生成成片；本文保留仍需修复的稳定性、状态机和诊断问题。

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
4. 首次云端没有成片。新 job 当时后端状态：
   - `status = failed_retryable`
   - `currentStage = openstoryline_rendering_failed`
   - `progressPct = 50`
   - `resultAssets = []`
   - `failureReason = engine_run_failed: failed to run OpenStoryline engine: Server error '500 Internal Server Error' for url 'http://openstoryline-engine:8000/v1/runs'`
5. 服务器容器状态正常但只是健康，不代表成片成功：
   - `firered-openstoryline`：Up，healthy
   - `openstoryline-engine`：Up，healthy
   - `video-worker`：Up
6. 2026-05-11 12:52 CST 对带素材 job `6fd28e7b-507c-400a-bee4-c81dd7c37556` 执行 retry 后，云端成片成功：
   - `status = succeeded`
   - `currentStage = completed`
   - `progressPct = 100`
   - `retryCount = 1`
   - `resultAssets.length = 3`
   - COS 结果包含 `final.mp4`、`cover.jpg`、`subtitles.srt`
   - 浏览器页面显示“成片已生成”，并挂载 COS 签名视频地址
   - 通过 GET range 校验 COS `final.mp4` 返回 `206 / video/mp4`
   - 下载后 `ffprobe` 校验：`h264` 视频轨、`aac` 音频轨、`608x1080`、时长约 `5.66s`、大小约 `1.0MB`

## 观察到的 bug / 问题

### P1：FireRed/OpenStoryline 首次真实出片失败，但 retry 后通过

现象：新带素材 job `6fd28e7b-507c-400a-bee4-c81dd7c37556` 首次在 `openstoryline_rendering` 阶段失败，未生成 `final.mp4`、封面、字幕或 COS 结果资产。模型缓存确认完成后，对同一 job 执行 retry，最终成功生成 3 个 COS 结果资产。

服务器日志关键证据：

- `video-worker`：`POST http://openstoryline-engine:8000/v1/runs` 返回 `500 Internal Server Error`
- `openstoryline-engine`：`POST /v1/runs HTTP/1.1 500 Internal Server Error`
- `firered-openstoryline`：`ValueError: timeline result has no video track`
- `firered-openstoryline`：`[Agent tool error] ... artifact_id render_video_...`

初步判断：不是上传/COS/worker 领取问题，而是 FireRed 的自动节点编排存在不稳定性。首次失败为 `timeline result has no video track`；二次 retry 中虽然有 `generate_voiceover` 内部 404 报错，但 FireRed 后续仍完成 `plan_timeline_pro` 和 `render_video`。

后续修复方向：仍需增强 FireRed adapter prompt / 保底剪辑链路，让 `render_video` 稳定拥有视频轨；同时把 FireRed 内部错误摘要透传到 job 诊断字段，避免只能进容器看日志。

### P1：TTS provider 内部报错被 FireRed 容错，最终成片无 voiceover

现象：二次 retry 过程中，`firered-openstoryline` 出现 `generate_voiceover` 错误：

- `requests.exceptions.HTTPError: 404 Client Error: Not Found for url: https://openspeech.bytedance.com/v1/t2a_v2`
- 日志堆栈落在 `generate_voiceover.py` 的 `_tts_minimax_sync`

但 job 最终仍成功，`resultPayload.openstoryline.voiceover = {}`。也就是说这次成片可播放，但配音没有真正生成，最终视频更接近“素材 + 字幕/BGM/剪辑”的降级结果。

初步判断：FireRed agent 可能让 LLM 选择了 `minimax` TTS 参数，但运行时 `service_config.tts.provider` 期望是 `bytedance_bigtts`，出现 provider / base_url 混配。相关位置：

- `workers/video-worker/openstoryline/app/engine_adapters.py` 的 `_build_fire_red_service_config()`
- `workers/video-worker/openstoryline/firered/src/open_storyline/mcp/hooks/node_interceptors.py` 的 `inject_tts_config()`
- `workers/video-worker/openstoryline/firered/src/open_storyline/nodes/core_nodes/generate_voiceover.py`

后续修复方向：TTS runtime config 应强制覆盖 LLM 生成的 provider/base_url，而不是 `setdefault`；或者在当前阶段默认关闭 voiceover，把“无配音成片”作为明确降级模式展示给用户。

### P1：成片时长跟随短素材，未达到脚本目标 60 秒

现象：二次 retry 成功生成的 `final.mp4` 约 `5.66s`，而脚本目标是 `60s`。本次输入测试素材本身是短视频，所以这说明真实链路能成片，但还不能证明“按脚本扩展到目标时长”的能力稳定。

后续修复方向：对短素材需要定义产品规则：循环/慢放/补素材/降级提示。否则用户看到“成片已生成”，但实际只有几秒，会误以为完成质量达标。

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

### P1：输出现场目录被清理，排查证据和 resultPayload local path 会失效

现象：`logPayload` 写了 `retained_output_dir`，但服务器实际检查：

- `outputs/jobs/6fd28e7b-507c-400a-bee4-c81dd7c37556` 为空
- `tmp/jobs/6fd28e7b-507c-400a-bee4-c81dd7c37556` 已不存在

二次 retry 成功后也观察到类似问题：`resultPayload.local_outputs` 仍指向 `/srv/jingjing-video-worker/outputs/jobs/.../final.mp4` 等本地路径，但这些文件已被清理。真正可访问结果应以 `resultAssets` 中的 COS 对象为准。

代码原因：`workers/video-worker/worker/app/processor.py` 的 `finally` 会无条件 `shutil.rmtree(workspace_dir)` 和 `shutil.rmtree(output_dir)`。

明天修复方向：失败时保留 workspace/output 一段时间，或增加 `WORKER_RETAIN_FAILED_ARTIFACTS` 配置；成功后如果继续清理本地文件，`resultPayload.local_outputs` 需要标记为 worker 内部临时路径，避免被误当作可长期访问路径。

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
2. 强制 TTS runtime config 覆盖 LLM 生成的 provider/base_url，或在当前阶段把 voiceover 明确降级为关闭。
3. 增强 OpenStoryline / FireRed 内部错误透传，让 job 诊断字段能看到 `timeline result has no video track`、TTS 404 等关键原因。
4. 修改失败现场保留策略，保留 failed job 的 input/output/metadata；成功 job 的 `local_outputs` 也要避免误导。
5. 针对 FireRed `timeline result has no video track` 修 adapter prompt 或做保底剪辑链路。
6. 定义短素材生成短视频时的产品策略：接受短片、循环扩展、补素材还是前置提示。
7. 预热并持久化 FireRed / ModelScope 模型缓存，避免下一次真实链路被大模型下载拖住。

## 本轮没有继续做的事

- 没有重启远端容器。
- 已对带素材 job 执行一次 retry，并成功生成 COS 结果资产。
- 没有修改 worker 代码或前端代码。
- 没有读取或输出服务器 `.env` 密钥。

## Branch / 状态

- Branch：`codex/rag-material-retrieval-prd`
- 当前状态：二次校验已确认成片链路跑通；稳定性与体验问题待修
- Merge：未 merge
