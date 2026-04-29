# 2026-04-23 staging COS + Video Worker implementation task

## 任务目标

把当前已经确认的四层 staging 架构真正落地为可运行的实现基线：

```text
Vercel：前端 + 轻 API
Supabase：数据库、任务表、业务数据
腾讯云 COS：素材和成片存储
腾讯云轻量服务器：视频处理 Worker
```

本轮目标不是直接做 production，也不是顺手重构整套内容工作台，而是先打通：

```text
浏览器上传素材
-> Vercel 签发 COS 临时凭证
-> COS 存储新媒体文件
-> Supabase 写 asset_objects / video_edit_jobs
-> 轻量服务器 worker 轮询任务
-> OpenStoryline 执行
-> 结果回传 COS
-> 前端展示任务状态与成片预览
```

---

## 当前事实基线

截至 `2026-04-23`，仓库当前状态已确认如下：

1. `app/` 已是一个真实 Next.js + Supabase 项目，不是纯文档仓
2. 已存在 staging Vercel 绑定：
   - `app/.vercel/project.json`
   - `projectName = jingjing-content-platform-staging`
3. 已存在 Supabase migration 基线：
   - `app/supabase/migrations/202604200001_v01_a_core_import.sql`
   - `app/supabase/migrations/202604220001_v01_platform_admin_foundation.sql`
4. 已存在 `asset_objects` 基础表，但当前字段还不足以表达 `COS`
5. 已存在 `platform_settings`，但当前分类只有：
   - `llm`
   - `import`
   - `membership`
6. 当前 `content` / `draft` / `rewrite` 页面仍大量依赖 `mock-api`
7. 当前还没有：
   - `COS` 接入代码
   - `video_edit_jobs` 表
   - 媒体上传 API
   - 视频任务 API
   - `workers/` 目录

这意味着这轮实现应优先：

- 先把后端能力和数据边界做实
- 再把 UI 接到新能力上
- 不把“顺手去 mock 化 / 全量真实化页面”混在同一轮里

---

## 方案冻结

### 1. 环境范围

- 只做 `staging / PoC`
- 不同时展开 production bucket / production worker

### 2. 地域

- worker：`新加坡`
- COS：`新加坡`

### 3. COS 模式

- 单一私有 staging bucket
- 不开 public-read
- 浏览器上传走：
  - `Vercel 先发临时凭证`
  - `前端直传 COS`
- 文件读取走短时签名 URL

### 4. worker 运行方式

- 腾讯云轻量服务器
- `Docker Compose`
- 服务拆分：
  - `openstoryline-engine`
  - `video-worker`

### 5. 任务触发方式

- worker 轮询 `video_edit_jobs`
- 默认：
  - `poll interval = 10s`
  - `max concurrency = 1`
- 不做 Vercel -> worker webhook 推送

### 6. 失败策略

- 首版不做自动重试
- 失败写成 `failed_retryable`
- 仅允许人工 retry
- `retry_count` 只在人工 retry 时递增

### 7. 配置面

- 秘密：只放环境变量
- 非秘密运行参数：这一轮也先不做后台配置页
- 不扩展 `platform_settings` 去承接视频 / COS 运行时配置

---

## 涉及目录

### 需要改动

- `app/supabase/migrations/**`
- `app/src/contracts/**`
- `app/src/server/api/**`
- `app/src/lib/db/**`
- `app/src/app/api/**`
- `app/src/components/dashboard/**`
- `app/src/app/dashboard/**`
- `app/.env.example`
- `workers/video-worker/**`（新增）
- `docs/handoff/**`
- `docs/progress/**`
- `docs/test/**`

### 不要碰的内容

1. 不要顺手改邀请码、平台管理台、商户资料等已完成链路
2. 不要重做当前管理员登录方案
3. 不要在本轮引入 production 配置
4. 不要迁移历史媒体数据
5. 不要把视频 / COS 配置收进 `platform_settings`
6. 不要把 `OpenStoryline` Web UI 直接暴露到公网
7. 不要把新媒体文件再默认落到 `Supabase Storage`

