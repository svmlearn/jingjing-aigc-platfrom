# 2026-04-22 Platform Admin Self-Test Fixes

## 本轮目标

针对 `2026-04-22-platform-admin-foundation-zero-memory-handoff.md` 做一轮真正的本地自测，并把自测中已经确认的问题先修到一个更稳的状态。

## 自测先发现的问题

### 1. 平台管理台页面直接暴露

- `/platform-admin` 页面域没有页面级守门
- 商家工作台里还直接放了“平台管理台”入口
- 当前虽然还是 mock 页面，但一旦后续接真数据，这会变成明显越权入口

### 2. 商户详情页存在错误回退

- `getAdminMerchant(merchantId)` 在查不到商户时会回退到第一条 mock 商户
- 导致错误 URL 会展示成另一家商户，而不是 404

### 3. 平台管理台导航高亮不准确

- “总览”使用了 `pathname.startsWith("/platform-admin/")`
- 导致进入子页面时“总览”和当前子页面同时高亮

### 4. 后端第一刀还有未收口的类型问题

通过 `tsc` / `build` 进一步确认：

- `platform-admin/settings` 路由传入 `updatePlatformSettings()` 的输入类型过宽
- `platform-admin-repository` 里对 Supabase 返回值的断言不够安全，TypeScript 会报错

## 已完成修复

### 1. 给平台管理台补了 demo 级页面守门

新增：

- `app/src/lib/auth/platform-admin-session.ts`
- `app/src/app/platform-admin-login/actions.ts`
- `app/src/app/platform-admin-login/page.tsx`

调整：

- `app/src/app/platform-admin/layout.tsx`

结果：

- `/platform-admin/**` 页面现在会先检查平台管理 cookie session
- 未通过时重定向到 `/platform-admin-login`
- 登录页先用 `ADMIN_SETUP_SECRET` 建立 demo 级页面访问 session
- 当前环境如果没有配置 `ADMIN_SETUP_SECRET`，登录页会进入“不可登录但可解释当前状态”的禁用态

### 2. 收紧商家工作台入口

更新：

- `app/src/components/app/dashboard-shell.tsx`

结果：

- 商家工作台不再直接展示平台管理台入口
- 减少误点和越权引导

### 3. 修复商户详情页错误回退

更新：

- `app/src/app/platform-admin/merchants/[merchantId]/page.tsx`
- `app/src/components/platform-admin/platform-admin-content.tsx`
- `app/src/lib/ui/platform-admin-mock.ts`

结果：

- mock 查不到商户时不再回退到第一家
- 页面改为走 `notFound()`

### 4. 修复导航高亮

更新：

- `app/src/components/platform-admin/platform-admin-shell.tsx`

结果：

- “总览”只在 `/platform-admin` 精确命中时高亮
- 其余子页面保持原先的前缀匹配逻辑

### 5. 修复当前已落地代码中的类型错误

更新：

- `app/src/lib/db/platform-admin-repository.ts`

结果：

- `updatePlatformSettings()` 改为接受真正的 settings update 输入类型
- Supabase 返回值断言改成更安全的 `unknown -> row type`

## 本轮验证结果

### 已通过

- `pnpm exec tsc --noEmit --pretty false`
- `pnpm build`

### 运行态检查

使用 `pnpm start --port 3100` 本地启动后确认：

- `GET /platform-admin` 返回 `307`，重定向到 `/platform-admin-login`
- `GET /platform-admin-login` 返回 `200`
- 当前环境未配置 `ADMIN_SETUP_SECRET`，登录页会正确进入禁用态
- `GET /dashboard/import` 页面内容里已搜不到“平台管理台”字样

### 仍未完全确认

- `eslint` 在当前本地环境里仍然超时，没有拿到稳定完成结果
- 因此这轮可以说 `tsc/build` 已通过，但**不能把 lint 说成已正式通过**

## 当前仍需注意的边界

### 1. 页面访问与 API 访问还不是同一套 auth

现在是：

- 页面：cookie session
- API：`ADMIN_SETUP_SECRET` header

这适合当前 demo 级守门，但不适合长期继续。

后续平台管理台前端从 mock 切到真实 API 前，要先统一成一套真正的 admin session / RBAC 方案，否则页面能进、接口不能调。

### 2. 这不是正式平台管理员体系

当前方案只是为了先把“页面直接裸露”这个问题压下去，不等于已经完成：

- `platform_admin_users`
- 正式登录态
- RBAC
- 审计追踪里的真实管理员身份

