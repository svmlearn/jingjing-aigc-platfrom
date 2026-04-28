# 2026-04-28 staging 登录态域名与咨询会话 401 修复

## 背景

用户反馈：注册 / 登录后进入咨询首页，页面仍提示 `Please sign in first.`。浏览器 Network 截图显示请求地址为：

```text
https://jingjing-content-platform-staging-lptrbpz4q.vercel.app/api/consultation/sessions
```

该地址是 Vercel 单次 deployment URL。它会随部署变化，和稳定 staging alias `https://jingjing-content-platform-staging.vercel.app` 不共享浏览器 cookie，容易造成“看起来进了页面，但 API 读不到登录态”。

同时，咨询页在 `GET /api/consultation/sessions` 失败后，仍会把 `sessions.length === 0` 判断成“没有会话”，继续自动 `POST /api/consultation/sessions`，导致 401 错误反复出现。

## 本次改动

- 新增 `app/src/proxy.ts`：
  - 将 `jingjing-content-platform-staging-*.vercel.app` 自动 308 跳转到稳定 staging alias。
  - 避免用户继续在单次 deployment URL 上登录和使用。
- 修改 `app/src/components/merchant/consultation-workspace.tsx`：
  - 所有咨询页 API fetch 显式使用 `credentials: "same-origin"`。
  - 401 时跳转 `/login?error=unauthenticated&next=<current-path>`。
  - 只有会话列表成功加载且确实为空时，才自动创建新会话。
  - 避免 GET 401 后继续触发 POST 401 循环。

## 验证

- `pnpm lint`：通过。
- `pnpm exec tsc --noEmit`：通过。
- `pnpm build`：通过，构建输出包含 `ƒ Proxy (Middleware)`。
- 本地 `next start -p 3100` 后用 Host 头验证：
  - `Host: jingjing-content-platform-staging-lptrbpz4q.vercel.app` 访问 `/dashboard` 返回 `308 Permanent Redirect`。
  - `Location: https://jingjing-content-platform-staging.vercel.app/dashboard`。

## 状态

- 待 commit / push / Vercel staging 部署。
- 本次无 Supabase migration。
