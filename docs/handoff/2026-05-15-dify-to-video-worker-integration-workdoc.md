# 2026-05-15 Dify 到 video-worker 主链路工作文档

## 2026-05-15 补充状态：旧实验入口已删除

本轮已安全删除早期 `dify-final-result-adapter` / `dify-content-generation-mainline` fixture 旁路，以及 `content-generation-service.ts` 中旧 Dify 优先分支。后续以 `content-generation-batch-service.ts`、`dify-workflow-client.ts`、`dify-final-json-mapper.ts` 和 `content_variants.video_script` 为当前 Dify 主链路。

保留的保护测试已改为直接使用 `video_script` 合同构造 `video_edit_jobs.input_payload`，并断言 payload 不包含 Dify 原始字段。本文档下方早前关于“旧 adapter 待清理 / 待决定”的描述已被本补充状态覆盖。

## 1. 本文档目标

本文件用于把当前 Dify 主链路、服务器配置、代码缺口和后续实现任务汇总给 M 同学或下一位 Agent。

本轮用户确认的主线是：

```text
Dify final_result_json
-> 解析并落库到 content_drafts / content_variants
-> 视频部分保存成 content_variants.variant_type = video_script
-> 用户在前台确认脚本后点击“AI 剪辑 / 生成视频”
-> 创建 video_edit_jobs.input_payload
-> video-worker 转成 ProductionDirective
-> 调 openstoryline-engine
-> FireRed/OpenStoryline 渲染
```

关键边界：

- Dify 是当前内容生成主 workflow，不是临时替身。
- OpenStoryline / FireRed 只认后半段 `video_edit_jobs.input_payload` / `ProductionDirective` 合同。
- OpenStoryline 不应该直接消费 Dify 原始 JSON。
- Dify 原始总包只能进入业务侧解析、留痕和排障，不允许直接塞进 `video_edit_jobs.input_payload`。
- Dify 链路走完只代表内容包和视频脚本已落库；不会自动启动视频服务器。
- 视频服务器开始工作的触发点和以前一致：用户确认脚本并点击“AI 剪辑 / 生成视频”后，主 app 创建 `video_edit_jobs`，worker 才开始处理。

## 2. 参考过的本地工作文档

本轮主要参考：

- `docs/架构规范/2026-04-28-current-architecture.md`
- `docs/架构规范/2026-05-12-内容日历批量生成与Dify过渡架构决策.md`
- `docs/产品文档/V2.1-内容日历到图文视频工作台协作PRD.md`
- `docs/handoff/2026-05-13-dify-v3-1-final-json-yml-handoff.md`
- `docs/handoff/2026-05-13-dify-v3-1-final-json-yml-completion-handoff.md`
- `docs/handoff/2026-05-14-dify-calendar-member-integration-handoff.md`
- `docs/progress/2026-05-14-dify-calendar-member-integration.md`
- `docs/progress/2026-05-15-dify-final-result-fixture-adapter.md`

外部资料只作为接口和部署事实参考，架构真相仍以本仓库文档与代码为准。

## 3. 外部资料要点

### 3.1 Dify 官方接口事实

Dify 官方工作流 API：

- 调用入口：`POST /v1/workflows/run`
- 鉴权：`Authorization: Bearer <API_KEY>`，官方明确建议 API Key 只存服务端，不共享到客户端。
- 必填输入：`inputs`、`user`
- `response_mode` 支持：
  - `blocking`
  - `streaming`
- `blocking` 返回 JSON。
- `streaming` 返回 SSE event stream。
- 返回中有 `workflow_run_id`，后续可用于查询运行详情。
- 文件变量可以传文件对象数组；本地文件应先通过文件上传 API 获取 `upload_file_id`，再以 `transfer_method: local_file` 引用。

Dify 文件上传 API：

- 调用入口：`POST /v1/files/upload`
- `multipart/form-data`
- 参数包含 `file` 和 `user`
- 返回 `id`，后续可作为 `upload_file_id`

对本项目的落地含义：

- 当前 `DIFY_BASE_URL=https://api.dify.ai/v1` 合理。
- Dify key 必须只放服务端环境变量：`DIFY_API_KEY`。
- 当前代码里 `DIFY_WORKFLOW_RESPONSE_MODE=streaming` 更适合长 workflow 和节点状态观察。
- 如果后续把真实图片/视频文件直接给 Dify，不要把私有 COS 签名 URL 当长期输入；优先走 Dify upload file 或保证签名 URL 有足够有效期。

