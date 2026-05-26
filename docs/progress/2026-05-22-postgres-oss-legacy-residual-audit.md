# 2026-05-22 PostgreSQL / Aliyun OSS 迁移残留全局扫描

## 状态

- 本轮只做全局检索和问题归类，未改运行时代码。
- 当前代码主线口径：自建 / 国内 PostgreSQL、国内服务器自托管、Aliyun OSS 新写入。
- 本文记录仍可能影响用户体验或误导后续部署的 Supabase / COS / Vercel 旧口径残留。

## 扫描范围

重点扫描：

- `app/src`
- `workers/video-worker`
- `app/.env.example`

排除默认噪音：

- `node_modules`
- `.next`
- lockfile
- `app/supabase/migrations` 历史迁移目录

本轮主要命令：

```bash
rg -n --hidden -S "supabase-not-configured|SUPABASE_NOT_CONFIGURED|Cloud Supabase|Supabase admin client is not configured|Missing public Supabase|Missing Supabase service|Supabase service role is required|Supabase Auth" app/src --glob '!**/*.test.ts' --glob '!**/node_modules/**' --glob '!**/.next/**'

rg -n --hidden -S "createSupabaseAdminClient|createSupabaseServerClient|createServerClient|isSupabasePublicConfigured|isSupabaseAdminConfigured|@supabase" app/src/app app/src/lib/auth app/src/lib/db app/src/server --glob '!**/*.test.ts' --glob '!**/node_modules/**' --glob '!**/.next/**'

rg -n --hidden -S "COS_NOT_CONFIGURED|Tencent COS|COS environment|COS_TEMP|COS_ENV|直传 COS|COS:|cos-preview|COS object|COS key|cosKey|COS_BUCKET|COS_REGION|tencent_cos|WORKER_COS|SUPABASE_DB_URL|Vercel|Supabase" app/src workers/video-worker app/.env.example --glob '!**/*.test.ts' --glob '!**/node_modules/**' --glob '!**/.next/**'
```

## 总体结论

当前残留不是单一文案问题，而是三类问题叠在一起：

1. 商家 owner 邀请码注册仍是 Supabase-only 路径，会直接触发当前用户看到 Supabase 不可用。
2. 登录、当前用户、平台管理、多个 repository 仍保留 Supabase fallback；当 PostgreSQL 环境变量缺失、模式判断不一致或某些路径还没迁完时，旧错误码和旧文案会冒出来。
3. 新上传合同已经要求 Aliyun OSS，但 worker 文档、部分 env 示例、UI 文案和一些 API 命名仍以 COS 为主语，容易误导部署和排障。

## P0：直接影响用户当前操作

### 1. 商家端邀请码注册仍是 Supabase-only

证据：

- `app/src/app/api/auth/register-with-invite/route.ts`
  - 第 1-2 行直接导入 Supabase admin/server client。
  - 第 15 行一进 `POST` 就调用 `createSupabaseAdminClient()`。
  - 第 17-21 行使用 Supabase Auth 创建用户。
  - 第 40-44 行使用 Supabase Server Client 登录。
- `app/src/components/dashboard/registration-flow.tsx`
  - 第 80 行提交到 `/api/auth/register-with-invite`。
  - 第 93-95 行会把后端错误展示给用户。

风险：

- 当前国内 PostgreSQL 环境下，商家 owner 使用邀请码注册时，仍可能报 Supabase service role / Supabase 环境不可用。
- 这是用户已反馈的“注册邀请码却报 Supabase 数据库不可用”的最可疑根因。

建议：

- 给 `/api/auth/register-with-invite` 增加 PostgreSQL-first 分支。
- PostgreSQL 模式下应写入 `app_users`、兑换平台邀请码、创建 merchant profile、写 domestic session cookie。
- Supabase 分支如保留，应只作为明确 legacy fallback，且用户可见错误不得再出现 Supabase。

### 2. 商家登录 server action 顺序仍会先判断 Supabase

证据：

- `app/src/app/(auth)/login/actions.ts`
  - 第 29-31 行先判断 `!isSupabasePublicConfigured()` 并跳转 `supabase-not-configured`。
  - 第 37 行之后才判断 `isDomesticSessionEnabled()`。
- `app/src/app/api/auth/merchant-login/route.ts`
  - 第 51-59 行先走 domestic session，顺序是正确的。

风险：

- 如果页面或表单仍走 server action，而不是 API route，则 PostgreSQL 环境也可能先跳出 `supabase-not-configured`。

建议：

- 调整 `signInToMerchant` 顺序：先 domestic session，再 legacy Supabase。
- 或确认该 server action 已不再被任何入口使用，删除或归档。

### 3. 当前用户兜底错误仍是 Supabase 文案

证据：

