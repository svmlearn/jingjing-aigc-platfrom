# 2026-05-21 内容日历生成标记与重复修改规则

## 目标

修复 AI 咨询里营销内容日历不能在同一轮继续通过 `update_content_calendar` 修订的问题，并在用户点击「生成团队本周内容」后记录“这份日历已经生成过团队内容”的事实状态。

## 产品规则

- 已写入 `docs/产品文档/V2.1-内容日历到图文视频工作台协作PRD.md` 的 5.5 节。
- `update_content_calendar` 不再因为本轮已调用过一次就从可用工具中移除。
- 生成团队内容后不锁死日历；系统只记录版本、批次和生成时间。
- 后续是否先询问用户确认，由 LLM 根据 `contentCalendarGeneration` 状态自行判断，代码不硬拦截。

## 实现摘要

- 新增 `contentCalendarGeneration` 策略快照字段。
- 新增 `app/src/lib/content-calendar-revision.ts`：
  - 计算当前日历版本。
  - 标记最近一次团队内容生成基于的日历版本。
  - 当日历生成后再次修改时标记为 `modified_after_generation`。
- `createDifyDailyTaskGenerationBatchForUser` 在创建团队内容批次后，把生成标记写回 consultation session 和 merchant strategy asset。
- Agent 工具说明会把当前日历生成状态、版本、批次、生成时间和任务数暴露给 LLM。
- `update_content_calendar` 在 native tool calling 和 JSON planner 可用工具中保持可重复出现。

## 验证

在 `app/` 下通过：

```bash
node --test src/lib/content-calendar-revision.test.ts src/server/api/consultation-service.test.ts
npm run typecheck
npm run lint
npm run build
git diff --check
```

结果：

- Node tests：44 passed。
- Typecheck：通过。
- Lint：通过，保留既有 10 个 unused warnings。
- Build：通过。
- Diff check：通过。
