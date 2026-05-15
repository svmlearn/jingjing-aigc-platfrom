# 2026-05-15 删除旧 Dify 实验入口进度

## 目标

安全删除早期 “Dify fixture 接入旧内容生成 API” 的实验入口，不影响当前 Dify 队列主链路：

`/api/content-generation/batches -> /api/content-generation/jobs/run-next -> runDifyWorkflow -> dify-final-json-mapper -> content_drafts/content_variants.video_script -> 用户点击 AI 剪辑 -> video_edit_jobs`

## 已完成

- 删除 `content-generation-service.ts` 中旧 Dify 优先分支：
  - `tryCreateDifyMainlineDraft`
  - `resolveDifyFinalResultForMainline`
  - `DifyMainlineDraftServiceInput`
  - `DifyFinalResultProvider`
  - `setDifyFinalResultProviderForTests`
- 删除旧实验文件：
  - `app/src/lib/dify-final-result-adapter.ts`
  - `app/src/lib/dify-content-generation-mainline.ts`
- 删除旧实验专属测试：
  - `app/src/lib/dify-final-result-adapter.test.ts`
  - `app/src/lib/dify-content-generation-mainline.test.ts`
  - `app/src/server/api/dify-content-generation-mainline-contract.test.ts`
- 改造 `app/src/lib/private-media-workflow-fixture.test.ts`：
  - 不再依赖旧 Dify builder。
  - 直接使用当前 `video_script` 合同构造 video job payload。
  - 断言 payload 不包含 `workflowVersion`、`outputs`、`article`、`video`、`quality` 等 Dify 原始字段。

## 验证结果

- `rg "dify-final-result-adapter|dify-content-generation-mainline|tryCreateDifyMainlineDraft|DIFY_CONTENT_GENERATION_ENABLED|CONTENT_GENERATION_USE_DIFY" app/src`：无命中。
- `node --test src/server/api/content-generation-worker-contract.test.ts src/lib/db/content-draft-repository-contract.test.ts src/server/api/video-job-payload.test.ts src/lib/private-media-workflow-fixture.test.ts`：20 passed。
- `npm run typecheck -- --pretty false`：通过。
- `npm run lint -- src/server/api/content-generation-service.ts src/server/api/content-generation-batch-service.ts src/lib/private-media-workflow-fixture.test.ts`：通过。
- `git diff --check`：通过。

## 未做事项

- 未做真实 Dify 全链路测试。
- 未调用真实 Dify key。
- 未触发 video-worker / OpenStoryline / FireRed。
- 未修改数据库 schema 或 worker 合同。

## 当前结论

旧实验入口已经从代码层清除；当前 Dify 主链路只保留队列 job、Dify workflow client、V3.1 final JSON mapper、`content_variants.video_script`、以及用户点击后生成 `video_edit_jobs.input_payload` 的合同。
