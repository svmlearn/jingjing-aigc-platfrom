# 2026-04-23 staging COS video worker handoff

## 目标

在当前 staging 四层架构下，为 `Worktree C` 落地独立的 `workers/video-worker/` 骨架，覆盖：

- `Docker Compose`
- `openstoryline-engine`
- `video-worker`
- 轮询执行骨架
- 腾讯云 COS 下载 / 上传封装
- OpenStoryline 内部调用骨架

范围严格限定在：

- `workers/video-worker/**`
- 本 handoff 文档

没有触碰用户明确禁止的目录：

- `app/src/components/**`
- `app/src/app/dashboard/**`
- `app/src/app/api/**`
- `app/supabase/migrations/**`
- `app/package.json`
- `docs/progress/**`
- `docs/test/**`

## 已完成

1. 新增 `workers/video-worker/` 目录。
2. 新增 `workers/video-worker/docker-compose.yml`，固定两个服务：
   - `openstoryline-engine`
   - `video-worker`
3. Compose 已按任务书固定值落地：
   - `WORKER_POLL_INTERVAL_SECONDS=10`
   - `WORKER_MAX_CONCURRENCY=1`
   - `VIDEO_JOB_STALE_MINUTES=120`
   - 主机目录根：`/srv/jingjing-video-worker`
   - 挂载目录：
     - `/srv/jingjing-video-worker/tmp`
     - `/srv/jingjing-video-worker/models`
     - `/srv/jingjing-video-worker/outputs`
4. Compose 没有开放任何 OpenStoryline 公网端口；仅使用内部网络访问，`openstoryline-engine` 只 `expose 8000/8001`。
5. 新增 `.env.example`，覆盖：
   - `SUPABASE_DB_URL`
   - `COS_SECRET_ID`
   - `COS_SECRET_KEY`
   - `COS_BUCKET`
   - `COS_REGION`
   - worker 固定轮询参数
   - `OPENAI_API_KEY`
   - 常见 OpenStoryline provider key 占位
6. 新增 `workers/video-worker/openstoryline/**`：
   - 提供一个本地 HTTP skeleton 服务
   - 暴露 `GET /health`
   - 暴露 `POST /v1/runs`
   - 用占位文件模拟 `final.mp4 / cover.jpg / subtitles.srt / run-metadata.json`
7. 新增 `workers/video-worker/worker/**`：
   - `config.py`：环境变量与固定参数校验
   - `db.py`：`video_edit_jobs` stale sweep / 只认领 `pending` / stage update / success / failure / `asset_objects` 写入骨架
   - `cos_client.py`：腾讯云 COS 下载 / 上传封装
   - `openstoryline_client.py`：内部 HTTP 调用封装
   - `processor.py`：单任务执行链路骨架
   - `poller.py`：启动和轮询前扫 stale、每 10 秒轮询、单并发串行消费
   - `main.py`：worker 启动入口
8. 新增 `workers/video-worker/README.md`，解释运行方式、固定值、输入输出约定和当前范围。
9. 当前 worktree 已切到本地分支：
   - `feature/staging-cos-video-worker`

## 未完成

1. 还没有把真实上游 `FireRed-OpenStoryline / 小红书AI剪辑视频` 代码直接打包进当前 worktree。
   - 原因：本 worktree 中不存在任务前文提到的本地参考副本目录，无法在不越界复制其他分支文件的前提下直接嵌入。
   - 当前用的是“保持内部调用合约稳定”的 skeleton service。
2. 还没有做真实联调：
   - 未连接真实 Supabase 数据库
   - 未连接真实腾讯云 COS bucket
   - 未跑真实 OpenStoryline 渲染
3. `asset_objects` / `video_edit_jobs` SQL 以任务书目标 schema 为前提，后续需要和 A/B worktree 最终 migration 对齐一次字段名。
4. 目前输出文件是占位产物，不是可播放成片；后续接真实引擎后，需要把 `openstoryline-engine` skeleton 替换为真实执行服务。
5. 手工 retry 的真实 API 还未在本 worktree 实现；当前 worker 侧已按约定收紧为“只认领 `pending`”。A 分支的 retry API 需要把任务重新置回 `pending`，并同步执行 `retry_count + 1`。

## 改动文件

- `workers/video-worker/.env.example`
- `workers/video-worker/.gitignore`
- `workers/video-worker/README.md`
- `workers/video-worker/docker-compose.yml`
- `workers/video-worker/openstoryline/Dockerfile`
- `workers/video-worker/openstoryline/requirements.txt`
- `workers/video-worker/openstoryline/app/__init__.py`
- `workers/video-worker/openstoryline/app/config.py`
- `workers/video-worker/openstoryline/app/main.py`
- `workers/video-worker/openstoryline/app/schemas.py`
- `workers/video-worker/worker/Dockerfile`
- `workers/video-worker/worker/requirements.txt`
- `workers/video-worker/worker/app/__init__.py`
- `workers/video-worker/worker/app/config.py`
- `workers/video-worker/worker/app/cos_client.py`
- `workers/video-worker/worker/app/db.py`
- `workers/video-worker/worker/app/main.py`
- `workers/video-worker/worker/app/models.py`
- `workers/video-worker/worker/app/openstoryline_client.py`
- `workers/video-worker/worker/app/poller.py`
- `workers/video-worker/worker/app/processor.py`
- `docs/handoff/2026-04-23-staging-cos-video-worker-handoff.md`

## 验证结果

### 1. Python 语法静态检查

执行：

```bash
python3 -m compileall workers/video-worker/openstoryline/app workers/video-worker/worker/app
```

结果：

- 通过

### 3. retry 行为约束检查

代码确认：

- worker 认领 SQL 现在只匹配 `status = 'pending'`
- `failed_retryable` 不会被 polling worker 自动认领
- 后续人工 retry 必须先把任务改回 `pending`，worker 才会再次执行

### 2. Docker Compose 解析检查

执行：

```bash
cp workers/video-worker/.env.example workers/video-worker/.env
docker compose -f workers/video-worker/docker-compose.yml config
rm workers/video-worker/.env
```

结果：

- 通过
- Compose 可正确解析两个服务、固定挂载目录和内部网络配置

## 当前分支与 commit

- Branch: `feature/staging-cos-video-worker`
- Current commit: `449d1ff24e51faa21584718278d49f803f181bab`
- 说明：本轮改动当前仍停留在本 worktree 工作区内，**没有 merge、没有 push**

## 额外说明

1. 用户要求先读的两份绝对路径文档：
   - `/Users/wy/Desktop/静境/静境4.0/小红书抖音矩阵获客平台/docs/架构规范/2026-04-23-当前阶段技术决策-媒体存储与视频执行架构.md`
   - `/Users/wy/Desktop/静境/静境4.0/小红书抖音矩阵获客平台/docs/handoff/2026-04-23-staging-cos-video-worker-implementation-task.md`

   在本次会话里，这两个绝对路径读取失败；我改为读取当前 worktree 内对应同名文件继续执行，内容是一致的 staging 方案上下文。

2. 下一位接手时最优先补的顺序建议：
   - 先把真实 OpenStoryline 运行方式接进 `openstoryline-engine`
   - 再用真实 staging 数据库和 COS 做联调
   - 最后和 A/B worktree 对齐 `asset_objects` / `video_edit_jobs` 字段细节
