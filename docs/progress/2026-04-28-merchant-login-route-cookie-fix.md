# 2026-04-28 商家登录闪退修复记录

## 背景

staging 商家端登录后会短暂进入 `/dashboard`，随后回到：

```text
/login?error=unauthenticated&next=%2Fdashboard
```

此前已补过 Supabase session refresh proxy 和浏览器端登录组件，但线上仍有闪退。

## 根因定位

问题集中在登录提交链路：

- 当前 `app/src/components/app/merchant-login-form.tsx` 依赖客户端 hydration 后执行 `onSubmit`。
- 登录成功后再用 `router.push(nextPath)` 进入 dashboard。
- 在 staging / in-app browser 场景下，存在登录 cookie 写入、客户端跳转、服务端 layout/API 读取 session 之间的竞态。
- 结果是 `/dashboard` 或 `/api/consultation/sessions` 仍可能读不到稳定 Supabase session cookie，并触发 unauthenticated 回登录页。

## 本次改动

- 新增 `app/src/app/api/auth/merchant-login/route.ts`
  - 普通 POST 登录 route。
  - 使用 `@supabase/ssr` 的 `createServerClient`。
  - 在 route handler 内把 Supabase `setAll` 写出的 auth cookies 直接挂到同一个 `303` redirect response。
  - 成功后跳转 safe `next`，失败后跳转 `/login?error=...`。
  - 无商户绑定时在同一 cookie 接线里 `signOut()`，清掉刚建立的 session。
- 修改 `app/src/components/app/merchant-login-form.tsx`
  - 去掉客户端 Supabase 登录、`router.push` 和 hydration 依赖。
  - 改为 `<form action="/api/auth/merchant-login" method="post">`。

## 验证

在 worktree `/Users/wy/.codex/worktrees/merchant-login-route`：

- `pnpm install --frozen-lockfile`：通过。
- `pnpm lint`：通过。
- `pnpm exec tsc --noEmit`：通过。
- `pnpm build`：通过。
  - build 输出包含 `ƒ /api/auth/merchant-login`。
  - build 输出包含 `ƒ Proxy (Middleware)`。

## 状态

- 分支：`codex/merchant-login-route`
- 尚未 push / merge。
- 未执行 Supabase migration。
- 需要部署到 staging 后，用测试账号确认登录后停留 `/dashboard`，并检查 `/api/consultation/sessions` 返回 `200`。
