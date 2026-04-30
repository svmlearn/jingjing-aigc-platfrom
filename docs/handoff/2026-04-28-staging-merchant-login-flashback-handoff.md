# 2026-04-28 staging 商家登录闪退 handoff

## 当前目标

修复 staging 上商家登录后短暂进入咨询首页、随后提示「登录状态已失效」并跳回登录页的问题。

用户已明确要求：先停止继续修复，只把定位和建议方案写成 handoff，交给下一位 AI 处理。

## 已完成内容

本轮已经推送并部署过以下相关提交：

- `59d9c15 fix: refresh supabase session in proxy`
  - 修改 `app/src/proxy.ts`。
  - 保留 Vercel 单次 deployment URL 跳稳定 alias 的逻辑。
  - 在 proxy 中新增 Supabase SSR session refresh：`createServerClient` + `getAll` / `setAll` + `supabase.auth.getUser()`。
- `c072a1d fix: stabilize merchant login session`
  - 新增 `app/src/components/app/merchant-login-form.tsx`。
  - 将 `/login` 页面里的商家登录表单改为浏览器端 `supabase.auth.signInWithPassword`，再调用 `/api/merchant-profile` 校验商户绑定。
  - 该提交已 push 到 Gitee `main`。
  - 该提交已部署到 Vercel staging alias。

当前 Vercel staging alias：

- `https://jingjing-content-platform-staging.vercel.app`
- inspect 显示 Ready，指向 deployment：`https://jingjing-content-platform-staging-eqd1q9euy.vercel.app`

## 当前仍然失败的现象

用户复测反馈：现在登录进去就闪退。

我在 in-app browser 里复测也看到相同现象：

1. 打开 `/login?next=/dashboard`。
2. 输入用户在聊天里提供的测试账号密码。
3. 点击登录后，没有稳定停留在 dashboard。
4. 最终回到：
   - `/login?error=unauthenticated&next=%2Fdashboard`

不要把测试账号密码写入代码、文档、commit message 或日志。需要复测时只在当前安全上下文里临时使用，或让用户重新提供。

## 已验证信息

本地检查在 `c072a1d` 前后通过：

- `pnpm lint`：通过。
- `pnpm exec tsc --noEmit`：通过。
- `pnpm build`：通过。

线上页面内容检查：

- `curl -sL https://jingjing-content-platform-staging.vercel.app/login?next=/dashboard` 已能看到 `MerchantLoginForm` 被打进页面的 RSC payload。
- HTML 初始表单是无 `action` 的普通 `<form>`，依赖客户端 hydration 后的 `onSubmit` 执行登录。

一个重要中间现象：

- 只部署 `59d9c15` 之后，我曾用独立 CDP 后台 tab 登录，看到 `/api/consultation/sessions` 返回 `200`，页面也停在咨询诊断页。
- 但用户可见的 in-app browser 标签页仍会闪退。
- 追加 `c072a1d` 后，用户和我的 in-app browser 复测仍会回到 unauthenticated 登录页。
- 所以当前修复不可靠，不能作为完成状态。

## 我的判断

问题核心仍在「登录完成后，dashboard 服务端布局 / 后续 API route 读不到稳定的 Supabase session cookie」。

目前做过的两个方向都不够稳：

1. Server Action 登录：
   - `app/src/app/(auth)/login/actions.ts` 中 `signInToMerchant` 使用 `createSupabaseServerClient()` 后 `redirect(next)`。
   - 疑似 Server Action 写 cookie 到 redirect 响应在当前部署 / 浏览器上下文里没有稳定传给后续 dashboard 和 API。

2. 客户端登录组件：
   - `MerchantLoginForm` 依赖 React hydration 后的 `onSubmit`。
   - 线上初始 HTML 的 form 没有 `action`，如果 hydration 未完成、被浏览器默认提交、或前后跳转竞态出现，仍可能回到旧的 unauthenticated 流程。
   - 即便客户端 `signInWithPassword` 成功，也还需要确认后续 server layout 是否一定能在同一次跳转中读到 cookie。

因此下一步建议不要继续在当前 Client Component 方案上打补丁，而是改成无需 hydration 的传统 POST 登录 route。

## 建议解决方案

建议新增一个显式 route handler：

- `app/src/app/api/auth/merchant-login/route.ts`

让 `/login` 页面表单改成：

```tsx
<form action="/api/auth/merchant-login" method="post">
  <input type="hidden" name="next" value={next} />
  ...
</form>
```

