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
- `cos素材库入库包_20260515.rar` 的占位 merchant `00000000-0000-4000-8000-000000000001` 应映射到阿里云验收商家 `5bb8381f-1a72-48bc-ab87-d7bbf2740e7c`（静境阿里云验收商家），上传用户映射到 `e60fd946-c939-4807-ba7e-8d11facc158a`。当前 RDS 未发现 `merchant_media_assets` / `merchant_media_clips` 表，因此尚未导入素材库。