### 3.2 Dify GitHub / Gitee / CSDN 类资料的使用边界

- GitHub `langgenius/dify` 是当前可信源，说明 Dify 是面向 workflow、RAG、观测和 API 集成的生产级平台，官方推荐 Docker Compose 自托管，最低资源约 2C/4G。
- Gitee 上能找到若干 Dify 镜像仓库，但多为非官方 mirror，不能作为版本和接口真相源。
- CSDN / 社区问答常见问题集中在 Docker Compose `.env` 不生效、端口冲突、升级后 `.env.example` 新变量未同步等。本文只把这些吸收为部署检查项，不把社区文章当作架构依据。

### 3.3 FireRed/OpenStoryline 官方仓库事实

GitHub `FireRedTeam/FireRed-OpenStoryline` 的定位是自然语言驱动的视频创作/剪辑 agent，支持媒体搜索组织、脚本生成、音乐/配音/字体推荐、对话式修订和可复用风格 skill。

对本项目的落地含义：

- OpenStoryline 是视频制作执行引擎，不是业务内容真相源。
- 本项目继续保持 `video-worker -> openstoryline-engine -> firered-openstoryline` 的隔离结构。
- 主 app 不直接调用 FireRed/OpenStoryline，也不把 Dify JSON 直接交给它。

## 4. 当前代码事实

### 4.1 Dify API client 已存在

代码位置：

- `app/src/server/api/dify-workflow-client.ts`

已具备：

- 读取 `DIFY_API_KEY`
- 默认 `DIFY_BASE_URL=https://api.dify.ai/v1`
- 支持 `DIFY_WORKFLOW_RESPONSE_MODE=blocking|streaming`
- 支持 `DIFY_WORKFLOW_TIMEOUT_SECONDS`
- mock 环境变量：`DIFY_MOCK_FINAL_RESULT_JSON`
- 从 `outputs.final_result_json` 或兼容字段读取最终 JSON

### 4.2 Dify V3.1 final JSON mapper 已存在

代码位置：

- `app/src/server/api/dify-final-json-mapper.ts`

当前强约束：

- 顶层只认 `status/article/video/quality`
- 递归拒绝已删除字段
- `article` 映射为成员端图文包
- `video.scenes` 映射为成员端视频脚本包

注意：

- 当前 mapper 的 `quality` 只保留 `riskTerms`，和 2026-05-14 文档一致。
- 2026-05-15 补充：老的 `app/src/lib/dify-final-result-adapter.ts` / `app/src/lib/dify-content-generation-mainline.ts` 以及旧 `content-generation-service.ts` Dify 旁路已删除，避免两套 Dify JSON 契约长期并存。

### 4.3 Dify batch/job 服务已存在

代码位置：

- `app/src/server/api/content-generation-batch-service.ts`
- `app/src/lib/db/content-generation-repository.ts`
- `app/src/app/api/content-generation/batches/route.ts`
- `app/src/app/api/content-generation/jobs/run-next/route.ts`

已具备：

- 创建 `content_generation_batches`
- 创建 `content_generation_jobs`
- claim 一个 pending job
- 调 Dify workflow
- 解析 final JSON
- 创建一份 `content_drafts`
- 创建两个 `content_variants`
  - `note`
  - `video_script`
- 回写 `daily_content_tasks`
- 记录 `difyWorkflowRunId`

### 4.4 video_edit_jobs 后半段合同已存在

代码位置：

- `app/src/server/api/video-edit-jobs-service.ts`
- `app/src/server/api/video-job-payload.ts`
- `app/src/lib/db/video-edit-job-repository.ts`

现有保护：

- 只能从 `contentVariantId` 创建视频任务。
- `assertVideoScriptVariantAccess` 会确认 variant 存在且 `variant_type = video_script`。
- `buildVideoEditJobInputPayload` 要求：
  - `reviewStatus = approved`
  - `scriptText` 非空
  - `script.locked = true`
- `input_payload` 只包含执行合同字段：
  - `script`
  - `productionDirective`
  - `productionConfig`
  - `materialContext`
  - `input_assets`
  - `render_mode`

这说明后半段方向是对的：worker 不需要也不应该理解 Dify 原始 JSON。

