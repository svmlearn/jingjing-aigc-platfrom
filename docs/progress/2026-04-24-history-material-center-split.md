# 2026-04-24 我的内容 / 素材中心边界修正

时间：2026-04-24 20:27 CST

更新：2026-04-24 20:48 CST，已补素材中心后端持久化与 staging 部署。

## 目标

根据 staging 浏览器批注，先修正两个信息架构问题：

1. `我的内容` 不再承接咨询聊天记录；咨询历史已经移动到 `咨询诊断` 页右侧抽屉。
2. `内容中心` 实际应为 `素材中心`，用于上传素材和找对标，不再展示图文/视频工作台草稿。

## 本轮改动

- `app/src/app/api/history/records/route.ts`
  - 移除咨询会话读取。
  - `/api/history/records` 只返回图文草稿 bundle 与视频任务。
- `app/src/components/merchant/history-hub.tsx`
  - 删除 `咨询` 分类和咨询记录渲染分支。
  - 保留 `全部 / 图文 / 脚本 / 视频任务`。
  - 增加归档搜索框。
- `app/src/components/merchant/content-center.tsx`
  - 重做为独立 `素材中心`。
  - 空态说明改为素材库语义。
  - 支持 `上传素材` 弹窗和 `找对标` 弹窗。
  - 已改为调用后端 API 读取和写入素材，不再只保存在当前浏览器状态。
- `app/src/contracts/material.ts`
  - 新增素材库 DTO、素材来源、素材状态、送入工作台引用类型。
- `app/src/lib/db/material-library-repository.ts`
  - 复用现有 `source_items` 表保存素材库记录。
  - 使用 `trace_payload.materialLibrary = true` 标记素材中心记录。
  - 使用 `structure_summary / engagement_snapshot` 保存素材类型、状态和互动标签。
  - `send-to-workbench` 会设置 `is_selected_for_rewrite = true`，并在 `trace_payload.materialWorkbenchReferences` 追加引用记录。
- `app/src/server/api/material-library-service.ts`
  - 新增素材中心服务层：上传素材、生成对标样本、送入工作台。
- `app/src/app/api/materials/**`
  - `GET /api/materials`：读取当前商家的素材库。
  - `POST /api/materials`：保存上传链接为素材记录。
  - `POST /api/materials/benchmark-search`：保存找对标结果为素材记录。
  - `POST /api/materials/[materialId]/send-to-workbench`：保存素材送入图文/视频工作台的引用。
- `app/src/components/app/dashboard-shell.tsx`
  - 导航文案从 `内容中心` 改为 `素材中心`。
- `app/src/components/merchant/consultation-workspace.tsx`
  - 右侧 `营销内容日历` 的 `查看全部` 从 `/dashboard/content` 改到 `/dashboard/history`，避免再跳到素材中心。

## 验证

- `npm run lint`：通过。
- `npm run build`：通过。
- Vercel staging deployment：通过。
  - Inspect URL: `https://vercel.com/neveraloofwy-4960s-projects/jingjing-content-platform-staging/miPVjiipvwfnoFKfzFoEwMNkVpjr`
  - Deployment URL: `https://jingjing-content-platform-staging-dmhe01t07.vercel.app`
  - Alias: `https://jingjing-content-platform-staging.vercel.app`
- 素材中心后端版二次部署：通过。
  - Inspect URL: `https://vercel.com/neveraloofwy-4960s-projects/jingjing-content-platform-staging/8uybmYUF2bW1spNB5q6MbiScPXnA`
  - Deployment URL: `https://jingjing-content-platform-staging-2ny8p535j.vercel.app`
  - Alias: `https://jingjing-content-platform-staging.vercel.app`
- 线上 HTML 轻量验证：
  - `/dashboard/content` 已出现 `素材中心 / 对标素材与上传素材 / 上传素材 / 找对标 / Your Library is Empty`。
  - `/dashboard/history` 筛选区为 `全部 / 图文 / 脚本 / 视频任务`，不再出现 `咨询` 分类。
- 线上 API 轻量验证：
  - 未登录访问 `GET /api/materials` 返回 `401 UNAUTHENTICATED`，说明路由已部署且受商家登录保护。
  - `/dashboard/content` HTML 已包含 `正在读取素材库`，说明页面已切到后端读取流程。

## 后续建议

- 当前素材中心已经真实入库到 `source_items`。
- 下一步需要把“上传链接解析 / 找对标检索”从当前的占位样本生成，替换为真实 provider：
  - 上传链接解析：拉取标题、正文/脚本、封面、互动数据、评论摘要。
  - 找对标：接小红书/抖音检索 provider，保存真实返回的素材样本。
  - 工作台消费：图文/视频工作台读取 `materialId / materialReferenceId` 后，把素材拆解真正带入生成上下文。
