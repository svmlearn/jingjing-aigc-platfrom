# 2026-05-26 member video job restore handoff

## 当前状态

成员端 AI 剪辑任务恢复修复已在本地完成、验证并合并到本地 `main`，代码提交为：

- `55a43a8 fix: restore member video edit jobs`

该提交已推送到远端：

- `origin/5.26-worker-fix`

服务器 release 尚未执行。

## 已完成内容

- 成员从日历普通入口进入视频制作页时，只自动恢复当前 Dify 脚本下的进行中 AI 剪辑任务。
- 成员从“我的内容 / 历史”点击 AI 剪辑任务时，可按 `jobId` 回看当时脚本和成片结果。
- 历史回看模式禁用再次剪辑，避免用户基于旧脚本重新进入当前 Dify 剪辑链路。
- 后端列表接口支持按 `dailyTaskId`、`contentVariantId` 和 `state=in_flight` 查询。
- public job DTO 增加任务绑定字段，同时继续隐藏内部 worker payload。

## 验证结果

已通过：

```bash
cd app
node --test src/server/api/video-job-public-dto.test.ts src/server/api/video-edit-jobs-service-contract.test.ts src/server/api/video-job-public-route-contract.test.ts src/components/member/member-workspace-contract.test.ts src/lib/member-video-workflow.test.ts
corepack pnpm typecheck
corepack pnpm lint
git diff --check
```

## 下一步建议

如需上线到服务器组 release：

1. 以 `origin/5.26-worker-fix` 当前最新提交为 release 基线。
2. 按既有 `/srv/jingjing-domestic/releases/<timestamp>-<sha>` release 流程打包、上传、安装、构建。
3. 切换 `current` 后重启 app、content-generation worker、FireRed/OpenStoryline、video-worker，并 reload nginx。
4. 验证 `/api/health`、OpenStoryline ready、systemd 服务状态。
5. 重点手测成员端：
   - 日历进入视频任务，进行中 job 能恢复。
   - 我的内容点击已完成 job，能看到当时脚本和成片结果。
   - 历史回看模式无法再次点击 AI 剪辑。

## 注意事项

- 本轮没有服务器 release，也没有服务重启。
- 本轮没有推送 `origin/main`。
- 如果后续需要把文档留痕也同步到 `5.26-worker-fix`，需要把本 handoff/progress 文档提交后再次推送。

