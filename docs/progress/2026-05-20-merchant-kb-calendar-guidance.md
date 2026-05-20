# 2026-05-20 用户知识库沉淀到营销日历与 Dify 输入

## 背景

用户确认：咨询台 / 选题 AI 在聊天时需要读取用户端上传的知识库，并把筛选后的项目事实、卖点、边界和素材提示沉淀到营销日历。后续成员端每日任务调用 Dify 时，营销日历内的指导信息要进入 `task.knowledgeRefs`，再进入 Dify 输入。

当前 Dify 内部也有知识库，但本轮改造的重点不是替代 Dify 检索，而是把咨询台已经筛选过的用户知识库上下文作为强指导传入。

## 改动

- 新增 `ContentCalendarGuidanceDto` / `ContentCalendarKnowledgeRefDto`，在营销日历项上可选保存知识库指导。
- 新增 `app/src/lib/content-calendar-guidance.ts`：
  - 只从 `scope === "merchant"` 的知识库命中中提炼日历指导。
  - 保留 document / chunk 来源、摘要、必须参考事实、内容角度、合规边界和素材提示。
  - 支持从日历项收集 `knowledgeRefs` 和 guidance summary。
- 咨询台保存策略资产前，把本轮命中的用户知识库片段附加到 `contentCalendarDraft[].guidance`。
- `toStrategySnapshot` 反序列化时保留日历 guidance，避免从 DB 读回后丢失。
- 每日内容任务生成时，从选中的图文 / 视频日历项收集 guidance，写入：
  - `teamCalendarSource.calendarGuidance`
  - `knowledgeRefs`
  - 素材检索 query / material hints
- Dify input snapshot 打包时，`viralReferences` 和 `fallback_knowledge_text` 保留知识库来源、chunkId、documentId、摘要、角度和边界。

## 验证

- `node --test src/lib/content-calendar-guidance.test.ts src/server/api/consultation-service.test.ts`：41 passed
- `pnpm --dir app typecheck`：通过
- `pnpm --dir app lint`：通过
- `pnpm --dir app build`：通过

说明：新 worktree 初始没有 `node_modules`，已用 `pnpm --dir app install --frozen-lockfile --offline` 从本地 pnpm store 恢复依赖；`app/node_modules/` 和 `app/.next/` 均为忽略文件，不纳入提交。

## 分支

- branch：`codex/kb-calendar-guidance`
- worktree：`/Users/wy/.codex/worktrees/kb-calendar-guidance`
- 状态：已实现、已验证，待用户确认后合并 / push。

## 2026-05-20 部署补充

- 本地 `main` 先合入本次知识库日历指导提交 `3328185`。
- 为避免服务器回滚，随后合入 `gitee/codex/domestic-infra-migration` 中已在服务器侧使用的 worker/OpenStoryline 修复：
  - `e7c78db fix: reject worker filter clips fallback`
  - `4652a1c fix: extend openstoryline run timeout`
  - `e5c8e18 chore: align domestic worker timeout template`
- 最终代码部署基线：`fcf7b6d`。
- Gitee `main`：已推送到 `fcf7b6d`。
- GitHub `main`：已推送到 `fcf7b6d`。
- Aliyun ECS release：`/srv/jingjing-domestic/releases/20260520121313-fcf7b6d`。
- `/srv/jingjing-domestic/current` 已切到该 release。
- 重启服务：
  - `jingjing-domestic-app.service`
  - `jingjing-firered-openstoryline.service`
  - `jingjing-openstoryline-engine.service`
  - `jingjing-video-worker.service`

部署后验证：

- `systemctl is-active`：四个服务均为 `active`。
- `GET http://127.0.0.1:3000/api/health`：`ok: true`，DB `postgres`，storage `aliyun_oss`。
- `GET http://127.0.0.1:8000/ready`：OpenStoryline `ready`，adapter `fire_red`，FireRed runtime assets ready。
- `GET http://127.0.0.1:3000/login`：HTTP `200`。

观察到的既有运行事实：

- 部署前 worker 最新任务 `7a148613-8c5d-4108-aeb5-9411362a42f1` 已在 `2026-05-20 11:52` 因 `FireRed stream run timeout after 900s` 失败。
- 本次合入并部署了 1800s timeout 相关修复，后续真实 AI 剪辑任务需要继续观察是否能越过该超时点。
