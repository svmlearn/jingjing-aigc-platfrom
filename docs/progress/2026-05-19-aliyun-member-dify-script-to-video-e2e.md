# 2026-05-19 阿里云成员端 Dify 脚本到 AI 剪辑 E2E

## 目标

验证并修复 V2.3.1 主链路：

owner 生成团队本周内容 -> Dify 写回 daily task 视频脚本 -> 成员端上传素材 -> 点击 AI 剪辑 -> 直接复用 Dify draft/variant 创建 `video_edit_job` -> worker/FireRed 成片 -> `video-results/*` preview/download 200。

## 关键修复

- 成员端已有 Dify `generatedVideoScript`、`contentDraftId`、`contentVariantId` 时，直接读取 draft bundle、确认 exact variant、创建 `video_edit_job`，不走旧 `/api/content/video-workbench-agent`。
- `/api/content/video-workbench-agent` 增加服务端防护：如果收到带 Dify 脚本和 draft/variant 的 daily task，返回已有 Dify draft bundle，`trace.mode=dify_daily_task_reuse`，不调用视频脚本制作 Agent。
- 成员端创建 AI 剪辑时不再走 no-voiceover：无克隆音色时使用默认系统配音 `voiceover.enabled=true`、`mode=system`、`provider=minimax`；有 ready 克隆音色时使用 `voice_profile` + `pixelle_clone`。
- 追加成员端声音克隆入口：`/member/video/:taskId` 支持成员上传 MP3/M4A/音频生成 `voice_profile`；浏览器把 M4A 标成 `video/mp4` 或 `application/octet-stream` 时也按音频处理。
- 新增 `/api/voice-profiles`、`voice_profiles` PostgreSQL 表、`voice-profiles/*` OSS 上传 prefix、`audio` asset type，并在 video worker input payload 中附带 ref audio asset 引用。
- FireRed 增加单素材 deterministic grouping fallback，避免单 clip 时卡在 LLM 分组。
- 阿里云 release 下 FireRed `run.sh` 支持从 `VIDEO_WORKER_HOST_ROOT/firered` 软链 `.storyline`、`resource`、`outputs`，避免 release 切换后运行时模型和素材目录缺失。
- 对比新加坡运行容器和“服务器环境”包后，同步了 ASR 配置透传、Pexels 私有 base URL 透传、LLM no-proxy client、`dashscope==1.25.17` 等 worker 运行差异；保留阿里云 OSS/PostgreSQL 适配和 `video-results/*` 输出前缀。
- 商家素材库保持现有 `source_items + asset_objects` 结构，不新建历史 `merchant_media_*` 表；App 侧 job 入参只保留成员/草稿素材，worker 运行期根据脚本素材需求从 `source_items + asset_objects` 检索商家视频素材，再传给 FireRed。

## 新加坡快照对比

- 新加坡运行容器源：
  - `video-worker`
  - `openstoryline-engine`
  - `firered-openstoryline`
- 本地快照目录：
  - `/tmp/jingjing-sg-container/video-worker`
  - `/tmp/jingjing-sg-container/openstoryline-engine`
  - `/tmp/jingjing-sg-container/firered`
- 结论：
  - 新加坡代码是 COS 环境，不能覆盖本地 OSS provider abstraction。
  - 本地 OSS 分支已有 worker heartbeat、worker_id、PostgreSQL/OSS、timing、`video-results/*` 等国内化差异，均保留。
  - 已同步运行容器中与 provider 无关的 FireRed/OpenStoryline runtime 差异。

## 真实 E2E 记录

下列记录是本批次早些时候跑通的 normal no-voiceover 基线，用来证明 Dify draft/variant 到 worker/FireRed/OSS preview/download 的链路已通。2026-05-19 后续产品口径已调整为“不再走 no-voiceover”，待用默认 `minimax` 配音或 `voice_profile` 克隆配音各跑一条真实成片验证。

- batch id: `139fc0f5-df9c-4ee2-a349-3a76f47866ac`
- content generation job id: `ae545779-8d96-445c-a513-ade662cb2fdf`
- member user id: `e60fd946-c939-4807-ba7e-8d11facc158a`
- daily task id: `da18e62a-99dd-4d0f-824e-2db4e6e19bbc`
- Dify draft id: `bce1e108-5b9a-4387-96bd-de155707ef0b`
- Dify video variant id: `3a228828-9506-4525-b013-f2d994213a38`
- stale old video job: `388b2920-a633-4b7a-83dd-b3fe147be4a3`, 已取消
- successful video job id: `c435fb7c-3e83-491f-9413-0195273f37e0`
- final asset id: `bd0c1c3f-6114-43e9-a855-2f661f77a715`
- final object key: `video-results/5bb8381f-1a72-48bc-ab87-d7bbf2740e7c/c435fb7c-3e83-491f-9413-0195273f37e0/final.mp4`
- preview: 200, `948762` bytes
- download: 200, `948762` bytes
- 本地下载文件：`artifacts/aliyun-member-dify-script-to-video-e2e/final-c435fb7c-3e83-491f-9413-0195273f37e0.mp4`

