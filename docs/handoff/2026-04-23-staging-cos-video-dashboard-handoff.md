# 2026-04-23 staging-cos-video-dashboard handoff

## 目标

在不重构整套 dashboard 数据层的前提下，把「上传素材、生成视频、查看视频任务结果」挂进现有 draft detail 页面，并且前端调用链路对齐任务书里的 staging 接口名。

## 已完成

1. 在 [app/src/components/dashboard/draft-detail.tsx](/Users/wy/.codex/worktrees/19e4/小红书抖音矩阵获客平台/app/src/components/dashboard/draft-detail.tsx) 里把草稿详情页扩成：
   - 左侧继续保留现有草稿编辑
   - 右侧新增素材上传与视频任务面板
   - 支持在同一页切换当前编辑的 variant
   - 对 `video_script` variant 显示“生成视频”入口

2. 新增 [app/src/components/dashboard/draft-video-panels.tsx](/Users/wy/.codex/worktrees/19e4/小红书抖音矩阵获客平台/app/src/components/dashboard/draft-video-panels.tsx)：
   - 素材上传入口
   - 归档成功后的 `content_draft` 级资产列表
   - `video_script` 版本卡片与“生成视频”按钮
   - 视频任务状态面板
   - 任务刷新、取消、重试按钮
   - 结果资产预览区，优先消费后端返回的 `signedPreviewUrl`

3. 新增 [app/src/lib/ui/video-workflow.ts](/Users/wy/.codex/worktrees/19e4/小红书抖音矩阵获客平台/app/src/lib/ui/video-workflow.ts) 前端封装层：
   - `POST /api/media/upload-intents`
   - `POST /api/media/complete`
   - `GET /api/video-edit-jobs`
   - `GET /api/video-edit-jobs/:id`
   - `POST /api/video-edit-jobs`
   - `POST /api/video-edit-jobs/:id/retry`
   - `POST /api/video-edit-jobs/:id/cancel`
   - 对返回值做了 `camelCase / snake_case` 兼容归一化
   - 浏览器侧素材上传使用 COS SDK 动态脚本加载，不改 `package.json`
   - 增加 `content_draft` 素材缓存与视频任务缓存的本地持久化兜底

4. 补了两个状态恢复问题：
   - 任务刷新时先调用 `GET /api/video-edit-jobs`，再对当前 draft 相关 job 按需补 `GET /api/video-edit-jobs/:id`，把 `resultAssets[].signedPreviewUrl` hydrate 回来
   - 素材面板进入页面时会优先恢复当前浏览器里最近一次成功归档到 `content_draft` 的素材缓存，避免刷新后直接空列表

5. 更新 [app/src/app/dashboard/drafts/[draftId]/page.tsx](/Users/wy/.codex/worktrees/19e4/小红书抖音矩阵获客平台/app/src/app/dashboard/drafts/[draftId]/page.tsx) 页头文案，让页面描述包含素材上传与视频任务。

## 未完成

1. 还没有真正的“全量 draft 资产查询”接口。
   现在素材区的刷新后恢复依赖浏览器本地缓存，能解决“刷新就空”的问题，但还不能替代服务端真实资产列表。

2. 没有改 `content detail` 页面。
   这轮为了守住 B 分支边界，只把入口和结果挂进 draft detail 页面，没有顺手扩散到别的 dashboard 页面。

3. 没有验证真实 COS / video job API 可用性。
   如果 A 分支接口还没落地，当前 UI 会显示错误或空态，但调用位置和接口名已经固定到任务书约定。

## 改动文件

- [app/src/app/dashboard/drafts/[draftId]/page.tsx](/Users/wy/.codex/worktrees/19e4/小红书抖音矩阵获客平台/app/src/app/dashboard/drafts/[draftId]/page.tsx)
- [app/src/components/dashboard/draft-detail.tsx](/Users/wy/.codex/worktrees/19e4/小红书抖音矩阵获客平台/app/src/components/dashboard/draft-detail.tsx)
- [app/src/components/dashboard/draft-video-panels.tsx](/Users/wy/.codex/worktrees/19e4/小红书抖音矩阵获客平台/app/src/components/dashboard/draft-video-panels.tsx)
- [app/src/lib/ui/video-workflow.ts](/Users/wy/.codex/worktrees/19e4/小红书抖音矩阵获客平台/app/src/lib/ui/video-workflow.ts)

## 验证结果

已做：

- 手工检查了入口位置、接口名和面板字段，确保对齐任务书：
  - `status`
  - `current_stage`
  - `progress_pct`
  - `failure_reason`
  - 结果资产预览
- 确认素材上传链路固定使用：
  - `/api/media/upload-intents`
  - `/api/media/complete`
- 确认视频任务链路固定使用：
  - `/api/video-edit-jobs`
  - `/api/video-edit-jobs/:id`
  - `/api/video-edit-jobs/:id/retry`
  - `/api/video-edit-jobs/:id/cancel`

未完成 / 阻塞：

- 直接在当前 worktree 跑 `pnpm build` 仍然不行，因为 [app](</Users/wy/.codex/worktrees/19e4/小红书抖音矩阵获客平台/app>) 缺少 `node_modules`，命令输出为：

```text
> next build
sh: next: command not found
WARN  Local package.json exists, but node_modules missing, did you mean to install?
```

- 为了不碰当前 worktree 的 `.next` 和 `node_modules`，我额外尝试了“临时快照目录 + 外部依赖”构建，但遇到了两类环境问题：
  1. Turbopack 对指向仓库外部的 `node_modules` 符号链接直接 panic
  2. webpack 快照构建在当前环境里仍然依赖外部 next worker 路径，没拿到一个稳定可复用的通过结果

- 所以这轮的验证结论是：
  - 调用链路和 UI 改动已补齐
  - 真实 `next build` 还需要一个可用的本地依赖环境，或者在允许写 `.next` 的隔离构建目录里完成

## 当前提交点

- worktree: `/Users/wy/.codex/worktrees/19e4/小红书抖音矩阵获客平台`
- branch: `b/staging-cos-video-dashboard-ui`
- base commit: `449d1ff24e51faa21584718278d49f803f181bab`

## push / merge

- 未 push
- 未 merge

## 下一步建议

1. 先在 A 分支把 `/api/media/*` 和 `/api/video-edit-jobs*` 路由落稳。
2. 给这个 worktree 补可用依赖环境后，再跑一次 `pnpm build`。
3. 如果 A 分支补了“按 draft 拉历史资产”的接口，B 这里再把素材面板从“本次会话列表”切到“真实全量资产列表”。
