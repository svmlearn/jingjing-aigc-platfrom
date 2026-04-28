# Current Task: 视频工作台全链路验收问题收敛

日期：2026-04-28

## 当前目标

按 review findings 顺序修复视频工作台全链路问题，优先保证：

1. 视频工作台上传的分段素材会真正进入 COS，并创建 `asset_objects`，worker 能拿到 `input_assets`。
2. 本地/demo 模式创建的视频 job 会自动推进到完成态，不再卡在 pending。
3. 脚本生成校验失败时不提前创建孤儿 `source_items`。
4. 制作修订必须基于已有完成视频 job，不允许退化成普通新任务。
5. 服务器真实部署时有明确 FireRed/OpenStoryline 引擎启动入口，不把生产出片误跑成 skeleton 占位视频。

## 已完成

### Finding 1：视频工作台素材上传绑定

已修改：

- `app/src/components/merchant/video-workbench.tsx`
- `app/src/lib/ui/video-workflow.ts`

当前行为：

- “传镜头”不再只是改 UI 状态。
- 用户选择图片/视频文件后，会调用媒体上传链路。
- 上传流程走 `/api/media/upload-intents`、COS 上传、`/api/media/complete`。
- 完成后会创建 draft 下的 `asset_objects`。
- 上传状态支持 uploading / uploaded / failed，并显示进度和文件大小。
- 上传素材带 `sortOrder`，供后端生成 worker payload 时稳定排序。

已验证：

- `corepack pnpm lint`
- `corepack pnpm typecheck`
- `corepack pnpm build`

## 2026-04-28 21:35 补充：浏览器直传 COS CORS 阻断

用户在 `/dashboard/video?testMode=video_chain` 选择第一段测试素材后，页面显示 `CORS blocked or network error`。

已确认：

- `/api/media/upload-intents` 能返回 `201`，临时凭证、bucket、region、object key 都能生成。
- 服务端/Node 侧用同一 COS 配置可以真实写入 COS，说明不是“素材进 DB”或 COS 密钥完全不可用。
- 对同一个 COS object URL 发浏览器预检等价的 `OPTIONS` 请求，`Origin = http://localhost:3001`，结果为 `403 AccessForbidden`。
- COS 返回错误信息为 `CORSResponse: This CORS request is not allowed`。
- `GET`、`PUT`、带/不带 `content-type`、带 `authorization,x-cos-security-token,content-type` 的预检都被拒绝。
- 当前 COS 密钥读 `GetBucketCORS` 也返回 `403 AccessDenied`，不能安全读取并合并现有 CORS 规则。

结论：

- 当前浏览器上传失败根因是 COS bucket CORS 未放行本地调试来源 `http://localhost:3001`。
- 代码上传链路方向是对的：先领临时凭证，再浏览器直传 COS，最后 `/api/media/complete` 只登记 COS 元数据。
- 需要由具备 bucket CORS 管理权限的账号在 COS bucket 上追加跨域规则；不要在无法读取现有规则时盲目 `putBucketCors`，因为该操作可能覆盖已有 CORS 配置。

建议追加的最小规则：

- AllowedOrigin: `http://localhost:3001`
- AllowedMethod: `GET`, `PUT`, `POST`, `HEAD`, `OPTIONS`
- AllowedHeader: `*`
- ExposeHeader: `ETag`, `x-cos-request-id`
- MaxAgeSeconds: `600`

后续用户已在腾讯云控制台处理 staging COS bucket：

- Bucket: `jj-content-staging-1341668543`
- Region: `ap-singapore`
- CORS Origins: `http://localhost:3000`, `http://localhost:3001`, `https://jingjing-content-platform-staging.vercel.app`, `https://*.vercel.app`
- Methods: `PUT`, `GET`, `POST`, `HEAD`
- Allow-Headers: `*`
- Expose-Headers: `ETag`, `Content-Length`, `x-cos-request-id`
- Max-Age: `600`
- Vary: 已开启

复测结果：

