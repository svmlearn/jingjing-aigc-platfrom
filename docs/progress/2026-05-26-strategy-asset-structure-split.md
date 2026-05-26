# 2026-05-26 策略资产结构拆分执行记录

## 背景

- 接续 `docs/handoff/2026-05-26-consultation-next-window-zero-context-handoff.md`。
- 用户明确说明 history delete 的 reloading 不是核心，本轮优先处理剩余核心任务中的策略资产结构拆分。
- Worktree：`/Users/wy/.codex/worktrees/strategy-asset-structure-split`
- Branch：`codex/strategy-asset-structure-split`
- Base：`main @ b316e79`
- Long-task-gate：disabled
- Subagent：未使用。当前环境的 subagent tool 要求用户显式要求派发/并行时才使用，本轮由主 Agent 直接完成。

## 本轮完成

1. 在应用层拆出咨询会话的新上下文字段：
   - `strategyAssetSnapshot`
   - `contentCalendarContext`
   - `articleBrief`
   - `videoBrief`
2. 保留旧 `strategySnapshot` JSON 兼容层：
   - 未做数据库迁移。
   - `contentCalendarDraft`、`contentCalendarGeneration`、`articleBrief`、`videoBrief` 仍从旧 JSON 解析出来，供既有内容生成、圆桌、工作台链路继续使用。
   - `currentSuggestion` 仍保留为历史兼容字段，不再作为咨询工作台策略文档 fallback。
3. 新增 `app/src/lib/strategy-snapshot.ts` 拆分 helper：
   - `buildStrategyAssetSnapshot`
   - `buildContentCalendarContext`
   - `splitStrategySnapshot`
4. API/repository 层：
   - 咨询 session summary/detail 输出新拆分字段。
   - merchant-level strategy asset 输出 `strategyAssetSnapshot`。
   - `attachStrategyAssetToSession` 统一把 merchant strategy asset 覆盖到 session，并同步拆分字段。
5. Runtime 层：
   - 主模型上下文继续暴露 `strategySnapshotContext` 与 `contentCalendarContext`，但不再把完整旧 `strategySnapshot` 当作一个大桶传入。
   - `contentCalendarContext` 只暴露业务状态、notice、`generationStatus` 和前 7 条 calendar item。
   - 隐藏内部生成字段，例如 batch id、current revision id、generated job count。
   - `update_strategy_snapshot` / `update_content_calendar` 工具结果同步新拆分字段。
6. 商家咨询 UI：
   - 右侧策略资产文档优先使用 `strategyAssetSnapshot.strategyMarkdown`。
   - 内容日历优先使用 `contentCalendarContext.calendar`。
   - fallback 策略文档不再使用 `currentSuggestion`，改为稳定策略字段与策略标签。
7. 测试：
   - 增加断言，覆盖新 DTO/helper/service/runtime/UI 的拆分出口。
   - 调整旧 calendar generation 断言，避免继续把 `strategySnapshot.contentCalendarGeneration` 作为 runtime 主读取口径。

## 改动文件

- `app/src/contracts/consultation.ts`
- `app/src/lib/strategy-snapshot.ts`
- `app/src/lib/db/consultation-repository.ts`
- `app/src/lib/db/merchant-strategy-asset-repository.ts`
- `app/src/server/api/consultation-service.ts`
- `app/src/server/api/consultation-runtime/context.ts`
- `app/src/server/api/consultation-runtime/tools.ts`
- `app/src/components/merchant/consultation-workspace.tsx`
- `app/src/server/api/consultation-service.test.ts`
- `docs/progress/2026-05-26-strategy-asset-structure-split.md`
- `docs/handoff/2026-05-26-strategy-asset-structure-split-handoff.md`

## 验证结果

已通过：

```bash
git diff --check
node --test app/src/server/api/consultation-service.test.ts
npm run typecheck
npm run lint
npm run build
```

结果：

- `git diff --check`：通过
- `node --test app/src/server/api/consultation-service.test.ts`：58 passed，0 failed
- `npm run typecheck`：通过
- `npm run lint`：通过
- `npm run build`：通过，Next.js production build 成功

备注：测试命令仍出现既有 Node `MODULE_TYPELESS_PACKAGE_JSON` warning，本轮未处理。

## 未做事项

1. 未做数据库结构迁移或旧 JSON 字段物理删除。
2. 未把内容生成、圆桌、图文工作台、视频工作台全部迁到新拆分 DTO；这些链路本轮保持兼容。
3. 未合并 history delete reloading fix 分支，避免混入非核心改动。
4. 未启动浏览器做人工 UI 点击验证；本轮用静态断言、typecheck、lint、production build 覆盖。

## 状态

- 已完成核心策略资产结构拆分。
- 待提交冻结。
- 未 push。
- 未 merge。
- 未 deploy。
