# 2026-05-27 main a66e184 服务器 release

## 范围

- 本地分支：`main`
- 发布代码 commit：`a66e184f3c01ec84df248838a67f36907010ca50`
- 目标服务器：`ubuntu@8.154.28.41:/srv/jingjing-domestic`
- 发布方式：从本地已提交 Git tree 使用 `git archive` 打包，服务器新建 release 目录构建并切换 `current`；没有热改 `/srv/jingjing-domestic/current`。

本轮包含此前已经合入 `main` 的咨询 Agent 素材检索工具实现，以及本轮新增的最近分支合并排查 progress。

## 本地验证

已执行：

```bash
git diff --check HEAD
cd app
node --test src/lib/material-retrieval.test.ts src/server/api/consultation-service.test.ts
npm run typecheck
```

结果：

- `git diff --check HEAD`：通过。
- 咨询 / 素材检索 focused tests：`65` passed。
- `npm run typecheck`：通过。

## 远端推送

- Gitee `main`：`d53bc8a..a66e184`
- GitHub `main`：`d53bc8a..a66e184`

## 发布前检查

- 旧 SSH 用户 `meng@8.154.28.41` 已不可用，返回 `Permission denied (publickey)`；本轮后续全部使用 `ubuntu@8.154.28.41`。
- `ubuntu` 用户 passwordless sudo 可用。
- 发布前 current：
  - `/srv/jingjing-domestic/releases/20260527133000-38227a1`
- 发布前服务状态：
  - `jingjing-domestic-app.service`: active
  - `jingjing-content-generation-worker.service`: active
  - `jingjing-firered-openstoryline.service`: active
  - `jingjing-openstoryline-engine.service`: active
  - `jingjing-video-worker.service`: active
  - `nginx.service`: active
- 发布前 in-flight 任务：
  - `video_edit_jobs`: `[]`
  - `content_generation_jobs`: `[]`

## 发布记录

- 本地 archive：`/tmp/jingjing-a66e184.tar`
- 服务器 archive：`/tmp/jingjing-a66e184.tar`
- 上一个 release：`/srv/jingjing-domestic/releases/20260527133000-38227a1`
- 新 release：`/srv/jingjing-domestic/releases/20260527134121-a66e184`
- 当前 symlink：
  - `/srv/jingjing-domestic/current -> /srv/jingjing-domestic/releases/20260527134121-a66e184`

构建步骤：

```bash
corepack pnpm@10.20.0 install --frozen-lockfile
corepack pnpm@10.20.0 build
```

结果：

- `pnpm install`：通过，复用缓存安装 `721` packages。
- `next build`：通过，`Compiled successfully`，TypeScript 通过，静态页面生成 `64/64`。

本轮继续恢复 FireRed runtime symlinks：

- `.storyline -> /srv/jingjing-video-worker/firered/.storyline`
- `resource -> /srv/jingjing-video-worker/firered/resource`
- `outputs -> /srv/jingjing-video-worker/firered/outputs`

## 重启与健康检查

已重启：

- `jingjing-domestic-app.service`
- `jingjing-content-generation-worker.service`
- `jingjing-firered-openstoryline.service`
- `jingjing-openstoryline-engine.service`
- `jingjing-video-worker.service`

已 reload：

- `nginx.service`

最终状态：

- `jingjing-domestic-app.service`: active
- `jingjing-content-generation-worker.service`: active
- `jingjing-firered-openstoryline.service`: active
- `jingjing-openstoryline-engine.service`: active
- `jingjing-video-worker.service`: active
- `nginx.service`: active

健康检查：

- `curl -fsS http://127.0.0.1:3000/api/health`：ok，database `postgres`，storage `aliyun_oss`。
- `curl -fsS http://8.154.28.41/api/health`：ok，database `postgres`，storage `aliyun_oss`。
- `curl -fsS http://127.0.0.1:8000/ready`：ready，FireRed ready。
- `curl -fsS http://127.0.0.1:7860/api/ready`：ready，`render_video_available=true`。

发布后代码确认：

- `/srv/jingjing-domestic/current/docs/progress/2026-05-27-recent-branch-merge-audit.md`：存在。
- `/srv/jingjing-domestic/current/app/src/lib/material-retrieval.ts`：存在。

## 风险与未覆盖

- 本轮没有触发真实咨询 Agent 对话，也没有跑浏览器端端到端验证；服务器验证覆盖构建、服务启动、健康检查和发布目录内容。
- 本 release progress 是发布完成后补写的 docs-only 记录，不影响已发布运行时代码。
