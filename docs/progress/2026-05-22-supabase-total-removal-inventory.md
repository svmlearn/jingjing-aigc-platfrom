# 2026-05-22 Supabase 彻底移除清单

## 状态

- 当前分支：`main`
- 本轮只做全局检索和移除清单整理，未修改运行时代码。
- 背景：P0/P1/P2 已把当前主线切到 PostgreSQL、app-owned session、Aliyun OSS，并清理用户可见旧错误；本清单面向下一轮“彻底删除 Supabase 兼容层”。

## 扫描范围

重点扫描：

- `app/src`
- `app/db`
- `app/scripts`
- `app/.env.example`
- `app/package.json`
- `workers/video-worker`
- `app/supabase`
- `docs`

排除：

- `node_modules`
- `.next`
- Python `__pycache__`

主要命令：

```bash
rg -n --hidden -S "supabase|Supabase|SUPABASE|@supabase|supabase_storage|supabase-not-configured" app/src app/.env.example app/package.json workers/video-worker --glob '!**/node_modules/**' --glob '!**/.next/**' --glob '!**/__pycache__/**'

rg -l -S "createSupabaseAdminClient|createSupabaseServerClient|createServerClient|isSupabaseAdminConfigured|isSupabasePublicConfigured|@supabase" app/src --glob '!**/node_modules/**' --glob '!**/.next/**'

rg -n -S "createSupabaseAdminClient|isSupabaseAdminConfigured|cloudSupabaseRequiredError|requireSupabaseAdmin|supabase\\.from|supabase\\.rpc" app/src/lib/db app/src/server --glob '!**/*.test.ts' --glob '!**/*.test.mjs'

rg -n -S "supabase_storage|SUPABASE_DB_URL|SUPABASE_SERVICE_ROLE_KEY|NEXT_PUBLIC_SUPABASE|@supabase|supabase/migrations|auth\\.users" app/src app/db app/scripts workers/video-worker app/.env.example app/package.json --glob '!**/node_modules/**' --glob '!**/.next/**'
```

粗略文件命中：

- 运行时代码 / env / worker：47 个文件。
- DB / scripts / `app/supabase`：8 个文件。
- docs 历史资料：276 个文件。

## 总体结论

Supabase 还不是“零星几处”，而是仍存在五类残留：

1. `@supabase/*` 包和 `app/src/lib/supabase/*` client shim 仍在。
2. 商家、成员、平台管理员 auth 仍保留 legacy Supabase 登录 / 注册 fallback。
3. 多个 repository 仍保留 Supabase admin fallback，尤其 Agent Console、平台管理、内容/素材/知识库相关仓储。
4. `supabase_storage` 仍作为历史 storage provider 枚举存在于 contract、schema、DB constraint、部分服务输出。
5. worker / env / docker compose 仍接受 `SUPABASE_DB_URL` 作为旧数据库 URL fallback。

如果目标是“彻底不需要旧数据、旧部署、回滚链路”，这些都可以进入后续 removal 批次；但不建议一次性无差别删除，应先完成替代路径确认和 DB migration。

## 命名不一致专项结论

本轮额外看了“外面叫 Supabase / COS，里面其实已经是 PostgreSQL / OSS”的情况。结论是：确实存在，而且它们不能按同一种方式处理。

### 1. 旧名字，但主线语义已经换成当前口径

这些更偏“改名债”，不是当前主线的阻断级行为问题：

- `app/src/lib/db/cloud-supabase-required.ts`
  - 文件名和 `cloudSupabaseRequiredError()` 仍叫 Supabase。
  - 但 PostgreSQL preferred 下已经返回 `APP_DATABASE_NOT_CONFIGURED` / `APP_DATABASE_REPOSITORY_UNAVAILABLE`。
  - 真正删除 Supabase 时，应改名为 `database-required.ts`、`repository-required.ts` 或类似当前口径 helper。
- `app/src/app/api/media/cos-preview/route.ts`
  - 路由名仍叫 `cos-preview`。
  - 内部已经通过 `getObjectStorageProvider()` 处理对象存储，并支持 `oss://` 与 `cos://`。
  - 新路由 `app/src/app/api/media/object-preview/route.ts` 只是 re-export 旧实现。
  - 下一步应把实现移动到 `object-preview`，旧 `cos-preview` 只作为短期 alias，最终删除。
- `workers/video-worker/worker/app/cos_client.py`
  - 文件名仍叫 `cos_client.py`，但核心类已经叫 `ObjectStorageClient`。
  - 上传默认跟随 `settings.storage_provider`，当前默认是 `aliyun_oss`。
  - 但文件里仍有真实 Tencent COS client 分支，因此它不是纯改名债。
