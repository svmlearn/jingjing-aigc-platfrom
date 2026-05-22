# 2026-05-21 voice-fix 合并与服务器 release

## 目标

把 Gitee 分支 `codex/voice-fix` 拉到本地独立集成分支，合入当前 `main` 验证后，再合回 `main`，同步推送 Gitee / GitHub，并在存在运行代码变更时重新 release 服务器。

## 分支与提交

- 远端来源：`gitee/codex/voice-fix`
- 本地集成分支：`integration/voice-fix-main-20260521`
- voice-fix 原始提交：`171e142 fix: restore voice profile upload prefix`
- 合并后 main 提交：`faa81b074c1ad1f15283a9a2a61122af43532028`
- 合并方式：先在集成分支 merge `main`，无冲突；再 fast-forward 合回本地 `main`。

## 代码变更

仅涉及 3 个 app 文件：

- `app/src/lib/media-upload-contract.ts`
- `app/src/lib/media-upload-contract.test.ts`
- `app/src/server/storage/object-storage.ts`

核心变更：

- `voice_profile` 上传前缀从 `voice-profiles/{merchantId}/{ownerId}` 恢复为 `draft-inputs/{merchantId}/{ownerId}/voice-profile-audio`。
- 契约测试补充了新前缀的通过用例，以及旧 `voice-profiles/...` 路径应被拒绝的断言。

## 本地验证

```bash
cd app
node --test src/lib/media-upload-contract.test.ts
pnpm run typecheck
pnpm run lint
```

结果：

- `media-upload-contract.test.ts`：5 条通过。
- TypeScript：通过。
- ESLint：通过，有 10 个既有 unused warning，非本次引入。

## 推送

- Gitee `main`：已推到 `faa81b0`
- GitHub `main`：已推到 `faa81b0`

## 服务器 release

- ECS：`ubuntu@8.154.28.41`
- 上一个 release：`/srv/jingjing-domestic/releases/20260521182400-bade413`
- 新 release：`/srv/jingjing-domestic/releases/20260521185321-faa81b0`
- 当前 symlink：`/srv/jingjing-domestic/current -> /srv/jingjing-domestic/releases/20260521185321-faa81b0`

发布步骤：

1. 本地使用 `git archive` 从 `faa81b0` 生成 `/tmp/jingjing-faa81b0.tar`。
2. 上传到服务器 `/tmp/jingjing-faa81b0.tar`。
3. 解压到新 release 目录。
4. 在服务器执行：
   - `corepack pnpm@10.20.0 install --frozen-lockfile`
   - `corepack pnpm@10.20.0 build`
5. 切换 `/srv/jingjing-domestic/current`。
6. 重启：
   - `jingjing-domestic-app.service`
   - `jingjing-content-generation-worker.service`
   - `jingjing-firered-openstoryline.service`
   - `jingjing-openstoryline-engine.service`
   - `jingjing-video-worker.service`
7. Reload `nginx.service`。

## 发布前任务检查

- `video_edit_jobs` in-flight：0
- `content_generation_jobs` in-flight：1
- 该内容生成任务为旧滞留任务：
  - id：`90dd08b1-fad7-4c3f-8689-cf2b52775ea1`
  - status：`running`
  - started_at：`2026-05-21 04:19:32.215598+08`
  - updated_at：`2026-05-21 04:19:32.215598+08`
- 本次未改数据库任务状态。

## 发布后验证

服务状态：

- `nginx.service`：active
- `jingjing-domestic-app.service`：active
- `jingjing-content-generation-worker.service`：active
- `jingjing-firered-openstoryline.service`：active
- `jingjing-openstoryline-engine.service`：active
- `jingjing-video-worker.service`：active

健康检查：

- `http://127.0.0.1:3000/api/health`：ok，database=postgres，storage=aliyun_oss
- `http://8.154.28.41/api/health`：ok，database=postgres，storage=aliyun_oss
- `http://127.0.0.1:8000/ready`：ready
- `http://127.0.0.1:7860/api/ready`：ready

服务器代码确认：

- `/srv/jingjing-domestic/current/app/src/lib/media-upload-contract.ts`
- `/srv/jingjing-domestic/current/app/src/server/storage/object-storage.ts`

两处均已包含：

```text
draft-inputs/${input.merchantId}/${input.ownerId}/voice-profile-audio
```

