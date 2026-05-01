# 2026-05-01 咨询 Agent Skill 运行链路 Handoff

## 当前目标

确认并修复平台后台为咨询 Agent 挂载 Skill 后，商家端咨询 Agent 是否能使用该配置；同时把右侧策略资产明确为受控业务工具输出。

## 当前分支 / 基线

- Branch: `codex/integrate-main-gitee-meng-4.30`
- HEAD: `a2e5934`
- 本轮未 push、未 merge、未 commit。
- 当前工作树已有较多非本轮改动，本轮只处理咨询 Agent 相关文件。

## 已完成

1. 后台 Agent 配置页的 `挂载技能` 已支持勾选和保存。
2. 保存调用现有 API：`PATCH /api/platform-admin/agents/:agentId/skills`。
3. 咨询 runtime 会读取 `consultation_default` active route binding 对应的 Agent。
4. runtime 会读取 active Prompt Version，并在 flags 允许时替换旧平台设置里的 system prompt。
5. runtime 会读取 enabled Skill bindings，并把 enabled Skill 作为候选 Skill。
6. 候选 Skill 只披露摘要；本轮匹配后才注入 Skill Body。
7. 右侧策略资产写入点已明确为业务工具：
   - `update_strategy_snapshot`
   - `update_content_calendar`
   - `generate_article_brief`
   - `generate_video_brief`
8. 补了 source-level 测试。

## 改动文件

- `app/src/components/platform-admin/agent-console-pages.tsx`
- `app/src/server/api/consultation-service.ts`
- `app/src/components/merchant/consultation-workspace.tsx`
- `app/src/server/api/consultation-service.test.ts`
- `docs/progress/2026-05-01-consultation-agent-skill-runtime.md`
- `docs/handoff/2026-05-01-consultation-agent-skill-runtime-handoff.md`

## 验证结果

通过：

```bash
cd app && npm run typecheck
```

通过：

```bash
cd app && node --test src/server/api/consultation-service.test.ts
```

备注：

- `node --test` 有 `MODULE_TYPELESS_PACKAGE_JSON` warning，但 3 个测试均通过。

## 接手建议

下一步如果继续推进，建议优先做浏览器手工验证：

1. 进入平台后台 Agent 配置页。
2. 对线上咨询 Agent 勾选一个 enabled Skill 并保存。
3. 发起商家端咨询消息，观察 consultation events / visible summary 是否出现：
   - `agentContainer`
   - `skillDisclosure.mode = progressive_disclosure`
   - candidate skill ids
   - active skill ids
4. 验证右侧策略资产是否随消息更新：
   - 产品定位
   - 核心卖点卡
   - 目标客群
   - 当前建议
   - 营销内容日历

## 仍未完成 / 风险

- Skill 创建、编辑、启用/禁用仍是只读。
- Knowledge Set 挂载仍是只读。
- 当前 Skill 激活是关键词规则，不是完整 SkillTool。
- 没有实现 Claude Code 的 fork/inline skill 执行器、allowedTools 权限修改、usage ranking、paths 条件激活。
- 未做真实 Supabase staging 数据验证。

## 是否 push / merge

- 未 push。
- 未 merge。
- 待用户验收后再决定是否提交。

## 16:12 staging 部署与验证补充

### 部署状态

- Supabase staging：已确认 up to date。
  - `supabase migration list` 显示 `202605010001` 已在 remote。
  - `supabase db push --dry-run` 返回 `Remote database is up to date.`
- Vercel staging：已部署。
  - Deployment URL：`https://jingjing-content-platform-staging-i6bpd63w7.vercel.app`
  - Alias：`https://jingjing-content-platform-staging.vercel.app`

### 验证状态

通过：

```bash
cd app && npm run typecheck
cd app && npm run build
cd app && node --test src/server/api/consultation-service.test.ts
```

HTTP 入口检查：

- `/`：200
- `/login`：200
- `/platform-admin-login`：200

后台 API 验证：

- 后台账号登录 Server Action 成功，返回 `303 /platform-admin`。
- `/api/platform-admin/agents` 返回 online Agent：
  - `initial_consultation_agent`
  - `serviceStatus = enabled`
- `/api/platform-admin/skills` 返回 200；验证前 staging 没有 Skill。
- `PATCH /api/platform-admin/agents/:agentId/skills` 写入空数组返回 200。

商家端 API 验证：

- 商家账号登录 `/api/auth/merchant-login` 成功，返回 `303 /dashboard`。
- `/api/consultation/sessions` 返回 200。
- 新建咨询会话成功。
- 发送咨询消息成功，返回：
  - `agentContainer.agentKey = initial_consultation_agent`
  - `skillDisclosure.mode = progressive_disclosure`
  - 7 个业务工具均 `completed`
  - 右侧策略资产包含内容日历、图文 brief、视频 brief

