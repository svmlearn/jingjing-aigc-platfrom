# 2026-05-27 最近分支合并排查与文档核对

## 背景

在将 `codex/consultation-material-search-tools-20260527` 合入本地 `main` 后，又检查了 2026-05-25 到 2026-05-27 的本地分支，目的是确认是否还有最近工作没有进入本地 `main`。

这次排查的关键结论是：不能只看 `git branch --no-merged main`。部分分支拓扑上没有 merge，但 patch 内容已经通过其他集成提交进入 `main`；如果未来只按“未 merge 分支”整包合并，容易把旧基线、旧产品口径或已经被替代的实现重新带回来。

## 执行事实

当前本地 `main` 在排查前后均保持干净。

已确认 2026-05-27 分支均已进入本地 `main`：

- `codex/consultation-material-search-tools-20260527`
- `codex/social-content-filters-20260527`
- `codex/social-viral-media-backfill-20260527`
- `codex/integrate-5.27-worker-20260527`

2026-05-25 没有发现本地分支最后提交落在这一天。

2026-05-26 分支中，大多数已经进入 `main` 或 patch 等价进入 `main`。真正有独有 patch 的只有：

- `codex/consultation-history-delete-loading-fix`
  - 独有 commit：`8960c67 fix: stabilize consultation history deletion`
- `codex/consultation-small-fixes`
  - 独有 commit：`26c8842 fix: stabilize consultation asset updates`

## 对两个未合分支的判断

### `codex/consultation-history-delete-loading-fix`

该分支修复咨询台删除历史会话后的前端 loading 抖动：

- 拆分 `sessionsLoading / sessionsRefreshing / sessionLoading`。
- 删除会话后本地乐观更新列表。
- 删除最后一条会话时抑制自动新建。
- 加入 `sessionRequestSequence`，避免迟到详情请求污染当前会话。

这些核心实现已经在当前 `main` 的 `app/src/components/merchant/consultation-workspace.tsx` 中存在。因此它拓扑上虽然不是 `main` 的祖先，但代码内容不需要再整包合并。

### `codex/consultation-small-fixes`

该分支包含几类小修：

- 删除历史会话后的本地更新。这一部分已被 `consultation-history-delete-loading-fix` 更完整的实现覆盖，并且当前 `main` 已具备完整实现。
- 策略资产 Editor 使用当前 loop state，而不是旧 session snapshot。当前 `main` 已经使用 `state.strategySnapshot`，核心问题已解决。
- `update_strategy_snapshot` 参数清洗为 `merchantId / round / stage` 白名单。该方向已被后续方案替代：当前 `main` 的 `update_strategy_snapshot` 是空参数工具，模型只传 `{}`，上下文由 runtime 注入。
- `guardAssistantWriteClaims` 中文自然语言拦截器。该方向不应合入当前 `main`；当前产品口径是“工具结果是唯一事实来源”，但不靠额外中文文本检测器判断 AI 是否说谎。当前测试也明确要求 `guardAssistantWriteClaims` 不存在。

因此，该分支代码不建议整包合并。

## 本轮文档核对

检查了 `codex/consultation-small-fixes` worktree 中一份未提交产品文档：

- `docs/产品文档/2026-05-26-咨询Agent工具结果与策略资产边界修订.md`

当前 `main` 已经存在同名文件，而且主线版本包含 `codex/consultation-claude-code-alignment` 已按该稿完成实现的记录，以及 `## 6. 本分支实现记录`。这比 `consultation-small-fixes` worktree 里的旧未提交版本更完整。

因此，本轮没有用旧 worktree 版本覆盖主线产品文档，只新增本 progress 作为“最近分支未合并表象”的排查记录。后续再从旧分支补文档时，需要先确认主线是否已有同名且更新的版本。

## 后续处理建议

1. 不要直接 merge `codex/consultation-history-delete-loading-fix`。
   - 如果担心遗漏，只对照当前 `main` 的 `consultation-workspace.tsx` 继续验证删除历史会话体验。
2. 不要直接 merge `codex/consultation-small-fixes`。
   - 其中有效代码已被当前 `main` 吸收或替代。
   - `guardAssistantWriteClaims` 与当前产品口径冲突，不应回灌。
3. 后续再遇到“很多分支没有合并”的情况，先跑：
   - `git cherry -v main <branch>`
   - `git diff --stat main..<branch>`
   - 再读对应 `docs/handoff/`、`docs/progress/`
   - 不要只凭 `git branch --no-merged main` 下结论。

## 验证

本轮只新增 progress，没有改应用代码，也没有改动主线产品文档内容。

已执行：

```bash
git status --short --branch --untracked-files=all
git diff --check
```

结果：

- `docs/产品文档/2026-05-26-咨询Agent工具结果与策略资产边界修订.md` 已在 `main` 存在，且保留主线版本。
- `git diff --check` 通过。

## 风险与未覆盖

- 本轮没有重新跑应用测试，因为只补录文档和 progress。
- 本轮没有删除旧分支或清理 worktree。旧分支保留供必要时追溯。
- `codex/consultation-small-fixes` worktree 中仍可能显示同名 untracked 文件；这是源 worktree 状态，不代表 `main` 仍有未提交内容。