route handler 里自己创建 `NextResponse.redirect(...)`，并把 Supabase 写出的 cookies 明确挂到这个 redirect response 上。

关键点不是简单复用现在的 `createSupabaseServerClient()`，而是要在 route handler 内按 request/response 显式接线：

```ts
let response = NextResponse.redirect(new URL(next, request.url), 303);

const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
  cookies: {
    getAll() {
      return request.cookies.getAll();
    },
    setAll(cookiesToSet, headers) {
      cookiesToSet.forEach(({ name, value, options }) => {
        response.cookies.set(name, value, options);
      });

      Object.entries(headers).forEach(([key, value]) => {
        response.headers.set(key, value);
      });
    },
  },
});
```

完整逻辑建议：

1. `POST /api/auth/merchant-login`
   - 读取 `email` / `password` / `next`。
   - `next` 继续沿用现有 safe path 规则：必须以 `/` 开头，不能是 `//`，不能进入 `/platform-admin`。
   - 缺邮箱或密码：`303` 到 `/login?error=invalid-credentials&next=...`。
2. 调用 `supabase.auth.signInWithPassword({ email, password })`。
   - 失败：`303` 到 `/login?error=invalid-credentials&next=...`。
   - 成功：Supabase 的 `setAll` 应该把 `sb-...-auth-token` cookies 写到同一个 redirect response。
3. 调用 `getOperationalMerchantProfileByOwnerUserId(data.user.id)` 校验商户绑定。
   - 如果没有商户绑定，准备 redirect 到 `/login?error=no-merchant-profile`。
   - 最好在同一个 response 接线里调用 `supabase.auth.signOut()`，确保清掉刚写入的 Supabase cookie。
4. 成功后返回 `303` 到 safe `next`。
5. `/login` 页面可以回退为 server-rendered 表单，或保留一个纯展示组件，但不要依赖客户端 JS 才能完成登录。

这个方案的目标是让登录响应本身携带 `Set-Cookie + Location: /dashboard`，避免 Server Action / hydration / 客户端跳转之间的竞态。

## 建议验证清单

不要把密码写入文档或 commit。

最小验证：

1. `pnpm lint`
2. `pnpm exec tsc --noEmit`
3. `pnpm build`
4. 本地或 staging 登录：
   - 先访问 `/logout` 清状态。
   - 打开 `/login?next=/dashboard`。
   - 用用户提供的测试账号登录。
   - 最终 URL 应停在 `/dashboard`。
   - 页面不出现「登录状态已失效，请重新登录」。
   - 在浏览器上下文执行：
     - `fetch('/api/consultation/sessions', { cache: 'no-store', credentials: 'same-origin' })`
     - 期望 status 为 `200`。
5. 用 `curl -i -X POST /api/auth/merchant-login` 或浏览器 Network 检查：
   - 登录成功响应应为 `303`。
   - 响应应带 `Set-Cookie`，cookie 名类似 `sb-...-auth-token`。
   - 不要在日志中输出 cookie 值。

## 文件边界

建议下一位 AI 主要修改：

- `app/src/app/(auth)/login/page.tsx`
- `app/src/app/api/auth/merchant-login/route.ts`（新增）
- 可选：删除或改造 `app/src/components/app/merchant-login-form.tsx`
- 可选：保留 `app/src/app/(auth)/login/actions.ts`，也可以确认无引用后删除
- `docs/progress/2026-04-28-supabase-session-refresh-proxy.md` 或新增 progress 记录最终验证结果

不要动这些与当前问题无关的本地脏文件：

- `.gitignore`
- `AGENTS.md`
- `docs/README.md`
- `.codex/`
- `docs/progress/2026-04-28-tencent-cloud-mdeploy-access.md`
- `docs/探索/2026-04-28-热点抓取与咨询Agent优化待验证事项.md`
- `docs/需求池.md`

## 分支 / 远端 / 部署状态

- 当前分支：`main`
- 最新相关 commit：`c072a1d fix: stabilize merchant login session`
- Gitee：已 push 到 `main`
- Vercel staging：已部署且 Ready
- Supabase：本轮没有 migration，没有执行 DDL

## 交接状态

当前不是完成状态。

请下一位 AI 从「新增明确 POST 登录 route handler，并把 Supabase cookies 写进 redirect response」这个方案开始，不要误以为 `c072a1d` 已经解决了线上闪退。
