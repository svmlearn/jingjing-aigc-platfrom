# 2026-05-26 策略资产结构拆分 Handoff

## 当前目标

把咨询链路里的策略资产上下文从旧 `strategySnapshot` 大对象里拆出来，至少在应用层形成清晰出口：

- `strategyAssetSnapshot`：长期策略资产字段与策略文档。
- `contentCalendarContext`：内容日历与生成状态。
- `articleBrief`：图文工作台草案。
- `videoBrief`：视频工作台草案。

用户已说明 history delete reloading 不是核心，因此本分支没有合入 reloading 修复。

## 分支信息

- Worktree：`/Users/wy/.codex/worktrees/strategy-asset-structure-split`
- Branch：`codex/strategy-asset-structure-split`
- Base：`main @ b316e79`
- Long-task-gate：disabled
- Subagent：未使用
- Final commit：提交后以本分支 `HEAD` 为准，最终 SHA 已在当前窗口最终回复中报告
- Push：未 push
- Merge：未 merge
- Deploy：未 deploy

## 已完成

1. 新增咨询合同 DTO：
   - `StrategyAssetSnapshotDto`
   - `ContentCalendarContextDto`
   - `ArticleBriefDto`
   - `VideoBriefDto`
2. 在 session summary/detail 与 merchant strategy asset 上暴露新字段。
3. 新增 `splitStrategySnapshot` 兼容拆分层，旧 JSON 存储继续可读。
4. repository/service 输出 session 时同步新字段。
5. runtime context 从大 `strategySnapshot` 桶改为：
   - `strategyAsset`
   - `contentCalendarContext`
   - bounded `strategySnapshotContext`
6. runtime tool result 在策略更新和日历更新后同步新拆分字段。
7. 商家咨询工作台右侧策略资产与日历读取新字段优先。
8. fallback 策略资产文档不再依赖 `currentSuggestion`。
9. 增加静态断言测试，防止 UI/runtime 回退到旧主读取口径。

## 关键文件

- `app/src/contracts/consultation.ts`
- `app/src/lib/strategy-snapshot.ts`
- `app/src/lib/db/consultation-repository.ts`
- `app/src/lib/db/merchant-strategy-asset-repository.ts`
- `app/src/server/api/consultation-service.ts`
- `app/src/server/api/consultation-runtime/context.ts`
- `app/src/server/api/consultation-runtime/tools.ts`
- `app/src/components/merchant/consultation-workspace.tsx`
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

- consultation service tests：58 passed，0 failed
- typecheck：通过
- lint：通过
- production build：通过

## 下一步建议

1. 先 review 本分支，再决定是否 cherry-pick/merge 到主线。
2. 继续做 P1 merchant profile context slimming。
3. 后续如果要彻底移除旧结构，应另开任务做数据库迁移和内容生成/圆桌/工作台全链路改造，不要和本次应用层拆分混在一起。

## 风险与注意

- 本轮是应用层拆分，不是物理数据模型迁移。
- 旧 `strategySnapshot` 仍是兼容载体，短期内不能删除。
- 内容生成相关服务仍有大量合法的旧字段读取，这是为了保持既有链路稳定。