- `app/src/lib/auth/current-user.ts`
  - 第 18-23 行在非 domestic session 且 Supabase 未配置时抛 `SUPABASE_NOT_CONFIGURED` 和 `Cloud Supabase environment variables are required.`

风险：

- 多个 API 和页面通过 `getAuthenticatedUser()` 间接暴露这个错误。
- 当 PostgreSQL 环境变量缺失、domestic mode 未开启或本地/服务器配置不完整时，用户仍看到旧架构文案。

建议：

- 改成 PostgreSQL 当前口径错误，例如 `APP_DATABASE_NOT_CONFIGURED`。
- 如果是未登录，应继续返回 `UNAUTHENTICATED`，不要把配置问题混成登录问题。

### 4. 商家 onboarding 页面仍强依赖 Supabase

证据：

- `app/src/app/(auth)/merchant/onboarding/page.tsx`
  - 第 30-31 行 Supabase 未配置时跳 `supabase-not-configured`。
  - 第 34-35 行通过 Supabase 获取当前用户。

风险：

- 商家 owner 注册成功后，前端会跳转 `/merchant/onboarding`。
- 即使注册改成 PostgreSQL，如果 onboarding 未迁，用户仍可能在下一步被 Supabase 卡住。

建议：

- 改为 `getAuthenticatedUser()` / domestic session 优先。
- 仅在明确 legacy Supabase 模式下读取 Supabase session。

## P1：用户可能间接撞到的旧 fallback / 文案

### 5. 统一 Supabase-required 错误仍存在

证据：

- `app/src/lib/db/cloud-supabase-required.ts`
  - 第 6-7 行统一抛 `SUPABASE_NOT_CONFIGURED` 和 `Cloud Supabase environment variables are required.`

典型引用模块：

- `app/src/lib/db/merchant-media-repository.ts`
- `app/src/lib/db/daily-content-task-repository.ts`
- `app/src/lib/db/content-draft-repository.ts`
- `app/src/lib/db/video-edit-job-repository.ts`
- `app/src/lib/db/media-repository.ts`
- `app/src/lib/db/merchant-repository.ts`

风险：

- 这些模块多数已有 PostgreSQL 分支，但配置不完整或开关判断未命中时，会回到 Supabase 文案。

建议：

- 按模块梳理：已完成 PostgreSQL 实现的模块，应在当前模式下抛 `APP_DATABASE_NOT_CONFIGURED` 或 `APP_DATABASE_QUERY_FAILED`。
- 真正保留 legacy Supabase 的模块，把函数名和错误码改成 `legacySupabaseRequiredError`，避免误导。

### 6. `merchant-repository` 内部仍有本地 Supabase-required 函数

证据：

- `app/src/lib/db/merchant-repository.ts`
  - 第 985-990 行定义本地 `cloudSupabaseRequiredError()`，仍抛 `SUPABASE_NOT_CONFIGURED`。

风险：

- 商家资料、邀请码、团队成员等路径如果 PostgreSQL 判断未命中，会直接带出旧文案。

建议：

- 将该函数替换为当前数据库口径错误。
- 对商家 owner 注册、团队邀请码、成员工作区这几条链路优先加回归测试。

### 7. 平台管理端仍保留 Supabase Auth UI 文案

证据：

- `app/src/components/platform-admin/platform-settings-editor.tsx`
  - 第 52 行：`Supabase Auth 用户创建失败，请检查邮箱或密码。`
  - 第 677 行：说明“密码由 Supabase Auth 管理”。
- `app/src/lib/db/platform-admin-repository.ts`
  - 第 325-330 行：创建后台管理员时仍可能抛 `Supabase service role is required to manage platform admins.`
  - 第 508-512 行：其他管理能力同样可能抛该文案。

风险：

- 平台管理端创建管理员、配置用户时仍显示旧认证系统，和当前 PostgreSQL 口径冲突。

建议：

- UI 文案改成“平台账号系统 / PostgreSQL app-owned auth”。
- Supabase Auth 只作为 legacy fallback 出现在代码注释或内部兼容层，不进入页面文案。

### 8. Agent Console repository 仍有 Supabase admin required

证据：

- `app/src/lib/db/agent-console-repository.ts`
  - 第 4493-4496 行 `requireSupabaseAdmin()` 抛 `Supabase admin client is not configured.`
  - 文件内仍有大量 `createSupabaseAdminClient()` legacy 分支。
  - 第 5108-5113 行已有 `shouldUseAppPostgres()` / `shouldUseDemoFallback()` 判断。

风险：

- Agent 控制台部分写操作若 PostgreSQL 分支遗漏或判断未命中，会暴露 Supabase admin 错误。

建议：

- 对 Agent 控制台 P0 操作逐项确认 PostgreSQL 分支覆盖。
- 对无法迁移的 legacy 分支改内部错误码，不再提 Supabase admin。

