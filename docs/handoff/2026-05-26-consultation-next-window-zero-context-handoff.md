# 2026-05-26 咨询 Agent 后续工作零上下文交接

## 交接目的

这是给下一个全新上下文窗口看的接续文件。新的 Agent 即使没有聊天记忆，也应能通过本文件和引用文件继续推进：

1. 小分支修复“删除咨询聊天记录后，历史面板反复重新加载”。
2. 结构性分支拆分策略资产，把流程字段和内容草稿从策略资产里移走。
3. P1 分支做商家资料上下文瘦身。
4. 最终完成 `docs/产品文档/2026-05-26-咨询Agent工具结果与策略资产边界修订.md` 里的剩余内容。

## 当前仓库状态

工作目录：

- `/Users/wy/Desktop/静境/静境4.0/小红书抖音矩阵获客平台`

当前主线事实：

- 本地分支：`main`
- 本交接写入前 HEAD：`d851f9a docs: record real db account bootstrap`
- `main` 已本地合并咨询 Agent 工具结果与策略资产边界修复。
- `main` 已本地提交真实 DB 账号初始化 progress 记录。
- 写入本交接前，本地 `main` 比 `origin/main` 和 `gitee/main` 都领先 2 个 commit。
- 本交接文件提交后，本地 `main` 会再多 1 个 docs commit，因此预计比两个远端领先 3 个 commit。
- 当前尚未 push 到 GitHub / Gitee。
- 当前尚未部署服务器。

已合入但未推送的关键 commit：

1. `a1c5a05 fix: align consultation tool loop with tool results`
   - 咨询 Agent 工具结果、策略资产边界、runtime context 对齐 Claude Code 风格。
2. `d851f9a docs: record real db account bootstrap`
   - 记录真实服务器账号初始化事实，不包含明文密码、连接串、hash 或密钥。

下个窗口开始时先跑：

```bash
git status --short
git log --oneline --decorate --max-count=6
git rev-list --left-right --count origin/main...main
git rev-list --left-right --count gitee/main...main
```

如果用户要先上线已合并内容，再 push 两个远端并走服务器部署；如果用户要继续开发，则先为新任务开 worktree，不要直接在主目录做中大型改动。

## 必读文件

进入新窗口后按顺序读：

1. `AGENTS.md`
2. `docs/README.md`
3. 本文件：`docs/handoff/2026-05-26-consultation-next-window-zero-context-handoff.md`
4. `docs/产品文档/2026-05-26-咨询Agent工具结果与策略资产边界修订.md`
5. `docs/progress/2026-05-26-consultation-claude-code-alignment.md`
6. `docs/handoff/2026-05-26-consultation-claude-code-alignment-handoff.md`
7. `docs/progress/2026-05-26-real-db-account-bootstrap.md`
8. `docs/架构规范/2026-05-20-Agent架构易错点.md`
9. `docs/架构规范/2026-05-22-Claude-Code上下文工具Skill机制调研与咨询Agent改造指引.md`
10. 本地 Claude Code 参考项目：
    - `references/open-source/claude-code项目/claude-code-main/src/query.ts`
    - `references/open-source/claude-code项目/claude-code-main/src/services/tools/toolExecution.ts`
    - `references/open-source/claude-code项目/claude-code-main/src/services/tools/toolOrchestration.ts`
    - `references/open-source/claude-code项目/claude-code-main/src/utils/messages.ts`

产品基准的原始来源也在：

- `/Users/wy/.codex/worktrees/consultation-small-fixes/docs/产品文档/2026-05-26-咨询Agent工具结果与策略资产边界修订.md`

主目录已带入同名产品文档；原则上以后以主目录版本为当前真相源。

## 已完成内容

已完成并验收通过：

1. `update_strategy_snapshot` 对模型只暴露 `{}`。
2. 工具失败原因回到 tool result。
3. native / JSON tool result 带 `is_error` 语义。
4. `update_content_calendar.calendar` 改为必填，避免空参数假完成。
5. 去掉自然语言“已更新”检测器。
6. runtime context 去掉模型可见的 `conversationContext.round/stage/summaryText/recentMessages`。
7. 内容日历拆为模型可见的独立 `contentCalendarContext`。
8. 策略资产模型目标字段收敛为：
   - `positioning`
   - `coreSellingPoints`
   - `targetAudiences`
   - `keyScenes`
   - `strategyTags`
   - `strategyMarkdown`
