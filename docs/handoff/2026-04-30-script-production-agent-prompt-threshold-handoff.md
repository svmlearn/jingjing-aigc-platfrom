# 2026-04-30 短视频脚本设计大师 Prompt 调整 Handoff

## 当前目标

将 `SCRIPT_PRODUCTION_AGENT_SYSTEM_PROMPT` 从泛化的「视频工作台创作 Agent」调整为更明确的「短视频脚本设计大师」Prompt，并把系统 Prompt 收敛为纯目录。角色边界、事实优先级、信息门槛、输出格式、工具失败和合规规则拆到独立 prompt 文档模块；解释性说明另写成人类阅读文档。

## 本轮已完成

1. 将角色名称统一为「短视频脚本设计大师」，避免继续使用「视频工作台创作 Agent」或「脚本设计大师」这类不够准确的定位。
2. 将首个主板块从「目标」改为「Prompt」，更贴近本文件作为系统提示词的性质。
3. 将 `SCRIPT_PRODUCTION_AGENT_SYSTEM_PROMPT` 收敛为纯目录，目前只有 `01` 到 `07` 条目录项。
4. 系统 Prompt 不再直接写角色细则、咨询台优先级、JSON 格式、停止条件或失败规则，只列出：
   - `role_boundary`
   - `sufficiency_threshold`
   - `source_priority`
   - `initial_generation / versioning`
   - `output_contract`
   - `tool_and_failure`
5. 修正信息优先级：咨询台已确认信息是最高优先级，视频工作台、当前用户要求、历史脚本、素材限制、内容日历卡片都不能覆盖咨询台事实。
6. 修正冲突处理：如果视频工作台或用户后续要求与咨询台事实冲突，Agent 不能自行采纳新说法，必须提示用户回到咨询台更改并确认后再继续。
7. 新增 `app/src/server/api/video-script-production-agent-prompt-doc.ts`，将“角色边界”“信息足够门槛”“事实优先级”“初版生成”“修订版本”“输出契约”“工具失败与合规”全部拆进 `activePromptCards`。
8. 将完整输出格式骨架从主 payload 的 `outputSchema` 移到 `activePromptCards.output_contract.schema`。
9. 新增 `app/src/server/api/video-script-production-agent-runtime.ts`，承接类型、脚本 brief 校验、修订意图分类、LLM 输出解析和 normalize helper。
10. 将 `video-script-production-agent.ts` 从约 `594` 行压到 `84` 行，只保留系统 Prompt 目录、常量、消息构建和 re-export。
11. 将字段解释、信息门槛解释、输出状态设计解释移到 `docs/架构规范/2026-04-30-script-production-agent-prompt-design.md`，专门给人看，不再塞回 Prompt。
12. 明确视频工作台只允许补充脚本表达、素材和拍摄限制；如果缺的是业务事实，必须回咨询台补齐。
13. 补充测试，锁住纯目录系统 Prompt、独立 prompt 文档模块、入口文件行数、Agent 规则卡、咨询台最高优先级、冲突回咨询台、信息足够门槛、输出契约和“规则卡不写人类解释”。

## 改动文件

1. `app/src/server/api/video-script-production-agent.ts`
   - 更新 `SCRIPT_PRODUCTION_AGENT_SYSTEM_PROMPT` 为纯目录，并引用独立 prompt 文档模块和 runtime 模块。
2. `app/src/server/api/video-script-production-agent-prompt-doc.ts`
   - 新增 Agent 执行用规则卡与输出 schema。
3. `app/src/server/api/video-script-production-agent-runtime.ts`
   - 新增脚本制作 Agent 的类型、校验、修订分类和输出解析逻辑。
4. `app/src/server/api/video-script-production-agent.test.ts`
   - 更新并新增 prompt 结构与业务规则测试。
5. `docs/架构规范/2026-04-30-script-production-agent-prompt-design.md`
   - 新增人类阅读版 Prompt 设计说明。
6. `docs/handoff/2026-04-30-script-production-agent-prompt-threshold-handoff.md`
   - 本交接文档。

## 验证结果

已在 `D:\codexplan\jinging\app` 执行：

```powershell
node --test src/server/api/video-script-production-agent.test.ts
```

结果：`22` 个测试全部通过，`0` 失败。

运行时仍有 Node 的 `MODULE_TYPELESS_PACKAGE_JSON` 警告，提示 `package.json` 未声明 `type: "module"`，但不影响本轮测试通过；该警告不是本轮引入的功能阻塞。

## 当前工作区状态

- 工作区：`D:\codexplan\jinging`
- 当前分支：`master`
- 本轮未新开 worktree，直接在当前工作区接续修改。
- 最终 commit：无
- push / merge：未 push，未 merge
- 注意：当前工作区存在多处既有脏改动和未跟踪文件，本轮只围绕脚本制作 Agent prompt 与其测试推进，未回滚、未整理其他文件。

## 下一步建议

1. 如果继续收口脚本制作 Agent，优先检查 app 实际 UI 是否也同步使用「短视频脚本设计大师」这一命名。
2. 如果产品侧还要继续调整“咨询台 vs 视频工作台”的职责边界，需要同步修改 prompt 与测试，避免只改文案不改约束。
3. 如果要提交，建议先单独检查本轮相关两个代码文件的 diff，再决定是否把其它既有脏改动一起纳入或拆开处理。
4. 如果后续要接 M 同学开发，重点说明：业务事实只能从咨询台确认，视频工作台只做脚本表达、素材、拍摄限制的补充与修订。