## 验证

- `pnpm --dir app typecheck` 通过
- `pnpm --dir app lint` 通过
- `pnpm --dir app build` 通过
- `node --test src/server/api/video-job-payload.test.ts src/lib/member-video-workflow.test.ts src/server/api/video-job-public-dto.test.ts` 通过，覆盖 voice profile production config、成员端 preview/download 状态和 public DTO。
- `bash -n workers/video-worker/openstoryline/firered/run.sh` 通过
- `python3 -m py_compile ...` changed FireRed/OpenStoryline files 通过
- `PYTHONPATH=workers/video-worker uv run ... python -m unittest discover -s workers/video-worker/tests` 通过，`104` tests
- `git diff --check` 通过

## 观察到的问题

- 用户浏览器曾在旧 bundle/旧 loaded tab 下触发过 `POST /api/content/video-workbench-agent`，nginx 日志中看到 502。服务端已加防护，后续即使误打该接口，只要 daily task 已有 Dify script + draft/variant，也会复用 Dify draft，不再调用脚本 Agent。
- 首次 worker retry 失败原因是当前 release 缺 FireRed `.storyline/models/transnetv2-pytorch-weights.pth`，已通过 runtime root 软链修复，并写入 `run.sh`。

## 未做

- 没有伪造新的 Dify 多任务批量成功；本次按要求只复用已真实成功的 Dify job 和 daily task 做一条 AI 剪辑链路。
- 没有修改 DNS、ICP、RDS 公网、OSS 公共权限。
- 没有恢复 Supabase/COS/Vercel 旧配置到阿里云主路径。

## 2026-05-19 配音链路修正

- 成员端音色上传保持可选。
- 无音色上传时，成员端创建 job 使用默认系统配音，provider 为 `minimax`，不再发送 `voiceover.enabled=false`。
- 有音色上传且 `voice_profile` ready 时，成员端创建 job 使用 `voice_profile`，worker 会下载参考音频并走 `pixelle_clone`。
- 阿里云 worker env 已补齐 ASR provider key 和 TTS provider key；只保留阿里云 OSS/PostgreSQL 当前配置，未恢复 COS/Supabase。
- 阿里云 FireRed systemd 已从 `config.aliyun-no-asr.toml` 切到 `config.video_edit_engine.toml`。
- ASR 最小激活已通过：直接调用 FireRed ASR 节点返回 `provider=aliyun_paraformer`、`model=paraformer-realtime-v2`、`request_id_present=true`、`sentence_count=1`。
- App release: `/srv/jingjing-domestic/releases/20260519210941-08f87d7`。
- `cos素材库入库包_20260515.rar` 的占位 merchant `00000000-0000-4000-8000-000000000001` 已映射到阿里云验收商家 `5bb8381f-1a72-48bc-ab87-d7bbf2740e7c`，上传用户映射到 `e60fd946-c939-4807-ba7e-8d11facc158a`。素材已导入现有 `source_items + asset_objects`：4 条 `source_items`、4 个视频 `asset_objects`、4 个缩略图 `asset_objects`；未创建 `merchant_media_*` 表。

## 2026-05-19 默认配音真实成片验证

- 修复 FireRed 运行配置：
  - `worker.env` 曾覆盖 `OPENSTORYLINE_CONFIG` 到旧 `config.aliyun-no-asr.toml`，导致 `generate_voiceover` / `select_bgm` / `local_asr` 未注册，`plan_timeline` 缺依赖后循环。
  - `workers/video-worker/openstoryline/firered/run.sh` 已兜底旧 no-ASR 配置，默认使用 `config.video_edit_engine.toml`。
  - `config.video_edit_engine.toml` 已禁用未部署的外部 `video_edit_engine` MCP（`127.0.0.1:9001`），避免 `ConnectError: All connection attempts failed`。
- 默认系统配音真实 job：
  - failed pre-fix job: `e60d7114-6164-4f1a-9bfe-1de7aa1bbf92`
  - successful video job id: `58205b68-db35-4d10-afe8-66dd7f93e4cb`
  - member user id: `e60fd946-c939-4807-ba7e-8d11facc158a`
  - daily task id: `da18e62a-99dd-4d0f-824e-2db4e6e19bbc`
  - Dify draft id: `bce1e108-5b9a-4387-96bd-de155707ef0b`
  - Dify video variant id: `3a228828-9506-4525-b013-f2d994213a38`
  - final asset id: `d46c3011-1c75-478a-bdd7-ded911763d76`
  - final object key: `video-results/5bb8381f-1a72-48bc-ab87-d7bbf2740e7c/58205b68-db35-4d10-afe8-66dd7f93e4cb/final.mp4`
  - final size: `1623832` bytes
  - result: `succeeded / completed / 100`