- `Origin = http://localhost:3001`
- `Access-Control-Request-Method = PUT`
- `Access-Control-Request-Headers = authorization,x-cos-security-token,content-type`
- COS 预检返回 `200 OK`
- 页面刷新后旧的 `CORS blocked or network error` 横幅不再出现，可继续由浏览器重新选择素材上传。
- `node --test src/server/api/video-job-payload.test.ts`
- `git diff --check app/src/components/merchant/video-workbench.tsx app/src/lib/ui/video-workflow.ts`

### Finding 2：本地/demo 视频 job 自动推进

已修改：

- `app/src/lib/db/video-edit-job-repository.ts`

当前行为：

- 无 Supabase admin 时，本地内存 job 会按时间线自动推进。
- 状态从 pending / queued / preparing / running 最终到 succeeded。
- 成功时写入 local demo `resultPayload`。
- 明确这是本地 UI/demo 模拟完成，不是真实渲染和 COS 回写。

已验证：

- `corepack pnpm lint`
- `corepack pnpm typecheck`
- `corepack pnpm exec tsc --noEmit --incremental false`
- `corepack pnpm build`
- `node --test src/server/api/video-job-payload.test.ts`
- `git diff --check app/src/lib/db/video-edit-job-repository.ts`

### Finding 3：脚本生成失败前不创建孤儿 source_item

已修改：

- `app/src/server/api/content-generation-service.ts`

当前行为：

- `validateScriptProductionBrief` 先执行。
- 脚本制作 agent 成功产出候选后，再创建 `source_item`。
- 如果咨询台信息不足抛 `SCRIPT_PRODUCTION_BRIEF_INCOMPLETE`，不会留下孤儿 `source_items`。

已验证：

- `corepack pnpm lint`
- `corepack pnpm typecheck`
- `node --test src/server/api/video-job-payload.test.ts src/server/api/video-script-production-agent.test.ts`
- `git diff --check app/src/server/api/content-generation-service.ts`

### Finding 4：制作修订必须基于源 job

已修改：

- `app/src/components/merchant/video-workbench.tsx`

当前行为：

- 制作修订必须存在 `job.id`，且当前 job 为 `succeeded`。
- 没有完成视频时，前端提示先创建并完成 AI 剪辑任务。
- 创建制作修订时传入明确的 `sourceJobId`，不再用 `job?.id` 退化成普通 manual job。

已验证：

- `corepack pnpm lint`
- `corepack pnpm build`
- `corepack pnpm typecheck`
- `node --test src/server/api/video-job-payload.test.ts src/server/api/video-script-production-agent.test.ts`
- `git diff --check app/src/components/merchant/video-workbench.tsx app/src/server/api/content-generation-service.ts`

### Finding 5：FireRed/OpenStoryline 生产部署入口

涉及文件：

- `workers/video-worker/docker-compose.yml`
- `workers/video-worker/docker-compose.firered.yml`
- `workers/video-worker/.env.example`
- `workers/video-worker/firered.env.example`
- `workers/video-worker/README.md`

已修改：

- `docker-compose.yml` 缺省 adapter 改为 `fire_red`。
- `docker-compose.yml` 缺省 `FIRERED_OPENSTORYLINE_BASE_URL` 改为 `http://firered-openstoryline:7860`。
- 新增 `docker-compose.firered.yml`，强制生产 FireRed adapter 配置，并让 `openstoryline-engine` 等待 `firered-openstoryline` healthy。
- `.env.example` 明确为本地 skeleton smoke 使用。
- README 中服务器真实部署命令改为：
  - `docker compose -f docker-compose.yml -f docker-compose.firered.yml --profile firered up --build`

当前行为：

- 生产部署如果没有显式配置，不会再静默落到 skeleton 占位视频。
- 本地 smoke 仍可通过 `.env.example` 显式使用 skeleton。
- 服务器真实视频引擎路径固定为 Docker：
  - `video-worker -> openstoryline-engine:/v1/runs -> firered-openstoryline:/api/worker/runs`

已验证：

- `docker compose -f docker-compose.yml -f docker-compose.firered.yml --profile firered config --quiet`
- `python -m pytest tests/test_openstoryline_engine_adapters.py tests/test_engine_run_contract.py`
- `python -m pytest tests`
- `git diff --check -- workers/video-worker/docker-compose.yml workers/video-worker/docker-compose.firered.yml workers/video-worker/README.md workers/video-worker/.env.example docs/current-task.md`

