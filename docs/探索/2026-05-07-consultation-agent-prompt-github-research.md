# 2026-05-07 咨询 Agent 提示词 GitHub 检索报告

## 1. 需求摘要

- 主题：战略咨询 / 商家经营咨询 / 产品策略 / Agent `agent.md` 与 `soul.md` 提示词。
- 数量：Top 10。
- 最低 stars：默认 `>= 100`，但实际检索中对“战略咨询 prompt”精确硬过滤召回很低，所以最终采用“先广泛召回，再按仓库级 stars 与内容相关性重排”。
- 排序模式：相关性优先。
- 目标形态：资料清单 / 方法论 / 可复用提示词结构。
- 偏好：适合沉淀到静境咨询 Agent；要支持一问一答、业务澄清、策略资产沉淀和空资料防污染。
- 排除：泛泛 one-line prompt 清单、纯营销文案 prompt、归档仓库、和当前咨询 Agent 无关的工程仓库。

检索时间：

- GitHub Search API 初筛：2026-05-07 18:22-18:37 CST。
- GitHub Repo API 元数据复查：2026-05-07 18:35 CST。
- 配额状态：Search API 复查结束时 remaining=0；Repo API 元数据抓取结束时 remaining=9。

## 2. 检索词清单

Query-1: `strategy consultant prompt agent.md soul.md`  
目的：查战略咨询 Agent 资产结构。

Query-2: `business advisor system prompt agent`  
目的：查商业顾问类 system prompt。

Query-3: `consulting agent prompt strategic thinking`  
目的：查咨询顾问与战略思维表达。

Query-4: `product manager prompts strategy roadmap`  
目的：补产品策略、路线图、PRD advisor 场景。

Query-5: `startup consultant prompt chatgpt`  
目的：补创业顾问、商业计划诊断协议。

Query-6: `marketing consultant prompt chatgpt`  
目的：只作为咨询流程参考，不作为营销专家替代。

Query-7: `prompt engineering guide agent system prompt`  
目的：补提示词工程、约束、可靠性规则。

Query-8: `agent personas SOUL AGENTS prompt`  
目的：查 `SOUL.md`、persona、agent workspace 类结构。

Query-9: `product management skills strategy canvas agent`  
目的：查可复用 PM skill / strategy canvas。

Query-10: `professional prompts consultation business plan`  
目的：查专业服务式远程咨询协议。

说明：精确 query + GitHub stars 硬过滤召回很低，后续放宽到 prompt hub、PM skills、professional prompts、system prompt library 方向，合并后深读。

## 3. 筛选与重排规则

- 硬过滤：公开仓库、未归档、stars 约等于或高于 100。
- 相关性：优先选择有完整 prompt、agent persona、工作流、澄清问题、策略框架的仓库。
- 适配性：优先选择能直接转化为“初始咨询 Agent”的角色边界、追问节奏和输出规范的仓库。
- 成熟度：README / 示例 / 文件组织清楚者优先。
- 风险：license 不清或 GPL / CC-SA 类内容只借鉴结构，不复制正文。

## 4. 结果总览

- 精确搜索：10 组 exact query 召回不足，多数组合为 0。
- 放宽搜索：围绕 prompt hub、PM skills、professional prompts、system prompt library 召回候选。
- 深读候选：12 个仓库。
- 入选 Top 10：10 个仓库。
- 最终落地策略：不复制外部 prompt 原文，只抽象为四类结构：
  - `agent.md`：职责、边界、工作流、判断框架、输出规范、禁止行为。
  - `soul.md`：人格、语气、acknowledgement、追问节奏、压力场景回应。
  - 空资料 guardrail：未知必须保持未知，禁止行业脑补。
  - 策略咨询流程：一问一答，先澄清事实，再沉淀资产。

## 5. Top 10 单榜

