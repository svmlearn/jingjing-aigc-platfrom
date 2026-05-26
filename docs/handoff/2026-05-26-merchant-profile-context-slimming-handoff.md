# 2026-05-26 商家资料上下文瘦身 Handoff

## 当前目标

完成咨询 Agent 的 P1 商家资料上下文瘦身：不要每轮把完整商家资料作为一个 `merchantProfileContext` 大对象塞给模型，而是拆成身份、业务事实、输出风格、安全语言约束。

## 分支信息

- Worktree：`/Users/wy/.codex/worktrees/merchant-profile-context-slimming`
- Branch：`codex/merchant-profile-context-slimming`
- Base：`34cc4e3 refactor: split consultation strategy asset contexts`
- 依赖关系：本分支建立在策略资产结构拆分分支之上，集成时建议先合 `codex/strategy-asset-structure-split`
- Long-task-gate：disabled
- Subagent：未使用
- Final commit：提交后以本分支 `HEAD` 为准，最终 SHA 已在当前窗口最终回复中报告
- Push：未 push
- Merge：未 merge
- Deploy：未 deploy

## 已完成

1. `buildConsultationRuntimeContextMessage` 不再输出：
   - `# merchantProfileContext`
   - `merchantId`
   - 完整商家资料大对象
2. 新增模型可见上下文块：
   - `# merchantIdentityContext`
   - `# merchantBusinessFactsContext`
   - `# outputStyleConstraints`
   - `# safetyLanguageConstraints`
3. `buildContextBudgetReport` 改为按四个拆分块计预算，不再用完整 `merchant` bucket。
4. `buildConsultationSlimContextPack` 的 included 列表同步为四个拆分块。
5. `buildConsultationContextInjection` 的 sessionContext 同步拆分。
6. `buildSharedConsultationState` 的商家摘要不再混入默认 CTA。
7. `buildPhaseRuntimeRules` 明确允许模型使用新的四个商家上下文块。
8. `consultation-service.test.ts` 增加防回归断言。

## 关键文件

- `app/src/server/api/consultation-runtime/context.ts`
- `app/src/server/api/consultation-service.ts`
- `app/src/server/api/consultation-service.test.ts`

## 验证

已通过：

```bash
git diff --check
node --test app/src/server/api/consultation-service.test.ts
npm run typecheck
npm run lint
npm run build
```

结果：

- consultation service tests：59 passed，0 failed
- typecheck：通过
- lint：通过
- production build：通过

## 下一步建议

1. review `codex/strategy-asset-structure-split`。
2. review 本分支。
3. 如都通过，按依赖顺序集成：
   - 先合策略资产结构拆分。
   - 再合商家资料上下文瘦身。
4. push / deploy 仍需用户明确授权。

## 风险与注意

- 本分支不独立于策略资产拆分；直接 cherry-pick 到未合 B 的主线会产生上下文文件冲突。
- 本轮没有改变知识库检索和素材检索策略，只改商家 profile 自动注入方式。
- 如果后续要进一步压缩商家业务事实，应基于真实 token / char budget 报告继续调参，而不是靠关键词硬判断。