### 4.5 和以前视频链路的关系

这条链路和以前的视频工作台链路本质一致，只是“脚本来源”从旧的脚本制作 agent / 手动草稿，换成了 Dify 生成并落库的 `video_script` variant。

保持不变：

- 用户必须先看到脚本。
- 用户需要确认脚本，variant 进入 `reviewStatus = approved`。
- 用户点击“AI 剪辑 / 生成视频”后，主 app 才创建 `video_edit_jobs`。
- 视频服务器只轮询 / 消费 `video_edit_jobs`。
- OpenStoryline/FireRed 只处理 worker 标准化后的 ProductionDirective。

变化点：

- Dify 负责生成图文内容包和视频脚本。
- Dify `video.scenes[]` 需要持久化为 `content_variants.production_scenes`，方便后续创建视频任务时组装分镜素材查询。
- Dify 原始 JSON 只保留在 `content_drafts.input_snapshot` / generation job 输出中用于追溯，不进入视频执行层。

## 5. 当前最大缺口

### P0-1：Dify video.scenes 没有可靠持久化到 content_variants

`createDraftWithVariants()` 的 TypeScript 入参支持 `productionScenes`，`content-generation-batch-service.ts` 也传入了：

```text
productionScenes: input.finalJson.video.scenes.map(mapDifySceneToProductionScene)
```

原缺口：

- 真实 Supabase 迁移里的 `content_variants` 表没有 `production_scenes` / `payload` / `structured_payload` 字段。
- `content-draft-repository.ts` 的真实 Supabase insert/select 没有写入或读取 `productionScenes`。
- `assertVideoScriptVariantAccess()` 也没有把结构化分镜带给 `buildVideoEditJobInputPayload()`。

结果风险：

- 本地 demo 内存态有 `productionScenes`。
- 真实 Supabase 落库后，结构化分镜可能丢失。
- `buildVideoEditJobInputPayload()` 创建 scene asset queries 时优先读 `variant.productionScenes`，读不到就退化成从 `scriptText` 里用关键词提取。
- 这会让用户点击“AI 剪辑”后，Dify 生成的结构化分镜不能稳定进入视频素材匹配和 ProductionDirective 组装。

2026-05-15 已完成代码修复：

1. 新增 migration：
   - `app/supabase/migrations/202605150003_content_variant_production_scenes.sql`
   - `content_variants.production_scenes jsonb not null default '[]'::jsonb`
2. 更新 `content-draft-repository.ts`：
   - `ContentVariantRow` 增加 `production_scenes`
   - `contentVariantSelect` 增加 `production_scenes`
   - `createDraftWithVariants()` / `appendContentVariantToDraft()` 支持写入
   - `mapContentVariant()` 映射到 `productionScenes`
3. 更新 `video-edit-job-repository.ts`：
   - `assertVideoScriptVariantAccess()` select `production_scenes`
   - 返回值包含 `productionScenes`，供用户点击 AI 剪辑时构建 scene asset queries
4. 更新 `local-real-chain-repository.ts`：
   - 本地 real-chain 同步 `production_scenes`
5. 增加测试：
   - `app/src/lib/db/content-draft-repository-contract.test.ts`

待真实环境执行：

- 在目标 Supabase / 国内 PostgreSQL 执行 migration。
- 用真实 Dify job smoke 验证 `video_script.production_scenes` 非空。
- 用户确认脚本后点击 AI 剪辑，检查 `video_edit_jobs.input_payload.materialContext.sceneAssetQueries` 来自 structured scenes。

### P0-2：Dify 真实 API 入口还没有单队列消费器

当前有 `POST /api/content-generation/jobs/run-next`，但它是 API route，还需要明确谁来按队列顺序触发它。

现状：

- Vercel 侧已经有过 300 秒限制记录。
- 真实 Dify 单条曾超过 6 分钟。
- `/srv/jingjing-video-worker` 当前部署的是视频 worker 栈，不是内容生成 worker。

建议：

- 当前阶段只做队列形式，不做多并发。
- 已新增 `app/scripts/content-generation-worker.mjs`。
- 已新增 `npm run content-generation:worker`。
- runner 只调用 `POST /api/content-generation/jobs/run-next`。
- 每次只 claim 一个 pending job，处理完再取下一个。
- 后续如新增 compose service，也必须先按单实例、单并发、顺序队列运行。
- 不要把 Dify job 消费逻辑塞进 `video-worker`，避免内容生成和视频渲染长任务互相影响。