| 仓库 | 星标 | 仓库归属类型 | 项目介绍（是什么 + 推荐理由） | 其它信息补充 | 链接 |
|---|---:|---|---|---|---|
| `LichAmnesia/GPT-Prompt-Hub` | 2,358 | 方法论 / Prompt Hub | 收录结构化商业、产品、策略 prompt。最有价值的是“strategy consultant / product advisor”这类 prompt 的模块化结构：先定义角色，再要求澄清上下文、使用框架、输出可决策 artifact。适合转成咨询 Agent 的 `agent.md` 主骨架。 | License: MIT；updated: 2026-05-07；风险低，仍不直接复制正文。 | https://github.com/LichAmnesia/GPT-Prompt-Hub |
| `Troyanovsky/AI-Professional-Prompts` | 123 | 垂直场景方案层 | 专业咨询服务 prompt 集，Startup / Marketing / AI consultant 都强调“单次远程咨询协议、一步一步、一轮一个问题、进入下一步前总结已知”。非常适合修正当前咨询 Agent 的对话节奏。 | License: CC-BY-SA-4.0；updated: 2026-04-29；可借鉴结构，避免正文复制。 | https://github.com/Troyanovsky/AI-Professional-Prompts |
| `deanpeters/product-manager-prompts` | 847 | 方法论 / PM prompt | 面向产品经理的策略、路线图、PRD prompts，核心价值是把 AI 当成“帮助用户思考”的顾问，而不是填表工具。适合咨询 Agent 的“先澄清 context，再给策略输出”的原则。 | License: MIT；updated: 2026-05-07；Python repo，内容主体是 prompts。 | https://github.com/deanpeters/product-manager-prompts |
| `deanpeters/Product-Manager-Skills` | 4,063 | Skill / 方法论层 | PM skills 框架，提供 product strategy session、target customer、problem framing、opportunities、prioritization、success metrics 等稳定输出结构。适合后续把咨询 Agent 能力拆成 skill。 | License: GitHub 返回 NOASSERTION；updated: 2026-05-07；需复核具体文件 license。 | https://github.com/deanpeters/Product-Manager-Skills |
| `phuryn/pm-skills` | 10,973 | Skill 市场 / 产品策略层 | 覆盖 product strategy、discovery、growth，多数 skill 用输入要求、步骤、输出结构描述能力。适合借鉴“业务模式、用户假设、风险假设、实验验证”的咨询资产字段。 | License: MIT；updated: 2026-05-07；适合做下一阶段咨询 skills 来源。 | https://github.com/phuryn/pm-skills |
| `nidhinjs/prompt-master` | 7,237 | Prompt 工程方法论 | 强调 identity、hard rules、output lock、成功标准、停止条件，以及避免 vague verbs / no success criteria / over-permissive agent。适合给咨询 Agent 加“不要含糊追问、不要过度授权、不要污染资产”的硬规则。 | License: MIT；updated: 2026-05-07；更多是 prompt 质量准则。 | https://github.com/nidhinjs/prompt-master |
| `alirezarezvani/claude-skills` | 13,978 | Agent persona / Skill 集合 | 包含 persona-based agents 和多类 skill，persona 结构强调 identity、mission、critical rules、capabilities、workflow、communication style、success metrics。适合拆分 `agent.md` 与 `soul.md`。 | License: MIT；updated: 2026-05-07；内容很广，需只取 persona 组织方式。 | https://github.com/alirezarezvani/claude-skills |
| `dair-ai/Prompt-Engineering-Guide` | 74,287 | 方法论 / 研究层 | 通用 prompt engineering 教程与可靠性资料，不是咨询 prompt，但可提供基础原则：明确任务、上下文、约束、输出格式和可靠性。适合做底层提示词规范参考。 | License: MIT；updated: 2026-05-07；偏通用。 | https://github.com/dair-ai/Prompt-Engineering-Guide |
| `msitarzewski/agency-agents` | 94,567 | Agent persona / Workspace 层 | 多 Agent persona 与集成方式，强调每个 Agent 有 personality、process、deliverables，并在某些集成中拆出 `SOUL.md` / `AGENTS.md` / `IDENTITY.md`。适合验证三件套资产方向。 | License: MIT；updated: 2026-05-07；内容偏泛 agent roster。 | https://github.com/msitarzewski/agency-agents |
| `x1xhlol/system-prompts-and-models-of-ai-tools` | 136,851 | 系统提示词 / 架构参考层 | 大量 AI 工具 system prompt 与 agent loop 资料，适合参考生产级 prompt 如何描述工具边界、语言规则、内部流程和不可见实现。对咨询业务内容帮助较弱。 | License: GPL-3.0；updated: 2026-05-07；只可作架构观察，不建议复用正文。 | https://github.com/x1xhlol/system-prompts-and-models-of-ai-tools |

## 6. 结论与下一步建议

本轮真正值得落地的不是“找一个现成战略顾问 prompt 复制进去”，而是把多个仓库的共同结构转成静境自己的专家资产：

1. `agent.md` 负责职责、边界、流程、框架和禁止行为。
2. `soul.md` 负责像谁、怎么说、怎么承认未知、怎么追问。
3. 空资料场景必须优先保护：不能从账号名、邮箱、旧默认值推断行业。
4. 咨询 Agent 的第一句话不应默认业务线，而应先问“你是谁 / 主营什么 / 当前要解决什么”。
5. 后续可以把 business model、JTBD、SWOT、content calendar 拆成独立 skills，而不是继续堆进一个巨大 system prompt。
