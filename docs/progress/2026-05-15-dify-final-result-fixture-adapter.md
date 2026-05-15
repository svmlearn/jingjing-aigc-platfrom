# 2026-05-15 Dify final_result_json fixture adapter 进展

## 目标

落实 Dify 主链路融合门禁：

- 使用 `outputs.final_result_json` 中的 `workflowVersion/status/article/video/quality/debug`。
- 正常 fixture 生成 `note` + `video_script` 两个兼容 variant。
- `quality.status = blocked` 或关键字段缺失时不创建可投产视频脚本。
- Dify 原始总包不得直接进入 `video_edit_jobs.input_payload`。
- 缺 Dify API key / workflow id 不阻塞本轮合同验证。

## 已完成

- 新增纯 adapter：`app/src/lib/dify-final-result-adapter.ts`。
- 新增 Dify 主链路融合 helper：`app/src/lib/dify-content-generation-mainline.ts`。
- 支持从 Dify response 的 `outputs.final_result_json` 解析字符串或对象。
- 校验关键字段：
  - `workflowVersion`
  - `article.title / coverCopy / images[].cosPath / images[].role / copyText`
  - `video.storyOutline / estimatedDuration / scenes[]`
  - `video.scenes[].sceneNo / timeRange / durationSec / sceneType / title / requiresUserUpload / taskDescription / visualDescription / voiceover`
  - `quality.status / quality.pass`
- 正常 fixture 映射为：
  - `note` variant：`article.*`
  - `video_script` variant：`video.*` 生成 `scriptText` 和 `productionScenes`
- `quality.status = blocked` 返回 blocked，不产出 variants。
- 缺 `video.scenes[]` 返回 schema_failed，不产出 variants。
- Dify 来源 `video_script` 经现有 `buildVideoEditJobInputPayload` 生成 worker payload，测试确认 payload 顶层不含 `outputs/article/video/quality/debug/workflowVersion` 原始总包。
- `generateArticleDraftForUser` 已接入 Dify 主链路薄切片：
  - `DIFY_CONTENT_GENERATION_ENABLED=1` 或 `CONTENT_GENERATION_USE_DIFY=dify` 时，优先读取 `DIFY_FINAL_RESULT_JSON_FIXTURE` / `DIFY_MOCK_FINAL_RESULT_JSON` / `DIFY_FINAL_RESULT_JSON`。
  - fixture / mock final JSON 通过 schema gate 后，复用现有 `createManualSourceItem` 和 `createDraftWithVariants` 创建同一个 draft 下的 `note` + `video_script` variants。
  - feature flag 关闭时不进入 Dify 分支，继续走现有图文 / 视频兼容辅路。
  - Dify provider / schema 失败时返回现有辅路；`quality.status = blocked` 明确抛 `DIFY_QUALITY_BLOCKED`，不创建可投产视频脚本。
- 新增服务接线合同测试：`app/src/server/api/dify-content-generation-mainline-contract.test.ts`，确认 Dify 分支在现有生成路径前、且落库仍走现有 repository helper。

## Mock / Real 说明

- Dify：本切片使用固定 fixture / mock response；未调用真实 Dify API。
- Supabase：本切片不依赖 Supabase app keys 或 service role。
- Worker：本切片复用本地 payload builder 做合同测试；未调用真实 video worker。

## 验证

- `node --test src/lib/dify-final-result-adapter.test.ts src/lib/dify-content-generation-mainline.test.ts src/server/api/dify-content-generation-mainline-contract.test.ts`
  - 14 passed。
- long-task focused app contract gate 已纳入：
  - `src/lib/dify-content-generation-mainline.test.ts`
  - `src/server/api/dify-content-generation-mainline-contract.test.ts`
- 最新 focused gate：
  - `81` Node tests passed。
- Node 输出 `MODULE_TYPELESS_PACKAGE_JSON` 性能警告，未影响测试结果。
- `./node_modules/.bin/tsc --noEmit`
  - 通过。

## 未完成 / 后置

- 真实 Dify API smoke 后置；缺 `DIFY_API_KEY` / `DIFY_WORKFLOW_ID` 不作为本轮阻塞项。
- 独立 `content_generation_jobs` / `output_json` 表仍可作为后续持久化增强；本轮采用现有 `source_items.trace_payload`、`content_drafts.input_snapshot` 和 variant 落库合同作为等价实现，不新增 Supabase 硬依赖。
- 全量商家素材库、Pexels-compatible、COS 60 天素材 URL、OpenStoryline 私有素材链路仍需继续。

## 回滚点

若该切片引入异常，可回退：

- `app/src/lib/dify-final-result-adapter.ts`
- `app/src/lib/dify-final-result-adapter.test.ts`
- `app/src/lib/dify-content-generation-mainline.ts`
- `app/src/lib/dify-content-generation-mainline.test.ts`
- `app/src/server/api/dify-content-generation-mainline-contract.test.ts`
- `app/src/server/api/content-generation-service.ts` 中 `tryCreateDifyMainlineDraft` 接线