- FireRed 路径事实：
  - loaded media: 7 videos
  - filtered clips: 6
  - grouped clips: 2 groups
  - script: `Using locked custom script for 2 group(s)`
  - voiceover: `minimax`, 2 segments, total `10100ms`, `clone_enabled=false`
  - ASR/speech rough cut: `local_asr` -> `speech_rough_cut` succeeded
  - timeline: `plan_timeline_pro` succeeded
  - render: MoviePy wrote final video, worker uploaded outputs to Aliyun OSS
- Download fix:
  - 前端下载曾返回 OSS XML：`Can not override response header on content-type`。
  - `app/src/server/storage/aliyun-oss-provider.ts` 已修复：Aliyun signed read URL 不再覆盖 response `content-type`，只保留 `content-disposition`。
  - Direct OSS signed GET verification after release: inline 200, attachment 200, object `Content-Type=video/mp4`。
  - 本地下载文件：`tmp/video-results/58205b68-db35-4d10-afe8-66dd7f93e4cb-final.mp4`
- Releases:
  - FireRed config release: `/srv/jingjing-domestic/releases/20260519214702-d712324`
  - Download fix app release: `/srv/jingjing-domestic/releases/20260519220300-00e6a71`
  - `/api/health`: ok, DB `postgres`, storage `aliyun_oss`

## 2026-05-19 商家素材库检索真实成片验证

- 架构口径：
  - 不创建 `merchant_media_assets` / `merchant_media_clips` 历史表。
  - 素材库使用现有 `source_items + asset_objects`。
  - `video_edit_jobs.input_payload.input_assets` 只保留成员上传/草稿素材。
  - worker 在运行期根据 `materialContext.sceneAssetQueries`、缺失素材提示和脚本文本检索 `source_items + asset_objects`，把命中的商家视频素材作为本地运行期输入传给 FireRed。
- 素材包导入：
  - package: `cos素材库入库包_20260515.rar`
  - merchant id: `5bb8381f-1a72-48bc-ab87-d7bbf2740e7c`
  - created by user id: `e60fd946-c939-4807-ba7e-8d11facc158a`
  - source items: 4
  - video asset objects: 4
  - thumbnail asset objects: 4
  - object prefix: `source-assets/5bb8381f-1a72-48bc-ab87-d7bbf2740e7c/*`
  - `merchant_media_*` table count: 0
- worker 修复：
  - `workers/video-worker/worker/app/db.py` 新增 `list_video_material_input_assets`，从 `source_items + asset_objects` 读取视频素材。
  - `workers/video-worker/worker/app/processor.py` 下载成员输入后，再下载商家素材库命中的视频素材到 `inputs/merchant-materials`。
  - 日志记录 `user_inputs_downloaded`、`material_library_inputs_downloaded`、`material_library_asset_ids`。
- deployed release: `/srv/jingjing-domestic/releases/20260519225312-60e0a29`
- latest HEAD: `60e0a29`
- verification video job id: `cfb03f5c-d1a0-422b-8840-047592008a48`
- member user id: `e60fd946-c939-4807-ba7e-8d11facc158a`
- daily task id: `da18e62a-99dd-4d0f-824e-2db4e6e19bbc`
- Dify draft id: `bce1e108-5b9a-4387-96bd-de155707ef0b`
- Dify video variant id: `3a228828-9506-4525-b013-f2d994213a38`
- final asset id: `ab1b5ce3-8aa4-4ae2-893a-35a2d94a2bbf`
- final object key: `video-results/5bb8381f-1a72-48bc-ab87-d7bbf2740e7c/cfb03f5c-d1a0-422b-8840-047592008a48/final.mp4`
- final size: `6169178` bytes
- result: `succeeded / completed / 100`
- material evidence:
  - persisted `input_payload.input_assets`: 7
  - worker `runtime_payload.input_assets`: 11
  - user inputs downloaded: 7
  - material library inputs downloaded: 4
  - material library asset ids: `fa3b7b4a-cb4f-4282-a1e3-ff7063f478fd`, `753f9de3-03e2-492e-bc50-302dc883721f`, `f2d3b3ea-4750-44fd-99e2-bd9d5816647a`, `9eba31e8-9776-48e3-9a24-bbe2c21073c0`
- FireRed evidence:
  - `split_shots` output clips count: 14
  - `understand_clips`: 14/14
  - `generate_voiceover`: `minimax`
  - `render_video`: succeeded
- app logs:
  - verification window 未发现 `/api/content/video-workbench-agent` 调用。
- preview/download:
  - app API preview: 200, `Content-Type=video/mp4`, `6169178` bytes
  - app API download: 200, `Content-Type=video/mp4`, `6169178` bytes
