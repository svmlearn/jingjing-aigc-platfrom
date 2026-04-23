# 2026-04-23 Staging COS / Video Worker 集成验证记录

## 背景

本轮在 `codex/staging-cos-video-integration` 上收口以下 4 条并行分支的已验收改动：

- A: `feature/staging-cos-video-schema-api`
- B: `b/staging-cos-video-dashboard-ui`
- C: `feature/staging-cos-video-worker`
- D: `feature/staging-cos-video-ops-docs`

集成方式使用 `cherry-pick`，而不是直接 merge 整个分支，目的是减少把各自 worktree 基线差异一起带入主线的风险。

## 集成提交

- `96b39bc` `docs: add staging video architecture baseline`
- `1e02dde` `Add staging COS media and video job backend APIs`
- `f860620` `Clarify staging COS schema API handoff commit`
- `24b49de` `Harden video job payloads and job result asset filtering`
- `1f147a2` `Update handoff for hardened video job backend`
- `1962a02` `Add staging video worker skeleton`
- `1f8ae54` `feat: hydrate video jobs and persist dashboard media state`
- `5586a44` `docs: update dashboard handoff metadata`
- `0a7a390` `docs: refine staging video worker ops runbook`

## 集成中发现的问题

前端新增了腾讯云 COS 相关依赖：

- `cos-nodejs-sdk-v5`
- `qcloud-cos-sts`

但 A 分支最初只更新了 `app/package.json`，没有同步刷新 `app/pnpm-lock.yaml`。  
直接在当前工作树运行 `pnpm exec tsc --noEmit` 时会报模块缺失：

- `Cannot find module 'cos-nodejs-sdk-v5'`
- `Cannot find module 'qcloud-cos-sts'`

因此本轮补做了 lockfile 刷新。

## 处理方式

考虑到当前工作树已有历史 `node_modules`，直接在仓库内执行 `pnpm add --lockfile-only` 出现长时间无输出的卡顿，所以改用隔离快照完成 lockfile 生成和构建验证：

1. 复制 `app/package.json`、`app/pnpm-lock.yaml`、`app/pnpm-workspace.yaml` 到临时目录
2. 在临时目录执行：

```bash
pnpm add cos-nodejs-sdk-v5@^2.15.4 qcloud-cos-sts@^3.1.3 --lockfile-only --ignore-scripts
```

3. 将生成后的 `pnpm-lock.yaml` 回写到仓库
4. 再复制整个 `app/` 到另一个临时目录，执行全新安装和构建验证

## 验证结果

### 1. Worker Python 骨架

执行：

```bash
python3 -m compileall workers/video-worker/openstoryline/app workers/video-worker/worker/app
```

结果：通过

### 2. Docker Compose 配置

执行：

```bash
cp workers/video-worker/.env.example workers/video-worker/.env
docker compose -f workers/video-worker/docker-compose.yml config
rm workers/video-worker/.env
```

结果：通过

### 3. 前端 TypeScript 与生产构建

在隔离临时快照中执行：

```bash
pnpm install --frozen-lockfile
pnpm exec tsc --noEmit
pnpm build
```

结果：全部通过

补充说明：

- 这里特意使用隔离快照，而不是直接复用当前工作树的 `node_modules`
- 目标是验证“仓库当前代码 + 更新后的 lockfile”是否可被一个全新环境正确安装和构建

## 当前结论

`codex/staging-cos-video-integration` 已完成 A/B/C/D 的收口集成，并且补齐了前端 lockfile。  
以当前仓库快照看，这轮 staging COS / Video Worker 集成已经达到“可并回主线”的状态。
