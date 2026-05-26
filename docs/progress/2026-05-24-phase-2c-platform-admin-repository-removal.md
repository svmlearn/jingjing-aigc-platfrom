# 2026-05-24 Phase 2C Platform Admin Repository Supabase Fallback Removal

## Scope

本批只处理 Phase 2C 第二小批：

- `app/src/lib/db/platform-admin-repository.ts`
- `app/src/lib/db/platform-admin-repository-phase-2c-contract.test.mjs`

未触碰 `agent-console-repository.ts`、`merchant-media-repository.ts`、`consultation-repository.ts`、`import-repository.ts`、`content-generation-repository.ts`、`voice-profile-repository.ts`、`cloud-supabase-required.ts`、storage provider、worker、package / lockfile，也未纳入既有 untracked inventory 文档。

## Runtime Changes

### Removed Supabase fallback

- 删除 `createSupabaseAdminClient` / `isSupabaseAdminConfigured` import。
- 删除 `@/lib/supabase/admin` 依赖。
- 删除所有 Supabase `.from(...)` fallback branches。
- 删除 Supabase admin auth fallback：
  - `auth.admin.createUser`
  - `auth.admin.updateUserById`
  - Supabase user metadata 同步逻辑
- 删除 fallback-only helper：
  - `shouldUseAppPostgres()`
  - `shouldUseDemoFallback()`
  - `platformAdminAuthNotConfiguredError()`
  - `recordPlatformAdminEvent()`
  - Supabase-only `getPlatformAdminUserById()` / `getPlatformInvitationCodeById()` / `countActiveSuperAdmins()` fallback helpers

### PostgreSQL app DB path

- `listPlatformAdminUsers()` 直接查询 `public.platform_admin_users`。
- `createPlatformAdminUser()` 继续用 app-owned `password_hash`，通过 `insertAppOwnedPlatformAdminUser()` 写入 `public.platform_admin_users`，并写 `platform_admin_user.created` event。
- `updatePlatformAdminUser()` 保留 active `super_admin` 数量保护；禁用用户时继续 revoke `public.platform_admin_sessions`；并写 `platform_admin_user.updated` event。
- `listPlatformInvitationCodes()` 直接查询 `public.invitation_codes`。
- `createPlatformInvitationCode()` 继续使用 `insertAppOwnedInvitationCode()`；duplicate code 仍通过 `isPostgresUniqueViolation()` 映射为 `INVITATION_CODE_EXISTS`；并写 `invitation_code.created` event。
- `updatePlatformInvitationCode()` 继续校验 status transition，更新 `public.invitation_codes` 并写 `invitation_code.updated` event。
- `listPlatformMerchants()` / `getPlatformMerchantById()` 直接查询 `public.merchant_profiles`，并继续通过 PostgreSQL count helper 统计 imports / drafts。
- `updatePlatformMerchant()` 继续更新 `public.merchant_profiles` 并写 `merchant.updated` event。
- `getPlatformSettings()` 直接查询 `public.platform_settings`。
- `updatePlatformSettings()` 继续批量 upsert `public.platform_settings` 并写 `settings.updated` event 到 `public.platform_admin_events`。
- `insertPlatformAdminEvent()` 保留为 PostgreSQL event writer。

### Local demo fallback

保留的 local demo fallback 仅限 platform settings：

- `getPlatformSettings()` 在 `isLocalDemoRuntime()` 下返回内存 `demoPlatformSettings` 或默认配置。
- `updatePlatformSettings()` 在 `isLocalDemoRuntime()` 下更新内存 `demoPlatformSettings`。
- 该 fallback 不再依赖 Supabase 配置判断。

平台管理员账号和管理操作不再有 Supabase fallback；非 local demo 路径直接走 app PostgreSQL，未配置时由 `queryAppDb()` / `withAppDbTransaction()` 抛当前 app database 口径错误。

## Tests

新增源码契约测试：

- `app/src/lib/db/platform-admin-repository-phase-2c-contract.test.mjs`

契约覆盖：

- repository source 不再包含 `createSupabaseAdminClient`、`isSupabaseAdminConfigured`、`@/lib/supabase`、`supabase`、`Supabase`、`.from(`、`auth.admin`。
- 11 个公开函数仍存在。
- PostgreSQL 主路径仍包含 `queryAppDb`、`withAppDbTransaction`、`public.platform_admin_users`、`public.invitation_codes`、`public.merchant_profiles`、`public.platform_settings`、`public.platform_admin_events`。
- app-owned admin user create/update 仍使用 `password_hash`、`createPlatformAdminPasswordHash()`、super admin count/protection 和 session revoke。
- invitation code duplicate 仍映射为 `INVITATION_CODE_EXISTS`。
- merchant/settings/admin/invitation audit event 写入仍可从源码契约看到。
- local demo fallback 只由 `isLocalDemoRuntime()` 控制。

## Verification

已通过：

```bash
cd app && node --test src/lib/db/platform-admin-repository-phase-2c-contract.test.mjs
```

结果：8 tests passed。

```bash
cd app && npm run lint -- src/lib/db/platform-admin-repository.ts src/lib/db/platform-admin-repository-phase-2c-contract.test.mjs
```

结果：通过。

```bash
cd app && npm run typecheck -- --pretty false
```

结果：通过。

```bash
rg -n -S "createSupabaseAdminClient|isSupabaseAdminConfigured|@/lib/supabase|supabase|Supabase|\.from\(|auth\.admin" app/src/lib/db/platform-admin-repository.ts
```

结果：无命中。

```bash
git diff --check
```

结果：通过。

## Retained / Not Touched

- 保留 settings 的 local demo 内存 fallback，条件是 `isLocalDemoRuntime()`。
- 未处理 agent-console / merchant-media。
- 未处理 consultation / import / content-generation / voice-profile。
- 未处理 `cloud-supabase-required.ts`。
- 未处理 storage provider、worker、Supabase package/client shims。
- 未 push，未部署。