9. `currentSuggestion` 不再作为策略资产 Editor、runtime context、工具 schema 的目标字段；只剩旧 DTO / 历史数据兼容。
10. `generate_article_brief` / `generate_video_brief` 继续对咨询台 Agent 隐藏。
11. 产品文档、progress、handoff 已写入并通过主线程验收。

验收命令已通过：

```bash
git diff --check c00ae07f2c670a6c6d3a35f6a8570bc6f51dc8a2..HEAD
node --test app/src/server/api/consultation-service.test.ts
cd app && npm run typecheck
cd app && npm run lint
cd app && npm run build
```

注意：这些命令是在 `a1c5a05` 合入前后验证的。后续如果继续改代码，必须重新跑对应验证。

## 未完成内容

产品文档里仍未完成的重点：

1. 删除咨询聊天记录后，历史面板反复进入重新读取状态。
2. 策略资产物理拆分：
   - 从 `StrategySnapshotDto` 中拆出 `contentCalendarDraft`
   - 拆出 `contentCalendarGeneration`
   - 拆出 `articleBrief`
   - 拆出 `videoBrief`
   - 废弃 / 迁移 `currentSuggestion`
3. P1：商家资料上下文瘦身：
   - 当前 `merchantProfileContext` 仍包括商家 ID、名称、行业、服务项目、品牌摘要、区域摘要、表达风格、默认 CTA、禁用词。
   - 产品决策是后续不要每轮把完整商家资料整包塞给模型。

## 推荐后续顺序

不要把三个任务揉成一个大分支。建议严格按下面顺序做。

### 任务 A：小分支修删除历史反复加载

优先级最高，范围最小。

推荐 branch：

- `codex/consultation-history-delete-loading-fix`

推荐 worktree：

- `/Users/wy/.codex/worktrees/consultation-history-delete-loading-fix`

已定位的主要入口：

- `app/src/components/merchant/consultation-workspace.tsx`
  - `loadSessions`：每次调用会 `setLoading(true)`、`setSessionsLoaded(false)`。
  - `toggleHistoryDrawer`：打开历史抽屉时会再次 `loadSessions(sessionId ?? undefined)`。
  - `deleteHistorySession`：删除成功后会清空当前 session，再 `await loadSessions()`。
  - 自动新建会话 effect：当 `sessionsLoaded && !loading && sessions.length === 0 && !creating` 时会自动 `createSession()`。
  - 历史抽屉 UI 使用同一个 `loading` 状态展示“正在读取咨询聊天记录...”。
- `app/src/app/api/consultation/sessions/route.ts`
  - `GET` 列表，`POST` 新建。
- `app/src/app/api/consultation/sessions/[sessionId]/route.ts`
  - `GET` 详情，`DELETE` 删除。
- `app/src/lib/db/consultation-repository.ts`
  - `listConsultationSessions`
  - `deleteConsultationSession`

当前可疑原因：

1. `loading` 同时服务主会话区和历史抽屉，删除后 `loadSessions()` 会让抽屉反复进入读取态。
2. 删除最后一个会话时，列表为空会触发自动新建会话 effect；这和历史抽屉删除流程叠在一起，容易形成“删除 -> 重新拉取 -> 自动新建 -> 再拉取”的观感。
3. 删除当前 session 后先 `setSession(null)`、`setSessionId(null)`，随后 `loadSessions()` 内又会按列表第一项或空值重设 session；状态切换可能让详情加载和列表加载交错。

产品期望：

- 删除历史记录后，不要让历史抽屉长时间或反复显示“正在读取咨询聊天记录...”。
- 删除非当前会话：从历史列表中即时移除，不影响当前对话。
- 删除当前会话且仍有其他会话：自动切到下一个最近会话。
- 删除当前会话且没有其他会话：可以创建新会话，但历史抽屉应稳定显示空态或新列表，不应无限 loading。
- 删除失败：恢复原列表或保留列表，显示错误。

建议实现方向：

1. 拆分 `loading`：
   - 主区会话详情 loading
   - 历史列表 loading / refreshing
   - 删除中 session id
