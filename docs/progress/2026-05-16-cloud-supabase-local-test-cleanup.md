# 2026-05-16 云端 Supabase 本地测试入口清理

## 背景

本轮确认：app 不使用本地 Supabase，业务数据源使用部署在云端的 Supabase。本地运行 Next app 时也必须通过 `.env.local` 连接云端 Supabase。

## 已清理

- 删除 `LOCAL_REAL_CHAIN_*` 本地真实链路测试桥接配置。
- 删除 `app/src/lib/db/local-real-chain-repository.ts`。
- 移除 media / content draft / video edit job 对 `local-real-chain-repository` 的运行时引用。
- 移除商家登录、商家后台、onboarding、`getAuthenticatedUser` 在未配置 Supabase 时的本地/demo 放行。
- 移除平台后台 localhost 本地超管 fallback。
- 移除 repository / service 在未配置 Supabase service role 时返回本地 demo / memory 数据的运行时 fallback。
- 私有素材下载 token secret 不再使用本地 fixture secret 兜底。
- 删除误落盘的 `app/supabase/supabase/` 本地 CLI 临时目录，并在 `.gitignore` 忽略。
- 移除 app 中仅供本地 Postgres 桥接使用的 `pg` / `@types/pg` 依赖。

## 当前规则

- 本地 app 可以启动，但必须连接云端 Supabase。
- 必需配置：
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
- 缺少云端 Supabase 配置时，认证和业务 API 应明确返回配置错误或跳转到登录错误页，不能自动造 demo 用户、demo 商家或 demo 超管。

## 验证结果

- `cd app && corepack pnpm typecheck` 通过。
- `cd app && corepack pnpm lint` 通过。
- 本地 Supabase / local demo / 本地桥接 / 无 Supabase Auth 兜底关键字搜索未命中运行时桥接入口。

## 保留项

- 平台后台页面仍有 `platform-admin-mock` UI 样本引用；用户已明确“后台不要动”，本轮不继续处理。
- 商家端旧 dashboard 详情 / 改写 / 草稿页面仍有 `mock-api` 引用；当前主入口 `/dashboard/content` 已走真实接口，旧页面 mock 后续如需彻底收口再单独处理。

## push / merge

本轮准备仅做本地 merge 到 `孟_5.13`，不 push。