---

## 建议 worktree 拆法

这轮适合至少拆 3 个 worktree，并且先划清文件边界，避免互相覆盖。

### Worktree A：Schema + Backend Media/API

建议分支名：

- `feature/staging-cos-video-schema-api`

负责内容：

1. 新增 `video_edit_jobs` migration
2. 扩展 `asset_objects`
3. 新增媒体上传 API
4. 新增视频任务 API
5. 新增 `contracts` / `repository` / `schemas`
6. 更新 `.env.example`

建议独占文件：

- `app/supabase/migrations/**`
- `app/src/contracts/content.ts`
- `app/src/contracts/draft.ts`
- `app/src/server/api/schemas.ts`
- `app/src/lib/db/import-repository.ts`
- `app/src/lib/db/merchant-repository.ts`
- `app/src/app/api/media/**`
- `app/src/app/api/video-edit-jobs/**`
- `app/.env.example`

### Worktree B：Dashboard UI 接入

建议分支名：

- `feature/staging-cos-video-dashboard`

负责内容：

1. `content_draft` 详情页上传素材入口
2. 视频脚本版本上的“生成视频”入口
3. 视频任务详情展示
4. 前端调用 `/api/media/*` 和 `/api/video-edit-jobs/*`
5. 最小可用的 COS 签名预览展示

注意：

- 当前相关页面还带 `mock-api`
- 这条分支不要试图在同一轮把整个 `content` / `draft` 工作台都改成全真实数据
- 只补最小可挂接的新入口与新面板

建议独占文件：

- `app/src/components/dashboard/content-detail.tsx`
- `app/src/components/dashboard/draft-detail.tsx`
- `app/src/components/dashboard/content-detail-page.tsx`
- `app/src/app/dashboard/content/[sourceItemId]/page.tsx`
- `app/src/app/dashboard/drafts/[draftId]/page.tsx`
- 新增视频任务相关前端组件

### Worktree C：Video Worker + Compose

建议分支名：

- `feature/staging-cos-video-worker`

负责内容：

1. 新增 `workers/video-worker/`
2. `Docker Compose`
3. worker 轮询执行骨架
4. COS 下载 / 上传封装
5. OpenStoryline 内部调用骨架
6. worker 环境变量模板

建议独占文件：

- `workers/video-worker/**`
- `docker-compose*`（如果放在 worker 目录）
- worker README / env example

### Worktree D：手工基础设施与联调留痕

这一块不一定单独一条分支，但必须有人负责记录。

负责内容：

1. 腾讯云 COS bucket 手工配置
2. CAM 子账号与权限
3. CORS 配置
4. Vercel 环境变量录入
5. 轻量服务器目录初始化
6. 联调记录、截图、测试文档、handoff

建议落文档：

- `docs/progress/**`
- `docs/test/**`
- `docs/handoff/**`

---

## 实现顺序

建议严格按下面顺序推进：

### 第一阶段：A / C 并行准备

1. A 分支先定义并提交：
   - `video_edit_jobs`
   - `asset_objects` 扩展
   - 新 API contract
2. C 分支并行搭：
   - worker 目录
   - compose
   - 轮询骨架
   - COS / OpenStoryline client 占位

这一步的目标不是打通，而是把接口、环境变量、表结构固定下来。

### 第二阶段：D 完成手工配置

必须手工完成：

1. 新加坡私有 bucket
2. CAM 子账号
3. COS CORS
4. Vercel 环境变量
5. 轻量服务器目录准备

没有这一步，A/C 后续无法联调。

### 第三阶段：A 打通后端链路

需要完成：

1. `/api/media/upload-intents`
2. `/api/media/complete`
3. `/api/video-edit-jobs`
4. `/api/video-edit-jobs/:id`
5. `/api/video-edit-jobs/:id/retry`
6. `/api/video-edit-jobs/:id/cancel`
7. 签名预览 URL 返回逻辑

