# 2026-04-28 商家入口修正 staging 部署与首个超管初始化

## 目标

修正 staging 入口体验并完成首个真实平台超管初始化：

1. 商家平台根路径不再直接进入工作台。
2. `/platform-admin-login` 默认只展示邮箱密码登录，不展示初始化口令、显示名称等 bootstrap 字段。
3. 为 staging 创建首个 `super_admin`。

## 代码与部署

- Branch：`main`
- Commit：`5305fca fix: add merchant auth entrypoints`
- GitHub：已推送 `main`
- Gitee：已推送 `main`
- Vercel Project：`jingjing-content-platform-staging`
- Deployment ID：`dpl_SMskNpZA5Kmbwje2FPy7Rz1x3H1N`
- Deployment URL：`https://jingjing-content-platform-staging-bh1yra5th.vercel.app`
- Staging alias：`https://jingjing-content-platform-staging.vercel.app`
- 状态：Ready

本轮部署后，Vercel 云端 `next build` 通过，route 输出新增/确认：

- `/`
- `/login`
- `/logout`
- `/platform-admin-login`

## 首个平台超管

- 邮箱：`ywangyangw@163.com`
- 角色：`super_admin`
- 状态：`active`
- 显示名：`平台超管`

安全说明：

- 初始密码由用户在对话中提供，仅用于创建 Supabase Auth 用户。
- 密码未写入代码、文档、提交或进度记录。
- 未输出 Supabase service role key、Vercel env 或数据库连接串。

## 执行方式

1. 使用 `web-access` CDP 浏览器操作用户已登录的 Supabase Dashboard。
2. 在 `Authentication / Users` 里创建 Auth 用户。
3. 通过 Supabase MCP SQL 写入 `platform_admin_users` 业务身份记录：
   - `auth_user_id = 21a5f175-9969-49fe-8876-a1340f73dd5c`
   - `email = ywangyangw@163.com`
   - `role = super_admin`
   - `status = active`
4. 使用 staging `/platform-admin-login` 表单完成真实登录验证。

## 验证结果

### 后台登录页

访问：

```text
https://jingjing-content-platform-staging.vercel.app/platform-admin-login
```

结果：

- 页面标题为“进入平台管理台”。
- 页面包含“登录平台管理台”。
- 默认页面不再出现：
  - `初始化口令`
  - `显示名称`
  - `创建 super_admin`

### 商家工作台守卫

访问：

```text
https://jingjing-content-platform-staging.vercel.app/dashboard
```

结果：

- 未登录时返回 `307`。
- 跳转到 `/login?error=unauthenticated&next=/dashboard`。

### 平台超管登录

使用 `ywangyangw@163.com` 登录 staging 后：

- 成功进入 `/platform-admin`。
- 页面显示：
  - `平台超管`
  - `super_admin`
- 未出现登录错误。

## 后续建议

1. 用户自行妥善保存并定期轮换首个超管密码。
2. 后续管理员账号统一在平台后台「系统配置」里由 `super_admin` 创建和维护。
3. Gitee 仍建议将默认分支切到 `main`，避免协作者打开旧 `master`。
