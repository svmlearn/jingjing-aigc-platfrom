# 2026-04-28 Supabase session refresh proxy 修复

## 背景

用户反馈：商家账号登录后能进入咨询页，但很快出现「登录状态已失效，请重新登录」，随后回到登录页。

现象说明：

- `/dashboard` 服务端页面已经能通过登录校验并渲染咨询页。
- 咨询页客户端请求 `/api/consultation/sessions` 时返回 `401 UNAUTHENTICATED`。
- 这说明页面渲染和后续 API 请求没有稳定共享同一份 Supabase session cookie。

## 根因判断

项目此前只有页面 / route handler 内的 `createServerClient`，没有在 Next proxy / middleware 层执行 Supabase session refresh。

Supabase SSR 文档和本地依赖类型说明都明确提示：如果 pages / route handlers 无法可靠写回 cookie，必须在 middleware / proxy 中实现 `getAll` / `setAll`，否则容易出现随机登出、提前 session 失效、刷新 token 后 cookie 没有写回等问题。

## 本次改动

- 修改 `app/src/proxy.ts`：
  - 保留原有 staging 单次 deployment URL 跳稳定 alias 的逻辑。
  - 新增 `createServerClient`。
  - 在 proxy 中通过 `request.cookies.getAll()` 读取 Supabase cookie。
  - 在 `setAll` 中同步更新 request cookies 和 response cookies。
  - 每次请求调用 `supabase.auth.getUser()`，让 Supabase SSR 有机会刷新并写回 session cookie。
- 追加修改商家登录入口：
  - 新增 `app/src/components/app/merchant-login-form.tsx`。
  - `/login` 页面保留原视觉结构，但登录提交改为浏览器端 `signInWithPassword`。
  - 登录成功后调用 `/api/merchant-profile` 校验商户绑定，再进入目标页面。
  - 这样 session cookie 由当前浏览器直接写入，避免 Server Action 写 cookie 在部分浏览器上下文中没有稳定传给后续 API 的问题。

## 验证

- `pnpm lint`：通过。
- `pnpm exec tsc --noEmit`：通过。
- `pnpm build`：通过，构建输出包含 `ƒ Proxy (Middleware)`。

## 状态

- `59d9c15 fix: refresh supabase session in proxy` 已 push 到 Gitee `main`，并部署到 Vercel staging。
- 追加的浏览器端商家登录修复待 commit / push / Vercel staging 部署。
- 本次无 Supabase migration。