### 第四阶段：C 打通 worker 链路

需要完成：

1. 轮询拿单
2. 任务状态推进
3. 从 COS 下载输入素材
4. 调 OpenStoryline
5. 回传成片 / 封面 / 字幕到 COS
6. 更新 `asset_objects` 和 `video_edit_jobs`

### 第五阶段：B 接入前端

最后补：

1. 素材上传入口
2. 生成视频入口
3. 任务状态视图
4. 成片预览

原因：

- B 分支依赖 A 的 API 稳定
- 否则前端会被迫反复改接口

---

## 具体实现要求

### A. Supabase Schema

#### 1. 新增 `video_edit_jobs`

字段固定：

- `merchant_id`
- `draft_id`
- `content_variant_id`
- `status`
- `current_stage`
- `trigger_source`
- `instruction_text`
- `input_payload`
- `runtime_payload`
- `progress_pct`
- `retry_count`
- `failure_reason`
- `result_payload`
- `log_payload`
- `started_at`
- `finished_at`
- `created_at`
- `updated_at`

`status` 固定使用：

- `pending`
- `queued`
- `preparing`
- `running`
- `succeeded`
- `failed_retryable`
- `failed_manual`
- `cancelled`

#### 2. 扩展 `asset_objects`

必须支持：

- `owner_type in ('source_item', 'content_draft', 'content_variant')`
- `asset_type in ('image', 'video', 'cover', 'subtitle')`

新增字段：

- `storage_provider`
- `bucket_name`
- `file_size_bytes`
- `etag`

兼容策略：

- `storage_provider` 允许保留 `supabase_storage`
- 当前新写入统一使用 `tencent_cos`

#### 3. 媒体归属规则

- `content_draft`
  - 用户上传的输入素材
- `content_variant`
  - 最终成片
  - 封面
  - 字幕

### B. COS 对象 key 规则

固定如下：

- `source-assets/{merchantId}/{sourceItemId}/{uuid}-{filename}`
- `draft-inputs/{merchantId}/{draftId}/{uuid}-{filename}`
- `video-outputs/{merchantId}/{draftId}/{variantId}/{jobId}/final.mp4`
- `video-covers/{merchantId}/{draftId}/{variantId}/{jobId}/cover.jpg`
- `video-subtitles/{merchantId}/{draftId}/{variantId}/{jobId}/subtitles.srt`

### C. Vercel 环境变量