## 注意事项

- 当前仓库有大量既有脏改动，不要随意 revert。
- 本轮只修 review findings，不合并、不 push。
- 不要在回答或文档中回显用户曾给过的任何 API key。
- `corepack pnpm typecheck` 不要和 `corepack pnpm build` 并行跑，`.next/types` 会被重建，可能产生假失败。

## 下一步

本轮 review findings 1-5 都已完成实现和验证。

下一步建议：

1. 再跑一轮 app 质量门做最终总验收。
2. 真实服务器补齐 Supabase、COS、LLM/VLM/TTS 密钥后，跑一次真实 `/v1/runs -> final.mp4 -> COS` 出片验收。
## 2026-04-28 20:23 补充：视频链路测试入口

用户需要在没有真实匹配脚本素材的情况下，自行验证视频上传、生成、预览和制作修订链路。

本轮新增“已确认视频脚本测试草稿”入口，而不是放松 `video_edit_jobs` 合同：

- 本地访问：`/dashboard/video?testMode=video_chain`
- 点击“创建测试脚本”后，系统创建 `video_script` variant，且 `reviewStatus = approved`
- 后续仍然走草稿素材上传、`video_edit_jobs` 创建、worker 执行、成片预览和 `sourceJobId` 制作修订
- 生产环境默认关闭；staging 如以 production 构建，需要 `VIDEO_CHAIN_TEST_ENTRYPOINT_ENABLED=true`

本轮新增/修改文件：

- `app/src/server/api/video-chain-test-draft.ts`
- `app/src/server/api/video-chain-test-draft.test.ts`
- `app/src/app/api/content/video-scripts/test-draft/route.ts`
- `app/src/server/api/content-generation-service.ts`
- `app/src/app/dashboard/video/page.tsx`
- `app/src/components/merchant/video-workbench.tsx`
- `docs/progress/2026-04-28-video-chain-test-entrypoint.md`

已验证：

- `node --test src/server/api/video-chain-test-draft.test.ts`
- `node --test src/server/api/video-job-payload.test.ts src/server/api/video-script-production-agent.test.ts`
- `corepack pnpm lint`
- `corepack pnpm typecheck`
- `corepack pnpm build`

## 2026-04-28 20:55 补充：本地测试页上传失败修复

问题现象：

- `/dashboard/video?testMode=video_chain` 创建测试脚本后，点击镜头素材上传显示“上传失败”。

根因：

- 本地 `localhost:3001` 的 Next app 初始没有 COS 配置，`POST /api/media/upload-intents` 返回 `COS_NOT_CONFIGURED`。
- 同步 COS 配置后，本地 demo 又卡在 `MEDIA_OWNER_NOT_FOUND`，因为 Next dev 下不同 API route 的内存草稿状态不稳定共享，且本地没有 app 侧 Supabase service role。

本轮处理：

- 从服务器 `/srv/jingjing-video-worker/.env` 只同步 COS 必要变量到被 git 忽略的 `app/.env.local`，未在日志中输出密钥值。
- 重启本地 `3001` dev server，确认 Next 读取 `.env.local`。
- 在本地 demo 模式下补 `media-repository` 的内存元数据索引：
  - `assertMediaOwnerAccess` 本地 demo 允许 `source_item` / `content_draft` 临时 owner 继续走上传链路；
  - 文件二进制仍走 COS，不进入 DB；
  - `createAssetObject` 本地 demo 只登记 COS `bucket/key/type/sortOrder` 等元数据；
  - `listAssetObjectsByOwner` 本地 demo 可按 owner 查询这些元数据，供后续组装 `video_edit_jobs.input_payload.input_assets`。

已验证：

- `POST /api/media/upload-intents` 返回 `201`。
- `POST /api/media/complete` 返回 `201`，只登记 COS 对象元数据；asset owner 为 `content_draft`，asset type 为 `video`。
- 当前浏览器页面已刷新并重新创建测试脚本，三个镜头均回到“传镜头”状态。
- `node --test src/server/api/video-chain-test-draft.test.ts src/server/api/video-job-payload.test.ts src/server/api/video-script-production-agent.test.ts`
- `corepack pnpm lint`
- `corepack pnpm typecheck`

