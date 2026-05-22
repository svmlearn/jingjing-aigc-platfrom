# 2026-05-22 PostgreSQL / Aliyun OSS P1-P2 legacy cleanup

## 状态

- 分支：`codex/fix-postgres-oss-legacy-p1-p2`
- 基线：P0 已合回后的本地 `main`
- 本轮范围：P1/P2 残留清理，不改已通过 review 的 P0 商家邀请码注册主链路。
- 未 push。
- 未部署。

## 开工前搜索命中

验证时间：`2026-05-22 20:06 CST`

P1-A / P1-B 旧 Supabase 口径搜索：

```bash
rg -n --hidden -S "SUPABASE_NOT_CONFIGURED|Cloud Supabase|Supabase admin client is not configured|Supabase service role|Supabase Auth|Missing Supabase service|Missing public Supabase|supabase-not-configured" app/src/lib/db app/src/lib/auth app/src/components/platform-admin app/src/app/platform-admin app/src/server --glob '!**/*.test.ts' --glob '!**/*.test.mjs' --glob '!**/node_modules/**' --glob '!**/.next/**'
```

实际命中：

- `app/src/lib/db/cloud-supabase-required.ts`：默认抛 `SUPABASE_NOT_CONFIGURED` / `Cloud Supabase environment variables are required.`
- `app/src/lib/db/merchant-repository.ts`：本地 repository fallback 仍抛 `SUPABASE_NOT_CONFIGURED`。
- `app/src/lib/db/platform-admin-repository.ts`：平台管理员创建/更新 auth 用户时暴露 `Supabase service role is required...`。
- `app/src/components/platform-admin/platform-settings-editor.tsx`：UI 文案写 `Supabase Auth`。
- `app/src/lib/db/agent-console-repository.ts`：demo fallback 和缺配置错误写 `Supabase service role` / `Supabase admin client is not configured.`

P1/P2-C OSS/COS 口径搜索：

```bash
rg -n --hidden -S "直传 COS|Tencent COS|COS environment|COS_TEMP|COS_ENV|COS object|COS key|cos-preview|cosKey|COS_BUCKET|COS_REGION|tencent_cos|WORKER_COS|SUPABASE_DB_URL|Vercel|Supabase" app/src/components/dashboard/draft-video-panels.tsx app/src/app/api/health/route.ts app/src/app/api/media/cos-preview/route.ts app/src/server/api/dify-final-json-mapper.ts app/src/server/storage/aliyun-oss-provider.ts app/src/contracts/media.ts app/.env.example workers/video-worker/README.md workers/video-worker/firered.env.example workers/video-worker/worker/app/config.py workers/video-worker/worker/app/cos_client.py --glob '!**/*.test.ts' --glob '!**/*.test.mjs' --glob '!**/node_modules/**' --glob '!**/.next/**'
```

实际命中：

- `app/src/components/dashboard/draft-video-panels.tsx`：上传说明仍写“直传 COS”。
- `app/src/app/api/health/route.ts`：存储健康检查错误 fallback 默认 provider 仍是 `tencent_cos`。
- `app/src/app/api/media/cos-preview/route.ts` 与 `app/src/server/api/dify-final-json-mapper.ts`：新渲染 URL 仍传播 `/api/media/cos-preview`。
- `app/src/contracts/media.ts` / `app/src/server/storage/aliyun-oss-provider.ts`：`cosKey` 仍作为响应字段存在。
- `app/.env.example`：Supabase/COS 仍在默认配置顶部，Aliyun OSS 口径不够明确。
- `workers/video-worker/README.md` / `firered.env.example`：默认架构仍写 Vercel + Supabase + Tencent COS。
- `workers/video-worker/worker/app/config.py` / `cos_client.py`：兼容 env 和 Tencent COS provider 仍存在，部分错误文案没有标 legacy。

## 已处理

### P1-A：repository fallback 错误口径

