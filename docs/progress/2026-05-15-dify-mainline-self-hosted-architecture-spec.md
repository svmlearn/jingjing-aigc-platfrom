# 2026-05-15 Dify 主链路国内自托管架构规范进度

## 本轮目标

把 Dify 作为内容生成主链路时，从 `final_result_json` 到图文 / 视频脚本落库，再到用户点击 AI 剪辑后触发 `video_edit_jobs` 和 video-worker 的边界沉淀成可执行工作文档。

## 已完成

- 新增架构规范目录：`docs/架构规范/2026-05-15-Dify主链路国内自托管方案/`
- 拆成总入口和 7 个分册：
  - `README.md`
  - `01-依据与全局硬门禁.md`
  - `02-工作流程与队列.md`
  - `03-数据合同与落库边界.md`
  - `04-国内自托管部署边界.md`
  - `05-视频触发与Worker合同.md`
  - `06-测试验收纠错与上线.md`
  - `07-门禁解释与把关清单.md`
- 补充交接稿：`docs/handoff/2026-05-15-dify-to-video-worker-integration-workdoc.md`
- 更新 `docs/README.md`，把新架构分册加入当前阅读入口。

## 本轮确认的硬边界

- Dify 只负责内容生成和视频脚本生成。
- 批量展开、状态、队列、落库由本系统负责。
- 当前阶段只做单队列、单实例、单并发消费，不做多并发。
- Dify 成功后只落 `content_drafts` / `content_variants`，不自动创建 `video_edit_jobs`。
- 视频部分必须先保存为 `content_variants.variant_type = video_script`。
- 用户确认脚本并点击“AI 剪辑 / 生成视频”后，才创建 `video_edit_jobs.input_payload`。
- video-worker 只消费 `video_edit_jobs`，并转换为 `ProductionDirective` 后调用 OpenStoryline / FireRed。
- OpenStoryline / FireRed 不直接读取 Dify 原始 JSON。
- 国内正式目标不依赖 Vercel serverless，默认按腾讯云大陆自托管路线规划。
- 真实 key、服务器密码、provider secret 不写入仓库、文档、日志或截图。

## 已识别 P0 缺口

1. `content_variants` 真实数据库表缺少 `production_scenes` 等结构化分镜持久化字段。
2. Dify V3.1 final JSON mapper 已统一为当前主线；旧 fixture adapter / mainline 入口已在 2026-05-15 后续补丁中删除。
3. 当前只有 `run-next` API，尚未落成稳定 content-generation 单队列常驻消费器。
4. 真实 Dify key 只应配置在目标运行环境，还未做真实端到端 smoke。
5. 国内 PostgreSQL / 国内 COS / 国内自托管 API 资源未完成验收前，不能声明国内生产可用。

## 2026-05-15 实现推进

已完成 P0-1 的代码切片：

- 新增 migration：`app/supabase/migrations/202605150003_content_variant_production_scenes.sql`
- `content_variants.production_scenes jsonb not null default '[]'::jsonb`
- `content-draft-repository.ts` 在创建 draft variant、追加 variant、select/map variant 时写入和读出 `productionScenes`
- `video-edit-job-repository.ts` 的 `assertVideoScriptVariantAccess` 读取 `production_scenes`，保证用户点击 AI 剪辑时 payload builder 能拿到结构化分镜
- `local-real-chain-repository.ts` 同步写入 `production_scenes`，保证本地 real-chain smoke 不退化
- 新增合同测试：`app/src/lib/db/content-draft-repository-contract.test.ts`

继续完成“当前可运行”切片：

- 新增单队列 runner：`app/scripts/content-generation-worker.mjs`
- 新增 npm 命令：`npm run content-generation:worker`
- runner 只 POST `APP_BASE_URL/api/content-generation/jobs/run-next`
- runner 单进程、单请求、单 job 顺序消费，不做多并发
- runner 不调用 video-worker / OpenStoryline / FireRed
- `.env.example` 补充：
  - `DIFY_WORKFLOW_RESPONSE_MODE`
  - `DIFY_WORKFLOW_TIMEOUT_SECONDS`
  - `DIFY_WORKFLOW_VERSION`
  - `APP_BASE_URL`
  - `CONTENT_GENERATION_WORKER_SECRET`
  - `CONTENT_GENERATION_WORKER_POLL_MS`
  - `CONTENT_GENERATION_WORKER_IDLE_MS`
  - `CONTENT_GENERATION_WORKER_REQUEST_TIMEOUT_MS`
- `content-generation-batch-service.ts` 增加 Dify 临时失败 retryable 分类：
  - timeout / Abort / fetch failed / 429 / 5xx -> `failed_retryable`
  - 缺 `DIFY_API_KEY` -> `failed_manual`
- 新增合同测试：`app/src/server/api/content-generation-worker-contract.test.ts`

本地运行命令：

```bash
cd app
npm run dev
```

另开一个终端：

```bash
cd app
npm run content-generation:worker
```

只跑一次可用：

```powershell
cd app
$env:CONTENT_GENERATION_WORKER_RUN_ONCE="1"
node scripts/content-generation-worker.mjs
Remove-Item Env:\CONTENT_GENERATION_WORKER_RUN_ONCE
```

仍未执行真实环境动作：

- 未连接真实 Supabase / 国内 PostgreSQL 执行 migration。
- 未使用真实 Dify key 跑 smoke。
- 未触发真实 video-worker / OpenStoryline 渲染。

## 验证状态

- 本轮是文档和架构边界沉淀，没有修改应用代码。
- 已执行 `git fetch origin main` 和 `git merge --no-edit FETCH_HEAD`，当前分支相对远端 main 已是 up to date。
- 已做文档敏感信息扫描，真实 Dify key 和服务器密码未写入仓库文档。
- 交接稿中的真实服务器 IP 已脱敏为 `<SERVER_HOST>` / `<已由用户在聊天中提供，仓库文档不落真实 IP>`。
- P0-1 实现切片已验证：
  - 旧记录：`node --test src/server/api/content-generation-worker-contract.test.ts src/lib/db/content-draft-repository-contract.test.ts src/server/api/video-job-payload.test.ts src/lib/dify-content-generation-mainline.test.ts`：25 passed
  - 2026-05-15 删除旧 Dify 实验入口后：`node --test src/server/api/content-generation-worker-contract.test.ts src/lib/db/content-draft-repository-contract.test.ts src/server/api/video-job-payload.test.ts src/lib/private-media-workflow-fixture.test.ts`：20 passed
  - `npm run typecheck -- --pretty false`：通过
  - `npm run lint -- src/server/api/content-generation-batch-service.ts src/server/api/content-generation-worker-contract.test.ts src/lib/db/content-draft-repository.ts src/lib/db/video-edit-job-repository.ts src/lib/db/local-real-chain-repository.ts src/lib/db/content-draft-repository-contract.test.ts`：通过
  - `git diff --check`：通过
  - `CONTENT_GENERATION_WORKER_RUN_ONCE=1 node scripts/content-generation-worker.mjs`：脚本可启动；当前 app 未启动时按预期返回 `fetch failed`

## 下一步建议

1. 先实现 `content_variants.production_scenes` 迁移和 repository 映射。
2. Dify final JSON 契约已统一到当前 mapper；旧实验入口已删除。
3. 增加 content-generation 单队列 worker，不塞进 video-worker。
4. 用真实 Dify 环境变量跑 1 条 smoke：Dify -> `video_script` -> 用户确认 -> 点击 AI 剪辑 -> `video_edit_jobs`。
5. 购买 / 确认国内资源后，再按新分册推进国内自托管验收。
