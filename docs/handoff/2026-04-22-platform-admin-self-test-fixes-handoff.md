# 2026-04-22 Platform Admin Self-Test Fixes Handoff

## 1. 当前目标

在 `platform-admin foundation` 这轮未提交改动上做一次更可靠的本地自测，并把已经确认的问题先修掉，避免下一位接手时继续基于有明显缺口的页面骨架往前推。

## 2. 当前分支 / 工作区

- 当前分支：`main`
- 当前仍是主目录脏工作区
- 本轮没有切 worktree

说明：

- 因为这次要直接在上一轮尚未提交的 platform-admin 改动上继续修和测
- 如果切新 worktree，会天然丢失这批未提交基线
- 所以本轮选择在当前脏工作区继续收口，并补充 handoff / progress 留痕

## 3. 本轮已完成

### 3.1 平台管理台页面守门

新增：

- `app/src/lib/auth/platform-admin-session.ts`
- `app/src/app/platform-admin-login/actions.ts`
- `app/src/app/platform-admin-login/page.tsx`

更新：

- `app/src/app/platform-admin/layout.tsx`
- `app/src/components/platform-admin/platform-admin-shell.tsx`

结果：

- `/platform-admin/**` 页面不再直接裸露
- 未通过 session 时会重定向到 `/platform-admin-login`
- 当前先用 `ADMIN_SETUP_SECRET` 做 demo 级页面访问守门
- 管理台壳层补了退出入口

### 3.2 商家工作台不再直接暴露平台管理台入口

更新：

- `app/src/components/app/dashboard-shell.tsx`

结果：

- 商家工作台侧栏与移动端头部里都不再直接展示平台管理台入口

### 3.3 商户详情页不再错误回退

更新：

- `app/src/app/platform-admin/merchants/[merchantId]/page.tsx`
- `app/src/components/platform-admin/platform-admin-content.tsx`
- `app/src/lib/ui/platform-admin-mock.ts`

结果：

- mock 商户查不到时改为 `notFound()`
- 不再静默回退到第一家商户

### 3.4 平台管理台导航高亮修正

更新：

- `app/src/components/platform-admin/platform-admin-shell.tsx`

结果：

- “总览”只会在 `/platform-admin` 根路径高亮
- 子页不会再和“总览”同时高亮

### 3.5 平台管理台后端类型错误修复

更新：

- `app/src/lib/db/platform-admin-repository.ts`

结果：

- `updatePlatformSettings()` 输入类型收紧
- Supabase 返回值断言改成更稳的 `unknown -> row type`
- 这轮前一版会卡住 `tsc/build` 的编译错误已经消除

## 4. 验证结果

### 4.1 已通过

- `pnpm exec tsc --noEmit --pretty false`
- `pnpm build`

### 4.2 运行态检查已做

基于 `pnpm start --port 3100` 做了最小验证：

- `GET /platform-admin`
  - 返回 `307`
  - 正确跳到 `/platform-admin-login`
- `GET /platform-admin-login`
  - 返回 `200`
- 当前环境未配置 `ADMIN_SETUP_SECRET`
  - 登录页进入禁用态
  - 页面解释当前不可登录原因
- `GET /dashboard/import`
  - 页面内容中已经搜不到“平台管理台”字样

### 4.3 仍未正式确认

- `eslint`

现象：

- 在当前环境里仍然超时，拿不到稳定完成结果

结论：

- 本轮可以确认 `tsc/build` 通过
- 但**不能宣称 lint 已通过**

## 5. 关键边界 / 下一位要注意什么

### 5.1 页面守门和 API 鉴权还不是同一套

现在是：

- 页面：platform admin session cookie
- API：`ADMIN_SETUP_SECRET` header

这只适合当前页面还是 mock / demo 级阶段。

如果下一位要继续做：

- 平台管理台页面接真实 API
- 邀请码真实提交
- 商户真实启停
- 平台 settings 真实保存

那么继续前进前最好先统一 admin auth 方案，否则会出现：

- 页面能进
- 浏览器里直接调 `/api/platform-admin/**` 却过不了

### 5.2 当前环境没有 `ADMIN_SETUP_SECRET`

所以本轮没有验证“输入口令 -> 建 session -> 进入平台管理台”这条正向流程，只验证了：

- 未授权时正确跳登录页
- 未配置 secret 时正确展示禁用态

如果下一位想补这段验证，需要在可控环境里显式提供 `ADMIN_SETUP_SECRET`。

## 6. 建议下一步顺序

建议继续时按这个顺序推进：

1. 先决定平台管理台正式 auth 方案是否现在就补
2. 如果暂时不补正式 auth，至少把页面访问和 API 调用统一到同一套 demo session 方式
3. 再把 `platform-admin` 页面从 mock 切到真实 API
4. 然后补一轮包含 `eslint` 的完整验证
5. 最后再考虑 commit

## 7. 改动文件

本轮新增 / 更新的核心文件：

- `app/src/lib/auth/platform-admin-session.ts`
- `app/src/app/platform-admin-login/actions.ts`
- `app/src/app/platform-admin-login/page.tsx`
- `app/src/app/platform-admin/layout.tsx`
- `app/src/app/platform-admin/merchants/[merchantId]/page.tsx`
- `app/src/components/platform-admin/platform-admin-shell.tsx`
- `app/src/components/platform-admin/platform-admin-content.tsx`
- `app/src/components/app/dashboard-shell.tsx`
- `app/src/lib/ui/platform-admin-mock.ts`
- `app/src/lib/db/platform-admin-repository.ts`
- `docs/progress/2026-04-22-platform-admin-self-test-fixes.md`

## 8. 最终提交状态

- 未 commit
- 未 push
- 未 merge

最终 commit：

- 无