本地运行：

```bash
cd app
npm run dev
```

另开一个终端：

```bash
cd app
npm run content-generation:worker
```

只跑一次：

```powershell
cd app
$env:CONTENT_GENERATION_WORKER_RUN_ONCE="1"
node scripts/content-generation-worker.mjs
Remove-Item Env:\CONTENT_GENERATION_WORKER_RUN_ONCE
```

### P0-3：服务器缺 Dify 环境变量

已脱敏检查服务器 `/srv/jingjing-video-worker/.env`，当前没有看到：

- `DIFY_API_KEY`
- `DIFY_BASE_URL`
- `DIFY_WORKFLOW_RESPONSE_MODE`
- `DIFY_WORKFLOW_TIMEOUT_SECONDS`
- `DIFY_WORKFLOW_VERSION`
- `CONTENT_GENERATION_WORKER_SECRET`

用户已提供真实 Dify：

- `DIFY_BASE_URL=https://api.dify.ai/v1`
- `DIFY_API_KEY` 已在聊天中提供，但不应写入仓库、文档或日志。

建议：

- 只在目标运行环境 `.env` / Vercel env / 服务器 secret 中配置。
- 文档和代码只保留变量名。
- 配置后用脱敏命令检查变量是否 present，不打印值。

### P0-4：Dify 契约存在两套历史版本

当前代码里有两套 Dify 映射：

- 新链路：`app/src/server/api/dify-final-json-mapper.ts`
  - 顶层只认 `status/article/video/quality`
  - `quality.riskTerms`
- 旧 fixture/mainline：已删除 `app/src/lib/dify-final-result-adapter.ts` / `app/src/lib/dify-content-generation-mainline.ts`
  - 不再要求 `workflowVersion`
  - 不再要求 `quality.status/pass`
  - 不再保留 `debug` 作为当前主线字段

建议：

- 明确以 2026-05-14 Dify V3.1 合约为当前主线。
- 旧 adapter 已不再被 `content-generation-service.ts` 使用；当前主线保留新的 mapper。
- 测试里也应避免继续要求已删除字段。

## 6. 服务器检查结果

服务器：

```text
host: <已由用户在聊天中提供，仓库文档不落真实 IP>
user: mdeploy
path: /srv/jingjing-video-worker
```

已验证：

```bash
cd /srv/jingjing-video-worker
docker compose ps
```

当前容器状态：

```text
video-worker              Up
openstoryline-engine      Up / healthy
firered-openstoryline     Up / healthy
```

当前 compose 默认服务：

```text
openstoryline-engine
video-worker
```

实际 `docker compose ps` 还能看到 `firered-openstoryline`，说明当前栈应使用了 FireRed overlay 或历史启动参数。

`.env` 脱敏盘点：

已存在主要变量：

- `SUPABASE_DB_URL`
- `COS_SECRET_ID`
- `COS_SECRET_KEY`
- `COS_BUCKET`
- `COS_REGION`
- `FIRERED_PROVIDER_KEY`
- `FIRERED_OPENSTORYLINE_BASE_URL`
- `OPENSTORYLINE_BASE_URL`
- `OPENSTORYLINE_ENGINE_ADAPTER`
- `OPENSTORYLINE_LLM_API_KEY`
- `OPENSTORYLINE_LLM_BASE_URL`
- `OPENSTORYLINE_VLM_API_KEY`
- `OPENSTORYLINE_VLM_BASE_URL`
- `SILICONFLOW_API_KEY`
- `DEEPSEEK_API_KEY`
- `MINIMAX_API_KEY`
- `TTS_MINIMAX_API_KEY`
- worker 临时目录、输出目录、单实例运行参数、COS multipart 等变量

占位或为空的变量：

- `FISH_AUDIO_API_KEY`
- `GOOGLE_API_KEY`
- `PEXELS_API_KEY`
- `TTS_302_API_KEY`
- `TTS_BYTEDANCE_BIGTTS_ACCESS_KEY`
- `TTS_BYTEDANCE_BIGTTS_APPID`
- `TTS_BYTEDANCE_BIGTTS_RESOURCE_ID`
- `TTS_BYTEDANCE_BIGTTS_SPEAKER`
- `OPENSTORYLINE_LLM_MODEL`
- `OPENSTORYLINE_VLM_MODEL`