- `workers/video-worker/worker/app/config.py`
  - `storage_provider` 默认已经是 `aliyun_oss`。
  - 但仍保留 `cos_*` 字段、`cos_result_prefix` 兼容属性、`SUPABASE_DB_URL` fallback。
  - 这是“当前默认已变，但兼容字段仍活着”的混合状态。
- `app/src/lib/auth/domestic-session.ts`
  - 已是 app-owned session / PostgreSQL user session。
  - 但返回类型仍借用 `@supabase/supabase-js` 的 `User`，函数名也叫 `toSupabaseCompatibleUser()`。
  - 这不是 Supabase 网络调用，但会让 `@supabase/supabase-js` 包无法删除。
- `app/src/server/storage/aliyun-oss-provider.ts`
  - 是真实 Aliyun OSS provider。
  - 但返回 DTO 里仍带 deprecated `cosKey` 兼容字段。

### 2. 旧名字，而且里面仍是真实旧依赖

这些不是只改名就能解决，删除前必须确认替代路径：

- `app/src/lib/supabase/*`
  - 真实 Supabase client shims。
  - 依赖 `@supabase/ssr` / `@supabase/supabase-js` 和 Supabase env。
- `app/src/proxy.ts`
  - 真实 Supabase session refresh。
- auth routes / session fallback
  - 商家、成员、平台管理员 auth 仍有 legacy Supabase fallback。
- repository fallback
  - 多个 repository 仍 import `createSupabaseAdminClient()` 或 `isSupabaseAdminConfigured()`。
  - 这些是实际数据访问 fallback，不是单纯文案。
- `app/src/server/storage/tencent-cos-provider.ts`
  - 真实 Tencent COS provider。
  - 依赖 `cos-nodejs-sdk-v5`、`qcloud-cos-sts` 和 `COS_*` env。
- `app/src/server/api/cos.ts`
  - 真实 Tencent COS helper facade。
  - 只允许 `tencent_cos`，并明确用于 legacy/reference operations。
- `app/scripts/check-domestic-cos-roundtrip.mjs`
  - 名称和目标都仍是 COS roundtrip。
- `workers/video-worker/worker/app/cos_client.py`
  - 虽然类名泛化，但 `_get_tencent_client()` 仍是真实 Tencent COS client。
- `app/supabase/migrations/*`
  - 旧 Supabase 迁移目录仍存在。

### 3. 旧字段 / provider 名仍在数据契约里活着

这类最容易误判。它不一定代表当前默认链路还走旧服务，但代表接口、DB 或历史数据仍接受旧值：

- `supabase_storage`
  - 仍存在于 media / knowledge contract、API schema、DB constraint、部分 seed/smoke。
  - 要彻底移除需要 DB 数据检查和 migration。
- `tencent_cos`
  - 仍是合法 storage provider。
  - 如果产品上确定只保留 Aliyun OSS，后续也需要做 provider 枚举收窄。
- `cosKey`
  - 仍作为 deprecated 字段出现在上传意图 / OSS provider 返回值中。
  - 删除前要查前端、Dify payload、worker 是否还有读取。
- worker 里的 `cos_client` / `_cos_client` / `FakeCosClient`
  - 多数是变量名和测试名旧，实际已能处理 `aliyun_oss`。
  - 但由于真实 Tencent COS 分支还在，不能只做字符串替换。

### 4. 针对“旧壳子”的后续处理建议

建议把“删除旧依赖”和“改名去误导”拆成两个批次：

1. 先删除真实旧依赖：
   - Supabase auth fallback。
   - Supabase repository fallback。
   - `SUPABASE_DB_URL` fallback。
   - `supabase_storage` 数据枚举。
   - Tencent COS provider，如果确认不再支持。
2. 再做命名清理：
   - `cloud-supabase-required.ts` -> 当前数据库 / repository helper。
   - `cos-preview` implementation -> `object-preview`。
   - `cos_client.py` -> `object_storage_client.py`。
   - `_cos_client` / `FakeCosClient` -> `_storage_client` / `FakeObjectStorageClient`。
   - `toSupabaseCompatibleUser()` -> `toAuthenticatedUser()` 或 `toAppSessionUser()`。
   - `cosKey` -> `storageKey` only。

## A. 直接 Supabase client / package 依赖

这些是彻底移除时最核心的依赖入口：

- `app/package.json`
  - `@supabase/ssr`
  - `@supabase/supabase-js`