保留现有：

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`
- `APIFY_TOKEN`
- `ADMIN_SETUP_SECRET`

新增：

- `COS_SECRET_ID`
- `COS_SECRET_KEY`
- `COS_BUCKET`
- `COS_REGION`
- `COS_STS_DURATION_SECONDS`
- `COS_READ_URL_TTL_SECONDS`
- `MEDIA_UPLOAD_MAX_BYTES`

说明：

- 这些值同时配置到 `Production` 和 `Preview`
- 当前只服务 staging 项目

### D. 上传接口

必须新增：

#### `POST /api/media/upload-intents`

输入：

- `ownerType`
- `ownerId`
- `assetType`
- `fileName`
- `mimeType`
- `sizeBytes`

输出：

- `bucket`
- `region`
- `cosKey`
- `TmpSecretId`
- `TmpSecretKey`
- `Token`
- `expiredTime`

约束：

- 临时凭证只能写服务端生成的单个对象 key
- 不允许列 bucket
- 不允许读其他 key

#### `POST /api/media/complete`

输入：

- `ownerType`
- `ownerId`
- `assetType`
- `storageProvider`
- `bucketName`
- `storageKey`
- `mimeType`
- `sizeBytes`
- `etag`
- `originUrl?`

成功后：

- 写 `asset_objects`
- 不在上传前预写半成品记录

### E. 视频任务接口

必须新增：

- `POST /api/video-edit-jobs`
- `GET /api/video-edit-jobs`
- `GET /api/video-edit-jobs/:id`
- `POST /api/video-edit-jobs/:id/retry`
- `POST /api/video-edit-jobs/:id/cancel`

创建任务时必须校验：

1. `content_variant.variant_type = 'video_script'`
2. variant 属于当前用户 merchant
3. 若缺少输入素材，可拒绝创建或明确返回错误

### F. Worker 目录

固定目录：

- `/srv/jingjing-video-worker`

固定挂载：

- `/srv/jingjing-video-worker/tmp`
- `/srv/jingjing-video-worker/models`
- `/srv/jingjing-video-worker/outputs`

Compose 项目名固定：

- `jingjing-video-worker`

服务固定：

- `openstoryline-engine`
- `video-worker`

公网策略：

- 不开放 OpenStoryline 端口
- 服务器公网只保留 SSH
- 需要调试 UI 时只允许 SSH tunnel

### G. Worker 环境变量

固定：

- `SUPABASE_DB_URL`
- `COS_SECRET_ID`
- `COS_SECRET_KEY`
- `COS_BUCKET`
- `COS_REGION`
- `WORKER_POLL_INTERVAL_SECONDS=10`
- `WORKER_MAX_CONCURRENCY=1`
- `VIDEO_JOB_STALE_MINUTES=120`
- `OPENAI_API_KEY`
- OpenStoryline 所需其他 provider key

### H. 轮询逻辑

默认规则固定：

1. 每 `10s` 轮询一次
2. 单机单并发 `1`
3. 只认领最早的：
   - `pending`
   - 或人工 retry 后重新回到可执行态的任务
4. worker 启动时和每轮轮询前，先把超时任务扫回：
   - `queued`
   - `preparing`
   - `running`
   - 如果 `updated_at` 超过 `120min`
   - 则改成 `failed_retryable`

---

## 验收标准

至少要满足：

1. staging Vercel 能读取 Supabase 与 COS 环境变量
2. 浏览器能获取 COS 临时凭证并直传一个 `<= 1GB` 测试视频
3. `/api/media/complete` 能成功写 `asset_objects`
4. 创建 `video_edit_job` 后，`10s` 内被 worker 认领
5. 任务成功后：
   - COS 中出现 `final.mp4`
   - 可选出现 `cover.jpg`
   - 可选出现 `subtitles.srt`
   - `asset_objects` 中有对应记录
6. 前端能拿到签名预览 URL 并播放视频
7. 制造一次失败后：
   - 任务进入 `failed_retryable`
   - 手工 retry 生效
   - `retry_count + 1`
8. worker 重启后不会让旧任务永久卡死

---

## 手工操作清单

这部分不在代码里，但必须由执行人落实：

1. 新加坡 COS bucket 创建
2. CAM 子账号创建
3. 最小权限策略绑定
4. COS CORS 设置
5. Vercel 环境变量录入
6. 轻量服务器安装 Docker / Compose
7. 服务器目录初始化
8. OpenStoryline 所需 provider key 准备

建议把这部分联调事实写入：

- `docs/progress/`
- `docs/test/`

---

## 交付要求

每个 worktree 完成后至少交付：

1. 代码改动
2. 最小自测记录
3. 本 worktree handoff
4. 明确说明：
   - 改了哪些文件
   - 没改哪些边界
   - 还依赖谁的分支
   - 是否需要 SQL / 环境变量 / 手工操作

最终集成时至少要有：

1. schema/API handoff
2. dashboard handoff
3. worker handoff
4. 一份整体联调记录

---

## 当前建议的集成顺序

如果后面要收口，建议：

1. 先合 `Schema + Backend Media/API`
2. 再合 `Video Worker`
3. 最后合 `Dashboard UI`

原因：

- 先让数据边界和接口稳定
- 再接 worker
- 最后接 UI，冲突最少

---

## 当前状态说明

本任务文档当前只是把计划冻结成可执行说明。

截至这份文档生成时：

- **还没有开始真正实现这轮 COS / video worker 改造**
- 当前仓库只完成了方案收敛与任务拆解
- 后续请基于这份文档开多个 worktree 并行推进
