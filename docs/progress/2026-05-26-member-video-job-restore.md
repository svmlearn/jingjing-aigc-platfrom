# 2026-05-26 member video job restore local fix

## 目标

修复成员端从内容日历进入视频制作页后，AI 剪辑任务状态丢失的问题：

- 成员从 `/member/video/[taskId]` 普通日历入口进入时，只自动恢复该任务当前 Dify 脚本下的进行中 AI 剪辑任务。
- 成员从“我的内容 / 历史”点击已完成 AI 剪辑任务时，进入 `/member/video/[taskId]?jobId=<jobId>` 回看当时脚本和成片结果。
- 历史回看模式下禁用再次 AI 剪辑。

## 分支与提交

- 开发分支：`codex/app-fix`
- 本地合并目标：`main`
- 代码提交：`55a43a8 fix: restore member video edit jobs`
- 远端推送：已执行 `git push origin main:5.26-worker-fix`
- 服务器 release：未执行

## 改动摘要

- `/api/video-edit-jobs` 列表查询新增 `state=in_flight`、`dailyTaskId`、`contentVariantId` 过滤。
- `PublicVideoEditJobDto` 派生暴露 `dailyTaskId` / `calendarItemId`，仍不暴露 `inputPayload`、`runtimePayload`、`resultPayload`、`logPayload`。
- 成员视频页支持 `jobId` search param：
  - 无 `jobId`：仅恢复 in-flight job。
  - 有 `jobId`：加载指定 job 和 draft bundle，展示当时脚本并进入只读回看。
- 成员历史页 AI 剪辑任务卡片在存在 `dailyTaskId` 时链接回 `/member/video/<dailyTaskId>?jobId=<jobId>`。
- 补充相关契约测试，覆盖任务恢复、历史回看、DTO 安全字段和列表过滤。

## 验证

在 `app/` 下执行并通过：

```bash
node --test src/server/api/video-job-public-dto.test.ts src/server/api/video-edit-jobs-service-contract.test.ts src/server/api/video-job-public-route-contract.test.ts src/components/member/member-workspace-contract.test.ts src/lib/member-video-workflow.test.ts
corepack pnpm typecheck
corepack pnpm lint
git diff --check
```

结果：

- Focused tests：28 passed
- TypeScript：通过
- ESLint：通过
- `git diff --check`：通过；仅出现 Windows 行尾提示

## 未执行事项

- 未推送 `origin/main`。
- 未执行服务器 release。
- 未重启 app / worker / OpenStoryline / video-worker 服务。

