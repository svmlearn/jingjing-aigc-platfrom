# 2026-05-14 Voice Clone User Flow Handoff

## 当前目标

把声音克隆入口放到商家用户端视频工作台，并打通 app API、COS audio asset、worker/OpenStoryline 克隆配音合同。

## 分支 / worktree

- Branch: `codex/voice-clone-user-flow`
- Worktree: `C:\Users\17330\.codex\worktrees\2843\孟_5.13_5.14`
- Push / merge: 未 push，未 merge。

## 已完成内容

- App：
  - 新增 `voice_profiles` API：`GET /api/voice-profiles`、`POST /api/voice-profiles`。
  - 新增 `voice_profiles` migration。
  - 扩展 media contract/schema/COS key prefix 支持 `voice_profile/audio`。
  - 视频工作台新增配音面板，支持系统配音、我的克隆音色、录音、上传音频、授权确认。
  - 用户端视频任务 payload 保持稳定业务语义：`mode + voiceProfileId + refAudioAssetId`，不携带克隆执行 provider。
- Worker/OpenStoryline：
  - worker 校验 voice profile ref audio，收到 `voice_profile` 后映射为 `pixelle_clone`，下载参考音频并注入本地 `ref_audio`。
  - adapter 使用 `pixelle_clone`，不再输出 unsupported `runninghub`。
  - FireRed 增加 `pixelle_clone` provider 入口。
  - result payload 增加 `voiceover_artifacts` 摘要。
- 测试：
  - App payload 测试覆盖克隆音色 JSON。
  - Worker directive/processor/adapter 测试覆盖克隆音色路径。

## 关键改动文件

- `app/src/components/merchant/video-workbench.tsx`
- `app/src/lib/db/voice-profile-repository.ts`
- `app/src/app/api/voice-profiles/route.ts`
- `app/supabase/migrations/202605140001_voice_profiles.sql`
- `workers/video-worker/worker/app/directive.py`
- `workers/video-worker/worker/app/processor.py`
- `workers/video-worker/openstoryline/app/engine_adapters.py`
- `workers/video-worker/openstoryline/firered/src/open_storyline/nodes/core_nodes/generate_voiceover.py`

## 验证

- App typecheck：通过。
- App focused eslint：通过。
- App video-job-payload node:test：13 passed。
- Worker focused pytest：44 passed。
- `git diff --check`：通过，仅有 Windows CRLF 提醒。

## 服务器部署入口

- Host: `43.160.208.189`
- SSH user: `mdeploy`
- Worker path: `/srv/jingjing-video-worker`
- 已知权限：可进入 worker 目录、读取 `.env`、写目录、执行 `docker compose ps`。
- 基础检查命令：

```bash
ssh mdeploy@43.160.208.189
cd /srv/jingjing-video-worker
docker compose ps
```

密码不写入仓库文档，需通过安全渠道单独交接。

## 下一步建议

1. 在 staging Supabase 执行 migration。
2. 配置 `TTS_PIXELLE_CLONE_BASE_URL`、`TTS_PIXELLE_CLONE_API_KEY`。
3. 用真实参考音频走一次：创建音色 -> 创建视频任务 -> worker 下载音频 -> FireRed 生成配音。
4. 如果实际 Pixelle/RunningHub 克隆接口不是 `/tts/clone` multipart 形态，只改 FireRed `pixelle_clone` handler。