解释：

- 视频后半段基础变量基本齐。
- Dify 前半段变量不在当前视频 worker `.env` 中。
- 空的 Pexels / Google / 部分 TTS key 会影响对应可选能力，不应阻塞 Dify -> video_script -> video_edit_jobs 合同实现。

## 7. M 同学执行命令建议

### 7.1 进入服务器并查看视频 worker 栈

```bash
ssh mdeploy@<SERVER_HOST>
cd /srv/jingjing-video-worker
docker compose ps
```

### 7.2 脱敏检查 env 是否有 Dify 变量

不要 `cat .env` 到聊天或工单里。使用类似命令：

```bash
cd /srv/jingjing-video-worker
awk 'BEGIN{FS="="} /^[A-Za-z_][A-Za-z0-9_]*=/ {
  key=$1;
  val=substr($0,index($0,"=")+1);
  if (key ~ /^DIFY_/ || key == "CONTENT_GENERATION_WORKER_SECRET") {
    if (val == "" || val ~ /^CHANGE_ME/ || val ~ /^your_/ || val ~ /^TODO/) {
      print key "=empty_or_placeholder"
    } else {
      print key "=present"
    }
  }
}' .env
```

### 7.3 配置 Dify 变量

在目标运行环境配置：

```bash
DIFY_API_KEY=<真实值，只放服务器或平台环境变量>
DIFY_BASE_URL=https://api.dify.ai/v1
DIFY_WORKFLOW_RESPONSE_MODE=streaming
DIFY_WORKFLOW_TIMEOUT_SECONDS=900
DIFY_WORKFLOW_VERSION=v3.1
CONTENT_GENERATION_WORKER_SECRET=<自行生成的强随机 secret>
```

如果运行在 Vercel Hobby，需要把 timeout 控制在平台上限内，例如 `290`。当前阶段即使迁到服务器，也只按单队列单实例消费，不做多并发。

### 7.4 手动消费 Dify job 的最小命令

假设主 app 已部署，并配置 `CONTENT_GENERATION_WORKER_SECRET`：

```bash
curl -X POST "$APP_BASE_URL/api/content-generation/jobs/run-next" \
  -H "content-type: application/json" \
  -H "x-content-generation-worker-secret: $CONTENT_GENERATION_WORKER_SECRET"
```

期望返回：

```json
{
  "processed": true,
  "job": {
    "status": "succeeded"
  }
}
```

当没有待处理任务时：

```json
{
  "processed": false,
  "job": null
}
```

实际 header 名称需要以 `app/src/app/api/content-generation/jobs/run-next/route.ts` 和 `schemas.ts` 当前实现为准，执行前先查代码。

## 8. 建议实现任务拆分

### Task A：统一 Dify final_result_json 契约

目标：

- 以 `status/article/video/quality.riskTerms` 为当前唯一主线。
- 已清理旧 adapter 对 `workflowVersion/quality.status/pass/debug` 的强依赖。

涉及文件：

- `app/src/lib/dify-final-result-adapter.ts`（已删除）
- `app/src/lib/dify-content-generation-mainline.ts`（已删除）
- `app/src/server/api/dify-final-json-mapper.ts`
- `app/src/server/api/content-generation-service.ts`
- 对应测试

验收：

- 测试不再要求已删除字段。
- schema 失败时不会创建可投产 `video_script`。
- Dify 原始总包不会进入 `video_edit_jobs.input_payload`。

### Task B：持久化 video_script structured scenes

目标：

- Dify 的 `video.scenes[]` 能稳定变成 `content_variants.production_scenes`。
- 创建 video job 时能直接生成 `sceneAssetQueries`。

涉及文件：

- `app/supabase/migrations/<new>_content_variant_production_scenes.sql`
- `app/src/contracts/draft.ts`
- `app/src/lib/db/content-draft-repository.ts`
- `app/src/server/api/content-generation-batch-service.ts`
- `app/src/server/api/video-job-payload.ts`
- 对应测试

验收：

- 真实 Supabase 插入/读取后 `productionScenes` 不丢。
- Dify 生成的视频脚本被 approve 后，创建 `video_edit_jobs` 的 payload 中能看到结构化 `sceneAssetQueries`。

### Task C：内容生成队列消费器

