# 2026-05-13 视频工作台 JSON 合同清理交接

## 当前目标

按用户要求收紧视频工作台与服务端之间的 JSON 合同：

1. 删除当前不需要的“视频链路测试”入口。
2. 收紧 `POST /api/video-edit-jobs` 公开请求合同，不再允许浏览器侧传 `inputPayload` 或旧 snake_case 字段。
3. 瘦身普通视频任务响应 JSON，不再向普通页面暴露 `inputPayload/runtimePayload/resultPayload/logPayload`。
4. 保留页面需要的顶层展示字段：`progressModules` 和 `resultAssets`。

本轮只做代码收敛、测试和交接记录，没有 push/merge。

## 已完成内容

### 1. 删除视频链路测试入口

已从商家端视频工作台移除 `testMode=video_chain` 相关分支：

- 不再从 `/dashboard/video` 读取或传递 `testMode`。
- 不再显示“链路测试模式 / 创建测试脚本”按钮。
- 不再调用已缺失的 `/api/content/video-scripts/test-draft`。
- 删除测试草稿 fixture 与对应测试文件。

涉及文件：

- `app/src/components/merchant/video-workbench.tsx`
- `app/src/app/dashboard/video/page.tsx`
- `app/src/app/dashboard/video/page-search-params.ts`
- `app/src/app/dashboard/video/page-search-params.test.ts`
- `app/src/server/api/video-chain-test-draft.ts`，已删除
- `app/src/server/api/video-chain-test-draft.test.ts`，已删除

确认结果：

- `rg "video_chain|videoChainTest|test-draft|createVideoChainTestDraft|reviseProductionFromTestMode|VIDEO_CHAIN_TEST|video-chain-test|testMode" app -S`
  - 无匹配结果。

### 2. 收紧创建视频任务请求 JSON

公开请求合同现在只接受：

- `contentVariantId`
- `instructionText`
- `sourceJobId`
- `productionConfig`

已完成：

- `app/src/contracts/video.ts`
  - `CreateVideoEditJobRequest` 移除 `inputPayload`。
  - `ProductionConfig.bgm.include/exclude` 收紧为 `mood/scene/genre/lang/id`。
- `app/src/server/api/schemas.ts`
  - `createVideoEditJobSchema` 加 `.strict()`。
  - `inputPayload` 保留为 `z.never().optional()`，显式拒绝浏览器传入。
  - `productionConfigSchema` 内部 `.strict()` 保持不变。
- `app/src/lib/ui/video-workflow.ts`
  - `createVideoEditJob()` 只发送 camelCase 合法字段，不再发送 `draftId`、snake_case 或 `inputPayload`。
- `app/src/components/merchant/video-workbench.tsx`
  - 直接 fetch `/api/video-edit-jobs` 的请求体只发送合法字段。
- `app/src/lib/db/video-edit-job-repository.ts`
  - 内部 `createVideoEditJob` 继续接受服务端生成的 `inputPayload`，不再复用公开请求类型。

后果：

- 旧客户端如果继续传 `draftId/draft_id/content_variant_id/production_config/inputPayload` 等字段，会从可能成功变成 400。
- 服务端内部的 `video_edit_jobs.input_payload` 和 worker payload 生成链路不变。

### 3. 修正进度模块读取与 fallback

已完成：

- `app/src/lib/ui/video-workflow.ts`
  - 前端任务归一化优先读取顶层 `progressModules/progress_modules`。
  - 不再依赖响应里的 `runtimePayload/resultPayload/logPayload` 推导普通页面进度。
- `app/src/lib/ui/video-progress-modules.ts`
  - 移除泛词 `openstoryline -> render`。
  - 改为具体阶段匹配：
    - `openstoryline_material_preparation` -> `material_preparation`
    - `openstoryline_material_match` -> `material_match`
    - `openstoryline_voiceover` -> `voiceover`
    - `openstoryline_subtitles` -> `subtitles`
    - `openstoryline_render/openstoryline_rendering` -> `render`
    - `uploading_outputs/completed` -> `output_delivery`

后果：

- 后续响应瘦身后，页面仍能通过顶层 `progressModules` 显示细进度。
- 没有顶层模块时，fallback 不会再把所有 `openstoryline_*` 误判成“合成渲染”。

### 4. 瘦身普通视频任务响应 JSON

公开响应类型：

- 新增 `PublicVideoEditJobDto`。
- 普通 API 返回的任务只包含：
  - `id`
  - `draftId`
  - `contentVariantId`
  - `status`
  - `currentStage`
  - `triggerSource`
  - `instructionText`
  - `progressPct`
  - `retryCount`
  - `failureReason`
  - `progressModules`
  - `resultAssets`
  - `startedAt`
  - `finishedAt`
  - `createdAt`
  - `updatedAt`

已完成：

