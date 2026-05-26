# 2026-05-23 video script duration 600s release paused handoff

## 当前目标

把视频脚本生成、视频脚本修订、视频工作台 agent 三个同步入口的 Next.js `maxDuration` 从 60 秒调为 600 秒，避免长脚本在 50-60 秒窗口附近被平台中断。

## 已完成

- 从远端 `5.23-worker-fix` 新开本地分支：`codex/5.23.1.video-fix`。
- 已修改并本地验证。
- 已提交代码 commit：`5a4fdebc7a4a070a4ca8b0cc47a3155e9d9fb84c`。
- 已推送到 Gitee 远端分支：`5.23-worker-fix`。

## 改动文件

- `app/src/app/api/content/video-scripts/route.ts`
- `app/src/app/api/content/video-scripts/revisions/route.ts`
- `app/src/app/api/content/video-workbench-agent/route.ts`
- `app/src/server/api/video-script-route-duration.test.ts`
- `docs/progress/2026-05-23-video-script-route-duration-600s.md`

## 本地验证

- `node --test src/server/api/video-script-route-duration.test.ts`：通过。
- `corepack pnpm typecheck`：通过。
- `corepack pnpm lint`：通过，仅有仓库既有 unused import warning，无 error。
- `corepack pnpm build`：通过。
- `git diff --check`：通过。

## Gitee 推送状态

- 首次 `git push origin HEAD:5.23-worker-fix` 因本机全局 Git 代理 `127.0.0.1:7890` 不可用失败。
- 已用单次命令清空代理重试成功：
  - `git -c http.proxy= -c https.proxy= push origin HEAD:5.23-worker-fix`
- 远端 `5.23-worker-fix` 已更新到 `5a4fdeb`。
- 该代理问题已记录到全局错误库：
  - `C:\Users\17330\.codex\docs\codex-runtime-errors.md`
  - 记录 ID：`GE-20260523-002`

## 服务器 release 状态

用户先提醒服务器当前有任务在跑，因此 release 曾暂停。随后用户确认任务有问题并要求停止这两个任务，本轮已继续完成 release。

暂停前已确认：

- 当前服务器可用 SSH 账号：`meng@8.154.28.41`。
- `ubuntu@8.154.28.41` 和 `root@8.154.28.41` 当前公钥登录失败。
- 服务器当前 release：
  - `/srv/jingjing-domestic/releases/20260523004542-92f0e3a`
- 当前六个服务均为 `active`：
  - `nginx.service`
  - `jingjing-domestic-app.service`
  - `jingjing-content-generation-worker.service`
  - `jingjing-firered-openstoryline.service`
  - `jingjing-openstoryline-engine.service`
  - `jingjing-video-worker.service`

暂停前已做但不会影响运行的服务器动作：

- 仅上传了待发布归档：
  - `/tmp/jingjing-5a4fdeb.tar`
- 未创建新的 `/srv/jingjing-domestic/releases/...` 目录。
- 未切换 `/srv/jingjing-domestic/current`。
- 未重启任何服务。
- 未修改服务器当前 release 文件。

## 已完成服务器 release

- 新 release：
  - `/srv/jingjing-domestic/releases/20260523120534-5a4fdeb`
- 当前指针：
  - `/srv/jingjing-domestic/current -> /srv/jingjing-domestic/releases/20260523120534-5a4fdeb`
- 新 release 已在服务器执行：
  - `corepack pnpm@10.20.0 install --frozen-lockfile`
  - `corepack pnpm@10.20.0 build`
- 已重启：
  - `jingjing-domestic-app.service`
  - `jingjing-content-generation-worker.service`
  - `jingjing-firered-openstoryline.service`
  - `jingjing-openstoryline-engine.service`
  - `jingjing-video-worker.service`
- 已 reload：
  - `nginx.service`

## 已停止的问题任务

- `video_edit_jobs`：`18058674-b17f-4337-9c3b-4edcac0ff81b`
  - status: `cancelled`
  - failure_code: `manual_stopped`
  - failure_reason: `manually_stopped_before_2026_05_23_video_duration_release`
- `content_generation_jobs`：`90dd08b1-fad7-4c3f-8689-cf2b52775ea1`
  - status: `canceled`
  - error_message: `manually_stopped_before_2026_05_23_video_duration_release`
  - batch `9ef286aa-b4ca-4bed-85a8-2048c89b17a5` 已重算为 `running_jobs = 0`

## 发布后验证

- 六个服务均为 `active`。
- `/api/health` 返回 ok，database 为 `postgres`，storage 为 `aliyun_oss`。
- OpenStoryline `/ready` 返回 ready，`engine_adapter=fire_red`。
- FireRed `/api/ready` 返回 ready，`tool_count=21`，`render_video_available=true`。
- `/srv/jingjing-domestic/current` 下三处目标 route 均为 `export const maxDuration = 600;`。
- 发布后 in-flight 队列为空：
  - `video_edit_jobs`: `[]`
  - `content_generation_jobs`: `[]`

## 下一步建议

本轮已完成 release。后续如果要重新验证 600 秒入口，可从页面或 API 触发一次超过 60 秒的视频脚本生成/修订请求，观察不再在 50-60 秒窗口被平台终止。

## 是否 push / merge

- 已 push 到 Gitee `5.23-worker-fix`。
- 未 merge 到 `main`。
- 已进行服务器 release。