- 本地下载文件：`tmp/video-results/cfb03f5c-d1a0-422b-8840-047592008a48-final.mp4`
- env cleanup:
  - 阿里云 `/srv/jingjing-domestic/shared/env/worker.env` 已移除空的 `SUPABASE_DB_URL` key。
  - worker database key 保持 `WORKER_DATABASE_URL`，不在 worker env 中保留 Supabase DB URL。
- extra validation:
  - `PYTHONPATH=workers/video-worker python3 -m unittest workers/video-worker/tests/test_processor_contract.py`: pass, 26 tests
  - `PYTHONPATH=workers/video-worker uv run python -m unittest discover -s workers/video-worker/tests`: pass, 105 tests
  - `python3 -m py_compile workers/video-worker/worker/app/db.py workers/video-worker/worker/app/processor.py`: pass
  - `pnpm --dir app typecheck`: pass
  - `pnpm --dir app lint`: pass
  - `pnpm --dir app build`: pass
  - `git diff --check`: pass

## 2026-05-19 成员端 M4A 与 ASR->TTS 克隆链路修正

- 问题判断：
  - Dify 生成的视频脚本与当前团队素材/成员上传素材不完全匹配，worker 虽然能检索素材库，但成片语义仍可能怪。
  - 成员端声音克隆入口对 M4A 的浏览器 MIME 处理不稳定，移动端可能把 `.m4a` 标成 `video/mp4` 或空类型，后续克隆服务容易不接受。
  - 成员端创建 job 时未把 `subtitles.talkingHeadSource=asr_original_audio` 传入 production config，FireRed 不会按“口播素材先 ASR，再交给 TTS/clone TTS 读”的目标链路执行。
- 修复：
  - `uploadVoiceProfileAudioFile` 对 `.m4a/.mp4` 音频统一使用 `audio/mp4` 发起上传签名和 asset 记录。
  - `ProductionConfig`、API schema、`buildVideoEditJobInputPayload` 支持 `subtitles.talkingHeadSource`。
  - 成员端有 ready `voice_profile` 时，创建 `video_edit_job` 传入 `talkingHeadSource: "asr_original_audio"`；无音色时仍默认 `script`，走系统配音。
  - FireRed locked custom script 注入逻辑改为：口播分镜的成员上传素材优先使用 ASR 文本作为字幕/配音文案，并继续进入 voiceover/TTS；不再默认跳过 TTS 保留原声。
  - 商家素材库素材带 `project_material` / `merchant_material_library` 标记时，不被口播 ASR 逻辑误覆盖。
  - 对未显式打 talking_head 标签但分镜文本包含“真人口播/出镜讲解/口播”的成员上传素材，允许使用 ASR 文本；如果 ASR 文本为空且只是候选口播，则回退锁定脚本，不直接失败。
- deployed release: `/srv/jingjing-domestic/releases/20260519233829-2b32908`
- HEAD: `2b32908`
- deployment health:
  - `jingjing-domestic-app.service`: active
  - `jingjing-firered-openstoryline.service`: active
  - `jingjing-video-worker.service`: active
  - `/api/health`: ok, DB `postgres`, storage `aliyun_oss`
- M4A upload intent check:
  - endpoint: `/api/media/upload-intents`
  - ownerType: `voice_profile`
  - assetType: `audio`
  - fileName: `codex-upload-check.m4a`
  - mimeType: `audio/mp4`
  - result: HTTP 201
  - provider: `aliyun_oss`
  - upload header `Content-Type`: `audio/mp4`
  - key prefix: `voice-profiles/5bb8381f-1a72-48bc-ab87-d7bbf2740e7c/<voiceProfileId>/...`
- validation:
  - `pnpm --dir app typecheck`: pass
  - `pnpm --dir app lint`: pass
  - `pnpm --dir app build`: pass
  - `node --test src/server/api/video-job-payload.test.ts src/lib/member-video-workflow.test.ts`: pass, 19 tests
  - `PYTHONPATH=workers/video-worker python3 -m unittest workers/video-worker/tests/test_firered_node_interceptors.py workers/video-worker/tests/test_directive_contract.py`: pass, 23 tests
  - `PYTHONPATH=workers/video-worker uv run python -m unittest discover -s workers/video-worker/tests`: pass, 107 tests
  - `python3 -m py_compile workers/video-worker/openstoryline/firered/src/open_storyline/mcp/hooks/node_interceptors.py`: pass
  - `git diff --check`: pass
- not yet rerun:
  - 未重新跑一条真实 voice clone 成片。下一条用户上传 M4A 并点击 AI 剪辑后，应重点观察 FireRed 是否出现 `local_asr` -> `generate_script` 使用 ASR 文本 -> `generate_voiceover` 使用 `pixelle_clone`。
