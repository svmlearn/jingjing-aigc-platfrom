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

部署备注：

- Vercel Hobby plan 单个 Serverless Function `maxDuration` 上限为 300 秒。
- 线上 `/api/content-generation/jobs/run-next` 先按 300 秒部署，Vercel Production 的 `DIFY_WORKFLOW_TIMEOUT_SECONDS` 应配置为 290。
- 真实 Dify 一次生成曾耗时约 6.2 分钟；如果线上继续出现超时，需要把该 worker 迁到外部常驻 worker/队列，或升级 Vercel plan。

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

## 2026-05-14 房地产图片素材种子入库

目标账号：

- `ywangyangw1@163.com`
- 对应 Supabase auth user 已确认存在。
- 对应 merchant profile：`young`
- 角色：owner

本次操作：

- 联网查找房地产相关公共图库图片素材。
- 选取 Unsplash 中的外立面、社区、客厅、厨房、卧室、卫浴、餐厅等 12 条示意素材。
- 写入该商家的 `source_items` 素材库。
- 每条素材均标记：
  - `materialLibrary = true`
  - `materialUsageType = image_asset`
  - `retrievalTargets = ["article_image_asset"]`
  - `materialCategory = stock_real_estate_reference`
  - `notRealProjectPhoto = true`

验证结果：

- 尝试入库：12 条。
- 新增入库：12 条。
- 抽样查询：12 条均命中 `article_image_asset`。
- URL host：`images.unsplash.com`。

使用边界：

- 这些素材是公共图库示意素材，不是真实项目照片。
- 可以用于链路测试、示意配图、Dify 图片输入验证。
- 对外发布真实楼盘内容前，应优先替换为商家自己的项目实拍、户型图、样板间、周边配套等素材。

## 2026-05-14 主链路目标补充

用户确认的完整主链路目标是：

```text
成员管理 / 邀请码生成
-> 成员加入团队
-> 上传图片素材和视频素材
-> 用生成好的内容日历调用 Dify
-> 为各个成员生成未来一周图文内容包和视频脚本
-> 成员端看到自己的未来一周内容
-> 成员按分镜上传素材
-> AI 剪辑成片
-> 成员端 / 我的内容能看到结果
```

这条目标已补充到：

- `docs/架构规范/2026-05-12-内容日历批量生成与Dify过渡架构决策.md`
- `docs/progress/总架构流程进度图.html`

## 2026-05-14 完整主链路 E2E 测试计划

本阶段测试目标不是只验证某一个按钮，而是验证 owner、成员、素材、Dify、worker、剪辑任务之间的数据能连续流动。

### Completion Gate

完整链路通过必须同时满足：

1. owner 能在商家端创建团队邀请码，并看到已加入成员。
2. 新成员能使用邀请码加入团队，进入成员端后只看到所属团队的项目和内容。
3. owner 能上传或准备图片/视频素材，素材能被标记为 Dify 可检索/可输入。
4. owner 能基于内容日历为未来 7 天、至少 1 个成员发起 Dify 批量生成。
5. worker 能消费 batch/job，真实调用 Dify，并落库图文内容包和视频脚本。
6. 成员端未来一周日历能看到生成结果，图文图片链接能渲染为图片。
7. 成员能按视频分镜上传必需素材。
8. 成员能发起 AI 剪辑任务，任务完成后在成员端“内容/历史”看到结果。

### Phase A：成员与权限冒烟

测试范围：

- owner 登录 `ywangyangw1@163.com` 对应商家。
- 创建 1 个团队邀请码。
- 使用另一个测试成员账号接受邀请码。
- 查询 `merchant_team_members`，确认出现 owner + member 两条 active membership。
- 成员访问 `/member`、`/member/calendar`、`/member/invite`，确认身份和团队绑定正确。

验收证据：

- 邀请码 API 返回 code。
- 成员接受 API 返回 merchant workspace。
- owner 团队管理页面能看到成员。

### Phase B：素材检索冒烟

测试范围：

- owner 素材库存在至少 3 张 `article_image_asset` 图片素材。
- 至少 1 条视频素材或分镜上传素材能落到 `asset_objects` / 视频剪辑输入。
- Dify batch 入参里能看到图片素材标题、描述和 URL/COS preview。

验收证据：

- `source_items.metadata.retrievalTargets` 包含 `article_image_asset`。
- batch/job 的 input snapshot 包含 `imageMaterials`。
- 若 Dify 输出 `article.images[].url` 或 `cosPath`，成员端图文页能直接渲染。

