# 2026-05-15 真人口播 + 商家素材库混剪链路 Handoff

## 当前目标

完成“真人口播 + 商家素材库混剪”安全修正：

```text
用户上传开头/结尾真人口播
-> 商家 COS manifest 接收已切片、已打标签素材
-> 非空 video_script 创建任务时自动锁定
-> video_edit_jobs.input_payload 组合用户口播 + 商家中间素材
```

## 已完成

- 新增商家素材 manifest 接收接口：`POST /api/merchant-media/manifests`。
- 新增 manifest 纯合同模块：`app/src/lib/merchant-media-manifest.ts`。
- 新增 Supabase / fallback repository：`app/src/lib/db/merchant-media-repository.ts`。
- 扩展 `merchant_media_clips` 合同：
  - 支持 `clip_type = segment`。
  - `clip_index >= 0`。
  - ready clip 必须有 bucket、mime、thumb、description、至少 3 个 tags。
- 视频 job payload：
  - 用户 draft 视频进入 `input_assets`。
  - 商家素材进入 `materialContext.merchantMediaMatches`。
  - intro/outro 或 `requiresUserUpload` 场景标记为 `user_talking_head`。
  - 中间镜头标记为 `merchant_broll`，不再把用户口播素材当作 b-roll 兜底。
  - `requireUserTalkingHead: true` 时，没有用户口播会抛 `VIDEO_USER_TALKING_HEAD_ASSET_REQUIRED`。
- 视频 job service：
  - 创建任务前自动锁定非空脚本。
  - 空脚本仍禁止创建任务。
  - 同时拉取商家 ready clips 用于 payload material context。
- 前端 video workbench：
  - 不再把“脚本未手动确认”作为创建 AI 剪辑的阻塞态。
  - 保留脚本显示，创建时由后端锁定。

## 工作边界

- 没有调用真实 Dify。
- 没有调用真实 video-worker / OpenStoryline / FireRed。
- 没有连接远端服务器。
- 没有实现自动切片、自动打标签。
- 没有 push、merge、commit。

## 验证

已通过：

```text
node --test src/server/api/content-generation-worker-contract.test.ts src/lib/db/content-draft-repository-contract.test.ts src/server/api/video-edit-jobs-service-contract.test.ts src/server/api/video-job-payload.test.ts src/server/api/merchant-media-manifest-service.test.ts src/lib/merchant-media-repository-contract.test.ts src/lib/merchant-media-library-contract.test.ts src/lib/private-media-doctor.test.ts src/lib/merchant-media-migration-contract.test.ts src/lib/private-media-workflow-fixture.test.ts
npm run typecheck -- --pretty false
npm run lint -- src/server/api/video-edit-jobs-service-contract.test.ts src/server/api/video-job-payload.ts src/server/api/video-edit-jobs-service.ts src/server/api/merchant-media-manifest-service.ts src/lib/merchant-media-manifest.ts src/lib/db/merchant-media-repository.ts src/components/merchant/video-workbench.tsx src/contracts/draft.ts src/lib/db/content-draft-repository.ts src/lib/db/video-edit-job-repository.ts
git diff --check
```

## 主要改动文件

- `app/src/app/api/merchant-media/manifests/route.ts`
- `app/src/lib/merchant-media-manifest.ts`
- `app/src/server/api/merchant-media-manifest-service.ts`
- `app/src/server/api/merchant-media-manifest-service.test.ts`
- `app/src/lib/db/merchant-media-repository.ts`
- `app/src/server/api/video-job-payload.ts`
- `app/src/server/api/video-job-payload.test.ts`
- `app/src/server/api/video-edit-jobs-service.ts`
- `app/src/server/api/video-edit-jobs-service-contract.test.ts`
- `app/src/components/merchant/video-workbench.tsx`
- `app/src/contracts/draft.ts`
- `app/src/lib/db/content-draft-repository.ts`
- `app/src/lib/db/video-edit-job-repository.ts`
- `app/src/server/api/content-generation-batch-service.ts`
- `app/supabase/migrations/202605150002_merchant_media_library.sql`
- `app/supabase/migrations/202605150004_merchant_media_segment_clips.sql`

## 下一步建议

1. 用一段真实手机开头/结尾口播和一份 COS manifest 做本地 API smoke。
2. 确认 COS bucket、前缀、签名读权限和 worker 运行环境一致。
3. 再做一次不调用 Dify 的 `video_edit_jobs` 到 worker 的 dry-run。
4. 最后再接真实 Dify output 到 `content_variants.video_script` 的端到端联调。

## 状态

待用户验收，待合并决策。