剩余边界：

- 当前修复打通的是本地测试页素材上传入口；因为本地 app 仍没有 `NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY`，不等于真实 staging app 数据闭环。
- 服务器侧 worker 仍需单独处理 compose 状态：此前只读检查为 `firered-openstoryline unhealthy`，`openstoryline-engine` 和 `video-worker` 为 `Created`。

## 2026-04-28 21:20 补充：本地 demo 任务 payload 资产链路修正

继续验证时发现：

- 创建测试脚本后直接创建 video job，最初返回 `CONTENT_VARIANT_NOT_FOUND`。
- 修复本地 demo 草稿 store 后，video job 可创建，但真实 COS 上传后创建的 job 仍然是 `script_only_fallback`，`input_assets` 数量为 0。

根因：

- 本地 demo 下 `content-draft-repository` 的测试草稿 store 是模块局部变量，不同 route 之间可能不共享。
- 本地 demo 下 `video-edit-jobs-service.buildServerManagedInputPayload` 原本硬编码 `assets: []`，没有读取 `content_draft` 下登记的 COS 元数据。

本轮补充：

- `content-draft-repository` 的本地 demo 草稿/variant store 改为挂到 `globalThis`。
- `media-repository` 的本地 demo asset metadata store 改为挂到 `globalThis`。
- `video-edit-jobs-service` 在本地 demo 下也调用 `listAssetObjectsByOwner({ ownerType: "content_draft", ownerId: draftId })`，组装 `input_assets`。

已验证：

- 创建测试脚本后直接创建 video job 返回 `201`。
- 生成 1x1 PNG 测试图并真实上传 COS，`/api/media/complete` 返回 `201`。
- 基于该草稿创建 video job 后：
  - `render_mode = asset_driven`
  - `input_assets.length = 1`
  - `input_assets[0].storage_provider = tencent_cos`
  - `bucket_name` 和 `storage_key` 均存在
- `/api/video-edit-jobs/:id` 详情轮询可读到 job，并自动推进到 `succeeded`。
- 基于已完成 source job 创建制作修订任务返回 `201`：
  - `triggerSource = regenerate`
  - `inputPayload.revisionContext.sourceJobId` 正确
  - `revisionType = production`
- 当前浏览器页面已刷新并重新创建测试脚本，三个镜头均为“传镜头”状态。
- `node --test src/server/api/video-chain-test-draft.test.ts src/server/api/video-job-payload.test.ts src/server/api/video-script-production-agent.test.ts`
- `corepack pnpm lint`
- `corepack pnpm typecheck`
- `corepack pnpm build`

## 2026-04-28 21:55 补充：Gitee 目标分支整合验证

用户要求将当前项目验证并推送到 Gitee：

- 仓库：`https://gitee.com/jingjing_2025/jingjing-content-platform.git`
- 目标分支：`孟_4.28_video-work`

整合判断：

- 远端目标分支与本地视频工作历史没有共同祖先，不能普通 merge，也不应强推覆盖。
- 本轮以 `origin/孟_4.28_video-work` 为基线，新建 `codex/integrate-video-work-20260428`，再把本地视频工作提交链 cherry-pick 上去。
- 仅 `app/src/components/platform-admin/platform-settings-editor.tsx` 有冲突；处理为保留远端 V2.2 后台设置页和管理员账号管理，同时补入脚本制作 agent 配置面板。

整合后验证：

- `node --test src/server/api/video-chain-test-draft.test.ts src/server/api/video-job-payload.test.ts src/server/api/video-script-production-agent.test.ts src/server/api/video-growth-context.test.ts`：22 passed
- `python -m pytest tests -q`：46 passed
- `docker compose -f docker-compose.yml -f docker-compose.firered.yml --profile firered config --quiet`：通过
- `corepack pnpm lint`：通过
- `corepack pnpm typecheck`：通过
- `corepack pnpm build`：通过

交接记录：

- `docs/handoff/2026-04-28-video-work-gitee-push-handoff.md`
