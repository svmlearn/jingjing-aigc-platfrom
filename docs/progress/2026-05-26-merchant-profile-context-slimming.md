# 2026-05-26 商家资料上下文瘦身执行记录

## 背景

- 接续 `docs/handoff/2026-05-26-consultation-next-window-zero-context-handoff.md` 的任务 C。
- 任务 B 策略资产结构拆分已冻结为 `34cc4e3`，本分支基于该提交继续做 P1 商家资料上下文瘦身。
- Worktree：`/Users/wy/.codex/worktrees/merchant-profile-context-slimming`
- Branch：`codex/merchant-profile-context-slimming`
- Base：`34cc4e3 refactor: split consultation strategy asset contexts`
- Long-task-gate：disabled
- Subagent：未使用。当前范围集中在 runtime context 和测试，由主 Agent 直接完成。

## 本轮完成

1. 移除模型可见的单一大块 `merchantProfileContext`。
2. 将商家资料拆成四个模型可见上下文块：
   - `merchantIdentityContext`：只放商家显示身份，目前仅 `name`。
   - `merchantBusinessFactsContext`：行业、服务项目、品牌摘要、区域摘要。
   - `outputStyleConstraints`：表达风格和默认 CTA。
   - `safetyLanguageConstraints`：禁用词。
3. 不再把 `merchantId` 作为模型可见业务上下文字段。
4. context budget 不再按完整 `merchant` 对象计入，改为按上述四个瘦身块分别计入。
5. slim context pack 的 `included` 记录同步改为四个拆分块。
6. `buildConsultationContextInjection` 的 `sessionContext` 同步使用四个拆分块，避免 debug / context injection 层继续呈现整包商家资料。
7. `buildSharedConsultationState` 的 `merchantProfileSummary` 移除默认 CTA，避免把输出约束混进事实摘要。
8. runtime phase rules 明确模型可使用四个拆分后的商家上下文块。
9. 增加静态断言测试，防止回退到 `merchantProfileContext`、`merchantId` 或完整 `merchant` budget bucket。

## 改动文件

- `app/src/server/api/consultation-runtime/context.ts`
- `app/src/server/api/consultation-service.ts`
- `app/src/server/api/consultation-service.test.ts`
- `docs/progress/2026-05-26-merchant-profile-context-slimming.md`
- `docs/handoff/2026-05-26-merchant-profile-context-slimming-handoff.md`

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
- `node --test app/src/server/api/consultation-service.test.ts`：59 passed，0 failed
- `npm run typecheck`：通过
- `npm run lint`：通过
- `npm run build`：通过，Next.js production build 成功

备注：

- 新 worktree 首次测试缺少 `node_modules`，先执行了 `corepack pnpm install --frozen-lockfile`。依赖来自锁文件和本地缓存，`node_modules` 未纳入 Git。
- 测试命令仍出现既有 Node `MODULE_TYPELESS_PACKAGE_JSON` warning，本轮未处理。

## 未做事项

1. 未做浏览器人工对话验证。
2. 未把 merchant knowledge / material retrieval 的上下文选择策略继续细分；本轮只处理商家资料 profile 自动注入。
3. 未 push。
4. 未 merge。
5. 未 deploy。

## 状态

- P1 商家资料上下文瘦身已完成并验证通过。
- 待提交冻结。
- 集成顺序建议：先合 `codex/strategy-asset-structure-split`，再合本分支。