2. 删除成功后先做乐观更新：
   - `setSessions((current) => current.filter((item) => item.id !== deletedId))`
   - 根据剩余列表决定 `sessionId`
   - 避免无条件 `await loadSessions()` 造成整抽屉重新加载。
3. 自动新建会话 effect 增加来源判断或 guard：
   - 不要在“用户刚刚删除历史、抽屉还在处理删除”的瞬间立即触发重复新建。
   - 可以引入 `isDeletingHistorySession` 或 `skipAutoCreateOnce` 之类的 UI 状态，但命名要清楚，别把业务状态塞给 Agent。
4. 列表刷新可以后台做，不要阻塞抽屉内容区。

验证建议：

```bash
cd app && npm run typecheck
cd app && npm run lint
cd app && npm run build
```

如果增加测试，优先写源码级或组件行为测试；如果当前项目没有前端测试环境，不要强行引入大测试框架。

浏览器验证建议：

1. 启动本地 app。
2. 登录商家端。
3. 新建 2 个咨询会话。
4. 打开历史记录，删除非当前会话。
5. 删除当前会话。
6. 删除最后一个会话。
7. 确认历史抽屉不会反复卡在“正在读取咨询聊天记录...”。

### 任务 B：结构性分支拆策略资产

在任务 A 合并后再做。

推荐 branch：

- `codex/strategy-asset-structure-split`

推荐 worktree：

- `/Users/wy/.codex/worktrees/strategy-asset-structure-split`

目标：

把策略资产变成长期策略资产，不再混入流程状态和内容生产草稿。

当前主要入口：

- `app/src/contracts/consultation.ts`
  - `StrategySnapshotDto` 仍包含：
    - `currentSuggestion`
    - `contentCalendarDraft`
    - `contentCalendarGeneration`
    - `articleBrief`
    - `videoBrief`
- `app/src/lib/strategy-snapshot.ts`
  - `emptyStrategySnapshot`
  - `toStrategySnapshot`
- `app/src/lib/db/merchant-strategy-asset-repository.ts`
  - 商家级策略资产持久化。
- `app/src/lib/db/consultation-repository.ts`
  - `consultation_sessions.strategy_snapshot` 仍保存 session 冗余快照。
- `app/src/server/api/consultation-service.ts`
  - 策略资产构造、内容日历写入、brief 兼容逻辑。
- `app/src/server/api/consultation-runtime/context.ts`
  - `contentCalendarContext` 已作为模型可见独立上下文，但底层数据仍来自旧 snapshot 字段。
- `app/src/components/merchant/consultation-workspace.tsx`
  - 右侧策略资产、内容日历 UI 仍从 `session.strategySnapshot` 读取。
- `app/db/migrations/202605130001_domestic_core_baseline.sql`
  - `consultation_sessions.strategy_snapshot` 当前是 JSONB 冗余。

不要一上来就直接删字段。推荐分阶段：

1. 定义新 DTO / 合同：
   - `StrategyAssetSnapshotDto` 或类似：只含长期策略字段。
   - `ContentCalendarContextDto` 或类似：承载日历条目和生成状态。
   - `ArticleBriefDto` / `VideoBriefDto` 如仍需要，进入工作台或任务草稿对象。
2. 保留旧数据读取兼容：
   - `toStrategySnapshot` 可以先从旧 JSON 中迁移读出。
   - 旧 `currentSuggestion` 只作为迁移来源，不进入新模型上下文。
3. 先改应用层数据流，再考虑 DB migration：
   - 先让 API response 可以同时给新字段和旧兼容字段。
   - 等 UI 和 runtime 都用新字段后，再做 migration 或长期兼容清理。
4. 内容日历下游要小心：
   - 团队内容生成链路还依赖 `contentCalendarDraft`。
   - `contentCalendarGeneration` 还影响“已生成团队内容后修改日历”的提醒。

验收标准：

- 模型可见策略资产仍只含 6 个目标字段。
- 内容日历仍能显示、更新、生成团队本周内容。
- 老会话里的旧 snapshot JSON 能被读出，不造成空日历或空策略。
- `currentSuggestion` 不再作为新写入字段。
- 图文 / 视频 brief 不重新暴露给咨询 Agent。

