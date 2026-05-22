# 2026-05-22 Auth Supabase Removal

## 状态

- 分支：`codex/remove-supabase-cos-legacy-longrun`
- 批次：第一阶段，身份层彻底去 Supabase
- 本轮范围：商家 / 成员 / 平台管理员 auth/session、dashboard gate、logout、proxy session refresh、auth 源码契约测试
- 未 push
- 未部署
- 未修改真实远程环境

## 删除的真实旧依赖

- `app/src/proxy.ts`
  - 删除 `@supabase/ssr` import。
  - 删除 Supabase session refresh，只保留 staging canonical host redirect 和 `NextResponse.next()`。
- `app/src/lib/auth/current-user.ts`
  - 删除 `@supabase/supabase-js` `User` 类型。
  - 删除 `createSupabaseServerClient()` / public Supabase session fallback。
  - `getAuthenticatedUser()` 只返回 app-owned `AuthenticatedUser`，未启用 app session 时 fail closed。
- `app/src/lib/auth/domestic-session.ts`
  - 删除从 Supabase `User` 类型借壳。
  - 新增项目自有 `AuthenticatedUser` 类型。
  - `toSupabaseCompatibleUser()` 改为 `toAuthenticatedUser()`。
- `app/src/lib/auth/platform-admin-session.ts`
  - 删除平台管理员登录、初始化、当前用户、登出里的 Supabase public/admin client fallback。
  - 平台管理员登录与 bootstrap 只走 `platform_admin_users` / `platform_admin_sessions` app-owned PostgreSQL path。
- `app/src/app/(auth)/login/actions.ts`
  - 删除商家登录 server action 的 Supabase password login fallback。
- `app/src/app/(auth)/logout/route.ts`
  - 登出只清 app-owned domestic session。
- `app/src/app/api/auth/merchant-login/route.ts`
  - 删除 `@supabase/ssr` route 内 client 和 Supabase password login fallback。
- `app/src/app/api/auth/register-with-invite/route.ts`
  - 删除商家邀请码注册的 Supabase admin user create / server sign-in fallback。
- `app/src/app/api/auth/member-login/route.ts`
  - 删除成员登录 Supabase password login fallback 和未配置时的 demo-member 成功跳转。
- `app/src/app/api/auth/member-register-with-invite/route.ts`
  - 删除成员邀请码注册 Supabase admin user create / server sign-in / cleanup fallback。
- `app/src/lib/demo/local-demo-runtime.ts`
  - 删除 Supabase `User` 类型依赖。
  - 本地 demo runtime 判断改为当前 PostgreSQL/app-owned session 口径。

## 保留的兼容字段 / 残留

- `platform_admin_users.auth_user_id` / `PlatformAdminUserDto.authUserId` 暂时保留。
  - 原因：这是现有 DB/DTO contract 字段；本批只删除 Auth fallback，不做 DB schema 字段 migration。
  - 当前 app-owned path 用 `id as auth_user_id` 保持 DTO 兼容。
- `app/src/lib/supabase/*`、`@supabase/ssr`、`@supabase/supabase-js` 暂时保留。
  - 原因：repository fallback 和 package removal 属于后续阶段，不能在 auth 批次里越界删除。
- `app/src/lib/db/platform-admin-repository.ts` 仍有 Supabase admin fallback。
  - 原因：它属于第二 / 第三阶段 repository fallback 清理，不混入身份层 commit。
- 历史 docs、旧 migrations、storage provider 字段没有在本批处理。

## 用户可见错误口径

- 商家登录 / 商家注册：旧 session provider 不可用时返回 `auth-not-configured` 或 `AUTH_SERVICE_NOT_CONFIGURED`，不出现 Supabase 字样。
- 成员登录 / 成员注册：旧 session provider 不可用时返回 `auth-not-configured` / `AUTH_SERVICE_NOT_CONFIGURED`，页面新增当前数据库会话配置提示。
- 平台管理员登录：未配置 app-owned platform admin auth 时返回既有 `not-configured`。

## 验证结果

通过：

