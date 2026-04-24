# 2026-04-24 Cloud Demo Execution Handoff

## 1. 当前目标

继续按 `docs/handoff/2026-04-23-cloud-demo-execution-brief.md` 推进，最终交付“可真实跑通的商家平台 demo”。

本轮重点先打第一条真实闭环：

1. 商家进入咨询页
2. 真实产生会话与策略快照
3. 从咨询进入图文 / 视频页
4. 真实写入 `content_drafts / content_variants`
5. 平台管理台真实改咨询与知识参数
6. 视频保底轨改成真实 MP4

## 2. 当前分支 / worktree

- 分支：`codex/cloud-demo-execution`
- worktree：`../小红书抖音矩阵获客平台-cloud-demo`
- 基线：`main` 上 `9611de0 docs: add cloud demo execution brief`

## 3. 本轮已完成

### 3.1 咨询域基础设施

已新增：

- `app/supabase/migrations/202604240001_v01_cloud_demo_consultation_foundation.sql`
- `app/src/contracts/consultation.ts`
- `app/src/contracts/knowledge.ts`
- `app/src/lib/db/consultation-repository.ts`
- `app/src/server/api/consultation-service.ts`
- `app/src/app/api/consultation/sessions/route.ts`
- `app/src/app/api/consultation/sessions/[sessionId]/route.ts`
- `app/src/app/api/consultation/sessions/[sessionId]/messages/route.ts`

结果：

- 咨询会话、消息、事件已可真实持久化
- `strategy_snapshot` 会按轮次更新
- 会返回轻量可见执行卡片

### 3.2 图文 / 视频真实草稿落库

已新增：

- `app/src/lib/db/content-draft-repository.ts`
- `app/src/server/api/content-generation-service.ts`
- `app/src/app/api/content/article-drafts/route.ts`
- `app/src/app/api/content/video-scripts/route.ts`
- `app/src/app/api/content/records/route.ts`
- `app/src/app/api/history/records/route.ts`

结果：

- 图文工作台生成真实 `content_drafts / content_variants`
- 视频脚本生成真实 `video_script` 变体
- 内容中心与历史页不再只读 mock

### 3.3 商家端主界面切换

已新增 / 修改：

- `app/src/app/page.tsx`
- `app/src/app/dashboard/page.tsx`
- `app/src/app/dashboard/article/page.tsx`
- `app/src/app/dashboard/video/page.tsx`
- `app/src/app/dashboard/history/page.tsx`
- `app/src/app/dashboard/settings/page.tsx`
- `app/src/app/dashboard/content/page.tsx`
- `app/src/app/dashboard/import/page.tsx`
- `app/src/app/dashboard/merchant-profile/page.tsx`
- `app/src/components/app/dashboard-shell.tsx`
- `app/src/components/merchant/*`
- `app/src/app/layout.tsx`
- `app/src/app/globals.css`

结果：

- 根路由默认进入 `/dashboard`
- 商家端页面已经切成原型图暗色风格
- 主导航已换成：
  - 咨询诊断
  - 图文工作台
  - 视频工作台
  - 内容中心
  - 我的内容
  - 商家设置

### 3.4 平台管理台设置页接真实配置

已新增：

- `app/src/components/platform-admin/platform-settings-editor.tsx`

已修改：

- `app/src/app/platform-admin/settings/page.tsx`
- `app/src/contracts/platform-admin.ts`
- `app/src/lib/db/platform-admin-repository.ts`
- `app/src/server/api/schemas.ts`

结果：

- 平台管理台可真实读写：
  - `llmRuntime`
  - `consultationAgent`
  - `knowledgeRuntime`

### 3.5 视频保底轨修复

已修改：

- `app/src/server/api/video-edit-jobs-service.ts`
- `workers/video-worker/openstoryline/app/main.py`
- `workers/video-worker/worker/app/processor.py`

结果：

- 没上传素材时也能创建任务
- worker 不再因空输入直接失败
- `openstoryline-engine` 会用 `ffmpeg` 产出真实 MP4

## 4. 当前没完成的部分

### 4.1 知识库还只有底座

虽然 migration 已创建：

- `knowledge_documents`
- `knowledge_chunks`
- `knowledge_ingestion_jobs`

但还没有：

- 文档上传 API
- 入库 worker / job 流程
- 平台管理台知识库 UI

### 4.2 图文 / 视频生成还是保底 engine

目前生成逻辑是仓库内 demo engine，目标是先保证 demo 可跑。

