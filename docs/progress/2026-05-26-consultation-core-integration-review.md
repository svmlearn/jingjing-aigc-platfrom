# 2026-05-26 咨询 Agent 核心分支 Review 与集成记录

## 背景

用户确认下一步做两阶段 review 和干净集成。本轮只集成核心剩余项：

1. 策略资产结构拆分。
2. P1 商家资料上下文瘦身。

删除历史记录 reloading 修复分支保持冻结，未纳入本轮核心集成。

## Review 输入

- Source docs：
  - `docs/README.md`
  - `docs/产品文档/2026-05-26-咨询Agent工具结果与策略资产边界修订.md`
  - `docs/handoff/2026-05-26-consultation-next-window-zero-context-handoff.md`
  - `docs/progress/2026-05-26-consultation-claude-code-alignment.md`
  - `docs/handoff/2026-05-26-consultation-claude-code-alignment-handoff.md`
- Reviewed branches：
  - `codex/strategy-asset-structure-split` / `34cc4e3`
  - `codex/merchant-profile-context-slimming` / `fb54db9`
- Review skill：
  - `code-review`
- Long-task-gate：
  - disabled
- Subagent：
  - 未使用。用户未显式要求派发 subagent，本轮由主 Agent 直接执行 review 与集成。

## Stage 1：Spec Compliance

结论：通过，无阻塞问题。

核对点：

1. 策略资产结构拆分符合产品文档第 4 节方向：
   - 新增 `strategyAssetSnapshot`、`contentCalendarContext`、`articleBrief`、`videoBrief` 应用层出口。
   - 旧 `strategySnapshot` JSON 保留为兼容载体，未误删 DB 字段。
   - `currentSuggestion` 未作为新模型上下文或 UI fallback 继续使用。
2. 内容日历仍是独立上下文资产：
   - runtime context 保留 `contentCalendarContext`。
   - 内部生成细节只暴露必要业务状态。
3. 图文/视频 brief 未重新暴露给咨询 Agent：
   - hidden tool 仍隐藏。
   - brief 作为拆分字段/兼容字段保留。
4. 商家资料上下文瘦身符合产品文档第 4A.1：
   - 不再输出单一 `merchantProfileContext` 大对象。
   - `merchantId` 不再作为模型可见业务上下文。
   - 身份、业务事实、输出风格、禁用词分层为四个块。
5. Scope 控制：
   - 未混入 history reloading 分支。
   - 未 push、未 deploy。
   - 未把探索内容写成已上线事实。

## Stage 2：Code Quality

结论：通过，无阻塞问题。

核对点：

1. 新 helper `splitStrategySnapshot` 只做兼容拆分，不改变旧 JSON 解析语义。
2. `attachStrategyAssetToSession` 统一 session strategy asset 覆盖逻辑，减少重复 overlay。
3. tool result 在策略资产更新和内容日历更新后同步 session 拆分字段，避免同轮上下文陈旧。
4. 商家资料预算桶从完整 merchant 对象改为四个拆分块，避免 budget 报告继续鼓励整包注入。
5. 新增测试为源码级防回归断言，覆盖：
   - split DTO/helper/service/runtime/UI 出口。
   - runtime 不回退到 `merchantProfileContext`、模型可见 `merchantId` 或完整 merchant budget bucket。
6. 剩余风险已在分支 progress/handoff 写清：
   - 未做 DB migration。
   - 未迁移内容生成、圆桌、工作台旧字段读取。
   - 未做浏览器人工 UI 点击验证。

## 集成方式

Worktree：

- `/Users/wy/.codex/worktrees/consultation-core-integration`

Branch：

- `codex/consultation-core-integration`

Base：

- `main @ b316e79`

Cherry-pick 顺序：

1. `34cc4e3 refactor: split consultation strategy asset contexts`
   - 集成后 commit：`e8d61e7 refactor: split consultation strategy asset contexts`
2. `fb54db9 refactor: slim consultation merchant profile context`
   - 集成后 commit：`c4bbb32 refactor: slim consultation merchant profile context`

Cherry-pick 结果：

- 无冲突。
- 集成 worktree 干净。

## 验证结果

已通过：

```bash
git diff --check main..HEAD
node --test app/src/server/api/consultation-service.test.ts
npm run typecheck
npm run lint
npm run build
```

结果：

- `git diff --check main..HEAD`：通过。
- `node --test app/src/server/api/consultation-service.test.ts`：59 passed，0 failed。
- `npm run typecheck`：通过。
- `npm run lint`：通过。
- `npm run build`：通过，Next.js production build 成功。

备注：

- 新 integration worktree 首次验证前执行了 `corepack pnpm install --frozen-lockfile` 补齐 `node_modules`。
- `node --test` 仍有既有 `MODULE_TYPELESS_PACKAGE_JSON` warning，本轮未处理。

## 当前状态

- 集成分支已完成并验证通过。
- 未合并回 `main`。
- 未 push GitHub / Gitee。
- 未 deploy。

## 合并建议

建议：可合并。

建议顺序：

1. 用户确认后，将 `codex/consultation-core-integration` 合入 `main`。
2. 合入后在 `main` 重新跑同一组验证。
3. 再决定是否顺手合入 history reloading 小修复。
4. 最后再做 push / deploy 决策。