完整 Skill E2E：

- 临时创建 staging 验证 Skill：`staging_consultation_positioning_skill`
- 临时绑定到线上咨询 Agent。
- 发送“个人IP定位、亮点优势、产品卖点、目标客群”消息后：
  - `candidateSkills` 命中该 Skill
  - `activeSkills` 命中该 Skill
  - 7 个业务工具均 completed
- 已清理：
  - 线上 Agent binding 恢复为空
  - 验证 Skill 已置为 `disabled`

### 浏览器验证备注

- Codex 内置浏览器不允许打开外部 staging URL。
- `web-access` 连接用户 Chrome 时等待授权超时，因此未完成 GUI 点击验证。
- API/SSR 验证已覆盖本次核心链路。

## 16:40 目标客群覆盖修复补充

用户在 staging 发现：Agent 回复中会说已经调整“目标客群”，但右侧资产仍保留默认值。根因是 `update_strategy_snapshot` 仍以规则重建快照为主，无法稳定识别“把目标客群改成 X”的明确覆盖意图。

当时已修：

- `update_strategy_snapshot` 调整为“策略资产 Editor”语义。
- 新增 `buildStrategyAssetEditorPatch`，识别定位、卖点、目标客群、场景、当前建议的明确编辑指令。后续 19:10 已移除，见下方“最新补充”。
- 当用户输入“目标客群改成/调整为 X”时，直接覆盖 `strategySnapshot.targetAudiences`。
- 商家端右侧策略资产由多张分散卡片收束为一个 `策略资产 Editor` 面板。

新增/继续修改文件：

- `app/src/server/api/consultation-service.ts`
- `app/src/components/merchant/consultation-workspace.tsx`
- `app/src/components/platform-admin/platform-settings-editor.tsx`
- `app/src/server/api/consultation-service.test.ts`
- `app/tsconfig.json`
- `docs/progress/2026-05-01-consultation-agent-skill-runtime.md`

验证：

```bash
cd app && node --test src/server/api/consultation-service.test.ts
cd app && npm run build
cd app && npm run typecheck
```

结果均通过。

staging 已重新部署：

- Deployment URL：`https://jingjing-content-platform-staging-66j0g22zc.vercel.app`
- Alias：`https://jingjing-content-platform-staging.vercel.app`
- 远端 build 成功，生成页面 `48/48`。

接口级目标客群覆盖验证已通过：

- 新建 staging 验证会话。
- 发送“请把目标客群调整为光明区周边科技园、科学城的年轻白领（30-40岁，年租金回报4.5%-6%），并同步更新策略资产。”
- 返回的 `strategySnapshot.targetAudiences` 精确包含该新目标客群。
- `update_strategy_snapshot` 工具卡显示为 `编辑策略资产`，状态 `completed`，summary 明确写出目标客群更新。
- 最终 alias 指向新部署后，重新读取验证会话仍返回相同目标客群和工具卡。

本轮没有 Supabase migration。

## 18:15 策略资产 Editor 工具参数补充

用户发现上一版虽然能写入字段，但本质仍偏规则抽取：如“改一下核心场景吧---我们不是门店，是房地产”会把口语和破折号一起写进核心场景。

当时已修：

- `update_strategy_snapshot` 现在优先让模型调用 `update_strategy_asset_editor` function tool。
- Agent 通过工具参数传入 `changedFields / positioning / coreSellingPoints / targetAudiences / keyScenes / currentSuggestion`。
- 当时仍保留硬规则 `buildStrategyAssetEditorPatch` 作为 fallback；后续 19:10 已移除。

验证：

- 本地：
  - `node --test src/server/api/consultation-service.test.ts`
  - `npm run typecheck`
  - `npm run build`
- staging：
  - Deployment URL：`https://jingjing-content-platform-staging-b1dx2n9d5.vercel.app`
  - Alias：`https://jingjing-content-platform-staging.vercel.app`
  - 远端 build 通过，页面 `48/48`

staging E2E：

- 新建会话：`8382ee9e-0b03-442e-97d5-803f209fe2b0`
- 用户消息：`改一下核心场景吧---我们不是门店，是房地产`
- 返回：
  - `strategySnapshot.keyScenes = ["房地产首次看房前的信任建立"]`
  - `editorPatch.mode = strategy_asset_editor`
  - `editorPatch.changedFields = ["keyScenes"]`
  - 工具卡：`编辑策略资产` / `completed`

当时结论：主链路已改为 Agent 工具调用传参；但“规则仅为 fallback”后来被判定为错误方向，已在 19:10 移除。

