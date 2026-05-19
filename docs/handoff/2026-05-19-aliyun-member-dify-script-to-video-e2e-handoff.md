# 2026-05-19 阿里云成员端 Dify 脚本到视频 E2E Handoff

## 当前目标

完成国内化迁移分支最后一段产品链路修复：成员端已拥有 Dify 写回的视频脚本和 draft/variant 时，AI 剪辑直接创建 `video_edit_job`，不再重新调用旧视频脚本制作 Agent。

## 已完成

- 前端成员端 Dify draft/variant 复用逻辑已提交。
- 成员端视频任务页已补声音克隆入口：成员可上传 MP3/M4A/音频，生成 ready `voice_profile` 后，AI 剪辑会使用该 voice profile 配音；没有 ready 音色时走默认系统配音，不再走 no-voiceover。
- 已补 `/api/voice-profiles`、`voice_profiles` PostgreSQL migration、`voice-profiles/*` 上传 prefix、`audio` asset type、worker payload 的 ref audio asset 引用。
- 服务端 `/api/content/video-workbench-agent` 已增加 Dify daily task 复用保护，防止旧前端 bundle 误打接口后调用脚本 Agent。
- worker/OpenStoryline/FireRed 已同步新加坡运行容器中的 provider-neutral runtime 差异，同时保留阿里云 OSS/PostgreSQL 差异。
- 一条真实阿里云 no-voiceover 基线 AI 剪辑链路已跑通，产物在 `video-results/*`，preview/download 都是 200；后续产品口径已调整为默认配音 / 克隆配音，不再继续使用 no-voiceover。
- 阿里云 worker env 已补齐 ASR/TTS provider 变量；FireRed systemd 已切到 `config.video_edit_engine.toml`；ASR 最小激活通过。
- 已下载最终 MP4 到本地 `artifacts/aliyun-member-dify-script-to-video-e2e/`，该目录已加入 `.gitignore`。

## 关键 ID

- batch id: `139fc0f5-df9c-4ee2-a349-3a76f47866ac`
- content generation job id: `ae545779-8d96-445c-a513-ade662cb2fdf`
- member user id: `e60fd946-c939-4807-ba7e-8d11facc158a`
- daily task id: `da18e62a-99dd-4d0f-824e-2db4e6e19bbc`
- video job id: `c435fb7c-3e83-491f-9413-0195273f37e0`
- final asset id: `bd0c1c3f-6114-43e9-a855-2f661f77a715`
- final object key: `video-results/5bb8381f-1a72-48bc-ab87-d7bbf2740e7c/c435fb7c-3e83-491f-9413-0195273f37e0/final.mp4`
- latest release: `/srv/jingjing-domestic/releases/20260519210941-08f87d7`
- latest HEAD: `08f87d7`

## 改动文件

- `app/src/components/member/member-workspace.tsx`
- `app/src/lib/ui/video-workflow.ts`
- `app/src/app/api/voice-profiles/route.ts`
- `app/src/contracts/media.ts`
- `app/src/contracts/video.ts`
- `app/src/contracts/voice.ts`
- `app/src/lib/db/voice-profile-repository.ts`
- `app/src/server/api/voice-profile-service.ts`
- `app/src/server/api/video-job-payload.ts`
- `app/src/server/api/video-edit-jobs-service.ts`
- `app/db/migrations/202605190002_selfhost_voice_profiles.sql`
- `app/src/server/api/content-generation-service.ts`
- `workers/video-worker/openstoryline/app/config.py`
- `workers/video-worker/openstoryline/app/engine_adapters.py`
- `workers/video-worker/openstoryline/firered/**`
- `.gitignore`

## 验证结果

- `pnpm --dir app typecheck`: pass
- `pnpm --dir app lint`: pass
- `pnpm --dir app build`: pass
- `node --test src/server/api/video-job-payload.test.ts src/lib/member-video-workflow.test.ts src/server/api/video-job-public-dto.test.ts`: pass
- `bash -n workers/video-worker/openstoryline/firered/run.sh`: pass
- changed Python `py_compile`: pass
- `PYTHONPATH=workers/video-worker uv run ... python -m unittest discover -s workers/video-worker/tests`: pass, `104` tests
- `git diff --check`: pass
- ASR minimal activation: pass, `provider=aliyun_paraformer`, `model=paraformer-realtime-v2`, `sentence_count=1`, request id present.

## 下一步

1. 推送 `codex/domestic-infra-migration` 到 `gitee/codex/domestic-infra-migration`。
2. 从最终 HEAD 部署 clean release 到 ECS。
3. 验证 `/api/health`、provider、storage provider、worker/FireRed/OpenStoryline 服务状态。
4. 如用户继续在网页端点 AI 剪辑，观察 nginx/app 日志，确认当前 bundle 不再发起旧 Agent；即使发起，服务端也应返回 `trace.mode=dify_daily_task_reuse`。
5. 用一条成员端任务优先验证默认 `minimax` 配音；有成员音色时再验证 `voice_profile` 克隆配音。

## 残余风险

- 浏览器缓存/旧 tab 可能仍加载旧 bundle；服务端 guard 已兜底，但最好刷新页面后再操作。
- 本次只验证了一条真实 Dify job，符合用户要求；没有扩展成多任务批量回归。
- 阿里云 normal no-voiceover 已跑通但后续不再作为产品主链路；默认配音和 voice clone 仍需真实成片端到端验收。
- `cos素材库入库包_20260515.rar` 应映射到 `静境阿里云验收商家`，但当前 RDS 缺 `merchant_media_assets` / `merchant_media_clips` 表，未导入素材库。