还没做：

- 外部 LLM 真调用
- 真正的 RAG 命中链路

### 4.3 视频还未做真实云端验收

当前只做到：

- 前端能建任务
- worker stub 能编译
- stub 能产出真实 MP4

还没做：

- 真正跑一条 `video_edit_jobs` 从 `pending -> succeeded`
- 成片回写到 COS
- 页面上看到真实成片 URL

### 4.4 Completion Gate 还没过

主要欠缺：

1. 知识库上传入库与检索闭环
2. 视频真实 worker 验收
3. 至少一条录屏 / 等价验收记录
4. 更完整的 history detail route

## 5. 推荐下一步顺序

建议按这个顺序继续：

1. 先把 `knowledge_documents` 的上传 / 入库 job / 平台管理台 UI 补齐
2. 再把咨询 service 真接 `knowledge_runtime`
3. 用当前 video page 建一条真实任务，在 staging worker 上验一遍
4. 验证 COS 回写与结果预览
5. 补录屏或等价完整验收记录
6. 根据当前 checkpoint 状态决定是否继续在 `main` 上推进

## 6. 验证结果

已通过：

- `pnpm install --frozen-lockfile`
- `pnpm lint`
- `pnpm exec tsc --noEmit`
- `pnpm build`
- `python3 -m compileall workers/video-worker/openstoryline/app workers/video-worker/worker/app`

补充收口：

- 为通过 React 19 hook lint，本轮额外整理：
  - `app/src/components/dashboard/draft-detail.tsx`
  - `app/src/components/dashboard/draft-video-panels.tsx`
  - `app/src/components/merchant/consultation-workspace.tsx`

## 7. 改动文件范围

核心代码：

- `app/src/app/page.tsx`
- `app/src/app/dashboard/**`
- `app/src/app/api/consultation/**`
- `app/src/app/api/content/**`
- `app/src/app/api/history/**`
- `app/src/components/app/dashboard-shell.tsx`
- `app/src/components/merchant/**`
- `app/src/components/platform-admin/platform-settings-editor.tsx`
- `app/src/contracts/consultation.ts`
- `app/src/contracts/knowledge.ts`
- `app/src/contracts/platform-admin.ts`
- `app/src/contracts/draft.ts`
- `app/src/lib/db/consultation-repository.ts`
- `app/src/lib/db/content-draft-repository.ts`
- `app/src/lib/db/platform-admin-repository.ts`
- `app/src/server/api/consultation-service.ts`
- `app/src/server/api/content-generation-service.ts`
- `app/src/server/api/video-edit-jobs-service.ts`
- `app/src/server/api/schemas.ts`

数据与 worker：

- `app/supabase/migrations/202604240001_v01_cloud_demo_consultation_foundation.sql`
- `workers/video-worker/openstoryline/app/main.py`
- `workers/video-worker/worker/app/processor.py`

## 8. 参考项目采用情况

### 咨询 Agent

本轮实际借鉴：

- `references/open-source/hermes-agent/`

采用方式：

- 借其“有界工具循环 + 结构化快照 + 轻量可见执行”思路
- 当前没有照抄运行时，而是在 `app/src/server/api/consultation-service.ts` 里做了保底 demo engine

### 商家端视觉

本轮实际采用：

- `docs/designs/AI设计的原型图/`

主要映射：

- `src/pages/Consultation.tsx`
- `src/pages/ArticleWorkbench.tsx`
- `src/pages/VideoWorkbench.tsx`
- `src/pages/ContentCenter.tsx`
- `src/pages/History.tsx`
- `src/pages/Settings.tsx`
- `src/components/layout/MainLayout.tsx`

### 图文生成

本轮只借了“统一输入 -> 多版本输出 -> 落库”的结构思路，未直接接入上游：

- `references/open-source/AIWriteX/`

### 视频链路

本轮保留当前 worker 架构，并把本地 stub 修到能产出真实 MP4：

- `workers/video-worker/openstoryline/app/main.py`

还没有真正接：

- `references/open-source/小红书AI剪辑视频/`

## 9. Push / Merge / Commit 状态

- `codex/cloud-demo-execution` 已冻结阶段性 checkpoint commit：`1c6ae66`
- 该阶段性成果已同步进入 `main`：`82e6ada`
- Completion Gate 仍未完成

## 10. 当前建议状态

当前最合适的状态是：

- `待继续执行`
- `已具备阶段性 checkpoint 条件`
- `待知识库闭环`
- `待真实视频验收`
- `默认直接在 main 推进`