### Phase C：1 成员 1 天真实 Dify 链路

测试范围：

- owner 为 1 个成员、1 天内容日历发起 batch。
- worker 使用真实 Dify API key 消费 1 个 job。
- 生成图文内容包和视频脚本。

验收证据：

- `content_generation_batches.status` 进入 finished 或 partial。
- `content_generation_jobs.status = succeeded`。
- `daily_content_tasks.article_task.generationStatus = succeeded`。
- `daily_content_tasks.video_task.generationStatus = succeeded`。
- 成员端图文页和视频脚本页能打开。

### Phase D：1 成员 7 天一周链路

测试范围：

- owner 使用“生成本周”创建 7 天 job。
- worker 连续消费直到本周 jobs 全部结束。
- 成员端 `/member/calendar` 未来 7 天均能看到生成状态和内容入口。

验收证据：

- job 总数与目标天数一致。
- 失败 job 有 error message，可重试或定位。
- 成员端一周列表无空白、无前端报错。

### Phase E：多成员分发链路

测试范围：

- 团队至少 2 个 active member。
- owner 选择 `active_members` 发起一周生成。
- 每个成员看到自己对应的内容任务。

验收证据：

- 每个成员都有独立 daily task / generation job 关联。
- 成员 A 与成员 B 的成员端视图不会互相串数据。

### Phase F：视频素材上传与 AI 剪辑

测试范围：

- 成员打开某天视频脚本。
- 按 required 分镜上传素材。
- 确认视频脚本草稿、媒体上传、variant approve、AI 剪辑 job 创建成功。
- 等待 worker/剪辑服务完成。

验收证据：

- 成员端视频页展示上传进度和剪辑任务状态。
- `video_edit_jobs` 有完整状态流转。
- `/member/history` 能看到剪辑任务或最终成片结果。

### 当前优先实现切片

下一步先补“成员管理 / 邀请码生成”：

- owner 侧新增团队成员页面。
- owner 能创建邀请码、复制成员加入链接。
- owner 能查看团队成员和邀请码使用次数。
- 保留成员端已有的邀请码接受链路。

## 2026-05-14 成员管理 / 邀请码实现进展

本轮新增：

- `GET /api/merchant-team`
  - owner 读取当前 workspace、active team members、团队邀请码列表。
- `POST /api/merchant-team/invitation-codes`
  - owner 创建团队邀请码。
  - 支持自定义 code、最大兑换次数、过期时间、备注。
- `/dashboard/team`
  - owner 侧团队成员页面。
  - 可生成邀请码、复制成员加入链接、查看成员列表和邀请码使用次数。

复用已有：

- `POST /api/member/invitations/accept`
  - 成员通过邀请码加入团队。
- `/member/invite?code=...`
  - 成员端邀请码入口已支持从 URL 预填 code。

本地 demo 冒烟结果：

1. `GET /api/merchant-team`
   - 返回 owner workspace。
   - 初始 members 只有 owner。
2. `POST /api/merchant-team/invitation-codes`
   - 使用 `TEAM-TEST-01` 创建邀请码成功。
   - 返回 `redemptionCount = 0`。
3. `POST /api/member/invitations/accept`
   - 使用 header `x-jingjing-demo-user-id: demo-member-001` 模拟成员。
   - 成员加入成功，返回 `role = member`。
4. 再次 `GET /api/merchant-team`
   - members 变为 owner + member。
   - `TEAM-TEST-01.redemptionCount = 1`。

验证结果：

```bash
pnpm --dir app typecheck
pnpm --dir app lint
pnpm --dir app build
```

均已通过。

浏览器自动化连接 Codex in-app browser 超时；本轮已用 dev server + API 冒烟 + production build 验证页面 route 和数据链路。

## 2026-05-14 发布进展

已执行：

- 推送 `codex/dify-calendar-member-integration` 到 Gitee `main`。
- Supabase 远端项目 `jrveaabguddromjtibbs` 已执行 `202605140001_content_generation_batches_jobs.sql`。
- Vercel Production 已补充 Dify 相关环境变量：
  - `DIFY_API_KEY`
  - `DIFY_WORKFLOW_RESPONSE_MODE=streaming`
  - `DIFY_WORKFLOW_TIMEOUT_SECONDS=290`
  - `DIFY_WORKFLOW_VERSION=v3.1`

部署注意：

- 首次 Vercel production deploy 因 Hobby plan 不允许 900 秒 `maxDuration` 被拒绝。
- 已将 run-next route 调整为 300 秒以满足当前 Vercel plan。

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
