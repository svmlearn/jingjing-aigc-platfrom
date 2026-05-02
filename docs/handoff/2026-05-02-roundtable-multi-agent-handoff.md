# 2026-05-02 圆桌咨询多 Agent 交接

## 当前目标

按 `V2.2-圆桌咨询多Agent访谈PRD.md` 完成第一版圆桌咨询模式：固定专家链、多轮问诊、阶段摘要、必要上下文 handoff、最终用户确认后回写策略快照。

## 分支和状态

- Branch：`codex/v2.2-roundtable-multi-agent`
- Worktree：项目主目录
- Commit：以本分支最终提交为准
- Push：未 push
- Merge：未 merge
- 本地 dev server：`http://127.0.0.1:3000`

## 已完成内容

1. 服务层
   - 新增 `app/src/server/api/roundtable-consultation-service.ts`。
   - 圆桌状态通过 `consultation_events` 的 `roundtable.state.updated` 保存完整 state。
   - 阶段消息通过 `consultation_messages.visible_summary.roundtable` 标记 phase / agent。

2. API
   - `POST /api/consultation/sessions` 支持 `mode: "roundtable"`。
   - 新增 `POST /api/consultation/sessions/:sessionId/roundtable`。

3. 前端
   - 咨询页新增普通咨询 / 圆桌咨询 Beta 模式入口。
   - 新增专家链进度、阶段摘要确认、策略候选保存、阶段产物展示。

4. 下游快照
   - 图文 / 视频生成 input snapshot 新增 `roundtableContext`。

5. 测试
   - 更新 `consultation-service.test.ts`，覆盖固定专家链、非 swarm、最终确认后才写策略、下游 snapshot 保留圆桌上下文。

## 主要改动文件

- `app/src/contracts/consultation.ts`
- `app/src/server/api/roundtable-consultation-service.ts`
- `app/src/server/api/consultation-service.ts`
- `app/src/server/api/schemas.ts`
- `app/src/app/api/consultation/sessions/route.ts`
- `app/src/app/api/consultation/sessions/[sessionId]/roundtable/route.ts`
- `app/src/components/merchant/consultation-workspace.tsx`
- `app/src/server/api/content-generation-service.ts`
- `app/src/server/api/consultation-service.test.ts`
- `app/src/lib/db/consultation-repository.ts`
- `docs/progress/2026-05-02-roundtable-multi-agent-implementation.md`

## 验证结果

通过：

```bash
cd app && pnpm typecheck
cd app && pnpm lint
cd app && node --test src/server/api/consultation-service.test.ts
git diff --check -- app/src/contracts/consultation.ts app/src/server/api/roundtable-consultation-service.ts app/src/server/api/consultation-service.ts app/src/server/api/content-generation-service.ts app/src/server/api/schemas.ts app/src/app/api/consultation/sessions/route.ts 'app/src/app/api/consultation/sessions/[sessionId]/roundtable/route.ts' app/src/components/merchant/consultation-workspace.tsx app/src/server/api/consultation-service.test.ts app/src/lib/db/consultation-repository.ts
```

说明：

- `node --test` 会出现 package 未声明 ESM 的既有 warning，但 9 项测试通过。
- 本轮没有新增 Supabase migration。
- 本轮没有接入 TTS。

## 下一步建议

1. 产品验收 `/dashboard` 圆桌咨询完整路径。
2. 用 staging 真实账号跑一条圆桌会话，确认 `consultation_events.payload.state` 可恢复。
3. 从圆桌生成的内容日历进入图文和视频工作台，抽查 `content_drafts.input_snapshot.roundtableContext`。
4. 若要进入下一版，再评估是否把 `roundtable_sessions / roundtable_phases / roundtable_handoffs` 升级为独立表。

## 注意事项

- 普通咨询路径没有迁移，仍使用原先的单 Agent bounded tool loop。
- 圆桌第一版不做自由 swarm，不做专家横向聊天。
- 最终策略保存前不会覆盖商家级 `merchant_strategy_assets`。
- 当前 `.gitignore` 和两份 V2.2 文档在本任务开始前已存在本地改动，提交前需要决定是否一并纳入本分支。

## 验收反馈后的修正

用户指出第一版圆桌体验存在明显硬编码：

- 专家追问像固定脚本。
- 阶段产物像字符匹配。
- “我没懂你什么意思”这类沟通状态被写入阶段摘要。

已修：

- `roundtable-consultation-service.ts` 中专家追问改为模型驱动 JSON 输出。
- 阶段摘要改为模型结构化摘要 + Zod schema 校验。
- 主持人汇总改为模型生成 `strategySnapshot` + schema 校验。
- 没有模型、信息不足或结构校验失败时，不写阶段产物，只提示继续补充或重试。
- 测试新增防回归断言，禁止回到 `buildFallbackQuestion`、`buildFieldItems`、`keywordHits` 等路径。
