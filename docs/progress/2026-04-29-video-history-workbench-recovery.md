# 2026-04-29 视频工作台恢复 / 我的内容视频聚合修正

## 背景

用户在 staging 验收时指出两类问题：

1. 视频工作台创建脚本或发起 AI 剪辑后，离开页面再回来，当前会话和任务状态不会恢复。
2. `我的内容` 中的视频历史展示语义不清：
   - `脚本` 和 `视频任务` 被拆成两个类目，不符合“同一个视频链路产物”的理解。
   - 列表标题使用 `4b4727a3` 这类截断 id，用户无法判断是哪一条。
   - 详情区直接展示 `queued / claimed / 0%` 等工程态字段，对用户没有可读价值。

## 本轮修改

### 1. 视频工作台恢复能力

- `app/src/app/dashboard/video/page.tsx`
  - 支持读取 `draftId`、`variantId`、`jobId` 查询参数。
- `app/src/components/merchant/video-workbench.tsx`
  - 新增本地快照恢复：
    - 记录 `sessionId / source / calendarItemId / materialId / materialReferenceId / strategyTag`
    - 记录 `draftId / variantId / jobId`
    - 记录左侧聊天消息、补充要求、当前脚本候选、画布展开状态
  - 返回 `/dashboard/video` 时，如果没有显式 query，会优先恢复最近一次工作台状态。
  - 从 `draftId` 拉取草稿后，会继续从 `inputSnapshot` 恢复咨询上下文。
  - 从 `jobId` 拉取任务后，会继续轮询 in-flight 视频任务。

### 2. 视频草稿读取通路

- `app/src/contracts/draft.ts`
  - `ContentDraftDto` 新增可选 `inputSnapshot`。
- `app/src/lib/db/content-draft-repository.ts`
  - 草稿读写补齐 `input_snapshot`。
  - 新增按 `draftId` 读取单条草稿 bundle 的能力。
- `app/src/server/api/content-generation-service.ts`
  - 新增 `getContentRecordForUser`。
- `app/src/app/api/content/records/[draftId]/route.ts`
  - 新增按草稿读取内容记录的 API。

### 3. 我的内容视频聚合展示

- `app/src/components/merchant/history-hub.tsx`
  - 筛选从 `全部 / 图文 / 脚本 / 视频任务` 改为 `全部 / 图文 / 视频`。
  - 将 `video_script draft + related video jobs` 聚合成单个视频记录。
  - 视频列表标题优先显示脚本标题，避免使用短 id。
  - 列表副信息改成时间 + 中文状态。
  - 视频详情区拆成：
    - 视频概要
    - 脚本内容
    - 当前视频进度
    - 多次任务时的任务记录
  - “查看详情”语义改为直接回到视频工作台深链。

### 4. 用户可读状态文案

- `app/src/lib/ui/video-job-display.ts`
  - 新增视频任务状态和阶段的中文映射。
  - 对 `claimed / downloading_inputs / openstoryline_rendering / completed` 等工程态阶段提供可读解释。
- `app/src/components/merchant/video-workbench.tsx`
  - 工作台右侧状态提示也改成用户可读文案，不再直接显示原始枚举。

### 5. 部署补充修正

- `app/src/components/merchant/video-workbench.tsx`
  - 补齐 `draftBundle` / `job` 的局部常量守卫，消除 Vercel TypeScript 构建报错。
- `app/src/app/dashboard/history/page.tsx`
  - 为使用 `useSearchParams()` 的 `HistoryHub` 增加 `Suspense` 包裹，满足 Next.js 16 的 prerender 约束。

## 验证

已完成：

- `git diff --check`
- 轻量 TS 语法编译检查：
  - `node -e "...typescript.transpileModule(...)" -> syntax-ok`
- `pnpm run build`
  - 初次生产构建暴露两类部署阻塞：
    - `video-workbench.tsx` 中的空值守卫未被 TypeScript 识别
    - `/dashboard/history` 页面缺少 `Suspense` 包裹 `useSearchParams()` 的客户端组件
  - 两处问题修复后，本地 `pnpm run build` 已通过

未完成：

- `corepack pnpm exec tsc --noEmit --incremental false`
  - 在当前仓库环境中长时间无输出，未拿到结束结果。
- 本地浏览器 UI 冒烟
  - 尝试启动 `pnpm dev --hostname 127.0.0.1 --port 3001` 后，`127.0.0.1:3001` 仍返回 `ERR_CONNECTION_REFUSED`，未完成页面级验证。

## 影响文件

- `app/src/app/dashboard/video/page.tsx`
- `app/src/components/merchant/history-hub.tsx`
- `app/src/components/merchant/video-workbench.tsx`
- `app/src/contracts/draft.ts`
- `app/src/lib/db/content-draft-repository.ts`
- `app/src/lib/ui/video-job-display.ts`
- `app/src/lib/ui/video-workbench-state.ts`
- `app/src/server/api/content-generation-service.ts`
- `app/src/app/api/content/records/[draftId]/route.ts`
