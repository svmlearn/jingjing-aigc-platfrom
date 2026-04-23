# 2026-04-23 Staging COS Video Schema/API Handoff

## 目标

在 A 范围内完成 staging 基线的后端部分：

- Supabase schema 补齐 `video_edit_jobs`
- 扩展 `asset_objects` 以支持 COS 媒体字段
- 新增媒体 contract、repository、COS 服务端能力
- 新增媒体上传 API、视频任务 API
- 任务详情返回内容变体结果资产时附带短时签名预览 URL

## 已完成

1. 新增 migration：`app/supabase/migrations/202604230001_v01_staging_cos_video_schema.sql`
   - 扩展 `asset_objects.owner_type` 为 `source_item | content_draft | content_variant`
   - 扩展 `asset_objects.asset_type` 为 `image | video | cover | subtitle`
   - 新增 `storage_provider`、`bucket_name`、`file_size_bytes`、`etag`
   - 新增 `video_edit_jobs`
   - 为 `video_edit_jobs` 增加 index、`updated_at` trigger、RLS select policy
   - 更新 `asset_objects_owner_read` policy，加入 `content_draft`

2. 新增 contract
   - `app/src/contracts/media.ts`
   - `app/src/contracts/video.ts`

3. 新增 repository
   - `app/src/lib/db/media-repository.ts`
   - `app/src/lib/db/video-edit-job-repository.ts`

4. 新增 COS 服务端能力
   - `app/src/server/api/cos.ts`
   - 支持读取 COS 环境变量
   - 支持签发路径受限的 COS 临时上传凭证
   - 支持生成 COS 短时签名预览 URL
   - 支持按规则生成 `source-assets/`、`draft-inputs/` key

5. 新增服务层
   - `app/src/server/api/media-service.ts`
   - `app/src/server/api/video-edit-jobs-service.ts`

6. 新增 API route
   - `POST /api/media/upload-intents`
   - `POST /api/media/complete`
   - `POST /api/video-edit-jobs`
   - `GET /api/video-edit-jobs`
   - `GET /api/video-edit-jobs/:id`
   - `POST /api/video-edit-jobs/:id/retry`
   - `POST /api/video-edit-jobs/:id/cancel`

7. 更新配置样例
   - `app/.env.example` 已加入 `COS_SECRET_ID`、`COS_SECRET_KEY`、`COS_BUCKET`、`COS_REGION`、`COS_STS_DURATION_SECONDS`、`COS_READ_URL_TTL_SECONDS`、`MEDIA_UPLOAD_MAX_BYTES`

8. 更新依赖
   - `app/package.json` 新增 `qcloud-cos-sts`
   - `app/package.json` 新增 `cos-nodejs-sdk-v5`

## 未完成 / 留给后续 worktree

1. 还没有接前端页面和上传组件。
2. 还没有实现 worker 轮询 `video_edit_jobs`、拉 COS 素材、回传结果。
3. 还没有落地腾讯云 COS bucket / CAM / CORS 的真实环境配置。
4. 还没有做任何历史媒体迁移。
5. 当前 `media` API 只支持浏览器直传 `source_item` 和 `content_draft` 两类输入素材。
   - `content_variant` 资产仍按既定方案留给 worker/后续服务端链路写入
6. `GET /api/video-edit-jobs` 当前返回 job 列表，但没有给列表项批量附带签名资产 URL。
   - `GET /api/video-edit-jobs/:id` 已附带 `resultAssets[].signedPreviewUrl`

## 改动文件

- `app/.env.example`
- `app/package.json`
- `app/src/server/api/schemas.ts`
- `app/src/app/api/media/upload-intents/route.ts`
- `app/src/app/api/media/complete/route.ts`
- `app/src/app/api/video-edit-jobs/route.ts`
- `app/src/app/api/video-edit-jobs/[id]/route.ts`
- `app/src/app/api/video-edit-jobs/[id]/retry/route.ts`
- `app/src/app/api/video-edit-jobs/[id]/cancel/route.ts`
- `app/src/contracts/media.ts`
- `app/src/contracts/video.ts`
- `app/src/lib/db/media-repository.ts`
- `app/src/lib/db/video-edit-job-repository.ts`
- `app/src/server/api/cos.ts`
- `app/src/server/api/media-service.ts`
- `app/src/server/api/video-edit-jobs-service.ts`
- `app/supabase/migrations/202604230001_v01_staging_cos_video_schema.sql`

## 验证结果

- 已执行：`cd app && pnpm build`
- 结果：通过
- 构建产物中已出现新路由：
  - `/api/media/upload-intents`
  - `/api/media/complete`
  - `/api/video-edit-jobs`
  - `/api/video-edit-jobs/[id]`
  - `/api/video-edit-jobs/[id]/retry`
  - `/api/video-edit-jobs/[id]/cancel`

## 额外说明

1. 用户要求优先阅读的第 2、3 份文档，在主仓绝对路径下当时不存在同名文件。
   - 本次实际读取的是当前 worktree 内同名文件：
   - `docs/架构规范/2026-04-23-当前阶段技术决策-媒体存储与视频执行架构.md`
   - `docs/handoff/2026-04-23-staging-cos-video-worker-implementation-task.md`
2. 没有改动以下范围：
   - `app/src/components/dashboard/**`
   - `app/src/app/dashboard/**`
   - `workers/**`
   - `docs/progress/**`
   - `docs/test/**`
   - `.vercel`
   - `.next`
   - `node_modules`
   - `app/supabase/.temp/`

## 分支 / 工作树

- worktree: `/Users/wy/.codex/worktrees/66a6/小红书抖音矩阵获客平台`
- branch: `feature/staging-cos-video-schema-api`

## 当前 commit

- 当前 handoff 编写时基线 HEAD：`449d1ff24e51faa21584718278d49f803f181bab`
- 本分支尚未 push
- 本分支尚未 merge
