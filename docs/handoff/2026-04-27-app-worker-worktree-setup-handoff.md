# 2026-04-27 app / worker 工作树启动 handoff

## 当前目标

主工作树作为协调和验收树，启动两个独立分支工作树：

1. app 工作树：主应用业务生产侧。
2. worker 工作树：视频执行工具侧。

两个工作树必须从同一个基线 commit 创建，避免 app / worker 对共享合同的理解分叉。

## 已完成

1. 已将主工作树当前成果冻结为本地基线提交：

```text
7c05227a0838e644239b4c3c7d85b1a89ab9490b
chore: freeze app worker worktree baseline
```

2. 已创建 app 工作树：

```text
branch: codex/app-video-production-contract
path: D:\codexplan\worktrees\jingjing-content-platform-app
```

3. 已创建 worker 工作树：

```text
branch: codex/worker-video-execution-contract
path: D:\codexplan\worktrees\jingjing-content-platform-worker
```

4. 两个工作树当前 HEAD 均为：

```text
7c05227a0838e644239b4c3c7d85b1a89ab9490b
```

## 分工边界

app 工作树任务书：

```text
docs/协作/2026-04-27-app-worktree-workdoc.md
```

worker 工作树任务书：

```text
docs/协作/2026-04-27-worker-worktree-workdoc.md
```

共享合同以此文件为准：

```text
docs/架构规范/2026-04-27-video-job-payload-contract.md
```

如果任一工作树需要修改共享合同，先交给主工作树审核，再同步给另一工作树。

## 验证结果

app 工作树已运行：

```powershell
corepack pnpm install --frozen-lockfile
corepack pnpm lint
corepack pnpm exec tsc --noEmit
```

结果：

```text
install 通过；lint 通过；tsc --noEmit 通过。
```

说明：

```text
PowerShell 直接执行 npm.ps1 被本机执行策略阻止；corepack pnpm 可用。
```

worker 工作树已运行：

```powershell
$env:PYTHONPATH='D:\codexplan\worktrees\jingjing-content-platform-worker\workers\video-worker'
python -m unittest discover -s workers\video-worker\tests -v
```

结果：

```text
Ran 8 tests in 2.208s
OK
```

## 当前状态

1. 主工作树：`master`，本地 ahead origin。
2. app 工作树：干净。
3. worker 工作树：干净。
4. 未 push。
5. 未 merge。

## 下一步建议

1. app 工作树先按任务书实现 `video_edit_jobs.input_payload` 生成、脚本确认门禁和素材上下文。
2. worker 工作树先按任务书实现合同消费、状态口径统一、输出检查和 FireRed fail closed 边界。
3. 主工作树负责审核共享合同、阶段验证和最终收口，不直接混写两个分支的业务实现。
