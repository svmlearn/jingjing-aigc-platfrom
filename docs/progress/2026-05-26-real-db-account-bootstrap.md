# 2026-05-26 real DB account bootstrap

## Scope

在阿里云真实服务器当前运行环境中补齐两个登录账号：

- 商家端账号：`shaokao@163.com`
- 平台后台账号：`jingjing@163.com`

本记录不保存明文密码、数据库连接串、密码哈希或任何密钥值。

## Target

- ECS：`ubuntu@8.154.28.41`
- Release：`/srv/jingjing-domestic/current -> /srv/jingjing-domestic/releases/20260526162411-17cd93e`
- App env：`/srv/jingjing-domestic/shared/env/app.env`
- DB：阿里云 RDS PostgreSQL，`jingjing_domestic`
- Runtime：`jingjing-domestic-app.service`

## Execution

执行方式：

1. 按 `web-access` 前置要求确认 Chrome CDP proxy 可用。
2. 通过 SSH 进入 ECS。
3. 使用 root 权限读取 root-only app env，只在进程内加载 `APP_DATABASE_URL`。
4. 用项目现有 `app/scripts/create-domestic-password-hash.mjs` 生成 PBKDF2 密码哈希。
5. 通过 `psql` 在一个事务中幂等写入/确认账号、角色和关系。

商家账号写入结果：

- `app_users.email = shaokao@163.com`
- `app_users.role = merchant_owner`
- `app_users.status = active`
- `merchant_profiles.name = 烧烤商家`
- `merchant_profiles.industry = 餐饮`
- `merchant_profiles.status = active`
- `merchant_team_members.role = owner`
- `merchant_team_members.status = active`

平台后台账号写入结果：

- `platform_admin_users.email = jingjing@163.com`
- 因平台管理员表此前已被首次脚本提交出首个后台账号，最终幂等确认时为 `updated`
- 最终角色：`super_admin`
- 最终状态：`active`

注意：第一次长 Node 维护脚本没有把结果输出回本地，但后续只读/幂等写入显示账号已经存在；第二次 `psql` 事务重新确认并更新了同一批账号的密码哈希、角色和状态。

## Verification

DB 计数验证：

```text
merchant_user_count = 1
merchant_profile_count = 1
merchant_owner_membership_count = 1
admin_user_count = 1
admin_role = super_admin
active_super_admin_count = 1
```

密码哈希验证：

```text
shaokao@163.com: role=merchant_owner, status=active, passwordOk=true
jingjing@163.com: role=super_admin, status=active, passwordOk=true
```

登录验证：

- 商家端 HTTP 登录：`POST /api/auth/merchant-login` 返回 `303 -> /dashboard`
- 浏览器 CDP 商家登录：`http://8.154.28.41/login` 成功进入 `/dashboard/consultation`，页面显示 `烧烤商家 咨询诊断`
- 浏览器 CDP 平台后台登录：`http://8.154.28.41/platform-admin-login` 成功进入 `/platform-admin`，页面显示 `平台超管 / super_admin`

## Push / Merge

- 本次账号初始化没有改 app runtime 代码。
- 本次账号初始化没有重启服务。
- 本次账号初始化执行时没有 push / merge；本文件后续作为执行记录进入 Git。
