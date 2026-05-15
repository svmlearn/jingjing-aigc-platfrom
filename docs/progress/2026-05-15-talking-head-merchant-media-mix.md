# 2026-05-15 真人口播 + 商家素材库混剪链路修正

## 目标

本轮修正视频创建链路的素材边界：

```text
用户上传开头/结尾真人口播
-> 商家预切片、预打标签素材通过 COS manifest 接收
-> video_script 非空时创建任务自动锁定
-> 创建 video_edit_jobs.input_payload
-> input_assets 只放用户口播，materialContext 放商家中间素材匹配
```

本轮不做真实 Dify 全链路测试，不调用真实 Dify key，不触发 video-worker / OpenStoryline / FireRed。

## 已完成

- 新增 `POST /api/merchant-media/manifests`：
  - 接收商家已切好片、打好标签、上传 COS 后的 manifest。
  - 校验 `sourceCosKey`、`clip.cosKey`、`thumbCosKey` 必须留在当前商家 COS 前缀下。
  - 校验每个 ready clip 至少 3 个 tags。
  - 支持 `full_video`、`segment`、`image`，其中视频 segment 允许非负 `clipIndex` 和有效 start/end 时间窗。
  - 通过 repository 落 `merchant_media_assets` / `merchant_media_clips`。

- 区分两类素材：
  - 用户手机口播素材：仍绑定 `content_draft`，只进入 `video_edit_jobs.input_payload.input_assets`。
  - 商家素材库：通过 manifest 接收，进入 `materialContext.merchantMediaMatches`，用于中间 b-roll / 项目画面。

- 创建 AI 剪辑任务的硬门槛：
  - `buildVideoEditJobInputPayload(..., requireUserTalkingHead: true)` 要求至少一段 `draft-inputs/.../{draftId}/...` 下的 COS 视频。
  - 只有商家素材库、没有用户口播时会抛 `VIDEO_USER_TALKING_HEAD_ASSET_REQUIRED`。
  - 商家素材不能替代用户真人口播门槛。

- 脚本免手动确认：
  - `createVideoEditJobForUser` 在构建 payload 前调用 `ensureVideoScriptApprovedForJob`。
  - 非空 `video_script` 若未 approved，会先 `approveContentVariant` 自动锁定。
  - 空脚本仍抛 `VIDEO_SCRIPT_TEXT_REQUIRED`。
  - 前端 AI 剪辑按钮不再把 `reviewStatus !== approved` 当阻塞态。

- Dify / worker 边界：
  - Dify 原始 JSON 仍不进入 `video_edit_jobs.input_payload`。
  - `productionScenes` 继续从 `content_variants.video_script` 进入 payload。
  - `sceneType` / `requiresUserUpload` 已贯通到 production scenes，用于标记 intro/outro 用户口播。
  - OpenStoryline 仍只消费后半段 `video_edit_jobs.input_payload` / ProductionDirective 合同。

## 关键文件

- `app/src/app/api/merchant-media/manifests/route.ts`
- `app/src/lib/merchant-media-manifest.ts`
- `app/src/server/api/merchant-media-manifest-service.ts`
- `app/src/lib/db/merchant-media-repository.ts`
- `app/src/server/api/video-job-payload.ts`
- `app/src/server/api/video-edit-jobs-service.ts`
- `app/src/components/merchant/video-workbench.tsx`
- `app/supabase/migrations/202605150002_merchant_media_library.sql`
- `app/supabase/migrations/202605150004_merchant_media_segment_clips.sql`

## 验证结果

- `node --test src/server/api/content-generation-worker-contract.test.ts src/lib/db/content-draft-repository-contract.test.ts src/server/api/video-edit-jobs-service-contract.test.ts src/server/api/video-job-payload.test.ts src/server/api/merchant-media-manifest-service.test.ts src/lib/merchant-media-repository-contract.test.ts src/lib/merchant-media-library-contract.test.ts src/lib/private-media-doctor.test.ts src/lib/merchant-media-migration-contract.test.ts src/lib/private-media-workflow-fixture.test.ts`：47 passed。
- `npm run typecheck -- --pretty false`：通过。
- `npm run lint -- src/server/api/video-edit-jobs-service-contract.test.ts src/server/api/video-job-payload.ts src/server/api/video-edit-jobs-service.ts src/server/api/merchant-media-manifest-service.ts src/lib/merchant-media-manifest.ts src/lib/db/merchant-media-repository.ts src/components/merchant/video-workbench.tsx src/contracts/draft.ts src/lib/db/content-draft-repository.ts src/lib/db/video-edit-job-repository.ts`：通过。
- `git diff --check`：通过。

## 未做事项

- 未用真实 Dify key 做全链路测试。
- 未连远端服务器 `43.160.208.189`。
- 未触发 video-worker / OpenStoryline / FireRed 渲染。
- 未做生产自动切片、自动打标签；本轮只接收本地已经切片打标签并上传 COS 的 manifest。

## 结论

当前代码层面已经能表达正确合同：至少一段用户真人口播 + 商家素材库中间素材，可以创建结构正确的 `video_edit_jobs.input_payload`。用户口播和商家 b-roll 不再混用，Dify 原始 JSON 不进入 worker payload。
