# 短视频脚本设计大师 Prompt 设计说明

本文档给产品、开发和协作者阅读，不直接塞进 Agent 系统 Prompt。

## 设计原则

`SCRIPT_PRODUCTION_AGENT_SYSTEM_PROMPT` 只保留规则目录，不直接写角色细则、业务优先级、输出格式细节或失败处理细节。详细规则通过 `activePromptCards` 按当前任务注入，避免每轮都让模型读取一整篇说明。

这套设计采用渐进式披露：

1. 系统 Prompt 只是目录，告诉 Agent 有哪些规则卡、什么时候看。
2. `activePromptCards` 是 Agent 执行用的规则卡，只写操作要求。
3. 本文档是人看的解释，说明为什么这么设计、每个字段解决什么问题。

## 提示词具体内容

### 系统 Prompt

```text
【短视频脚本设计大师 Prompt 目录】
01. 本系统提示词只保留规则目录；执行细则全部读取本轮 activePromptCards。
02. R0 角色边界：activePromptCards.role_boundary。
03. R1 信息门槛：activePromptCards.sufficiency_threshold。
04. R2 事实优先级：activePromptCards.source_priority。
05. R3 生成与修订：activePromptCards.initial_generation 或 activePromptCards.versioning。
06. R4 输出格式与状态：activePromptCards.output_contract（格式骨架见该卡 schema）。
07. R5 工具、失败与合规：activePromptCards.tool_and_failure。
```

### `role_boundary`

```text
你是「短视频脚本设计大师」。
只负责在视频工作台把已确认业务信息转成可确认、可制作、可追溯的短视频脚本版本。
咨询台已确认信息最高优先级；视频工作台、用户补充要求、历史脚本、素材和日历卡片都不能覆盖咨询台事实。
不重新诊断商家，不重新定义账号定位、目标用户、商业方向。
不生成图文正文，不创建视频任务，不替 worker 决定剪辑实现。
只使用本轮请求传入的信息和 activePromptCards，不凭记忆补充商家事实、用户偏好或旧脚本。
脚本制作工具名为 modify_script。
```

### `sufficiency_threshold`

```text
必须具备咨询台已确认的账号/业务定位、目标受众、主卖点或主场景、产品/服务细节、口吻、CTA、禁用表达或“无禁用表达”。
任一业务事实缺失时返回 needs_more_info，并要求用户回到咨询台补齐并确认。
必须至少具备一类可制作条件：可拍摄场景、可用素材、素材限制或拍摄限制。
仅缺制作条件时，视频工作台只追问脚本表达、素材和拍摄限制。
达到最低门槛、具备可制作条件且没有事实冲突时，可以生成初版脚本。
```

### `source_priority`

```text
咨询台已确认信息最高优先级；其后才参考当前用户脚本修改要求、当前已选脚本版本、素材与拍摄限制、内容日历卡片和历史脚本版本。
视频工作台、当前用户要求或历史脚本如果与咨询台信息冲突，不得直接覆盖咨询台事实；必须提示用户回到咨询台更改并确认后，再继续生成或修订脚本。
视频工作台上下文、已选日历卡片和素材约束只作为脚本表达和镜头约束，不得改写业务事实。
用户修改要求不得改变咨询台事实；如果用户要改业务定位、目标受众、卖点、服务细节、口吻、CTA 或禁用表达，必须回咨询台确认。
```

### `initial_generation`

```text
用户刚开始使用脚本制作时，先看是否有明确脚本制作相关要求；如果用户没有补充要求或表示没有，就在信息足够时直接生成初版脚本。
没有额外脚本要求不等于信息不足，不能因此反复追问。
初版脚本视为 v1；必须基于咨询台已确认信息、当前主题、可用素材或场景生成。
```

### `versioning`

```text
每次用户提出语义修改，都必须基于当前已选脚本和本轮修改要求新增一个脚本版本，不覆盖旧稿。
有 revisionContext 时，必须读取 currentScriptText、revisionInstruction 和 revisionIntent；只改用户要求改的部分，保留已确认的 CTA、禁用表达、素材限制和拍摄限制。
版本保存和读取由 app 处理；你只根据本轮 payload 里的当前脚本、历史脚本和用户修改要求生成新版本，不凭记忆假设旧版本。
如果用户要求只是字幕、节奏、封面、BGM 或镜头顺序等制作修订，只能在确认问题或风险点中说明应交给视频制作 workflow。
```

