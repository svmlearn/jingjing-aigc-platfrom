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

## 2026-05-02 专家容器 / 上下文工程底座

本轮根据产品讨论和参考项目结论，把“专家 = system prompt + skills + knowledge + tool policy”的底层能力先接到现有咨询 runtime。

### 已完成

1. 普通咨询 runtime 支持 `@专家` 路由：
   - 解析消息开头的 `@xxx`。
   - 按后台 `AgentConfig.displayName / agentKey / roleDescription` 匹配 enabled Agent。
   - 命中后本轮切换到目标专家容器；未命中则保留默认咨询 Agent 并记录 `mention_unresolved`。

2. 专家容器扩展：
   - 继续读取 active prompt version。
   - 继续读取 skill bindings，并保留 progressive disclosure。
   - 新增读取 knowledge set bindings，并展开为 `knowledgeDocumentIds`。
   - 支持从 `agent.modelConfig` 覆写 `model / temperature / maxRounds / retrievalTopK / enabledTools`。

3. 上下文工程注入器：
   - 新增 `consultation_context_injector_v1`。
   - 注入目标专家、商家、当前轮次、当前策略快照、知识命中数、工具执行结果。
   - 明确约束：`@` 只切换目标专家，不清空历史和策略资产。
   - 回复模型和策略资产编辑器都读取同一份共享上下文注入块。

4. 知识检索边界：
   - `searchKnowledgeChunks` 支持可选 `documentIds`。
   - 如果专家绑定了知识集，则平台知识收窄到这些文档。
   - 商家私有 indexed 知识仍保留，避免专家知识绑定误伤商家上下文。

5. 圆桌三专家兼容：
   - 将原 `phaseMeta` 包装为 `RoundtableExpertContainer`。
   - 三个固定阶段仍保持现有流程，但 UI / prompt 的 visible summary 里已有内置专家容器结构。

6. 前台专家 roster：
   - 新增 `GET /api/consultation/experts` 返回 enabled Agent 的轻量展示字段。
   - 普通咨询输入区新增专家 chip，用户点击即可插入 `@专家名 `。
   - 已有开头 `@xxx` 会被替换，新 chip 会保留后续正文。
   - assistant 消息上方会展示本轮实际命中的专家容器名称。

7. 前台圆桌入口收口：
   - 删除“咨询模式”切换条和“圆桌咨询 Beta”按钮。
   - 删除圆桌进度面板、阶段完成按钮和右侧圆桌阶段产物面板。
   - 旧圆桌会话只显示 legacy 提示，不再作为主交互入口。
   - 后端 roundtable service/API/types 先保留，避免旧会话兼容性问题。

### 验证结果

已通过：

```bash
cd app && node --test src/server/api/consultation-service.test.ts
cd app && npm run typecheck
cd app && npm run lint
git diff --check
```

`node --test` 仍有 package 未声明 ESM 的既有 warning，不影响 14 条测试通过。

### 当前边界

- 本轮没有新增数据库表。
- 本轮没有重做后台 Agent Console UI；前台 roster 当前展示所有 enabled Agent，后续需要后台增加“可被 @”开关和别名字段。
- 本轮没有删除后端圆桌 legacy 代码；只是从前台主入口移除，保留旧会话读取和兼容。
- 后续如果要“后台无限添加专家 + 前台专家 roster”，建议新增 consultation room/membership 或 session metadata，而不是继续堆在 roundtable state 里。
