# 2026-04-28 商家登录闪退最终解决记录

## 结论

商家后台“登录后马上闪退”的最终根因不是 Supabase 表结构、RLS、商户绑定数据，也不是账号密码问题。

真正原因是：

```text
商家后台退出登录入口使用了 <Link href="/logout">
而 /logout 的 GET 请求会执行 supabase.auth.signOut()
Next 可能预取或提前请求该链接
于是用户刚进入 dashboard，GET /logout 就清掉了 session
随后客户端请求 /api/consultation/sessions 返回 401
页面再跳回 /login?error=unauthenticated&next=%2Fdashboard
```

最终修复原则：

```text
GET 请求不能产生退出登录这类副作用。
真正退出登录必须改成 POST。
```

## 现象

用户反馈：

- 商家账号可以登录。
- 登录后短暂进入商家后台。
- 随后马上退出，回到登录页。

最终回落地址类似：

```text
/login?error=unauthenticated&next=%2Fdashboard
```

## 排查过程

### 1. 第一阶段：先修登录 cookie 写入链路

前一轮先怀疑登录成功后 Supabase session cookie 没有稳定写入后续 dashboard 请求。

因此新增了：

- `app/src/app/api/auth/merchant-login/route.ts`
- `app/src/components/app/merchant-login-form.tsx`

核心改法：

- 登录表单从客户端 `signInWithPassword + router.push` 改为普通 POST。
- `POST /api/auth/merchant-login` 在服务端用 `createServerClient` 登录。
- 登录成功后同一个 `303` redirect response 写入 Supabase auth cookies。

对应提交：

```text
0472104 fix: make merchant login set cookies on redirect
```

这一步是合理的稳定性补强，但不是最终闪退根因。

### 2. 第二阶段：线上日志定位真正登出来源

用户复测后仍然闪退，于是查看 Vercel runtime logs。

关键日志顺序：

```text
GET /dashboard 200
GET /logout 307
GET /api/consultation/sessions 401
GET /login 200
```

用户没有主动点击退出登录，因此 `GET /logout` 是异常请求。

代码中发现：

- `app/src/components/app/dashboard-shell.tsx`
  - 桌面端和移动端退出按钮都写成了 `<Link href="/logout">`
- `app/src/app/(auth)/logout/route.ts`
  - `GET /logout` 会直接执行 `supabase.auth.signOut()`

这意味着只要 Next 对 `/logout` 做预取、预加载或提前请求，就会清掉用户 session。

## 最终改动

### 1. 退出入口改为 POST 表单

文件：

```text
app/src/components/app/dashboard-shell.tsx
```

改动：

- 桌面端退出入口从 `<Link href="/logout">` 改为：

```tsx
<form action="/logout" method="post">
  <button type="submit">退出登录</button>
</form>
```

- 移动端退出入口也同样改为 POST 表单。

### 2. GET /logout 改为无副作用

文件：

```text
app/src/app/(auth)/logout/route.ts
```

改动：

- `GET /logout` 只 redirect 到 `/login`，不再 `signOut()`。
- 新增 `POST /logout`，只有 POST 才执行：

```ts
await supabase.auth.signOut();
redirect("/login");
```

对应提交：

```text
1265bd3 fix: prevent logout prefetch from clearing session
```

## 验证

本地验证：

```text
pnpm lint
pnpm exec tsc --noEmit
pnpm build
```

结果：全部通过。

线上部署：

```text
https://jingjing-content-platform-staging.vercel.app
```

最终部署记录：

```text
https://jingjing-content-platform-staging-it46ly2if.vercel.app
```

额外确认：

```text
GET /logout
```

线上现在只返回：

```text
307 Location: /login
```

不再返回清 session 的 `Set-Cookie`。

用户复测结果：

```text
已确认：登录后不再闪退，可以正常停留在商家后台。
```

## Supabase 结论

本次最终修复不需要修改 Supabase。

未涉及：

- Supabase migration
- 表结构
- RLS policy
- 商户数据
- 邀请码数据
- Supabase 环境变量

## 后续规则

以后项目内需要避免：

```text
GET route 里做 signOut、delete、update、redeem、publish 等有副作用动作。
```

建议规则：

- 页面跳转、读取、展示：可以用 GET。
- 登出、删除、保存、发布、兑换：必须用 POST / PATCH / DELETE。
- 不要用 `next/link` 指向有副作用的 route。
- 如果一定要提供 GET fallback，只允许做无副作用 redirect 或展示确认页。

## 相关文件

- `app/src/app/api/auth/merchant-login/route.ts`
- `app/src/components/app/merchant-login-form.tsx`
- `app/src/components/app/dashboard-shell.tsx`
- `app/src/app/(auth)/logout/route.ts`
- `docs/progress/2026-04-28-merchant-login-route-cookie-fix.md`
- `docs/progress/2026-04-28-logout-prefetch-flashback-fix.md`