### 9. 平台管理员 session 仍保留 Supabase 认证分支

证据：

- `app/src/lib/auth/platform-admin-session.ts`
  - 第 114-117 行 `isPlatformAdminAccessConfigured()` 允许 app-owned auth 或 Supabase。
  - 第 179-211 行 Supabase 密码登录分支仍存在。
  - 第 223-260 行创建初始平台管理员时仍有 Supabase Auth 分支。

风险：

- 这是兼容性残留，不一定直接错误；但如果环境变量或开关不一致，会造成“到底谁管后台账号”的混乱。

建议：

- 明确当前生产只走 app-owned platform admin auth。
- 如保留 Supabase，标记为 legacy mode，并避免 UI 文案默认提 Supabase。

## P1：COS / OSS 运行口径残留

### 10. App 新上传合同已是 Aliyun OSS，但部分 UI 仍写“直传 COS”

证据：

- `app/src/lib/media-upload-contract.ts`
  - 第 25-27 行明确要求 `storageProvider === "aliyun_oss"`，否则报 `New media uploads must use Aliyun OSS.`
- `app/src/components/dashboard/draft-video-panels.tsx`
  - 第 546-547 行仍写“直传 COS”。

风险：

- 用户和协作者会误以为新上传仍走 Tencent COS。

建议：

- UI 文案统一为“对象存储 / OSS”。
- 只有历史兼容、旧资产或显式 legacy 操作才写 Tencent COS。

### 11. Health check 失败默认 provider 仍是 `tencent_cos`

证据：

- `app/src/app/api/health/route.ts`
  - 第 63 行 storage check 失败时 provider 使用 `process.env.STORAGE_PROVIDER?.trim() || "tencent_cos"`。

风险：

- 如果 OSS 环境配置缺失，健康检查可能显示 provider 为 `tencent_cos`，误导排障。

建议：

- 默认值改为当前默认 `aliyun_oss`。
- 或从 `defaultStorageProviderName` 读取，避免再次分叉。

### 12. 仍有 `/api/media/cos-preview` 命名

证据：

- `app/src/app/api/media/cos-preview/route.ts`
  - 第 34-39 行同时解析 `oss://` 和 `cos://`。
- `app/src/server/api/dify-final-json-mapper.ts`
  - 第 176-188 行 `buildDifyImageRenderUrl()` 仍返回 `/api/media/cos-preview?...`。

风险：

- 功能上已支持 OSS，但 API 名称仍是 COS，后续 Dify / 前端 / 文档会继续传播旧概念。

建议：

- 新增 `/api/media/object-preview` 或 `/api/media/storage-preview`。
- 保留 `/api/media/cos-preview` 作为兼容 redirect/alias，逐步替换调用点。

### 13. `cosKey` 字段名仍作为通用存储 key 兼容字段

证据：

- `app/src/server/storage/aliyun-oss-provider.ts`
  - 第 125-145 行 Aliyun OSS 上传意图里仍返回 `cosKey: input.storageKey`。
- `app/src/contracts/media.ts`
  - 仍有 `cosKey?: string`。
- `app/src/lib/ui/video-workflow.ts`
  - 读取 `cosKey`、`storageKey`、`uploadKey` 多种字段。

风险：

- 这是兼容字段，不一定立即有 bug，但命名会持续把 OSS 当 COS 理解。

建议：

- 对外 DTO 优先使用 `storageKey` / `uploadKey`。
- `cosKey` 标记 deprecated，仅作为旧前端兼容字段。

## P2：部署文档 / env 示例旧口径

### 14. App `.env.example` 顶部仍把 Supabase 放在第一位

证据：

- `app/.env.example`
  - 第 1-6 行仍是 `NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_ANON_KEY`、`SUPABASE_SERVICE_ROLE_KEY`。
  - 第 41 行已设置 `STORAGE_PROVIDER=aliyun_oss`。
  - 第 42-46 行仍保留 COS 变量。

风险：

- 新接手的人容易先配 Supabase，而不是先配 `APP_DATABASE_URL` / `DATABASE_URL`。

建议：

- 将 PostgreSQL / app-owned auth 放到文件顶部。
- Supabase 放到“Legacy Supabase fallback”小节。
- COS 放到“Legacy Tencent COS compatibility”小节。

### 15. Worker README 仍是 Vercel / Supabase / Tencent COS 架构说明

证据：

- `workers/video-worker/README.md`
  - 第 5-8 行写 Vercel、Supabase、Tencent COS、Tencent Lighthouse。
  - 第 53-54 行部署说明要求设置 `SUPABASE_DB_URL, COS_*`。
  - 第 136-139 行描述从 Tencent COS 下载、上传回 Tencent COS。
  - 第 186-187 行示例 `storage_provider = tencent_cos`。
  - 第 204-207 行写 input asset 必须是 `tencent_cos`。
  - 第 267 行 local setup 仍要求 `WORKER_COS_*`，把 `SUPABASE_DB_URL` 当兼容。
  - 第 291-296 行 smoke 描述仍写 Tencent COS。

