# 2026-04-28 商家入口与平台后台登录体验修正

## 背景

用户在 staging 验收时发现两个入口问题：

1. 访问商家平台根路径会直接进入工作台，缺少“商家登录 / 邀请码注册”的入口判断。
2. 平台后台因为 staging 还没有真实管理员账号，登录页直接展示 `ADMIN_SETUP_SECRET` 初始化表单，体验上像仍在使用口令登录。

## 分支

- Worktree：`/Users/wy/.codex/worktrees/auth-entrypoint-fix`
- Branch：`codex/auth-entrypoint-fix`
- 基线：`6e960dd docs: record staging deploy and gitee sync`

## 已完成改动

### 商家端

- 根路径 `/` 不再直接 `redirect("/dashboard")`。
- 新增身份入口页：
  - 商家登录：`/login`
  - 邀请码注册：`/register`
  - 平台管理：`/platform-admin-login`
- 新增商家邮箱密码登录页 `/login`。
- 新增 `/logout`，用于商家退出登录。
- `/dashboard` layout 在真实 Supabase 环境下检查：
  - 必须有 Supabase Auth 会话。
  - 当前用户必须绑定可运营商户。
  - 未登录时跳转 `/login?error=unauthenticated&next=/dashboard`。
  - 没有商户绑定时退出会话并跳转 `/login?error=no-merchant-profile`。
- `/merchant/onboarding` 在真实 Supabase 环境下要求先登录。
- 商家侧边栏底部从“演示商家 -> 平台后台”改为“商家账号 / 退出登录”，避免商家端和平台后台入口混在一起。

### 平台后台

- `/platform-admin-login` 默认展示邮箱密码登录。
- 当 `platform_admin_users` 为空时，不再把初始化表单作为默认主界面。
- 首次初始化入口改为显式链接：
  - `/platform-admin-login?mode=bootstrap`
- 初始化仍需要 `ADMIN_SETUP_SECRET`，但只作为“首次部署初始化”保护，不作为日常登录方式。
- 管理员日常登录仍是 Supabase Auth 邮箱密码 + `platform_admin_users` RBAC。

## 未做

- 未创建真实平台管理员账号。
- 未修改 Supabase migration。
- 未修改 Vercel 环境变量。
- 未合并 main。
- 未 push。
- 未部署 staging。

说明：真实首个 `super_admin` 需要用户指定邮箱和初始密码；不能由代码或 Agent 随意编造。

## 验证

在 `app/` 下执行：

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm build
```

结果：

- 依赖安装通过。
- `pnpm lint` 通过。
- `pnpm build` 通过。
- Next.js route 输出新增：
  - `/login`
  - `/logout`

本地生产服务：

```bash
pnpm start --hostname 127.0.0.1 --port 3013
```

轻量 smoke：

- `/` 返回 200，并包含“商家登录 / 邀请码注册 / 平台管理”。
- `/login` 返回 200，并包含“登录商家工作台 / 使用邀请码注册”。
- `/platform-admin-login` 在无 Supabase env 的本地非 localhost Host 下返回后台邮箱密码登录页。

备注：

- 本地 localhost 因 demo runtime 会自动视为本地演示超管，`/platform-admin-login` 会跳转后台；因此后台 bootstrap 表单需在 staging 或带完整 Supabase env 的环境继续验收。

## 后续建议

1. 用户确认真实首个平台管理员邮箱与初始密码。
2. 合并该分支到 main。
3. 推送 GitHub / Gitee `main`。
4. 部署 Vercel staging。
5. 在 staging 完成：
   - `/` 入口选择验收。
   - 未登录访问 `/dashboard` 应跳 `/login`。
   - `/login` 能用商家 owner 账号进入。
   - `/platform-admin-login` 默认邮箱密码登录。
   - `/platform-admin-login?mode=bootstrap` 仅用于创建首个 `super_admin`。
