# 2026-04-28 GitHub / Gitee / Vercel staging 同步记录

## 目标

把当前 `main` 的 V2.2 集成结果同步到远端，并部署到 Vercel staging。

## 本次基线

- 本地分支：`main`
- 本次推送 HEAD：`fca0cc828c256ab5c6b43aa42318c58fc63acc85`
- HEAD message：`Add Codex branch event hooks`
- 说明：该 HEAD 在 V2.2 集成提交之后追加 `.codex/` 分支协作钩子、handoff/progress 模板和 `.gitignore` 规则；未修改 `app/` 业务代码。

## 代码推送

### GitHub

- Remote：`origin`
- URL：`git@github.com:svmlearn/jingjing-aigc-platfrom.git`
- 命令：`git push origin main`
- 结果：成功，`main` 已推到 `fca0cc8`

### Gitee

- Remote：`gitee`
- URL：`git@gitee.com:jingjing_2025/jingjing-content-platform.git`
- 说明：最初使用 HTTPS remote 推送失败，原因是本机 Gitee OAuth token 已过期；随后改用已可用的 SSH remote。
- 命令：`git push gitee main`
- 结果：成功，Gitee 新增/更新 `main` 分支到 `fca0cc8`

注意：

- Gitee 远端同时存在 `master`：`9978383 clean initial commit for W M collaboration`
- `gitee/master` 不是当前 `main` 的祖先，不能安全 fast-forward。
- 本轮没有强推或覆盖 Gitee `master`。
- 后续如果希望 M 同学默认打开最新代码，建议在 Gitee 页面把默认分支切到 `main`，或单独确认 `main -> master` 的合并/重建策略。

## Vercel staging 部署

- Vercel Project：`jingjing-content-platform-staging`
- Project ID：`prj_JRiAxxfWjDvc0kDroSuAMrbFtkTn`
- 部署目录：`app/`
- 命令：`vercel deploy --prod`
- 说明：该 Vercel project 本身是 staging 项目，因此使用 production target 发布到 staging alias。
- Deployment ID：`dpl_2ZX1dfEmZq3A9GpM85PqkeYMZJfG`
- Deployment URL：`https://jingjing-content-platform-staging-f9b9asa1t.vercel.app`
- Staging alias：`https://jingjing-content-platform-staging.vercel.app`
- 状态：Ready

构建结果：

- Vercel 云端 `next build` 通过。
- 共生成 41 个静态页面，动态 API / 页面 route 正常出现在构建输出中。
- Vercel 自动 alias 到 `https://jingjing-content-platform-staging.vercel.app`。

## 轻量 smoke

已验证：

- `vercel inspect jingjing-content-platform-staging.vercel.app` 返回当前部署 `jingjing-content-platform-staging-f9b9asa1t.vercel.app`，状态 `Ready`。
- `curl -I -L https://jingjing-content-platform-staging.vercel.app/platform-admin-login` 返回 `HTTP/2 200`。
- `platform-admin-login` HTML 可返回，页面语言为 `zh-CN`。

## Supabase 状态

本轮未执行 Supabase migration。

当前 staging migration 总账仍以以下文件为准：

- `docs/progress/2026-04-25-supabase-migration-current-state.md`

截至该总账，当前仓库 `app/supabase/migrations/` 下 7 个 migration 已在 staging Supabase 生效。

## 后续建议

1. 用真实管理员邮箱访问 staging 的 `/platform-admin-login`，初始化首个 `super_admin`。
2. 登录 `/platform-admin` 后抽测系统配置、邀请码、商户、Agent、知识库页面。
3. 确认 Gitee 协作入口：默认分支切 `main`，或另开任务处理 `main -> master`。
4. 若后续新增 migration，继续按 Supabase 总账规则记录 apply / 验证状态。
