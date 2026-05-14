# 2026-05-14 Dify 内容日历生成链路 Handoff

## 当前目标

让团队内容日历能够创建 Dify 批量生成任务，并把 Dify V3.1 最终 JSON 映射为成员端可查看的一周图文和视频脚本。

## 已完成

1. 新增 Dify final JSON mapper。
2. 新增 batch/job 数据表迁移。
3. 新增批量创建 API：`POST /api/content-generation/batches`。
4. 新增 worker API：`POST /api/content-generation/jobs/run-next`。
5. Worker 能完成：
   - claim pending job
   - 调用 Dify workflow
   - 校验 `outputs.final_result_json`
   - 生成 `content_drafts/content_variants`
   - 回写 `daily_content_tasks`
6. 成员端能展示 Dify 写回后的：
   - 图文标题、正文、封面文案、图片链接
   - 视频分镜、口播、字幕、拍摄指导
7. 视频分镜上传入口已按 `requiresUserUpload` 控制。
8. 商家端今日任务页增加“生成本周”按钮。

## 关键约束

Dify 最终 JSON 只认：

- `status`
- `article`
- `video`
- `quality`

`quality` 只保留：

- `riskTerms`

不要把这些历史字段加回成员端或 worker contract：

- `quality.status`
- `quality.pass`
- `quality.blockingReasons`
- `quality.missingInputs`
- `imageBriefIfMissing`
- `fallbackVisual`
- `memberDelivery`
- `workerDelivery`
- `qualityReview`

“缺图片”“需人工复核”这类质量提示已删除，不应出现在成员端 UI。

## 主要改动文件

- `app/src/server/api/dify-final-json-mapper.ts`
- `app/src/server/api/dify-workflow-client.ts`
- `app/src/server/api/content-generation-batch-service.ts`
- `app/src/lib/db/content-generation-repository.ts`
- `app/src/app/api/content-generation/batches/route.ts`
- `app/src/app/api/content-generation/jobs/run-next/route.ts`
- `app/src/app/api/media/cos-preview/route.ts`
- `app/supabase/migrations/202605140001_content_generation_batches_jobs.sql`
- `app/src/components/member/member-workspace.tsx`
- `app/src/components/merchant/daily-tasks-workspace.tsx`
- `app/src/contracts/content-generation.ts`
- `app/src/contracts/daily-task.ts`

## 需要的环境变量

- `DIFY_API_KEY`
- `DIFY_BASE_URL`，默认 `https://api.dify.ai/v1`
- `DIFY_WORKFLOW_RESPONSE_MODE`，可选 `blocking` 或 `streaming`
- `DIFY_WORKFLOW_TIMEOUT_SECONDS`，默认 900
- `DIFY_WORKFLOW_VERSION`，默认 `v3.1`
- `CONTENT_GENERATION_WORKER_SECRET`
- COS 预览所需的 `COS_SECRET_ID/COS_SECRET_KEY/COS_BUCKET/COS_REGION`

## 验证记录

已通过：

```bash
pnpm --dir app typecheck
pnpm --dir app lint
pnpm --dir app build
python3 docs/探索/2026-05-11-用dify来测试链路/verify_dify_v31_final_json_yml.py
```

本地 mock E2E 已通过：

- `POST /api/content-generation/batches` 创建 1 个 job。
- `POST /api/content-generation/jobs/run-next` 用 `DIFY_MOCK_FINAL_RESULT_JSON` 消费成功。
- `GET /api/member/tasks/week` 读到 Dify mock 图文、图片 URL、视频分镜 required flags `[false, true]`。

未完成：

- 本地未调用真实 Dify workflow。
- 还未在 staging 跑 migration。
- 还未接定时 worker/cron 循环消费队列。

## 下一步建议

1. 在 staging 执行 Supabase migration。
2. 配置 Dify 和 COS 环境变量。
3. 触发 `POST /api/content-generation/batches` 创建一周队列。
4. 用 worker secret 循环调用 `POST /api/content-generation/jobs/run-next`，直到返回 `processed: false`。
5. 打开成员端 `/member/calendar` 验收：
   - 一周任务状态从队列中/生成中变为已生成。
   - 图文图片能加载。
   - 视频脚本必传/团队素材分镜正确区分。

## Worktree / Branch

Worktree：

```text
/Users/wy/.codex/worktrees/dify-calendar-member-integration
```

Branch：

```text
codex/dify-calendar-member-integration
```

当前尚未 push，尚未 merge。