- `app/src/lib/supabase/admin.ts`
  - `createSupabaseAdminClient()`
  - `isSupabaseAdminConfigured()`
  - 读取 `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`
- `app/src/lib/supabase/server.ts`
  - `createSupabaseServerClient()`
  - `isSupabasePublicConfigured()`
  - 读取 `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `app/src/lib/supabase/browser.ts`
  - browser client shim。
- `app/src/proxy.ts`
  - 通过 `@supabase/ssr` 刷新 Supabase session。

移除影响：

- 删除这些之前，所有 `createSupabase*` 和 `isSupabase*Configured()` 调用必须先清掉。
- `domestic-session.ts`、`current-user.ts`、`local-demo-runtime.ts` 当前仍用 `@supabase/supabase-js` 的 `User` 类型，需要改成项目自己的 `AppUser` / `AuthenticatedUser` 类型。

建议 removal 批次：

1. 先新增项目自有 `AuthenticatedUser` 类型，替换 `@supabase/supabase-js` 的 `User` 类型。
2. 删除 auth fallback 和 repository fallback 后，再删 `app/src/lib/supabase/*`。
3. 最后从 `package.json` / lockfile 删除 `@supabase/ssr`、`@supabase/supabase-js`。

## B. Auth / session 层 Supabase fallback

仍有 Supabase auth fallback 的运行时代码：

- `app/src/lib/auth/current-user.ts`
  - PostgreSQL preferred 下已拦截，但非 preferred 仍会进入 Supabase fallback。
- `app/src/app/dashboard/layout.tsx`
  - 非 domestic 且 Supabase configured 时仍走 Supabase session。
- `app/src/app/(auth)/login/actions.ts`
  - legacy merchant login fallback。
- `app/src/app/(auth)/logout/route.ts`
  - 退出时仍尝试 Supabase sign out。
- `app/src/app/api/auth/merchant-login/route.ts`
  - legacy merchant login fallback，直接用 `@supabase/ssr`。
- `app/src/app/api/auth/register-with-invite/route.ts`
  - P0 已 PostgreSQL-first，但 legacy owner 注册 fallback 仍在。
- `app/src/app/api/auth/member-login/route.ts`
  - 成员登录 domestic first，但 legacy Supabase fallback 仍在。
- `app/src/app/api/auth/member-register-with-invite/route.ts`
  - 成员邀请码注册 domestic first，但 legacy Supabase fallback 仍在。
- `app/src/lib/auth/platform-admin-session.ts`
  - 平台管理员登录、初始化、session、sign out 仍保留 Supabase fallback。
- `app/src/lib/auth/domestic-session.ts`
  - 只剩 `User` 类型兼容和 `toSupabaseCompatibleUser()` 命名。
- `app/src/lib/demo/local-demo-runtime.ts`
  - demo runtime 仍检查 Supabase env。

删除前需要确认：

- 商家 owner 登录、成员登录、平台管理员登录都已经只走 app-owned session。
- dashboard / onboarding / member / platform-admin 页面不再需要 Supabase cookie。
- `proxy.ts` 不再承担任何有效 session 刷新职责。

建议删除顺序：

1. 移除 merchant/member/platform auth routes 的 legacy fallback。
2. 改 dashboard/logout/current-user 只识别 domestic/app-owned session。
3. 删除 `proxy.ts` 的 Supabase session 刷新逻辑，必要时改为空 proxy 或移除文件。
4. 改 `domestic-session.ts` 的 `toSupabaseCompatibleUser()` 为项目自有 user mapper。

## C. Repository 层 Supabase admin fallback

仍直接使用 Supabase admin client 或 Supabase fallback 的 repository / service：

- `app/src/lib/db/cloud-supabase-required.ts`
- `app/src/lib/db/merchant-repository.ts`
- `app/src/lib/db/merchant-media-repository.ts`
- `app/src/lib/db/daily-content-task-repository.ts`
- `app/src/lib/db/content-draft-repository.ts`
- `app/src/lib/db/video-edit-job-repository.ts`
- `app/src/lib/db/media-repository.ts`
- `app/src/lib/db/knowledge-repository.ts`
- `app/src/lib/db/platform-admin-repository.ts`
- `app/src/lib/db/agent-console-repository.ts`
- `app/src/lib/db/material-library-repository.ts`
- `app/src/lib/db/consultation-repository.ts`
- `app/src/lib/db/content-generation-repository.ts`
- `app/src/lib/db/voice-profile-repository.ts`
- `app/src/lib/db/merchant-strategy-asset-repository.ts`
- `app/src/lib/db/import-repository.ts`
- `app/src/lib/db/local-real-chain-repository.ts`
- `app/src/server/api/video-edit-jobs-service.ts`

需要特别注意：

- 有些 repository 已经有 PostgreSQL path，Supabase 只是 fallback。
- 有些 repository 可能仍主要依赖 Supabase path，删除前要确认 PostgreSQL coverage 是否完整。
- `agent-console-repository.ts` 内部 Supabase 使用最多，彻底移除风险最大，建议单独成批处理。

建议拆分：

1. 内容/视频工作台 repository：
   - `content-draft-repository.ts`
   - `video-edit-job-repository.ts`
   - `daily-content-task-repository.ts`
   - `media-repository.ts`
2. 商家/素材/策略 repository：
   - `merchant-repository.ts`
   - `merchant-media-repository.ts`
   - `material-library-repository.ts`
   - `merchant-strategy-asset-repository.ts`
3. 平台管理 / Agent Console：
   - `platform-admin-repository.ts`
   - `agent-console-repository.ts`
   - `knowledge-repository.ts`
4. 导入 / 咨询 / 内容生成：
   - `import-repository.ts`
   - `consultation-repository.ts`
   - `content-generation-repository.ts`
   - `voice-profile-repository.ts`

验收标准：

- 删除 `createSupabaseAdminClient` / `isSupabaseAdminConfigured` imports。
- 删除 `cloudSupabaseRequiredError()` 或改名为当前数据库错误 helper。
- 每个 repository 在 PostgreSQL-only 环境下有测试或 smoke 覆盖。

## D. `supabase_storage` provider / 数据字段残留

仍保留 `supabase_storage` 的位置：

- `app/src/contracts/media.ts`
  - `MediaStorageProvider = "aliyun_oss" | "tencent_cos" | "supabase_storage"`。
- `app/src/contracts/knowledge.ts`
  - knowledge document storage provider 类型仍允许 `supabase_storage`。
- `app/src/server/api/schemas.ts`
  - schema 仍允许 `storageProvider: "supabase_storage"`。
- `app/src/server/api/knowledge-service.ts`
  - inline / knowledge 相关输出仍可能写 `supabase_storage`。
- `app/src/server/api/video-job-public-dto.ts`
  - 某些 public DTO fallback 返回 `supabase_storage`。
- `app/db/migrations/202605130001_domestic_core_baseline.sql`
- `app/db/migrations/202605160001_selfhost_p0_foundation.sql`
- `app/db/migrations/202605170002_selfhost_storage_provider_aliyun_oss.sql`
- `app/db/migrations/202605190001_selfhost_inline_seed_knowledge_provider.sql`
- `app/db/migrations/202605190002_selfhost_voice_profiles.sql`
- `app/scripts/check-domestic-knowledge-repository-smoke.mjs`
  - seed/smoke 里仍插入 `supabase_storage`。

删除风险：

- 这不是纯代码删除，还涉及 DB constraint 和历史数据值迁移。
- 如果库里已经存在 `supabase_storage` 行，直接改 schema 会失败或导致读取不兼容。

建议处理：

1. 先查真实 PostgreSQL 数据：
   - `select storage_provider, count(*) from ... group by storage_provider`
2. 如果确认不需要历史数据，写 migration：
   - 清理或转换 `supabase_storage` 行。
   - 更新 check constraint，仅保留当前允许值。
3. 再删 contract/schema 里的 `supabase_storage`。
4. 更新测试 fixture 和 smoke seed。

## E. Worker / env 中的 `SUPABASE_DB_URL`

仍有 worker 兼容变量：

- `workers/video-worker/.env.example`
  - `SUPABASE_DB_URL` 兼容 fallback。
- `workers/video-worker/firered.env.example`
  - `SUPABASE_DB_URL=` 空值保留。
- `workers/video-worker/docker-compose.yml`
  - 仍把 `SUPABASE_DB_URL` 注入 worker。
- `workers/video-worker/worker/app/config.py`
  - `WORKER_DATABASE_URL` 优先，`SUPABASE_DB_URL` fallback。
- `workers/video-worker/worker/app/real_io_smoke.py`
  - smoke 仍接受 `SUPABASE_DB_URL` fallback。
- `workers/video-worker/tests/test_real_io_smoke.py`
  - 测试覆盖 `SUPABASE_DB_URL` fallback。

删除建议：

- 移除 `SUPABASE_DB_URL` fallback，只接受 `WORKER_DATABASE_URL`。
- 更新 `.env.example`、`firered.env.example`、`docker-compose.yml`。
- 删除或改写 `test_config_accepts_supabase_db_url_as_compatibility_fallback`。
- 更新 worker README 中 legacy 说明。

## F. `app/supabase` 历史目录和迁移引用

仍存在：

- `app/supabase/migrations/*`
- `app/supabase/.temp/pooler-url`
- 若干测试直接读取 `supabase/migrations/...`：
  - `app/src/lib/merchant-media-migration-contract.test.ts`
  - `app/src/lib/content-draft-repository-contract.test.ts`
  - `app/src/server/api/consultation-service.test.ts`

风险：

- `app/supabase/.temp/pooler-url` 是旧 Supabase 连接痕迹，若不再需要，应优先删除。
- `app/supabase/migrations` 作为历史迁移源存在，会持续让搜索结果里出现 Supabase。
- 若测试仍读取该目录，删除前必须把测试改到 `app/db/migrations` 或新的 schema contract fixture。

建议：

1. 先删除或确认 `.temp/` 不进入仓库与交接资料。
2. 把仍读取 `app/supabase/migrations` 的测试迁到 `app/db/migrations`。
3. 若历史迁移不再需要，归档到 docs 或删除 `app/supabase/`。

## G. 测试 / fixture / docs 噪音

测试中仍有 Supabase 相关命中：

- `app/src/lib/auth/postgres-auth-p0-contract.test.mjs`
  - 用来确认当前主线不落入 Supabase fallback。
- `app/src/lib/private-media-doctor.test.ts`
- `app/src/lib/private-media-workflow-fixture.test.ts`
- `app/src/lib/media-upload-contract.test.ts`
- `app/src/server/api/video-job-payload.test.ts`
- `workers/video-worker/tests/test_real_io_smoke.py`

docs 命中：

- `docs/` 下约 276 个文件仍提到 Supabase，多数是历史 handoff/progress/探索。

建议：

- removal 批次中，测试要按新规则改写，不要简单删除断言。
- docs 不建议全局硬删；可以保留历史事实，但当前入口文档必须继续指向 PostgreSQL / Aliyun OSS 当前口径。

## 建议 removal 执行顺序

### Phase 1：先拔掉 env 和 session fallback

- 删除 `NEXT_PUBLIC_SUPABASE_*`、`SUPABASE_SERVICE_ROLE_KEY` 在 `.env.example` 的 legacy 示例。
- 删除 `proxy.ts` Supabase session refresh。
- merchant/member/platform auth 只保留 app-owned session。
- 引入项目自有 `AuthenticatedUser` 类型，替换 `@supabase/supabase-js` 的 `User` 类型。

### Phase 2：repository Supabase fallback removal

- 先做已有 PostgreSQL 覆盖的 repository。
- Agent Console / Knowledge / Platform Admin 单独处理。
- 每个批次都跑当前 smoke 或源码契约测试，避免删除 fallback 后暴露未迁路径。

### Phase 3：storage provider 枚举清理

- 先查真实 DB 中 `supabase_storage` 数据。
- 再做 DB migration 和 contract/schema 清理。
- 删除 `supabase_storage` 相关 tests/fixtures。

### Phase 4：worker `SUPABASE_DB_URL` 清理

- 只保留 `WORKER_DATABASE_URL`。
- 更新 worker env、compose、real_io_smoke、tests。

### Phase 5：删除 packages 和 `app/src/lib/supabase`

- 所有 imports 清零后，删除 `app/src/lib/supabase/*`。
- 删除 `@supabase/ssr`、`@supabase/supabase-js` 依赖并更新 lockfile。

### Phase 6：历史目录归档 / 删除

- 删除或归档 `app/supabase/`。
- 更新仍引用 `supabase/migrations` 的 contract tests。
- 保留 docs 历史资料，但在 docs 入口继续明确“Supabase 是历史口径”。

## 可交给下一位 AI 的目标边界

不要让下一轮直接“全仓删 Supabase”。更稳的第一批 removal 目标：

1. 改 `AuthenticatedUser` 类型，去掉 auth/session 对 `@supabase/supabase-js` 类型的依赖。
2. 删除商家/成员/平台 auth route 的 legacy Supabase fallback。
3. 删除 `proxy.ts` Supabase refresh。
4. 保持 repository fallback 暂不动，另开批次处理。
5. 跑登录、注册、platform admin、member auth 的最小验证。

这样可以先把用户身份层完全变成 PostgreSQL / app-owned，再进入 repository 和 storage provider 层。