## 11. 给下一个零记忆 Agent 的续跑提示

如果你是“没有聊天记忆、只读文件接手”的下一位，请直接按下面做，不要再重走一遍探索。

### 11.1 先读这些文件，顺序不要变

1. `AGENTS.md`
2. `docs/handoff/2026-04-23-cloud-demo-execution-brief.md`
3. `docs/progress/2026-04-24-cloud-demo-execution-progress.md`
4. 本文件 `docs/handoff/2026-04-24-cloud-demo-execution-handoff.md`

读完这 4 个文件后，就可以直接继续实现，不需要再从聊天记录里找上下文。

### 11.2 先确认工作区，不要跑错地方

当前默认续跑工作区已经回到主目录：

- workspace: `/Users/wy/Desktop/静境/静境4.0/小红书抖音矩阵获客平台`
- branch: `main`

补充说明：

- 历史并行开发 worktree 仍存在：`/Users/wy/Desktop/静境/静境4.0/小红书抖音矩阵获客平台-cloud-demo`
- 它对应的分支是：`codex/cloud-demo-execution`
- 但当前这轮 cloud demo 第一阶段成果已经 cherry-pick 到 `main`，后续默认不要再切回 `-cloud-demo`，除非明确要对照旧 worktree 快照。

### 11.3 当前“已经成立”的事实

这些可以直接当真相源，不要再重新怀疑一遍：

1. 商家端主入口已经不是旧浅色后台，主页已经切到 `/dashboard` 咨询页
2. 咨询会话 / 策略快照 / 图文草稿 / 视频脚本 都已经有真实表和真实 API
3. `pnpm lint`、`pnpm exec tsc --noEmit`、`pnpm build` 已通过
4. worker Python compile 已通过
5. 视频保底轨已经不是“假 mp4 文本文件”，而是真 `ffmpeg` 生成 MP4

### 11.4 当前不要浪费时间的地方

这几处不用再重复排雷：

1. React 19 hook lint 相关阻塞已经补过一轮
2. 相关文件包括：
   - `app/src/components/dashboard/draft-detail.tsx`
   - `app/src/components/dashboard/draft-video-panels.tsx`
   - `app/src/components/merchant/consultation-workspace.tsx`
3. 现在更值得花时间的是 Completion Gate 里剩下的知识库与真实视频验收

结论：

- 不要再把时间花在同一批 lint 清障上
- 先继续完成 brief 的 Completion Gate

### 11.5 你接下来最应该做的事

不要散着修，直接按这个顺序往前推：

1. 先补 `knowledge_documents / knowledge_ingestion_jobs` 的上传、入库、列表、状态 API
2. 再补平台管理台里的知识库管理 UI
3. 再把咨询 service 真接 `knowledge_runtime` 检索，而不是只读配置
4. 然后在 staging worker 上真实跑一条 `video_edit_jobs`
5. 最后补录屏或等价验收记录

### 11.6 继续实现时优先看的代码入口

如果你要继续写：

- 咨询链路入口：
  - `app/src/server/api/consultation-service.ts`
  - `app/src/lib/db/consultation-repository.ts`
- 图文 / 视频草稿入口：
  - `app/src/server/api/content-generation-service.ts`
  - `app/src/lib/db/content-draft-repository.ts`
- 商家端页面入口：
  - `app/src/components/merchant/consultation-workspace.tsx`
  - `app/src/components/merchant/article-workbench.tsx`
  - `app/src/components/merchant/video-workbench.tsx`
- 平台设置入口：
  - `app/src/components/platform-admin/platform-settings-editor.tsx`
  - `app/src/lib/db/platform-admin-repository.ts`
- 视频 worker 入口：
  - `workers/video-worker/openstoryline/app/main.py`
  - `workers/video-worker/worker/app/processor.py`

### 11.7 如果只剩一轮上下文，先做哪一件

优先级最高的是：

- 把知识库上传 + 入库 job + 管理台列表补齐

原因：

1. 这能把 `consultation_agent / knowledge_runtime` 从“只有配置”推进到“真实生效”
2. 这是当前离 brief Completion Gate 最近、收益最高的一段缺口
3. 比先修旧 lint 更值

### 11.8 完成后别忘了补文档

如果你继续完成了新的链路，结束前至少要更新：

- `docs/progress/2026-04-24-cloud-demo-execution-progress.md`
- 本 handoff，或者新增下一份 handoff

不要把新的真实状态只留在聊天里。