- `app/src/lib/db/cloud-supabase-required.ts`
  - PostgreSQL preferred 时改为当前数据库错误：
    - 未配置数据库：`APP_DATABASE_NOT_CONFIGURED`
    - 数据库已配置但该 repository 路径不可用：`APP_DATABASE_REPOSITORY_UNAVAILABLE`
  - 非 PostgreSQL preferred 时才进入 legacy Supabase fallback。
  - legacy fallback 错误码改为 `LEGACY_AUTH_FALLBACK_NOT_CONFIGURED`，避免继续暴露旧 `SUPABASE_NOT_CONFIGURED`。
- `app/src/lib/db/merchant-repository.ts`
  - 本地 fallback 同步上述逻辑。
  - PostgreSQL preferred 下不再抛 `SUPABASE_NOT_CONFIGURED` / `Cloud Supabase...`。

### P1-B：平台管理端 / Agent Console 文案

- `app/src/components/platform-admin/platform-settings-editor.tsx`
  - UI 文案从 Supabase Auth 改为“平台账号系统”。
  - 平台账号配置缺失提示改为当前 PostgreSQL/session 口径。
- `app/src/lib/db/platform-admin-repository.ts`
  - 平台管理员 auth 用户创建/更新缺配置时，不再暴露 `Supabase service role`。
  - PostgreSQL preferred 下区分 `APP_DATABASE_NOT_CONFIGURED` 与 `PLATFORM_ADMIN_AUTH_NOT_CONFIGURED`。
- `app/src/lib/db/agent-console-repository.ts`
  - demo fallback 文案改成“平台数据源未配置”。
  - Agent Console 缺 repository 配置时，PostgreSQL preferred 下不再抛 Supabase admin client 文案。

### P1/P2-C：Aliyun OSS / 对象存储口径

- `app/src/components/dashboard/draft-video-panels.tsx`
  - “直传 COS”改为“直传 OSS”。
- `app/src/app/api/health/route.ts`
  - health check storage 错误 fallback provider 改为 `defaultStorageProviderName`，当前默认是 `aliyun_oss`。
- `app/src/app/api/media/cos-preview/route.ts`
  - 保留旧路由，但错误码改为 `OBJECT_PREVIEW_*`。
  - 注明旧路由仅用于历史 Dify payload。
- `app/src/app/api/media/object-preview/route.ts`
  - 新增通用 alias，复用现有 preview 逻辑，避免新调用继续传播 `cos-preview` 命名。
- `app/src/server/api/dify-final-json-mapper.ts`
  - 新生成图片渲染 URL 改用 `/api/media/object-preview`。
- `app/src/contracts/media.ts`
  - `tencent_cos` / `supabase_storage` 标为历史兼容值。
  - `cosKey` 标为 deprecated，主字段仍是 `storageKey` / `uploadKey`。
- `app/src/server/storage/aliyun-oss-provider.ts`
  - `cosKey` 响应字段加 deprecated 注释，仅作为老上传客户端兼容。
- `app/.env.example`
  - PostgreSQL / app-owned auth 放到默认顶部。
  - Aliyun OSS 放到当前对象存储主线。
  - Supabase 与 Tencent COS 下沉为 legacy compatibility。
- `workers/video-worker/README.md`
  - 默认架构改为 Next.js app APIs + PostgreSQL + Aliyun OSS + private Docker runtime。
  - 输入资产、结果前缀、真实依赖 smoke 文案改为对象存储 / Aliyun OSS 主线。
  - Tencent COS 只保留为 historical assets / older deployments 的 legacy compatibility。
- `workers/video-worker/firered.env.example`
  - 默认示例改为 `WORKER_DATABASE_URL` + `WORKER_STORAGE_PROVIDER=aliyun_oss` + `WORKER_ALIYUN_OSS_*`。
  - `SUPABASE_DB_URL` / `WORKER_COS_*` 保留为空值 legacy compatibility。
- `workers/video-worker/worker/app/config.py`
  - 缺数据库配置错误改成 PostgreSQL worker mode 口径。
  - `SUPABASE_DB_URL` 仍作为 legacy env fallback 读取，但不再出现在缺配置错误文案里。
- `workers/video-worker/worker/app/cos_client.py`
  - Tencent COS 缺配置错误改成 legacy object storage compatibility 口径。

## 保留的 legacy 兼容