## 18:40 补充：工具参数校验与一次纠错重试

用户继续追问模型 tool arguments 的可靠性。本轮补齐 Claude Code 风格的 runtime 校验链路：

- `update_strategy_asset_editor` arguments 增加 Zod schema。
- 首次 tool call 后 runtime 先 `safeParse`，再清洗业务文本。
- 校验失败时，不执行落库，而是把错误作为 `role: "tool"` 的 tool result 回传给模型。
- 模型被强制重试一次 `update_strategy_asset_editor`。
- 当时重试仍失败、没有 tool call、无 API key 或模型服务不可用时，仍会走 `buildStrategyAssetEditorPatch` 兜底。后续 19:10 已改为只返回当前快照，不再语义解析。

本地验证已通过：

- `cd app && node --test src/server/api/consultation-service.test.ts`
- `cd app && npm run typecheck`
- `cd app && npm run build`

已重新部署 staging：

- Deployment URL：`https://jingjing-content-platform-staging-16lyrs3al.vercel.app`
- Alias：`https://jingjing-content-platform-staging.vercel.app`

staging API E2E 已通过：

- 核心场景验证会话：`dab522cd-379b-46f8-9dec-faf34df6d76b`
  - 用户消息：`改一下核心场景吧---我们不是门店，是房地产`
  - 返回：`strategySnapshot.keyScenes = ["房地产首次咨询前的信任建立"]`
  - 工具卡：`编辑策略资产` / `completed`
- 目标客群回归会话：`3342b992-61fe-49e7-9d4a-2bfb058e2a8d`
  - 返回：`strategySnapshot.targetAudiences = ["光明区周边科技园、科学城的年轻白领（30-40岁，年租金回报4.5%-6%）"]`

本轮没有 Supabase migration。

## 19:10 最新补充：策略资产 Editor 改为全量文档工具，runtime 不再解析中文语义

用户指出“只按中文破折号切说明、不切年龄范围里的普通横杠、按去掉括号后的主标签去重”仍然是硬编码识别和切分。这个判断正确，本轮已按该方向收口。

最新实现：

- `update_strategy_asset_editor` 的工具参数改为完整 `strategyAsset` 文档：
  - `positioning`
  - `coreSellingPoints`
  - `targetAudiences`
  - `keyScenes`
  - `currentSuggestion`
- `changedFields` 只做变化标记，不再驱动 runtime 从用户原话中抽字段。
- runtime 不再保留语义解析 fallback；失败兜底只返回当前 `strategySnapshot`。
- 已移除：
  - `buildStrategyAssetEditorPatch`
  - `extractStrategyAssetFieldValue`
  - `parseStrategyAssetList`
  - `cleanupStrategyAssetValue`
  - `isAllowedStrategyAssetListItem`
  - `extractReferencedTargetAudiences`
  - `shouldResolveReferencedTargetAudiences`
  - `completeStrategyAssetEditorPatch`
- runtime 保留的只有数据卫生：
  - Zod schema 校验
  - 必填字段非空校验
  - 字符串 trim / whitespace normalize
  - 数组去空、精确字符串去重、最大条数限制
  - 校验失败时 tool result 回灌并重试一次
- “这5个 / 刚才说的 / 这些”必须由模型基于 `recentConversation` 和 `currentStrategySnapshot` 在工具参数里解决。

最新本地验证：

- `cd app && node --test src/server/api/consultation-service.test.ts`：6 项通过。
- `cd app && npm run typecheck`：通过。
- `cd app && npm run build`：通过，页面 `48/48`。

最新 staging 验证：

- Deployment URL：`https://jingjing-content-platform-staging-hyppy49e8.vercel.app`
- Alias：`https://jingjing-content-platform-staging.vercel.app`
- 远端 build 成功，页面 `48/48`。
- 验证会话：`344ae149-5ca2-422a-b7ea-e4b7e9b1d5dc`
- 第一轮让 Agent 提出 5 个目标客群，线上写入：
  - `都市年轻白领`
  - `创意设计师及自由职业者`
  - `三口之家或小家庭`
  - `首次购房者`
  - `投资型购房者`
- 第二轮用户说“你刚才说的这5个目标客群都要加进去，放到我的策略资产里的目标客群”，线上返回仍为上述 5 个群体。
- 未检测到 `门店 3 公里 / 门店周边上班族 / 新客体验人群`。
- 未检测到 Markdown 标记。
- 工具卡：`update_strategy_snapshot / 编辑策略资产 / completed`。

当前可交接结论：

- 策略资产右侧 Editor 链路已改为 Agent 全量文档工具调用。
- runtime 只校验和保存，不再做中文语义抽取、切分、主标签去重或旧模板过滤。
