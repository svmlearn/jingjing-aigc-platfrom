# 2026-04-28 merchant-login-route handoff

## 当前目标

修复商家后台登录后闪退到 `/login?error=unauthenticated&next=%2Fdashboard` 的问题。

## 已完成

- 新增 `app/src/app/api/auth/merchant-login/route.ts`。
- 将商家登录表单改为无需客户端 JS 的 POST 表单。
- 登录成功响应现在由 route handler 返回 `303 + Set-Cookie + Location`。
- 已跑通过 lint、TypeScript 和生产 build。

## 改动文件

- `app/src/app/api/auth/merchant-login/route.ts`
- `app/src/components/app/merchant-login-form.tsx`
- `docs/progress/2026-04-28-merchant-login-route-cookie-fix.md`
- `docs/handoff/2026-04-28-merchant-login-route-handoff.md`

## 分支 / worktree

- 分支：`codex/merchant-login-route`
- worktree：`/Users/wy/.codex/worktrees/merchant-login-route`

## 验证结果

- `pnpm install --frozen-lockfile`：通过。
- `pnpm lint`：通过。
- `pnpm exec tsc --noEmit`：通过。
- `pnpm build`：通过。

## 下一步建议

1. 部署该分支到 staging。
2. 访问 `/logout` 清旧状态。
3. 访问 `/login?next=/dashboard` 并用测试账号登录。
4. 确认最终停在 `/dashboard`。
5. 在浏览器执行 `fetch('/api/consultation/sessions', { cache: 'no-store', credentials: 'same-origin' })`，期望 status 为 `200`。

## push / merge

- 当前未 push。
- 当前未 merge。
