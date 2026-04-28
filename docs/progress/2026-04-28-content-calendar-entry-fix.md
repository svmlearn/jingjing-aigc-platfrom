# 2026-04-28 内容日历入口误跳转修复

## 背景

商家端咨询诊断页右侧「营销内容日历」的 `查看全部` 当前会跳转到 `/dashboard/history`，用户看到的是「我的内容」。这与 `docs/designs/AIGC商家页面` 原型不一致，原型里的全量内容日历是在当前咨询页打开日历视图。

## 本次改动

- 修改 `app/src/components/merchant/consultation-workspace.tsx`。
- 将「查看全部」改为「查看全部内容」，点击后在当前页打开内容日历弹层，不再跳转到「我的内容」。
- 统一内容日历任务跳转 URL，补充 `source=consultation_calendar`、`sessionId`、`calendarItemId`、`strategyTag`，图文任务补充 `mode=create`。

## 验证

- `pnpm lint`：通过。
- `pnpm exec tsc --noEmit`：通过。
- `git diff --check -- app/src/components/merchant/consultation-workspace.tsx`：通过。

## 状态

- 当前分支：`main`。
- 本次未 commit、未 push、未 merge。
