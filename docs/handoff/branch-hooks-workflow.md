# Codex 分支事件 Hooks 工作流

这套机制用于减少并行分支开发时的“人工复制消息”。它不替代 main 的集成判断，只把 worker 完成通知、main 待验收提醒、返修上下文注入这些动作文件化。

## 角色

- worker 分支窗口：在独立 worktree/派生窗口里开发、验证、commit，最后发布 `branch_ready` 事件。
- main 窗口：读取事件、临时合并验证、通过后本地 merge；不通过则把返修请求写入 control board。
- control board：`docs/progress/*branch-control-board*.md`，是跨窗口协作的持久真相源。

## Worker 完成时

在 worker 分支里完成代码、handoff/progress 和 commit 后运行：

```bash
.codex/scripts/branch-done --handoff docs/handoff/<file>.md --progress docs/progress/<file>.md
```

脚本会校验：

- 当前分支不是 `main`
- 分支名符合 `codex/vX.Y-*`
- worktree 干净
- 分支有未合入 main 的 commit
- handoff/progress 路径存在

通过后会写入本地 ignored 事件：

```text
.codex/branch-events/inbox/<event-id>.json
```

如果只想预览事件：

```bash
.codex/scripts/branch-done --handoff docs/handoff/<file>.md --progress docs/progress/<file>.md --dry-run
```

## Main 处理事件

main 窗口启动、恢复、提交用户 prompt 或准备停止时，hook 会检查 inbox。

查看队列：

```bash
.codex/scripts/branch-inbox-list
```

处理某个事件时先标记：

```bash
.codex/scripts/branch-event-status --event <event-id> --status reviewing
```

推荐验收流程：

1. 读取事件里的 handoff/progress。
2. 从 main 创建临时 worktree。
3. 在临时 worktree 执行 `git merge --no-commit --no-ff <branch>`。
4. 运行必要验证，通常是：
   ```bash
   cd app
   pnpm lint
   pnpm build
   ```
5. 通过后回到 main 本地 merge，更新 control board，并标记事件：
   ```bash
   .codex/scripts/branch-event-status --event <event-id> --status merged
   ```
6. 不通过则不 merge，写返修 block 到 control board，并标记：
   ```bash
   .codex/scripts/branch-event-status --event <event-id> --status needs_fix --message "简述阻断问题"
   ```

## 返修回流

main 把返修项写入 control board 的 marker block：

```md
<!-- codex-branch-fix-start codex/vX.Y-feature-a -->
Status: `needs_fix`
Branch: `codex/vX.Y-feature-a`
Event: `<event-id>`

Main review finding:

- [P1] ...

Required fix:

- ...
<!-- codex-branch-fix-end codex/vX.Y-feature-a -->
```

用户回到对应 worker 分支窗口后，只需要发“继续”。hook 会读取当前分支名，自动把对应返修 block 注入上下文。

worker 修完后重新 commit，再次运行 `branch-done`。

## 安全边界

- hooks 不会 push。
- hooks 不会 apply Supabase migration。
- hooks 不会触碰 staging 或 production。
- 自动 merge 只允许 main 集成 agent 在本地执行，且必须先完成临时 merge 验证。
- inbox/processed/runtime 是本地运行态，不进 Git；长期记录写入 control board 或 progress 文档。