目标：

- 不再依赖人工点 `run-next`。
- 明确用队列顺序消费 Dify jobs。
- 当前阶段不做多并发。

建议形态：

```text
/srv/jingjing-content-generation-worker
或 /srv/jingjing-video-worker/content-generation-worker
```

最小职责：

- 周期性 POST `/api/content-generation/jobs/run-next`
- 使用 `CONTENT_GENERATION_WORKER_SECRET`
- 记录日志
- 单实例、单并发，一次只处理一个 job
- 上一个 job 返回后再取下一个 pending job

不要做：

- 不要和 `video-worker` 混成一个 Python 进程。
- 不要让它直接调用 OpenStoryline。
- 不要在当前阶段引入多 worker 或批量并发 claim。

### Task D：Dify 真实 smoke

目标：

- 用真实 Dify key 跑 1 个 job。
- 确认落库、成员端展示、video_script variant 可被用户确认。

验收证据：

- `content_generation_jobs.status = succeeded`
- `content_generation_jobs.dify_workflow_run_id` 非空
- `content_drafts.input_snapshot.difyFinalJson` 存在
- `content_variants` 有 `note` 和 `video_script`
- `video_script.script_text` 非空
- `video_script.production_scenes` 非空
- Dify 结束后没有自动创建 `video_edit_jobs`
- 用户确认脚本前无法创建正式视频任务

### Task E：视频后半段联调

目标：

- 用户确认 Dify 生成的 `video_script` 后，点击“AI 剪辑 / 生成视频”真实创建 `video_edit_jobs`。
- video-worker 消费并调用 OpenStoryline/FireRed。

验收证据：

- `video_edit_jobs` 只在用户点击 AI 剪辑后出现。
- `video_edit_jobs.input_payload` 不含 Dify 原始 `article/video/quality` 顶层总包。
- `video_edit_jobs.status` 从 `pending` 推进到 `succeeded` 或明确失败状态。
- `openstoryline-engine` 和 `firered-openstoryline` 日志能看到一次对应 run。
- 成功时 COS 有 final video / cover / subtitles。
- `asset_objects(owner_type=content_variant, owner_id=<videoVariantId>)` 有输出资产。

## 9. 风险清单

1. 不要把 Dify key 写进仓库、日志、文档、截图或前端 bundle。
2. 不要把服务器密码写进文档；交接只写登录命令和权限事实。
3. 不要让 OpenStoryline 直接读 Dify JSON。
4. 不要把 Dify 质量字段旧版本重新加回成员端 UI。
5. 不要依赖 Vercel 长时间同步等待 Dify。
6. 不要在 Dify job 成功后自动创建 `video_edit_jobs`；视频服务器必须等用户点击 AI 剪辑后才开始。
7. 不要以本地 demo 的 `productionScenes` 存在为依据判断真实 Supabase 已支持。
8. 不要把社区镜像仓库当成 Dify 官方版本源。
9. 不要在真实发布账号上跳过目标商家、成员、平台、账号确认。

## 10. 当前结论

当前代码“方向正确，但最后一公里未完成”：

- Dify API client 有了。
- Dify batch/job 表和 API 有了。
- Dify final JSON 到 `note/video_script` 的创建路径有了。
- `video_edit_jobs` 后半段合同也已经守住了。

真正要补的是：

1. 统一 Dify V3.1 JSON 契约。
2. 把 Dify `video.scenes[]` 结构化持久化到真实 `content_variants`。
3. 配好真实 Dify env。
4. 建一个稳定的 content-generation worker 消费队列。
5. 跑一次 Dify -> video_script -> 用户确认脚本 -> 用户点击 AI 剪辑 -> video_edit_jobs -> OpenStoryline/FireRed 的端到端验收。

## 11. 外部参考链接

- Dify workflow run API：`https://docs.dify.ai/api-reference/工作流/执行工作流`
- Dify upload file API：`https://docs.dify.ai/api-reference/files/upload-file`
- Dify GitHub：`https://github.com/langgenius/dify`
- Dify Docker Compose 部署：`https://docs.dify.ai/getting-started/install-self-hosted/docker-compose`
- FireRed/OpenStoryline GitHub：`https://github.com/FireRedTeam/FireRed-OpenStoryline`
- 社区部署问题参考，非架构依据：`https://ask.csdn.net/questions/8967633`
