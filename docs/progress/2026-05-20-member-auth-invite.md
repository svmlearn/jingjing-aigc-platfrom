# 2026-05-20 成员端独立登录与邀请码注册

## 目标

补齐成员端自己的登录和注册入口：

- 成员使用“用户名 + 密码”登录，用户名可填写邮箱或手机号文本。
- 新成员通过成员端邀请码注册并绑定团队。
- 已有成员可继续输入其他团队邀请码。
- 多团队成员通过轻量团队选择页进入对应团队。

## 本地实现

分支：

- `codex/member-auth-invite`

提交：

- `cf44002 feat: add member login and invite registration`

主要改动：

- 新增产品文档：`docs/产品文档/V2.3.2-成员端独立登录与邀请码注册PRD.md`
- 新增成员登录页：`/member/login`
- 新增成员注册页：`/member/register`
- 新增团队选择页：`/member/teams`
- 新增 API：
  - `POST /api/auth/member-login`
  - `POST /api/auth/member-register-with-invite`
  - `GET /api/member/workspaces`
  - `POST /api/member/workspaces/select`
- 调整 `/member/invite`：
  - 未登录访问时跳转 `/member/register?code=...`
  - 已登录成员可用它加入其他团队
- 新增数据库迁移：`app/db/migrations/202605200001_member_multi_team_auth.sql`
  - 移除国内化 `app_users.email` 的邮箱格式约束，使其可承载邮箱或手机号文本用户名
  - 将 `merchant_team_members` 唯一约束从 `user_id` 改为 `(merchant_id, user_id)`
  - 增加成员按用户读取当前团队的索引

## 本地验证

通过：

```bash
cd app
npm run typecheck
npm run lint
npm run build
```

本地浏览器冒烟：

- `/member/login` 渲染正常。
- `/member/register?code=DEMO-MEMBER` 渲染正常，并预填邀请码。
- 未登录访问 `/member/calendar` 会跳转到 `/member/login?error=unauthenticated&next=%2Fmember%2Fcalendar`。
- 未登录访问 `/member/teams` 会跳转成员登录页。

## 远端推送

`main` 已快进到：

- `cf44002ff5caef5931a6f142a7bd9610764b8fb9`

已推送：

- Gitee `main`
- GitHub `main`

## 服务器部署

服务器：

- `ubuntu@8.154.28.41`

Release：

- `/srv/jingjing-domestic/releases/20260520125540-cf44002`

Current：

- `/srv/jingjing-domestic/current -> /srv/jingjing-domestic/releases/20260520125540-cf44002`

Release commit：

- `cf44002ff5caef5931a6f142a7bd9610764b8fb9`

数据库迁移：

```text
ALTER TABLE
DROP INDEX
CREATE INDEX
CREATE INDEX
```

迁移后 `merchant_team_members` 索引：

```text
idx_merchant_team_members_merchant_role
idx_merchant_team_members_user_status_updated
merchant_team_members_pkey
ux_merchant_team_members_merchant_user
```

部署说明：

- 先应用数据库迁移，再切换 release。
- 切换前检查 `video_edit_jobs` 无 in-flight 任务。
- 已重新构建 server release。
- 已重启：
  - `jingjing-domestic-app.service`
  - `jingjing-firered-openstoryline.service`
  - `jingjing-openstoryline-engine.service`
  - `jingjing-video-worker.service`

## 服务器验证

服务状态：

```text
jingjing-domestic-app.service: active
jingjing-firered-openstoryline.service: active
jingjing-openstoryline-engine.service: active
jingjing-video-worker.service: active
```

健康检查：

```text
GET http://8.154.28.41/api/health
ok=true
database.provider=postgres
storage.provider=aliyun_oss
```

页面检查：

```text
GET /member/login -> 200
GET /member/register?code=DEMO-MEMBER -> 200
GET /member/calendar -> 307 /member/login?error=unauthenticated&next=%2Fmember%2Fcalendar
```

OpenStoryline：

```text
GET http://127.0.0.1:8000/health -> status=ok, engine_adapter=fire_red
GET http://127.0.0.1:7860/ -> 200
```

成员注册 API 烟测：

- 临时创建测试邀请码。
- 调用 `POST /api/auth/member-register-with-invite`。
- 返回 `sessionEstablished=true` 且 `nextPath=/member/calendar`。
- 测试用户与测试邀请码已清理。

结果：

```text
member-register-smoke=ok
```

## 注意事项

- `docs/其他/` 仍为本地未跟踪目录，本轮没有 stage、commit、push 或部署。
- 部署过程中第一次复制 release 时误把 `current` symlink 本身复制成新 symlink，已纠正为真实 release 目录并重新 build；最终 current 指向真实目录 `/srv/jingjing-domestic/releases/20260520125540-cf44002`。
