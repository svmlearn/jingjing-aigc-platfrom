# 2026-05-02 圆桌咨询多 Agent 第一版实现记录

## 目标

根据 `docs/产品文档/V2.2-圆桌咨询多Agent访谈PRD.md`，在现有 AI 咨询诊断页中落地第一版圆桌咨询模式。

本轮按轻量实现边界推进：

- 不引入第三方 agent runtime。
- 不新增 roundtable 独立表。
- 复用现有 `consultation_sessions`、`consultation_messages`、`consultation_events`。
- 固定专家链：主持人 -> 资产盘点官 -> 技能洞察官 -> 营销策略官 -> 主持人汇总。
- 阶段摘要和 handoff 写入 `consultation_events.payload.state` 与消息 `visible_summary`。
- 最终策略候选只在用户点击保存后回写 `merchant_strategy_assets`。

## 已完成

1. 新增圆桌咨询类型契约：
   - `RoundtableStateDto`
   - `RoundtablePhaseOutputDto`
   - `RoundtableHandoffDto`
   - `RoundtableActionRequest`

2. 新增圆桌咨询服务：
   - 创建圆桌会话。
   - 发送当前专家多轮追问。
   - 阶段完成后生成结构化摘要。
   - 摘要确认后进入下一位专家。
   - 营销阶段确认后生成策略候选。
   - 用户确认后保存为策略快照。

3. 新增 API：
   - `POST /api/consultation/sessions` 支持 `mode: "roundtable"`。
   - `POST /api/consultation/sessions/:sessionId/roundtable` 支持：
     - `complete_phase`
     - `confirm_phase_summary`
     - `return_to_phase`
     - `save_strategy_candidate`

4. 更新咨询页 UI：
   - 新增普通咨询 / 圆桌咨询 Beta 模式入口。
   - 新增圆桌专家链进度。
   - 新增阶段摘要确认条。
   - 新增汇总策略保存动作。
   - 右侧新增圆桌阶段产物面板。

5. 更新内容生成 input snapshot：
   - 图文生成和视频脚本生成会固化 `roundtableContext`。
   - 保证圆桌阶段摘要进入后续内容生产快照。

## 关键边界

- 普通咨询仍走原有 `sendConsultationMessageForUser` 的 bounded tool loop。
- 圆桌会话检测到 `roundtable.state.updated` 后，发送消息会切到圆桌服务。
- 圆桌阶段问答不会直接更新 `merchant_strategy_assets`。
- 只有 `synthesis_review` 且存在 `strategyCandidate` 时，才允许保存策略快照。
- TTS 未进入本轮实现。

## 验证结果

已通过：

```bash
cd app && pnpm typecheck
cd app && pnpm lint
cd app && node --test src/server/api/consultation-service.test.ts
git diff --check -- app/src/contracts/consultation.ts app/src/server/api/roundtable-consultation-service.ts app/src/server/api/consultation-service.ts app/src/server/api/content-generation-service.ts app/src/server/api/schemas.ts app/src/app/api/consultation/sessions/route.ts 'app/src/app/api/consultation/sessions/[sessionId]/roundtable/route.ts' app/src/components/merchant/consultation-workspace.tsx app/src/server/api/consultation-service.test.ts app/src/lib/db/consultation-repository.ts
```

`node --test` 有 Node 对当前 package 未声明 ESM 的既有 warning，不影响测试通过。

本地 dev server：

```text
http://127.0.0.1:3000
```

## 待验收

1. 登录商家端，进入 `/dashboard`。
2. 点击「圆桌咨询 Beta」创建圆桌会话。
3. 验证资产盘点官可以多轮追问。
4. 点击「阶段完成」，验证摘要确认条出现。
5. 点击「确认进入下一位专家」，验证进入技能洞察官。
6. 依次完成技能和营销阶段。
7. 在主持人汇总页点击「保存为策略快照」。
8. 验证右侧策略资产与内容日历更新。
9. 从内容日历进入图文或视频工作台，后端 input snapshot 应包含 `roundtableContext`。

## 状态

- Branch：`codex/v2.2-roundtable-multi-agent`
- Push：未 push
- Merge：未 merge
- Staging：未部署

## 2026-05-02 体验纠偏

用户验收时指出第一版问题：

1. 专家追问仍像硬编码流程，不像有自主判断的 agent。
2. 阶段产物用字符匹配和模板拼接，误把“我没懂你什么意思”等对话状态写成业务事实。
3. 主持人汇总也存在模板感，不能作为可信策略候选。

已修正：

- 专家追问改为 LLM `json_object` 结构化输出，基于当前 transcript、前序阶段摘要和阶段职责自主生成下一问。
- 阶段摘要改为 LLM 结构化摘要 + Zod 校验。
- 模型判断信息不足、模型未配置或结构校验失败时，系统阻止生成阶段产物，不再写伪摘要。
- 主持人汇总改为 LLM 生成完整 `strategySnapshot`，并通过 schema 校验后才进入保存确认。
- 删除硬编码问题数组、正则抽句、关键词匹配和模板策略候选。
- 补测试禁止 `buildFallbackQuestion`、`buildFieldItems`、`keywordHits` 等硬编码摘要路径回归。

追加验证：

```bash
cd app && pnpm typecheck
cd app && pnpm lint
cd app && node --test src/server/api/consultation-service.test.ts
git diff --check
```
