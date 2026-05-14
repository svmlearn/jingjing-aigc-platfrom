# 2026-05-14 用户端声音克隆与配音链路进展

## 当前目标

落地商家用户端视频工作台的声音克隆入口、后端音色库、worker/OpenStoryline 克隆配音合同，并回传 voiceover artifact 摘要。

不处理历史 A/B/C/D/E JSON 对比内容。

## 已完成

- 用户端视频工作台新增配音设置：系统配音 / 我的克隆音色、录音、上传参考音频、授权确认、选择音色。
- 新增 `voice_profiles` 合同、仓储、API 和 Supabase migration。
- `asset_objects` 扩展支持 `owner_type = voice_profile`、`asset_type = audio`。
- media upload/complete 支持 `voice_profile/audio`，COS key 使用 `voice-profiles/{merchant_id}/{voice_profile_id}/...`。
- 用户端提交的视频任务 JSON 保持稳定业务语义，不暴露执行 provider：
  - `voiceover.mode = system`
  - `voiceover.mode = voice_profile`
  - `voiceProfileId`
  - `refAudioAssetId`
  - `includeOriginalAudio`
- 创建视频任务时校验当前用户的 voice profile 和 ref audio asset 归属，并把 audio asset 摘要写入 worker payload。
- worker 收到 `voice_profile` 后再映射为 `pixelle_clone`，下载 voice profile 参考音频，注入本地 `ref_audio`。
- OpenStoryline adapter 不再把克隆音色映射为 `provider: runninghub`，改为 `provider: pixelle_clone`。
- FireRed `generate_voiceover` 增加 `pixelle_clone` provider handler 和配置入口。
- `video_edit_jobs.result_payload.voiceover_artifacts` 回传配音摘要。

## 验证结果

- `corepack pnpm exec tsc --noEmit`：通过。
- `corepack pnpm exec eslint src/components/merchant/video-workbench.tsx src/server/api/video-job-payload.ts src/server/api/video-edit-jobs-service.ts src/lib/db/voice-profile-repository.ts src/server/api/voice-profile-service.ts src/app/api/voice-profiles/route.ts src/server/api/media-service.ts src/server/api/schemas.ts`：通过。
- `corepack pnpm dlx tsx --test src/server/api/video-job-payload.test.ts`：13 passed。
- `$env:PYTHONPATH='workers/video-worker'; python -m pytest workers/video-worker/tests/test_directive_contract.py workers/video-worker/tests/test_openstoryline_engine_adapters.py workers/video-worker/tests/test_processor_contract.py`：44 passed。
- `git diff --check`：通过，仅有 Windows CRLF 提醒。

## 待联调

- `TTS_PIXELLE_CLONE_BASE_URL` 和 `TTS_PIXELLE_CLONE_API_KEY` 需要按实际克隆服务商配置。
- FireRed `pixelle_clone` 当前按 `POST {base_url}/tts/clone`，multipart 字段为 `ref_audio`，表单字段含 `text`。若实际服务商接口不同，需要只调整 provider handler。
- Supabase migration 尚未在 staging 数据库执行。
