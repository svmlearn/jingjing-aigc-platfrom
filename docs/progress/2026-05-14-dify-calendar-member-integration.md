# 2026-05-14 Dify 内容日历到成员端生成链路进展

## 目标

打通“内容日历 -> Dify 批量生成 -> 中介成员端查看一周图文/视频脚本”的第一版工程链路。

## 已对齐的 Dify JSON 合约

本轮以 V3.1 最终 JSON 合约为准，已重新跑校验脚本：

```bash
python3 docs/探索/2026-05-11-用dify来测试链路/verify_dify_v31_final_json_yml.py
```

结果：`Dify V3.1 YAML final JSON contract verification passed.`

当前最终 JSON 只允许顶层字段：

- `status`
- `article`
- `video`
- `quality`

其中 `quality` 只保留：

- `riskTerms`

已确认不再使用/展示这些历史字段：

- `quality.status`
- `quality.pass`
- `quality.blockingReasons`
- `quality.missingInputs`
- `imageBriefIfMissing`
- `fallbackVisual`
- `qualityReview`
- `memberDelivery`
- `workerDelivery`
- `saveHints`

成员端不会再渲染“缺图片”“需人工复核”这类质量提示。

## 本轮实现

### 1. Dify Final JSON 映射层

新增 `app/src/server/api/dify-final-json-mapper.ts`：

- 强校验最终 JSON 顶层必须是 `status/article/video/quality`。
- 递归拒绝已删除字段，避免旧 workflow 输出悄悄回流。
- `article.images[].cosPath` 映射为成员端 `imageAssets[].url`。
- `http(s)` 图片链接前端直接渲染。
- COS key / `cos://...` 走 `/api/media/cos-preview?path=...` 换签名预览 URL。
- `video.scenes[].requiresUserUpload` 映射为成员端 `scene.required`，只驱动上传控件，不直接展示字段名。

### 2. 批量生成 batch/job

新增迁移：

- `app/supabase/migrations/202605140001_content_generation_batches_jobs.sql`

新增表：

- `content_generation_batches`
- `content_generation_jobs`

记录内容：

- 批次来源、成员范围、一周日历快照
- 每个成员/每日任务的 Dify 入参快照
- Dify workflow provider/version/run id
- 最终输出 JSON
- `quality.riskTerms`
- 回写后的 `content_draft_id/article_variant_id/video_variant_id`

### 3. API 与 Worker

新增 API：

- `POST /api/content-generation/batches`
  - 创建一周 Dify 生成批次。
  - owner 可按 `active_members` 为团队活跃成员建任务。
  - 普通成员按 `self` 建任务。

- `POST /api/content-generation/jobs/run-next`
  - worker 消费一个 pending job。
  - 调用 Dify workflow。
  - 校验 final JSON。
  - 创建一份内容草稿，包含两个 variant：
    - 小红书图文 `note`
    - 抖音视频脚本 `video_script`
  - 回写 `daily_content_tasks.article_task/video_task`。

Worker 环境变量：

- `DIFY_API_KEY`
- `DIFY_BASE_URL`，默认 `https://api.dify.ai/v1`
- `DIFY_WORKFLOW_RESPONSE_MODE`，支持 `blocking` / `streaming`
- `DIFY_WORKFLOW_TIMEOUT_SECONDS`，默认 900
- `DIFY_WORKFLOW_VERSION`，默认 `v3.1`
- `CONTENT_GENERATION_WORKER_SECRET`，配置后 worker route 必须带 secret

### 4. 成员端与商家端 UI

成员端：

- 图文图片卡片现在能渲染 Dify 返回的图片链接。
- 视频分镜按 `requiresUserUpload` 决定是否展示上传入口。
- 非必传镜头展示“团队素材”，不要求成员上传。
- 日历卡片只展示生成状态：队列中、生成中、已生成、失败。
- 未加入“缺图片/需人工复核”等质量提示。

商家端今日任务：

- 增加“生成本周”按钮。
- 点击后创建 Dify 生成 batch，并把一周任务标记为队列中。

## 图片素材检索现状

本轮已经把项目图片素材纳入 Dify 入参：

- 从素材库按 `article_image_asset` 检索。
- 附带 title/description/retrievalTargets/sourceKind/usageType。
- 如果素材有 `asset_objects`，会附带 COS 路径和可用时的签名预览 URL。

后续还需要继续优化：

- 图片素材入 Dify/RAG 的多模态索引方式。
- 图片素材描述质量。
- `assetQuery` 到素材库图片/视频的二次匹配。
- 私有 COS URL 的有效期与 Dify 执行时长配合。

## 验证

已通过：

```bash
pnpm --dir app typecheck
pnpm --dir app lint
pnpm --dir app build
python3 docs/探索/2026-05-11-用dify来测试链路/verify_dify_v31_final_json_yml.py
```

本地 mock E2E 已通过：

1. 使用 `DIFY_MOCK_FINAL_RESULT_JSON` 启动 dev server。
2. `POST /api/content-generation/batches` 创建 1 个 daily task job。
3. `POST /api/content-generation/jobs/run-next` 消费该 job。
4. worker 返回：
   - `processed: true`
   - `status: succeeded`
   - 已生成 `contentDraftId/articleVariantId/videoVariantId`
5. `GET /api/member/tasks/week` 确认：
   - 图文标题来自 Dify mock。
   - 图片 URL 为 Dify 返回的 `https://example.com/mock-image.jpg`。
   - 视频分镜 required flags 为 `[false, true]`，可区分团队素材和成员上传。
   - 图文/视频任务状态均为 `succeeded`。

未在本地触发真实 Dify 线上调用。本地 worker 已实现，但真实调用需要目标环境配置 `DIFY_API_KEY` 和 workflow 相关 env。

## 2026-05-14 真实 Dify Smoke Test

用户临时提供 Dify API key 后，使用临时环境变量启动本地 dev server，未写入 `.env`、代码或文档。

执行范围：

- `days = 1`
- `memberScope = self`
- `DIFY_WORKFLOW_RESPONSE_MODE = streaming`

执行结果：

- `POST /api/content-generation/batches`
  - 创建 1 个 job
  - batch status: `pending`
- `POST /api/content-generation/jobs/run-next`
  - `processed: true`
  - job status: `succeeded`
  - currentStage: `persisted`
  - errorMessage: `null`
  - 已生成 `contentDraftId/articleVariantId/videoVariantId`
- `GET /api/member/tasks/week`
  - article title: `光明星河天地小户型回归，上次没买到的这次怎么看？`
  - article status: `succeeded`
  - video status: `succeeded`
  - video scene count: `10`
  - required flags: `[true, false, false, false, true, false, false, false, true, true]`

图片结果：

- 本次真实 Dify 输出的 `article.images` 为空，成员端 `articleImageCount = 0`。
- 进一步检查本地 demo 素材库：`/api/materials?retrievalTarget=article_image_asset&limit=10` 返回 `count = 0`。
- 结论：本次没有图片不是前端渲染失败，而是当前本地环境没有可被 Dify 检索/输入的图片素材。
- 后续 staging 验收图片渲染时，需要先上传项目图片素材，并确认其 `retrievalTargets` 包含 `article_image_asset`。

## 当前状态

代码位于独立 worktree：

```text
/Users/wy/.codex/worktrees/dify-calendar-member-integration
```

分支：

```text
codex/dify-calendar-member-integration
```

尚未 push，尚未 merge。
