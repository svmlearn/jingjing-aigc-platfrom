# 2026-05-20 团队选题 Agentic RAG 部署记录

## 目标

将团队选题 Agentic RAG、内容日历上下文沉淀、以及“避免在代码里写死视频镜头门禁”的调整推送到远端主分支，并重新部署到国内服务器。

## 代码与远端

- 工作分支：`codex/team-topic-agentic-rag`
- 部署代码提交：`a1b8ffd0980f3e97643581603d235c191606db66`
- 合并说明：部署前将服务器已运行线 `gitee/孟_5.13` 合入当前分支，避免本次发布回退服务器已有内容。
- Gitee：`main` 已推送到 `a1b8ffd0980f3e97643581603d235c191606db66`
- GitHub：`main` 已推送到 `a1b8ffd0980f3e97643581603d235c191606db66`

## 本地验证

在 `app/` 下完成：

- `pnpm install --frozen-lockfile`：通过
- `node --test src/lib/content-calendar-guidance.test.ts src/server/api/consultation-service.test.ts`：通过，41 个测试
- `npm run typecheck`：通过
- `npm run lint`：通过，0 error，保留既有 warning
- `npm run build`：通过

## 服务器部署

- 服务器：`ubuntu@8.154.28.41`
- 上一个 release：`/srv/jingjing-domestic/releases/20260520144018-e8fc61a`
- 当前 release：`/srv/jingjing-domestic/releases/20260520171309-a1b8ffd`
- 当前指针：`/srv/jingjing-domestic/current -> /srv/jingjing-domestic/releases/20260520171309-a1b8ffd`

部署前查询 `video_edit_jobs`，没有运行中的任务：

- `cancelled`: 4
- `failed_retryable`: 4
- `succeeded`: 14

## 激活修正

切换 release 后，主应用 `/api/health` 立即通过，但视频链路的 OpenStoryline `/ready` 一度返回 503。

原因是本次 release 默认整体归属为 `jingjing:jingjing`，而三个视频相关 systemd 服务使用 `ubuntu:ubuntu` 运行。FireRed 启动脚本需要在 release 的 `workers/video-worker/openstoryline/firered` 目录内创建 `.storyline`、`resource`、`outputs` 运行时软链，因此被权限拒绝并不断重启。

已对本次 release 的 `workers/video-worker` 子树执行归属修正：

```bash
sudo chown -R ubuntu:ubuntu /srv/jingjing-domestic/releases/20260520171309-a1b8ffd/workers/video-worker
```

随后重启：

- `jingjing-firered-openstoryline.service`
- `jingjing-openstoryline-engine.service`
- `jingjing-video-worker.service`

## 最终验证

服务器内网：

- `systemctl is-active jingjing-domestic-app.service`：`active`
- `systemctl is-active jingjing-firered-openstoryline.service`：`active`
- `systemctl is-active jingjing-openstoryline-engine.service`：`active`
- `systemctl is-active jingjing-video-worker.service`：`active`
- `http://127.0.0.1:3000/api/health`：`ok`
- `http://127.0.0.1:8000/ready`：`ready`
- `http://127.0.0.1:3000/login`：`HTTP/1.1 200 OK`

公网：

- `http://8.154.28.41/api/health`：`ok`
- `http://8.154.28.41/login`：`HTTP/1.1 200 OK`

## 状态

本次功能代码已推送到 Gitee / GitHub `main`，并已部署到国内服务器。视频侧激活问题已在服务器上修正并验证通过。
