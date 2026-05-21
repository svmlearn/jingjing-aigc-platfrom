# 2026-05-21 PostgreSQL 迁移后 Supabase 残留记录

## 背景

用户指出：当前项目运行环境已经迁到自建 PostgreSQL，不应再在用户端看到“Supabase 未配置”这类提示。

本轮在独立 worktree 启动本地 dev server 时，因为该 worktree 没有继承主项目/服务器环境变量，`APP_DATABASE_URL` / `DATABASE_URL` 不存在，导致 PostgreSQL 登录开关没有启用。用户端登录链路落入历史 Supabase fallback 分支，于是页面出现了 `supabase-not-configured` 相关提示。

结论：这不是当前正式环境仍依赖 Supabase，而是代码里仍保留旧架构 fallback 和旧错误文案，异常或本地缺环境时会暴露出来。

## 今日观察到的残留点

1. `app/src/app/api/auth/merchant-login/route.ts`
   - 仍保留 Supabase auth 登录 fallback。
   - 当 `isDomesticSessionEnabled()` 为 false 时，会检查 `isSupabasePublicConfigured()`，并可能跳转 `supabase-not-configured`。
2. `app/src/app/(auth)/login/actions.ts`
   - 仍保留 Supabase 登录分支。
   - 其中还存在先检查 Supabase 配置、再判断 PostgreSQL domestic session 的旧顺序，后续应统一梳理。
3. `app/src/app/(auth)/login/page.tsx`
   - 错误码/文案仍缺少当前 PostgreSQL 架构口径，例如 `APP_DATABASE_NOT_CONFIGURED` 或“用户登录环境未配置”。
4. `app/src/lib/auth/current-user.ts`
   - 仍引入 `createLocalDemoUser`，但当前没有使用，lint 也提示 unused warning。
5. 多个 repository 仍有 Supabase fallback：
   - material library
   - knowledge
   - consultation
   - platform admin
   - merchant profile
   - import/source/comments
   - media/voice/video 相关仓储

## 后续统一修复建议

### 1. 先定架构口径

- 如果产品和部署已确定“正式环境只走自建 PostgreSQL”，应把用户端、成员端、平台管理端的登录和数据访问都切到 PostgreSQL-first / PostgreSQL-only。
- Supabase fallback 如需保留，只能作为明确的历史兼容或本地特殊模式，不能在当前用户可见文案里出现。

### 2. 统一错误码与文案

建议替换：

- `supabase-not-configured`
- `SUPABASE_NOT_CONFIGURED`
- “Cloud Supabase environment variables are required”

为当前架构口径：

- `app-database-not-configured`
- `APP_DATABASE_NOT_CONFIGURED`
- “用户登录环境未配置，请检查 APP_DATABASE_URL / DATABASE_URL”

### 3. 清理登录链路

重点文件：

- `app/src/app/api/auth/merchant-login/route.ts`
- `app/src/app/api/auth/member-login/route.ts`
- `app/src/app/platform-admin-login/actions.ts`
- `app/src/lib/auth/domestic-session.ts`
- `app/src/lib/auth/platform-admin-session.ts`
- `app/src/lib/auth/current-user.ts`

目标：

- PostgreSQL 环境存在时，直接走 `app_users` / `user_sessions`。
- PostgreSQL 环境不存在时，给出当前架构下的配置错误，而不是 Supabase 配置错误。
- 删除或隔离不再需要的 Supabase auth 分支。

### 4. 清理 repository fallback

后续需要逐模块确认 Supabase fallback 是否还需要：

- 如不需要，删掉 Supabase client 分支和相关配置判断。
- 如短期保留，需要统一命名为 legacy fallback，并保证用户可见错误不再提 Supabase。

## 需求池记录

已同步记录到 `docs/需求池.md`：

- `#6 PostgreSQL 迁移后清理 Supabase 残留与 fallback 文案`

状态暂定为“需要想想”，等后续明确是否 PostgreSQL-only 后再进入开发。
