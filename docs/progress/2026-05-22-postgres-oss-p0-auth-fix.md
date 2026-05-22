# 2026-05-22 PostgreSQL / Aliyun OSS P0 auth residual fix

## 状态

- 分支：`codex/fix-postgres-oss-legacy-p0`
- 本轮范围：只修 P0 用户可见 Supabase 旧逻辑 / 旧报错，重点是商家 owner 邀请码注册链路。
- 未 push。
- 未部署。
- 未删除或覆盖既有未提交扫描文档 `docs/progress/2026-05-22-postgres-oss-legacy-residual-audit.md`。

## 已完成

### 商家 owner 邀请码注册

- `app/src/app/api/auth/register-with-invite/route.ts`
  - 改为 PostgreSQL / domestic session first。
  - domestic 模式下写入 `public.app_users`，角色为 `merchant_owner`。
  - 继续调用既有 `redeemInvitationCode()`，在 PostgreSQL 模式下走 `pgRedeemInvitationCode()` 完成邀请码兑换、商家 profile 创建、owner membership 写入。
  - 注册成功后调用 `signInDomesticUser()` 写入 domestic session cookie。
  - 将 PostgreSQL 邀请码的 `INVITATION_CODE_NOT_ACTIVE` / `INVITATION_CODE_REDEEMED` / `INVITATION_CODE_PURPOSE_INVALID` 归一到前端已识别的 `INVITATION_CODE_UNAVAILABLE`。
  - legacy Supabase 分支保留在 domestic 分支之后。
  - Supabase 未配置时不再暴露 service role / Supabase 不可用文案，改为 `AUTH_SERVICE_NOT_CONFIGURED`。

### 商家 onboarding

- `app/src/app/(auth)/merchant/onboarding/page.tsx`
  - 去掉直接 Supabase session 获取。
  - 改为 `getAuthenticatedUser()` 优先。
  - 数据库 / session 配置缺失时跳 `auth-not-configured`，未登录仍跳 `unauthenticated`。

### 商家登录入口

- `app/src/app/(auth)/login/actions.ts`
  - 调整为先校验输入，再走 domestic session，再走 legacy Supabase。
  - 去掉先跳 `supabase-not-configured` 的逻辑。
- `app/src/app/api/auth/merchant-login/route.ts`
  - 保留 domestic session 优先。
  - legacy auth 未配置时改跳 `auth-not-configured`，不再跳 `supabase-not-configured`。
- `app/src/app/(auth)/login/page.tsx`
  - 增加 `auth-not-configured` 的当前口径中文提示。

### 当前用户兜底错误

- `app/src/lib/auth/current-user.ts`
  - PostgreSQL 模式缺数据库配置时抛 `APP_DATABASE_NOT_CONFIGURED`。
  - 只要 `isAppPostgresPreferred()` 为 true，就不会落到 legacy Supabase fallback。
  - PostgreSQL preferred 但 domestic session 未启用时抛 `APP_SESSION_NOT_CONFIGURED`。
  - 非 PostgreSQL preferred 且无 legacy Supabase 时，session provider 缺失仍抛 `APP_SESSION_NOT_CONFIGURED`。
  - 保留未登录为 `UNAUTHENTICATED`。
  - 去掉 `SUPABASE_NOT_CONFIGURED` / `Cloud Supabase environment variables are required.`。

### 回归测试

- 新增 `app/src/lib/auth/postgres-auth-p0-contract.test.mjs`
  - 约束商家 owner 邀请码注册必须先走 domestic/PostgreSQL，再到 legacy Supabase。
  - 约束登录 action / route 不再出现 `supabase-not-configured`。
  - 约束 onboarding 不再直接使用 Supabase session。
  - 约束 `getAuthenticatedUser()` 当前口径错误码不再是 Supabase。
  - 约束 `getAuthenticatedUser()` 中 `isAppPostgresPreferred()` 判断发生在 legacy Supabase fallback 之前。

## 验证结果

通过：

```bash
cd app && node --test src/lib/auth/postgres-auth-p0-contract.test.mjs
```

结果：5 tests passed。

通过：

```bash
cd app && npm run lint -- src/app/api/auth/register-with-invite/route.ts src/app/api/auth/merchant-login/route.ts 'src/app/(auth)/merchant/onboarding/page.tsx' 'src/app/(auth)/login/actions.ts' 'src/app/(auth)/login/page.tsx' src/lib/auth/current-user.ts src/lib/auth/postgres-auth-p0-contract.test.mjs
```

通过：

```bash
cd app && npm run typecheck -- --pretty false
```

通过：

```bash
git diff --check -- app/src/lib/auth/current-user.ts app/src/lib/auth/postgres-auth-p0-contract.test.mjs docs/progress/2026-05-22-postgres-oss-p0-auth-fix.md
```

通过：

```bash
rg -n "supabase-not-configured|SUPABASE_NOT_CONFIGURED|Cloud Supabase environment variables are required|Missing Supabase service|Supabase service role" app/src/app/api/auth/register-with-invite/route.ts 'app/src/app/(auth)/merchant/onboarding/page.tsx' 'app/src/app/(auth)/login/actions.ts' app/src/lib/auth/current-user.ts app/src/app/api/auth/merchant-login/route.ts 'app/src/app/(auth)/login/page.tsx' --glob '!**/*.test.ts'
```

