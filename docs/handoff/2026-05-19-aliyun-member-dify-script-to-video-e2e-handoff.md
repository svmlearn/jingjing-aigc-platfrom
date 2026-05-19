# 2026-05-19 阿里云成员端 Dify 脚本到视频 E2E Handoff

## 当前目标

完成国内化迁移分支最后一段产品链路修复：成员端已拥有 Dify 写回的视频脚本和 draft/variant 时，AI 剪辑直接创建 `video_edit_job`，不再重新调用旧视频脚本制作 Agent。

## 最新状态（2026-05-19 23:45）

- 最新 HEAD: `2b32908`
- 最新 pushed remote: `gitee/codex/domestic-infra-migration`
- 当前 ECS release: `/srv/jingjing-domestic/releases/20260519233829-2b32908`
- 成员端默认系统配音真实成片已跑通：`58205b68-db35-4d10-afe8-66dd7f93e4cb`
- final asset id: `d46c3011-1c75-478a-bdd7-ded911763d76`
- final object key: `video-results/5bb8381f-1a72-48bc-ab87-d7bbf2740e7c/58205b68-db35-4d10-afe8-66dd7f93e4cb/final.mp4`
- 本地下载文件：`tmp/video-results/58205b68-db35-4d10-afe8-66dd7f93e4cb-final.mp4`
- OSS signed GET: inline 200, attachment 200；已修复 `Can not override response header on content-type`。
- 商家素材库检索真实成片已跑通：`cfb03f5c-d1a0-422b-8840-047592008a48`
- 素材库结构保持 `source_items + asset_objects`，没有创建 `merchant_media_*` 表。
- 验证 job 持久化入参仍是 7 个成员/草稿素材；worker 运行期内部检索并下载 4 个商家视频素材，传给 FireRed 的运行期素材共 11 个。
- latest final asset id: `ab1b5ce3-8aa4-4ae2-893a-35a2d94a2bbf`
- latest final object key: `video-results/5bb8381f-1a72-48bc-ab87-d7bbf2740e7c/cfb03f5c-d1a0-422b-8840-047592008a48/final.mp4`
- latest 本地下载文件：`tmp/video-results/cfb03f5c-d1a0-422b-8840-047592008a48-final.mp4`
- latest preview/download: app API preview 200, app API download 200。
- 成员端 M4A 音色上传已修：`.m4a/.mp4` 音频上传强制使用 `audio/mp4`，阿里云 upload intent 验证 HTTP 201。
- 有 ready `voice_profile` 时，成员端创建 job 会带 `subtitles.talkingHeadSource=asr_original_audio`。
- FireRed 口播分镜逻辑已改为：成员上传口播素材先 ASR，ASR 文本继续交给 TTS/clone TTS；商家素材库素材不被 ASR 口播逻辑覆盖。

## 已完成

- 前端成员端 Dify draft/variant 复用逻辑已提交。
- 成员端视频任务页已补声音克隆入口：成员可上传 MP3/M4A/音频，生成 ready `voice_profile` 后，AI 剪辑会使用该 voice profile 配音；没有 ready 音色时走默认系统配音，不再走 no-voiceover。
- 已补 `/api/voice-profiles`、`voice_profiles` PostgreSQL migration、`voice-profiles/*` 上传 prefix、`audio` asset type、worker payload 的 ref audio asset 引用。
- 服务端 `/api/content/video-workbench-agent` 已增加 Dify daily task 复用保护，防止旧前端 bundle 误打接口后调用脚本 Agent。
- worker/OpenStoryline/FireRed 已同步新加坡运行容器中的 provider-neutral runtime 差异，同时保留阿里云 OSS/PostgreSQL 差异。
- 一条真实阿里云 no-voiceover 基线 AI 剪辑链路已跑通，产物在 `video-results/*`，preview/download 都是 200；后续产品口径已调整为默认配音 / 克隆配音，不再继续使用 no-voiceover。
- 阿里云 worker env 已补齐 ASR/TTS provider 变量；FireRed systemd 已切到 `config.video_edit_engine.toml`；ASR 最小激活通过。
- 已下载最终 MP4 到本地 `artifacts/aliyun-member-dify-script-to-video-e2e/`，该目录已加入 `.gitignore`。
- FireRed 配置已固定到完整本地节点：默认使用 `config.video_edit_engine.toml`，但不再挂未部署的 `127.0.0.1:9001` 外部 MCP。
- Aliyun OSS result 下载已修复：签名读 URL 不再覆盖 response `content-type`。
- `cos素材库入库包_20260515.rar` 已导入阿里云验收商家素材库，落在现有 `source_items + asset_objects`，对象前缀为 `source-assets/5bb8381f-1a72-48bc-ab87-d7bbf2740e7c/*`。
- worker 已改为运行期从 `source_items + asset_objects` 检索商家视频素材；App 侧 `video_edit_jobs.input_payload.input_assets` 不混入商家素材。
- 阿里云 worker env 已移除空的 `SUPABASE_DB_URL` key，只保留 `WORKER_DATABASE_URL` 作为数据库入口。

## 关键 ID

