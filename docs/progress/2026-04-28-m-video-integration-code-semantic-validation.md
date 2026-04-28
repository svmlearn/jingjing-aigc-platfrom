# 2026-04-28 M 视频分支集成代码语义验收

## 背景

- 验收分支：`codex/integrate-m-video-work`
- 验收范围：M 分支 `gitee/孟_4.28_video-work` 合入隔离分支后的 app / worker / migration 语义一致性。
- 本轮不操作本地 `main`，不 push，不把集成分支并回主线。

## 结论

当前集成分支通过基础工程校验和 worker 合同校验，可以作为待验收集成分支继续保留。

但从 V2.1 PRD 的内容日历链路看，仍有一个业务语义缺口：视频工作台页面当前只接收 `sessionId`、`materialId`、`materialReferenceId`、`strategy`、`testMode`，没有接收 PRD 要求的 `source=consultation_calendar`、`calendarItemId`、`strategyTag`，生成视频脚本时也没有把 `calendarItemId` / `selectedCalendarItem` 固化进 `content_drafts.input_snapshot`。

这个问题不属于 Git 文本冲突，而是“代码能合并、能构建，但业务链路还没完全对齐 PRD”的问题。建议在正式并入主线前，由 W / M 确认：本次 M 分支是否只收 worker + 视频生产合同，还是要同时补齐内容日历到视频工作台的 `calendarItemId` 语义闭环。

## 已确认通过的点

1. Git 层面：W 本地基线和 M 分支的实际重叠文件只有 `AGENTS.md` 与 `docs/README.md`，app 代码文件没有同文件冲突。
2. 图文链路：`generateArticleDraftForUser` 仍保留原有 article draft 生成、素材引用消费、`generated_kind=article` 逻辑。
3. 视频脚本链路：`generateVideoScriptForUser` 会从咨询 session、素材上下文、平台脚本生产 Agent 设置中生成 `video_script` draft / variants，并要求脚本 brief 足够完整。
4. 视频任务链路：`createVideoEditJobForUser` 不信任前端传入的 `inputPayload`，会在服务端重新组装 worker 入参。
5. worker 入参合同：app 侧输出 `productionDirective`、`productionConfig`、`input_assets`；worker 侧能识别脚本锁定、目标输出、制作配置、COS 输入素材，并对非法输入失败。
6. migration 依赖：`202604280001_script_production_agent_settings.sql` 会把 `platform_settings.category` 扩展为包含 `script_production`，并插入 `script_production_agent` 默认设置。

## 需要注意的语义风险

### 1. 内容日历到视频工作台的 calendarItemId 未落地

- PRD 要求：
  - `/dashboard/video?source=consultation_calendar&sessionId=...&calendarItemId=...&strategyTag=...`
  - 生成时 `input_snapshot` 固化 `source`、`calendarItemId`、`selectedCalendarItem`、`strategyTag`。
- 当前代码：
  - `app/src/app/dashboard/video/page.tsx` 只读取 `strategy`，不读取 `source`、`calendarItemId`、`strategyTag`。
  - `app/src/server/api/content-generation-service.ts` 的视频脚本 `inputSnapshot` 未写入 `calendarItemId` / `selectedCalendarItem`。

影响：用户从内容日历点击某一条视频卡片后，系统可以根据 session 生成视频脚本，但后续无法稳定追溯“当时点击的是哪一条日历内容”。

### 2. 制作修订分流建议补一层早期权限校验

`reviseVideoScriptForUser` 在识别到 production revision 时，会直接返回 `contentVariantId` 和 `instructionText`，没有像 semantic revision 一样先调用 `assertVideoScriptVariantAccess`。后续真正创建视频任务的 `createVideoEditJobForUser` 已经会校验 variant 和 source job 权限，所以这不是当前阻断项，但建议后续补齐早期校验，让 revision API 自身也更一致。

### 3. staging 应先跑 migration 再验证平台设置页保存

`getPlatformSettings` 在缺少 `script_production_agent` 行时有默认值兜底；但 `updatePlatformSettings` 会 upsert `category=script_production`。如果 staging 数据库未先应用 migration，平台设置页保存可能被旧 check constraint 拒绝。

## 验证命令

在 `codex/integrate-m-video-work` worktree 执行：

```bash
cd app
pnpm lint
pnpm typecheck
pnpm build
node --test src/server/api/video-job-payload.test.ts src/server/api/video-growth-context.test.ts src/server/api/video-script-production-agent.test.ts src/server/api/video-chain-test-draft.test.ts
```

结果：

- `pnpm lint`：通过
- `pnpm typecheck`：通过
- `pnpm build`：通过，Next.js 生成 46 个 app routes
- `node --test ...`：22 passed

在 worker 目录执行：

```bash
cd workers/video-worker
PYTHONPATH=. pytest -q
```

结果：

- `46 passed`

## 建议下一步

1. 如果本次只想把 M 的 worker / 视频生产合同先纳入主线：可以把上述 calendarItemId 问题记录为合并后待办，但合并说明里要明确“内容日历语义闭环未完成”。
2. 如果本次合并目标是完整 V2.1 内容日历到视频工作台闭环：应先在集成分支补齐 `source`、`calendarItemId`、`strategyTag` 解析和 `input_snapshot` 落库，再做一次 staging 冒烟。
3. staging 验收前先应用 `202604280001_script_production_agent_settings.sql`，再测试平台设置页保存、视频脚本生成、视频任务创建、worker 消费任务。