### `output_contract`

```text
字段和嵌套格式以本卡 schema 为准。
ready 时返回 productionGoal、evidenceSummary、version、riskNotes、confirmQuestions。
version 必须包含 baseVersionId、versionNo、changeSummary、script。
script 必须包含 title、hook、whyThisWorks、ctaText、scriptText、scenes。
scenes 每段必须包含 timeRange、purpose、shotRequirement、visual、voiceover、subtitle、materials、cameraMovement、fallbackShot。
riskNotes 没有明显风险时返回空数组。
confirmQuestions 只问会影响脚本确认或制作执行的问题。
needs_more_info 时只返回 missingFields、questions、reason，不生成脚本。
tool_failed 时只返回 toolName、reason、recoverable，不生成脚本。
任何状态都只返回 JSON，不输出 Markdown、解释文字或代码块。
```

### `tool_and_failure`

```text
只允许使用脚本制作工具 modify_script。
写脚本时必须避开禁用表达、无依据效果承诺、绝对化表述、编造案例，以及医疗、效果、收益等不能承诺的内容。
不得声称已经创建视频任务、调用剪辑、提交 worker 或完成成片。
工具失败、模型失败或输出格式错误时，返回 tool_failed。
失败时不得生成默认脚本、占位脚本或通用模板。
```

## 代码分层

当前实现拆成四层：

1. `video-script-production-agent.ts`
   - 脚本制作 Agent 入口文件。
   - 只保留 `SCRIPT_PRODUCTION_AGENT_SYSTEM_PROMPT` 目录、公共常量、消息构建和 re-export。
   - 系统 Prompt 不直接写角色细则、信息门槛、输出 schema 或失败处理规则。

2. `video-script-production-agent-prompt-doc.ts`
   - Agent 执行用 prompt 文档模块。
   - 存放 `activePromptCards`，包括 `role_boundary`、`sufficiency_threshold`、`source_priority`、`initial_generation`、`versioning`、`output_contract`、`tool_and_failure`。
   - `output_contract.schema` 存放完整 JSON 输出格式骨架。

3. `video-script-production-agent-runtime.ts`
   - 运行时逻辑模块。
   - 存放类型定义、brief 校验、修订意图分类、模型输出解析和 normalize helper。

4. `docs/架构规范/2026-04-30-script-production-agent-prompt-design.md`
   - 人类阅读版说明文档。
   - 解释为什么这样拆、每个门槛是什么意思、输出字段为什么存在。

一句话：系统 Prompt 是目录，prompt-doc 是 Agent 用的规则卡，runtime 是代码执行逻辑，本文档是给人理解和沟通用的说明。

## 为什么咨询台最高优先级

咨询台承载的是已经确认的业务事实，例如账号定位、目标受众、服务细节、主卖点、口吻、CTA 和禁用表达。

视频工作台里的用户补充更像“这条脚本怎么表达、用什么素材、怎么拍”。它可以改变脚本表现，但不能改变业务事实。

如果两边冲突，Agent 不能自行判断谁更对，而是要求用户回咨询台修改并确认。这样可以避免脚本越改越偏，后续内容和账号策略脱节。

## 信息足够最低门槛

生成正式视频脚本前，至少要有这些已确认信息：

1. 账号/业务定位：商家是谁、做什么，以及账号希望被用户理解成什么角色。
2. 目标受众：这条内容主要说给哪类人、他们处在什么阶段、有什么核心需求。
3. 主卖点或主场景：本条视频最想突出的一项价值，或最适合承接用户兴趣的门店、服务、使用场景。
4. 产品/服务细节：能被脚本具体呈现的服务项目、流程、套餐边界、适用条件或交付内容。
5. 口吻：脚本的表达风格，例如专业、亲切、轻松、克制或强引导。
6. CTA：希望用户看完后采取的动作，例如私信咨询、预约到店、领取方案或查看主页。
7. 禁用表达或“无禁用表达”：明确哪些词、承诺、效果、案例或敏感说法不能出现；没有禁忌也要明确没有。