- batch id: `139fc0f5-df9c-4ee2-a349-3a76f47866ac`
- content generation job id: `ae545779-8d96-445c-a513-ade662cb2fdf`
- member user id: `e60fd946-c939-4807-ba7e-8d11facc158a`
- daily task id: `da18e62a-99dd-4d0f-824e-2db4e6e19bbc`
- video job id: `c435fb7c-3e83-491f-9413-0195273f37e0`
- final asset id: `bd0c1c3f-6114-43e9-a855-2f661f77a715`
- final object key: `video-results/5bb8381f-1a72-48bc-ab87-d7bbf2740e7c/c435fb7c-3e83-491f-9413-0195273f37e0/final.mp4`
- successful release: `/srv/jingjing-domestic/releases/20260519210941-08f87d7`
- successful HEAD: `08f87d7`

最新默认配音验证：

- video job id: `58205b68-db35-4d10-afe8-66dd7f93e4cb`
- final asset id: `d46c3011-1c75-478a-bdd7-ded911763d76`
- final object key: `video-results/5bb8381f-1a72-48bc-ab87-d7bbf2740e7c/58205b68-db35-4d10-afe8-66dd7f93e4cb/final.mp4`
- cover asset id: `ca24ac63-2026-4d5f-b017-a4041022f9fb`
- subtitle asset id: `8d55018d-092e-446f-b38e-159f7b2a7067`
- voiceover: `minimax`, 2 segments, `clone_enabled=false`
- successful release: `/srv/jingjing-domestic/releases/20260519220300-00e6a71`
- successful HEAD: `00e6a71`

最新商家素材库检索验证：

- video job id: `cfb03f5c-d1a0-422b-8840-047592008a48`
- final asset id: `ab1b5ce3-8aa4-4ae2-893a-35a2d94a2bbf`
- final object key: `video-results/5bb8381f-1a72-48bc-ab87-d7bbf2740e7c/cfb03f5c-d1a0-422b-8840-047592008a48/final.mp4`
- cover asset id: `d7aa8a83-ccd4-46be-b93a-d7465d23a5e1`
- subtitle asset id: `5fc9a442-af27-4433-b665-91caed2bcfab`
- persisted input assets: 7
- worker runtime input assets: 11
- material library inputs downloaded: 4
- voiceover: `minimax`
- successful release: `/srv/jingjing-domestic/releases/20260519225312-60e0a29`
- latest HEAD: `60e0a29`

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
- `workers/video-worker/worker/app/db.py`
- `workers/video-worker/worker/app/processor.py`
- `workers/video-worker/tests/test_processor_contract.py`
- `app/src/lib/member-video-workflow.ts`
- `app/src/lib/member-video-workflow.test.ts`
- `workers/video-worker/tests/test_firered_node_interceptors.py`
- `.gitignore`
- `app/src/server/storage/aliyun-oss-provider.ts`

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
- Default voiceover E2E: pass, job `58205b68-db35-4d10-afe8-66dd7f93e4cb`, `succeeded / completed / 100`。
- Direct OSS signed GET for final video: inline 200, attachment 200, `Content-Type=video/mp4`。
- `PYTHONPATH=workers/video-worker python3 -m unittest workers/video-worker/tests/test_processor_contract.py`: pass, `26` tests
- `PYTHONPATH=workers/video-worker uv run python -m unittest discover -s workers/video-worker/tests`: pass, `105` tests
- Material library E2E: pass, job `cfb03f5c-d1a0-422b-8840-047592008a48`, `succeeded / completed / 100`。
- Material library evidence: persisted app input assets `7`，worker runtime assets `11`，material library inputs downloaded `4`。
- App API preview/download for latest final video: preview 200, download 200, `Content-Type=video/mp4`。
- RDS `merchant_media_*` table count: `0`。
- Latest ASR/voice clone contract validation:
  - `pnpm --dir app typecheck`: pass
  - `pnpm --dir app lint`: pass
  - `pnpm --dir app build`: pass
  - `node --test src/server/api/video-job-payload.test.ts src/lib/member-video-workflow.test.ts`: pass, `19` tests
  - `PYTHONPATH=workers/video-worker python3 -m unittest workers/video-worker/tests/test_firered_node_interceptors.py workers/video-worker/tests/test_directive_contract.py`: pass, `23` tests
  - `PYTHONPATH=workers/video-worker uv run python -m unittest discover -s workers/video-worker/tests`: pass, `107` tests
  - M4A upload intent on Aliyun: HTTP 201, provider `aliyun_oss`, upload `Content-Type=audio/mp4`

## 下一步

1. 用户刷新页面后重新上传 M4A 音色并点击 AI 剪辑。
2. 盯 FireRed 日志确认 `local_asr` 先识别口播素材，`generate_script` 使用 ASR 文本，`generate_voiceover` 使用 `pixelle_clone`。
3. 如需继续扩展素材库，沿用 `source_items + asset_objects`，不要补 `merchant_media_*` 历史表。

## 残余风险

- 浏览器缓存/旧 tab 可能仍加载旧 bundle；服务端 guard 已兜底，但最好刷新页面后再操作。
- 本次只验证了一条真实 Dify job，符合用户要求；没有扩展成多任务批量回归。
- 阿里云 normal no-voiceover 已跑通但后续不再作为产品主链路；默认配音已真实跑通，voice clone 的 ASR->clone TTS 已做契约修复和上传意图验证，仍需真实成片端到端验收。
- 商家素材库检索已通过一条真实 job 验证，但素材检索打分目前是轻量关键词匹配，后续如要提升准确率，应继续在 `source_items.trace_payload.materialAnalysis` 和脚本素材查询字段上增强，不应回退到 `merchant_media_*`。