结果：无命中。

## 真实冒烟验证

验证时间：`2026-05-22 19:40-19:42 CST`

环境：

- 本机一次性 PostgreSQL 17.9 测试库：`127.0.0.1:55439/postgres`
- Next dev server：`http://127.0.0.1:3017`
- App runtime 显式设置：
  - `APP_DATABASE_URL=postgresql://wy@127.0.0.1:55439/postgres?sslmode=disable`
  - `DATABASE_PROVIDER=postgres`
  - `APP_DATABASE_SSL=disable`
- `app/.env.local` 仍存在 legacy Supabase public env；本次冒烟覆盖混合环境下 PostgreSQL preferred 不落回 Supabase 的情况。

操作步骤：

```bash
tmpdir=$(mktemp -d /tmp/jj-pg-smoke-XXXXXX)
initdb -D "$tmpdir/data" --no-locale --encoding=UTF8
postgres -D "$tmpdir/data" -p 55439 -k "$tmpdir/socket"
```

```bash
psql "postgresql://wy@127.0.0.1:55439/postgres?sslmode=disable" \
  -v ON_ERROR_STOP=1 \
  -f app/db/migrations/202605130001_domestic_core_baseline.sql \
  -f app/db/migrations/202605200001_member_multi_team_auth.sql
```

```sql
insert into public.invitation_codes (code, purpose, status, max_redemptions, note)
values ('P0-SMOKE-20260522-1940', 'merchant_signup', 'active', 1, 'P0 auth smoke 2026-05-22');
```

```bash
APP_DATABASE_URL='postgresql://wy@127.0.0.1:55439/postgres?sslmode=disable' \
DATABASE_PROVIDER=postgres \
APP_DATABASE_SSL=disable \
NEXT_TELEMETRY_DISABLED=1 \
npm run dev -- --hostname 127.0.0.1 --port 3017
```

```bash
curl -i -c "$tmpdir/cookies.txt" \
  -H 'content-type: application/json' \
  -X POST http://127.0.0.1:3017/api/auth/register-with-invite \
  --data '{
    "email":"p0-smoke-20260522-1940@example.com",
    "password":"P0SmokePass123!",
    "inviteCode":"P0-SMOKE-20260522-1940",
    "merchantProfile":{
      "name":"P0 Smoke Merchant",
      "contactName":"P0 Smoke Owner",
      "serviceItems":["smoke test"],
      "industry":"QA"
    }
  }'
```

结果：

- `POST /api/auth/register-with-invite` 返回 `201 Created`。
- 响应体包含 `sessionEstablished: true`，并返回新建 `userId` 和 `merchantProfile`。
- 响应头写入 `jingjing_session` HttpOnly cookie。
- 使用该 cookie 访问 `GET /merchant/onboarding` 返回 `200 OK`，页面进入用户信息补全页。
- 对注册响应和 onboarding 响应执行旧文案扫描，匹配数为 `0`：

```bash
rg -n "supabase-not-configured|SUPABASE_NOT_CONFIGURED|Cloud Supabase|Supabase service role|Missing Supabase service" \
  "$tmpdir/register-response.txt" "$tmpdir/onboarding-response.txt"
```

数据库确认：

```sql
select 'app_users', count(*) from public.app_users where lower(email)='p0-smoke-20260522-1940@example.com'
union all
select 'merchant_profiles', count(*) from public.merchant_profiles where name='P0 Smoke Merchant'
union all
select 'merchant_team_members', count(*) from public.merchant_team_members mtm join public.app_users u on u.id=mtm.user_id where lower(u.email)='p0-smoke-20260522-1940@example.com' and mtm.role='owner' and mtm.status='active'
union all
select 'user_sessions', count(*) from public.user_sessions s join public.app_users u on u.id=s.user_id where lower(u.email)='p0-smoke-20260522-1940@example.com' and s.revoked_at is null and s.expires_at > timezone('utc', now())
union all
select 'invitation_codes_redeemed', count(*) from public.invitation_codes where code='P0-SMOKE-20260522-1940' and status='redeemed' and redemption_count=1;
```

返回：

```text
app_users|1
merchant_profiles|1
merchant_team_members|1
user_sessions|1
invitation_codes_redeemed|1
```

清理：

- 已停止本地 Next dev server。
- 已停止一次性 PostgreSQL 进程。

## 本轮未处理

- 未处理 P1 repository fallback 的统一改名和错误码清理。
- 未处理平台管理端 / Agent Console 的 Supabase Auth 文案和 legacy 分支。
- 未处理 P1/P2 COS / OSS 文案、health check 默认 provider、`cos-preview` 命名、worker README/env 示例。
- 未做真实服务器环境变量验证。
- 未做浏览器端手工注册流程点击验证。

## 下一步建议

1. 先 review 本轮 P0 auth 改动。
2. 如 review 通过，再进入 P1：统一 `cloudSupabaseRequiredError()` 和 `merchant-repository` 本地 Supabase-required fallback。
3. 之后再做 OSS/COS 命名和 worker 文档，不要和注册链路修复混成一个大改。