- `cloudSupabaseRequiredError()` 函数名未重命名，避免大面积 repository 重构；其 PostgreSQL preferred 行为已改为当前口径。
- `/api/media/cos-preview` 旧路由保留，用于历史 Dify/COS payload；新调用应使用 `/api/media/object-preview`。
- `tencent_cos` provider、`cos://` 解析、`supabase_storage` 枚举、`cosKey` 字段保留，用于历史素材和旧客户端兼容。
- worker 的 `SUPABASE_DB_URL` / `WORKER_COS_*` / `COS_*` 仍可作为 older deployments fallback，但示例和 README 默认不再要求它们。
- health response 仍保留 `cos` compatibility 字段，仅在实际 provider 是 `tencent_cos` 时返回。

## 验证结果

通过：

```bash
cd app && npm run lint -- src/lib/db/cloud-supabase-required.ts src/lib/db/merchant-repository.ts src/lib/db/platform-admin-repository.ts src/lib/db/agent-console-repository.ts src/components/platform-admin/platform-settings-editor.tsx src/components/dashboard/draft-video-panels.tsx src/app/api/health/route.ts src/app/api/media/cos-preview/route.ts src/app/api/media/object-preview/route.ts src/server/api/dify-final-json-mapper.ts src/server/storage/aliyun-oss-provider.ts src/contracts/media.ts
```

通过：

```bash
cd app && npm run typecheck -- --pretty false
```

通过：

```bash
python3 -m py_compile workers/video-worker/worker/app/config.py workers/video-worker/worker/app/cos_client.py
```

通过：

```bash
git diff --check
```

通过，结果无命中：

```bash
rg -n --hidden -S "SUPABASE_NOT_CONFIGURED|Cloud Supabase|Supabase admin client is not configured|Supabase service role|Supabase Auth|Missing Supabase service|Missing public Supabase|supabase-not-configured|直传 COS" app/src/lib/db app/src/components/platform-admin app/src/components/dashboard/draft-video-panels.tsx app/src/app/api/health/route.ts app/src/app/api/media/cos-preview/route.ts app/src/app/api/media/object-preview/route.ts app/src/server/api/dify-final-json-mapper.ts app/src/server/storage/aliyun-oss-provider.ts app/src/contracts/media.ts app/.env.example workers/video-worker/README.md workers/video-worker/firered.env.example workers/video-worker/worker/app/config.py workers/video-worker/worker/app/cos_client.py --glob '!**/*.test.ts' --glob '!**/*.test.mjs' --glob '!**/node_modules/**' --glob '!**/.next/**'
```

兼容项复核：

```bash
rg -n --hidden -S "Vercel|Supabase|Tencent COS|COS environment|COS_TEMP|COS_ENV|COS object|COS key|cos-preview|cosKey|COS_BUCKET|COS_REGION|tencent_cos|WORKER_COS|SUPABASE_DB_URL|直传 COS" app/src/components/dashboard/draft-video-panels.tsx app/src/app/api/health/route.ts app/src/app/api/media/cos-preview/route.ts app/src/app/api/media/object-preview/route.ts app/src/server/api/dify-final-json-mapper.ts app/src/server/storage/aliyun-oss-provider.ts app/src/contracts/media.ts app/.env.example workers/video-worker/README.md workers/video-worker/firered.env.example workers/video-worker/worker/app/config.py workers/video-worker/worker/app/cos_client.py --glob '!**/*.test.ts' --glob '!**/*.test.mjs' --glob '!**/node_modules/**' --glob '!**/.next/**'
```

结果：仍有命中，但均为上文列出的 legacy compatibility / deprecated 字段 / 旧路由 alias。

## 未处理 / 下一步

- 未重命名所有包含 `Supabase` / `COS` 的内部函数、文件名、路由名；本轮只处理用户可见旧文案和当前主线 fallback 错误。
- 未迁移历史 `tencent_cos` / `cos://` 资产引用；它们仍需要兼容读取。
- 未重写平台管理员登录体系；仅清理 UI 文案和缺配置错误。
- 未跑真实 worker OSS 读写 smoke；本轮只做 Python 语法检查和 app lint/typecheck。