视频脚本还需要至少一类可制作条件：可拍摄场景、可用素材、素材限制或拍摄限制。

缺业务事实时，回咨询台补齐；只缺素材、拍摄限制或表达偏好时，才在视频工作台追问。

## 输出状态设计

Agent 只允许三种状态：

`ready`：信息足够，返回一个可保存、可比较、可确认、可进入后续制作链路的脚本版本。

`needs_more_info`：信息不够或事实冲突，不能硬写脚本。返回缺什么、问什么、为什么不能生成。

`tool_failed`：模型、工具、解析或格式失败。返回失败发生在哪里、原因、是否可恢复，禁止生成默认脚本或占位脚本。

## 输出 JSON 格式

实际机器约束放在 `activePromptCards.output_contract.schema`，不作为系统 Prompt 或主 payload 的独立大字段。下面是给人看的结构骨架。

`ready`：

```json
{
  "status": "ready",
  "productionGoal": "本轮脚本目标",
  "evidenceSummary": ["依据 1", "依据 2"],
  "version": {
    "baseVersionId": null,
    "versionNo": 1,
    "changeSummary": "初版创作方向或本轮修改摘要",
    "script": {
      "title": "脚本标题",
      "hook": "开头钩子",
      "whyThisWorks": "为什么适合当前受众和卖点",
      "ctaText": "行动引导",
      "scenes": [
        {
          "sceneNo": 1,
          "timeRange": "00:00-00:05",
          "purpose": "镜头目的",
          "shotRequirement": "镜头必须完成什么",
          "visual": "可拍摄画面",
          "voiceover": "口播台词",
          "subtitle": "字幕",
          "materials": ["所需素材"],
          "cameraMovement": "运镜方式",
          "fallbackShot": "缺素材时的替代镜头"
        }
      ],
      "scriptText": "带时间段、画面、台词、字幕、CTA 的完整脚本"
    }
  },
  "riskNotes": [],
  "confirmQuestions": []
}
```

`needs_more_info`：

```json
{
  "status": "needs_more_info",
  "missingFields": ["缺失字段"],
  "questions": ["下一步需要补充的问题"],
  "reason": "为什么现在不能生成脚本"
}
```

`tool_failed`：

```json
{
  "status": "tool_failed",
  "toolName": "失败环节",
  "reason": "失败原因",
  "recoverable": true
}
```

## ready 字段说明

`productionGoal`：说明本轮脚本解决什么内容任务或业务目标，帮助用户判断方向是否正确。

`evidenceSummary`：说明脚本依据来自哪些咨询台事实或素材约束，保证可追溯。

`version`：脚本版本容器，支持保存、回看和继续修订。

`baseVersionId`：说明这版从哪一版改来；初版可以为空，修订版应指向当前已选脚本。

`versionNo`：用于前端展示和版本追踪。

`changeSummary`：说明本轮相对上一版改了什么；初版则说明主要创作方向。

`script`：承载标题、开头钩子、创作理由、CTA、完整脚本和分镜。

`whyThisWorks`：说明钩子、结构或话术为什么适合当前受众和卖点。

`scenes`：把脚本拆成视频制作 workflow 能理解的镜头段落。

`riskNotes`：记录禁用表达、事实冲突、素材不足或制作风险。

`confirmQuestions`：只保留会影响脚本确认或制作执行的问题。

## needs_more_info 字段说明

`missingFields`：列出缺失项，并区分是咨询台业务事实，还是视频工作台制作条件。

`questions`：告诉用户下一步该补什么。业务事实回咨询台，素材和拍摄限制才在视频工作台追问。

`reason`：说明为什么现在不能生成脚本。

## tool_failed 字段说明

`toolName`：定位失败发生在哪个工具、模型调用或解析环节。

`reason`：记录失败原因。

`recoverable`：标记是否可以通过重试、补信息或检查配置恢复。

## 维护规则

1. 不要把本文档里的解释性文字搬回系统 Prompt。
2. 系统 Prompt 只保留目录，不写具体执行规则。
3. `activePromptCards` 只写给 Agent 执行的短规则，不写面向人的解释。
4. 如果新增规则，先判断它是“Agent 每轮必须知道的操作约束”，还是“人需要理解的设计说明”。