### 任务 C：P1 商家资料上下文瘦身

在任务 B 稳定后再做，不建议提前做。

推荐 branch：

- `codex/merchant-profile-context-slimming`

推荐 worktree：

- `/Users/wy/.codex/worktrees/merchant-profile-context-slimming`

当前入口：

- `app/src/server/api/consultation-runtime/context.ts`
  - `buildConsultationRuntimeContextMessage`
  - 当前 `merchantProfileContext` 包括：
    - `merchantId`
    - `name`
    - `industry`
    - `serviceItems`
    - `brandSummary`
    - `regionSummary`
    - `toneStyle`
    - `defaultCta`
    - `forbiddenWords`

产品决策：

- 不再每轮把完整商家资料整包塞给模型。
- 商家 ID 主要用于系统内部定位，不应作为模型理解业务重点。
- 禁用词、默认 CTA、表达风格属于输出约束或风格资料，应和商家事实分层。
- 保留必要身份和业务事实，其他字段进入按需上下文或压缩摘要。

建议方向：

1. 拆成多个上下文块：
   - `merchantIdentityContext`
   - `merchantBusinessFactsContext`
   - `outputStyleConstraints`
   - `safetyLanguageConstraints`
2. 保持代码只传事实，不写死模型判断。
3. 长字段走预算和 compact，不在 prompt 里堆长解释。

验收标准：

- 咨询 Agent 仍能知道商家是谁、做什么、服务谁。
- 不把商家 ID 当业务内容重点。
- 输出风格 / CTA / 禁用词不和事实字段混成一个大对象。
- 不回退到“关键词判断才给上下文”的僵硬逻辑。

## 工作方式要求

1. 满足多文件或多轮改动时，必须开 worktree。
2. 任务 A 可以小分支直接实现；任务 B 建议用 subagent：
   - implementer 在 worktree 修改。
   - code-reviewer 审查后再合并。
3. 不要在同一个分支同时做 A/B/C。
4. 不要把“探索想法”写成已实现事实。
5. 每个分支结束都要写：
   - `docs/progress/...`
   - 如未推送或未部署，写 `docs/handoff/...`
6. push / deploy 需要用户明确授权。

## 推送和部署提醒

截至本交接创建时：

- 本地 `main` 有咨询 Agent 修复和真实 DB 账号 progress 记录。
- 尚未推送 GitHub：`origin git@github.com:svmlearn/jingjing-aigc-platfrom.git`
- 尚未推送 Gitee：`gitee git@gitee.com:jingjing_2025/jingjing-content-platform.git`
- 尚未部署服务器。

如果下个窗口先处理上线：

1. 确认 `git status --short` 干净。
2. `git push origin main`
3. `git push gitee main`
4. 按当前国内自托管部署文档执行服务器部署。
5. 部署后至少验证：
   - `/api/health`
   - 商家登录
   - `/dashboard/consultation`
   - 咨询 Agent 能正常打开历史记录和当前会话

不要把 push / deploy 状态写成已完成，除非真的执行过。

## 风险和边界

- 当前真实服务器已有账号初始化记录，但本交接不包含明文密码。
- `contentCalendarDraft` 仍是多个下游链路的数据源，拆分时不要只改类型不改调用点。
- `currentSuggestion` 仍在旧 DTO 和旧 JSON 兼容中，直接删除会破坏历史会话。
- 历史记录删除问题看起来是前端状态问题，但仍要确认 `DELETE /api/consultation/sessions/[sessionId]` 和 repository 删除是幂等、权限正确、无 404 误报。
- 不要引入 `tools-suggestion` 或自然语言“已更新”检测器，前一轮已明确否定。
- 不要把 `round/stage/summaryText/recentMessages` 重新塞回模型可见 runtime context。

## 新窗口第一句建议

如果用户说“继续”，新 Agent 可以这样接：

> 我会先读 `docs/handoff/2026-05-26-consultation-next-window-zero-context-handoff.md`、产品修订文档和上一轮 progress，然后开 `consultation-history-delete-loading-fix` worktree，先修删除历史记录后反复 loading 的小问题。这个分支只碰咨询历史 UI / session API 相关范围，不动策略资产拆分。