- `app/src/server/api/video-job-public-dto.ts`
  - 新增 `toPublicVideoEditJob()`。
  - 普通公开 DTO 不包含 `inputPayload/runtimePayload/resultPayload/logPayload`。
  - 如果内部 job 没有显式 `resultAssets`，会从 `resultPayload.resultAssets` 或 worker `uploaded_assets` 映射出顶层 `resultAssets`。
- `app/src/server/api/video-edit-jobs-service.ts`
  - `create/list/detail/retry/cancel` 对普通调用方返回 `PublicVideoEditJobDto`。
  - 结果资产 redirect 仍在服务端内部读取 `resultPayload`，不暴露给浏览器。
- 普通页面类型已改用 `PublicVideoEditJobDto`：
  - `app/src/components/merchant/video-workbench.tsx`
  - `app/src/components/merchant/history-hub.tsx`
  - `app/src/components/member/member-workspace.tsx`
  - `app/src/lib/ui/video-job-display.ts`
- `app/src/lib/ui/video-workflow.ts`
  - 不再从 `resultPayload` 兜底读取 `resultAssets`。
  - 普通页面结果资产只读顶层 `resultAssets`。

后果：

- 普通浏览器接口不再能直接看到 worker 输入、运行 payload、原始结果 payload 和日志 payload。
- 如果后续需要调试这些内部 payload，应另做受控 debug/admin 接口，不要放回普通响应。

## 验证结果

已通过：

- `cd app && node --test src/app/dashboard/video/page-search-params.test.ts`
- `cd app && node --test src/server/api/video-job-payload.test.ts`
- `cd app && node --test src/lib/ui/video-progress-modules.test.ts`
- `cd app && node --test src/server/api/video-job-public-dto.test.ts`
- `cd app && node --test src/server/api/video-job-public-route-contract.test.ts`
- `cd app && corepack pnpm exec tsc --noEmit --incremental false`
- `cd app && corepack pnpm lint`
- `cd workers/video-worker && python -m pytest tests/test_processor_contract.py`

补充说明：

- `node --test` 对当前 TS ESM 测试会打印 `MODULE_TYPELESS_PACKAGE_JSON` warning，但测试均通过。
- 直接 Node import `server-only` 文件仍会被运行时保护拦截；因此 route 防回归使用静态合同测试，不做脆弱的 route integration mock。

## 真实链路验收状态

本机未执行真实 `/api/video-edit-jobs -> worker -> OpenStoryline -> COS -> result asset` 链路。

原因：

- `app/` 下只有 `.env.example`，没有真实 `.env`。
- `workers/video-worker/` 下只有 `.env.example`，没有真实 `.env`。
- 缺少本地真实 `SUPABASE_DB_URL/COS_SECRET_ID/COS_SECRET_KEY/COS_BUCKET/COS_REGION` 和运行中的 OpenStoryline/worker 服务。

替代验证：

- `workers/video-worker/tests/test_processor_contract.py` 已通过，覆盖 worker 成功时写入 `result_payload.uploaded_assets` 的合同。
- `app/src/server/api/video-job-public-dto.test.ts` 已覆盖把 worker `uploaded_assets` 映射成公开顶层 `resultAssets`。

待环境具备后建议补跑：

1. 启动 app、OpenStoryline 和 video worker。
2. 用带视频素材的已确认脚本创建 `/api/video-edit-jobs` 任务。
3. 确认创建、列表、详情响应均不包含 `inputPayload/runtimePayload/resultPayload/logPayload`。
4. 确认顶层 `progressModules` 有细进度。
5. 确认成功后顶层 `resultAssets` 包含 video asset，且 `signedPreviewUrl` 可通过 `/api/video-edit-jobs/:id/result/:assetId` 访问。

## 当前工作区状态说明

当前工作区仍有多组未提交改动混在一起，不建议一次性提交：

建议提交拆分：

1. 视频链路测试入口删除：
   - dashboard video page/search params
   - 删除 `video-chain-test-draft*`
2. 创建请求 JSON 严格化：
   - `schemas.ts`
   - `contracts/video.ts`
   - `video-workflow.ts`
   - `video-edit-job-repository.ts`
   - 相关测试
3. 进度模块读取与 fallback：
   - `video-progress-modules.ts`
   - `video-progress-modules.test.ts`
   - 相关 UI 使用点
4. 公开响应 JSON 瘦身：
   - `video-job-public-dto.ts`
   - `video-job-public-dto.test.ts`
   - `video-job-public-route-contract.test.ts`
   - `video-edit-jobs-service.ts`
   - 普通页面的 `PublicVideoEditJobDto` 类型迁移
5. 结果资产 redirect / worker / 迁移 / demo / 其他文档：
   - 当前工作区里还有 worker、result route、migration、demo docs 等改动，需要单独判断归属。

不要直接回滚未识别的 dirty 文件；其中部分来自用户或此前任务。
