# 2026-04-28 logout 预取导致商家端闪退修复

## 背景

商家登录 route 修复部署后，用户复测仍反馈：登录进入商家后台后马上退出。

## 线上证据

Vercel runtime logs 显示，进入 dashboard 后立刻出现：

```text
GET /logout 307
GET /api/consultation/sessions 401
```

用户没有主动点击退出，因此判断是 dashboard 侧边栏中的 `next/link` 指向 `/logout`，被 Next 预取或导航机制提前请求。由于 `/logout` 的 `GET` 会执行 `supabase.auth.signOut()`，预取请求本身就清掉了 session。

## 本次改动

- `app/src/components/app/dashboard-shell.tsx`
  - 将桌面端和移动端的退出入口从 `<Link href="/logout">` 改为普通 POST 表单。
- `app/src/app/(auth)/logout/route.ts`
  - `GET /logout` 改为无副作用，只 redirect 到 `/login`。
  - 新增 `POST /logout` 才真正执行 `supabase.auth.signOut()`。

## 验证

- `pnpm lint`：通过。
- `pnpm exec tsc --noEmit`：通过。
- `pnpm build`：通过。

## Supabase

本次不涉及 Supabase migration、表结构、RLS 或环境变量变更。