```bash
cd app && node --test src/lib/auth/postgres-auth-p0-contract.test.mjs
```

结果：5 tests passed。

通过：

```bash
cd app && npm run lint -- src/lib/auth/authenticated-user.ts src/lib/auth/current-user.ts src/lib/auth/domestic-session.ts src/lib/auth/platform-admin-session.ts src/lib/auth/postgres-auth-p0-contract.test.mjs src/lib/demo/local-demo-runtime.ts 'src/app/(auth)/login/actions.ts' 'src/app/(auth)/logout/route.ts' src/app/api/auth/merchant-login/route.ts src/app/api/auth/register-with-invite/route.ts src/app/api/auth/member-login/route.ts src/app/api/auth/member-register-with-invite/route.ts src/app/dashboard/layout.tsx src/app/member/login/page.tsx src/app/member/register/page.tsx src/proxy.ts
```

通过：

```bash
cd app && npm run typecheck -- --pretty false
```

通过，结果无命中：

```bash
rg -n -S "@supabase|createSupabase|Supabase Auth|supabase-not-configured|SUPABASE_NOT_CONFIGURED" app/src/lib/auth app/src/app/api/auth 'app/src/app/(auth)' app/src/app/dashboard app/src/proxy.ts
```

通过，结果无命中：

```bash
rg -n -S "Supabase|supabase|SUPABASE|@supabase|createSupabase|isSupabase|toSupabaseCompatibleUser|auth\\.getUser|auth\\.signOut|auth\\.signInWithPassword|auth\\.admin" app/src/lib/auth app/src/lib/demo app/src/app/api/auth 'app/src/app/(auth)' app/src/app/dashboard app/src/proxy.ts
```

通过：

```bash
git diff --check
```

## 未处理

- 未删除 repository 层 Supabase admin fallback。
- 未删除 `app/src/lib/supabase/*` client shims。
- 未删除 app package 中的 `@supabase/*` 依赖。
- 未处理 `supabase_storage`、`tencent_cos`、`cosKey`、worker `SUPABASE_DB_URL`。
- 未执行真实浏览器点击和真实远程环境验证。

## 结论

第一阶段 auth/session 运行时已经从 Supabase Auth fallback 收敛到 app-owned / domestic session。置信度：高，依据是源码契约测试、触碰文件 lint、全量 typecheck 和 auth 范围旧词 / 旧调用扫描均通过。

## Review Follow-up：商家 profile 校验失败撤销 session

补丁时间：`2026-05-22`

问题：

- `app/src/app/(auth)/login/actions.ts` 和 `app/src/app/api/auth/merchant-login/route.ts` 在 domestic path 下先调用 `signInDomesticUser()` 写入 `jingjing_session`，再校验 `getOperationalMerchantProfileByOwnerUserId(user.id)`。
- 如果邮箱/密码正确但用户没有 operational merchant profile，页面会返回登录失败，但浏览器已经持有有效 app-owned session。

处理：

- 两个商家登录入口都拆成两段：
  - `signInDomesticUser()` 失败：继续返回 `invalid-credentials`。
  - profile 校验失败：调用 `signOutDomesticUser()` 撤销刚写入的 domestic session，再返回 `no-merchant-profile`。
- 没有恢复任何 Supabase fallback。
- 没有扩大范围到 repository / storage / worker。
- `app/src/lib/auth/postgres-auth-p0-contract.test.mjs` 新增源码契约测试：
  - 商家 profile check 的 `catch` 内必须出现 `signOutDomesticUser()`。
  - profile 失败必须返回 `no-merchant-profile`。
  - 密码失败仍映射到 `invalid-credentials`。

验证结果：

通过：

```bash
cd app && node --test src/lib/auth/postgres-auth-p0-contract.test.mjs
```

结果：6 tests passed。

通过：

```bash
cd app && npm run lint -- src/lib/auth/postgres-auth-p0-contract.test.mjs 'src/app/(auth)/login/actions.ts' src/app/api/auth/merchant-login/route.ts
```

通过：

```bash
cd app && npm run typecheck -- --pretty false
```

通过：

```bash
git diff --check
```
