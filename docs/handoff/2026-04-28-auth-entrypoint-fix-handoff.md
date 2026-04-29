# 2026-04-28 Auth Entrypoint Fix Handoff

## 当前目标

修正 staging 验收暴露的入口问题：

- 商家平台不能直接裸进工作台，需要先出现登录 / 邀请码注册入口。
- 平台后台不能把 `ADMIN_SETUP_SECRET` 初始化表单当成日常登录入口。

## 当前状态

- Branch：`codex/auth-entrypoint-fix`
- Worktree：`/Users/wy/.codex/worktrees/auth-entrypoint-fix`
- 状态：已实现 / 已本地验证 / 待用户确认是否合并部署

## 已完成

1. `/` 改成身份入口页。
2. 新增 `/login` 商家邮箱密码登录页。
3. 新增 `/logout` 商家退出路由。
4. `/dashboard` 在真实 Supabase 环境下要求已登录且绑定商户。
5. `/merchant/onboarding` 在真实 Supabase 环境下要求先登录。
6. 商家侧边栏移除跳平台后台的“演示商家”入口，改为商家账号和退出登录。
7. `/platform-admin-login` 默认展示邮箱密码登录。
8. 首次超管初始化移动到 `/platform-admin-login?mode=bootstrap`。

## 改动文件

```text
app/src/app/page.tsx
app/src/app/(auth)/login/page.tsx
app/src/app/(auth)/login/actions.ts
app/src/app/(auth)/logout/route.ts
app/src/app/(auth)/merchant/onboarding/page.tsx
app/src/app/dashboard/layout.tsx
app/src/app/platform-admin-login/page.tsx
app/src/components/app/dashboard-shell.tsx
docs/progress/2026-04-28-auth-entrypoint-fix.md
docs/handoff/2026-04-28-auth-entrypoint-fix-handoff.md
```

## 验证结果

在 `app/` 下：

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm build
```

结果：

- 全部通过。

本地 smoke：

- `/`：200，包含商家登录 / 邀请码注册 / 平台管理。
- `/login`：200，包含商家登录表单。
- `/platform-admin-login`：在非 localhost Host + 无 Supabase env 下返回后台登录页。

## 未完成 / 待确认

1. 未合并 main。
2. 未 push。
3. 未部署 staging。
4. 未创建真实平台管理员账号。

## 真实管理员账号说明

当前 staging 没有 `platform_admin_users` 记录，所以后台仍处于“首个超管待初始化”状态。

需要用户提供：

- 首个 `super_admin` 邮箱。
- 初始密码或设置密码方式。

然后可通过 `/platform-admin-login?mode=bootstrap` 使用 Vercel 已配置的 `ADMIN_SETUP_SECRET` 完成初始化。初始化完成后，日常入口 `/platform-admin-login` 就只走邮箱密码登录。

## 建议下一步

如果用户确认这版入口逻辑：

1. 合并 `codex/auth-entrypoint-fix` 到 `main`。
2. 推送 GitHub / Gitee `main`。
3. 部署 Vercel staging。
4. 用真实邮箱初始化首个 `super_admin`。
5. 跑 staging 验收：
   - 未登录访问 `/dashboard` 会跳 `/login`。
   - 商家 owner 登录后可进入工作台。
   - 后台默认是邮箱密码登录。
   - bootstrap 页面只在首个超管缺失时使用。

## Push / Merge

本轮 handoff 生成时：

- push：否
- merge：否