风险：

- 这是后续部署最容易被误导的地方之一。真实代码已支持 `WORKER_STORAGE_PROVIDER=aliyun_oss`，但 README 主叙事仍停留在旧架构。

建议：

- 重写 README 顶部架构口径为：国内服务器 + PostgreSQL + Aliyun OSS + FireRed/OpenStoryline。
- Tencent COS 只作为历史兼容 provider。
- 示例 payload 改为 `aliyun_oss`。

### 16. FireRed env 示例仍是旧 Supabase / 新加坡 COS

证据：

- `workers/video-worker/firered.env.example`
  - 第 7 行 `SUPABASE_DB_URL=postgresql://postgres:postgres@db.example.supabase.co...`
  - 第 9-13 行 Tencent COS，且 bucket 是 `jj-content-staging-1341668543`、region 是 `ap-singapore`。

风险：

- 如果按这个文件部署，会直接回到旧 Supabase / 新加坡 COS 口径。

建议：

- 改成 `WORKER_DATABASE_URL`、`WORKER_STORAGE_PROVIDER=aliyun_oss`、`WORKER_ALIYUN_OSS_*`。
- `SUPABASE_DB_URL` / `COS_*` 如保留，必须放 legacy fallback 注释区，不给真实默认值。

### 17. Worker 代码仍保留 COS fallback，默认已是 OSS

证据：

- `workers/video-worker/worker/app/config.py`
  - 第 17-19 行默认 `WORKER_STORAGE_PROVIDER` / `STORAGE_PROVIDER` / `aliyun_oss`。
  - 第 93-96 行 `WORKER_DATABASE_URL` 优先，`SUPABASE_DB_URL` 兼容 fallback。
  - 第 102-109 行读取 `WORKER_COS_*` 或 `COS_*`。
- `workers/video-worker/worker/app/cos_client.py`
  - 支持 `aliyun_oss` 和 `tencent_cos`，但类名仍是 `ObjectStorageClient` 文件名 `cos_client.py`。

风险：

- 运行逻辑相对安全，默认值已偏 OSS；主要是命名和兼容变量导致误判。

建议：

- 后续可把 `cos_client.py` 重命名为 `object_storage_client.py`。
- 保留 `tencent_cos` 分支作为历史资产读取，默认部署不再配置 COS。

## 暂不视为问题的残留

以下残留可以保留，但要有明确边界：

- `app/src/server/storage/tencent-cos-provider.ts`：作为历史 Tencent COS provider，可保留。
- `storageProvider` 枚举里保留 `tencent_cos` / `supabase_storage`：历史数据读取和旧资产兼容需要。
- 测试 fixture 中的 `tencent_cos`：只要测试名称说明 legacy 或多 provider 覆盖即可。
- `cos://` path 解析：作为历史 Dify / 旧资产路径兼容可保留。

## 建议修复顺序

### 第一阶段：止血用户可见错误

1. 修 `/api/auth/register-with-invite`，补 PostgreSQL owner 注册。
2. 修 `/merchant/onboarding`，改为 domestic session / `getAuthenticatedUser()` 优先。
3. 修 `app/(auth)/login/actions.ts` 判断顺序，避免先跳 Supabase。
4. 修 `current-user.ts` 的 `SUPABASE_NOT_CONFIGURED` 文案和错误码。
5. 加测试覆盖：
   - PostgreSQL 模式商家邀请码注册不调用 Supabase。
   - PostgreSQL 模式登录不出现 `supabase-not-configured`。
   - `getAuthenticatedUser()` 在当前口径下不会抛 Supabase 文案。

### 第二阶段：统一 repository fallback

1. 盘点所有引用 `cloudSupabaseRequiredError()` 的模块。
2. 对已有 PostgreSQL 分支的模块，未配置时抛 `APP_DATABASE_NOT_CONFIGURED`。
3. 对确实未迁的模块，明确列入迁移任务，不再让用户看到 Supabase 文案。
4. Agent Console / Platform Admin 写操作补 PostgreSQL 分支覆盖测试。

### 第三阶段：统一存储口径

1. 修 health check 默认 provider。
2. UI 文案从“COS”改成“OSS / 对象存储”。
3. 新增通用 preview route，逐步替代 `cos-preview`。
4. Worker README 和 env 示例改为 PostgreSQL + Aliyun OSS 主线。
5. `cosKey` 字段逐步 deprecate，DTO 主字段统一 `storageKey`。

## 本轮未做

- 未修改代码。
- 未运行测试。
- 未验证线上服务器环境变量。
- 未确认每个 Supabase fallback 是否仍有历史环境在使用。
