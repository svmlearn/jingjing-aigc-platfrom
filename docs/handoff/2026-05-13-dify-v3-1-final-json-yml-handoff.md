# 2026-05-13 Dify V3.1 最终 JSON 与 YML 修改零上下文交接

## 给下一位 AI 的启动说明

你接手的是「内容日历 + 爆款内容 + TXT 知识库 + 图片素材 -> 图文内容包 / 视频镜头脚本」这条 Dify POC 链路。

用户接下来要你基于已经定稿的最终 JSON 契约，继续修改 Dify YAML。请先读本文档，再读下面列出的关键文档和 YAML。不要依赖聊天记录。

如果你要开始改 Dify YAML，请使用项目里的 Dify 调整规范：`adjust_the_yml_of_dify` skill。核心原则是以终为始、奥卡姆剃刀、不要压缩或删减 LLM 提示词原文，优先通过 Code 节点收敛最终 JSON。

## 当前仓库状态

- 当前分支：`main`
- 最近一次本地提交：`e543c05 docs: record Dify content workflow exploration`
- 本交接文档创建于上述提交之后，若尚未提交，属于新增本地文档。
- 不要把 Dify API key 写入文档、YAML、脚本、结果文件或最终回复。

## 必读文件

按顺序读：

1. `AGENTS.md`
2. `docs/探索/2026-05-11-用dify来测试链路/2026-05-13-Dify-V3.1-数据流与最终JSON收敛规划.md`
3. `docs/探索/2026-05-11-用dify来测试链路/内容日历生成图文与视频脚本 POC V3.0.yml`
4. `docs/探索/2026-05-11-用dify来测试链路/2026-05-13-Dify最终JSON字段确认器.html`
5. 如需回归测试，再读：
   - `docs/探索/2026-05-11-用dify来测试链路/run_content_calendar_dify_cases.py`
   - `docs/探索/2026-05-11-用dify来测试链路/testcases/`

## 用户当前目标

下一步不是继续讨论字段，而是：

1. 基于已定稿的最终 JSON 契约，修改 Dify YAML。
2. 生成一个新的带时间戳的 V3.1 YAML 文件。
3. 保留现有 V3.0 YAML，不要覆盖。
4. 不要私自压缩、删减 LLM 节点的大段提示词。用户明确要求 LLM 对应提示词尽量原文保留。
5. 优先在最终编译 / Code 节点里做字段收敛，不要为了最终 JSON 简化而大面积重写上游 LLM。

建议新文件命名类似：

`docs/探索/2026-05-11-用dify来测试链路/YYYY-MM-DD-HHMMSS-内容日历生成图文与视频脚本-Dify工作流-V3.1-最终JSON收敛.yml`

## 背景共识

### V3.0 已经做了什么

- V2.0 做了视频脚本节点拆分。
- V3.0 在 V2.0 基础上继续做了图文内容包节点拆分。
- 所以 V3.0 包含 V2.0 的能力。
- 当前最新 YAML 是：
  - `docs/探索/2026-05-11-用dify来测试链路/内容日历生成图文与视频脚本 POC V3.0.yml`

### `<think>` 问题

之前担心 DeepSeek 输出 `<think>` 干扰 JSON。后来用户换模型/配置后，`text` 里已经没有 `<think>`。

但仍然确认：

- `text` 是 JSON 字符串文本，不适合作为下游主输入。
- `reasoning_content` 不应进入业务链路。
- `structured_output` 是更稳定的对象，应优先作为后续节点输入。

V3.1 可继续优化数据流：下游 LLM / Code 节点优先读取 `structured_output`，`text` 只兜底。

## 最终 JSON 定稿

生产主输出不要再输出庞大的 `articlePackage`、`videoScript`、`memberDelivery`、`workerDelivery`、`trace`、`saveHints` 全量结构。

最终主业务 JSON 定为：

```json
{
  "status": "needs_review",
  "article": {
    "title": "70平4米层高，总价友好",
    "coverCopy": "70平4米层高的家",
    "images": [
      {
        "cosPath": "cos://jingjing/project/2026/05/article-cover-70m-4m.jpg",
        "role": "cover"
      }
    ],
    "copyText": "70平4米层高，总价友好\\n\\n预算有限，但也想住得舒服...\\n\\n#买房 #小户型"
  },
  "video": {
    "storyOutline": "以预算有限的城市青年视角，从焦虑到发现舒适小面积产品...",
    "estimatedDuration": "60-90秒",
    "bgm": "轻盈、温暖、带一点节奏感",
    "toneOfVoice": "亲切共情、理性克制、专业引导",
    "scenes": [
      {
        "sceneNo": 1,
        "timeRange": "0-5s",
        "durationSec": 5,
        "sceneType": "口播",
        "title": "开场口播",
        "requiresUserUpload": true,
        "purpose": "共鸣与好奇",
        "taskDescription": "围绕今日主题生成可拍摄口播脚本，开头直接说客户最关心的问题。",
        "visualDescription": "中介站在小区入口附近，面对镜头自然说话。",
        "voiceover": "70平的小户型，层高竟然有4米？",
        "subtitle": "70平4米层高，预算有限也能看",
        "shotLanguage": {
          "framing": "半身口播",
          "cameraMovement": "固定镜头",
          "orientation": "横屏",
          "composition": "人物站画面左侧，右侧留出小区入口背景"
        },
        "filmingGuide": {
          "method": "手机横屏，半身自拍口播",
          "location": "小区入口",
          "posture": "站着",
          "tips": [
            "手机横屏拍",
            "语速放慢"
          ]
        },
        "editGuide": {
          "transition": "直接切",
          "pacing": "正常",
          "minUsableSeconds": 3
        },
        "assetQuery": "小区 航拍 全景 绿化 商业"
      }
    ]
  },
  "quality": {
    "riskTerms": []
  }
}
```

注意：上面是结构示例，不是固定内容。实际内容来自 Dify 各节点结果。

## 字段用途定稿

最终 JSON = `uiDisplayFields + runtimeOnlyFields`。

`removedFields` 不进入最终 JSON。

### 展示给成员 UI 的字段

这些字段最终 JSON 要输出，并且前端会直接展示给中介成员：

```json
[
  "status",
  "article.title",
  "article.coverCopy",
  "article.images[].cosPath",
  "article.copyText",
  "video.scenes[].sceneNo",
  "video.scenes[].timeRange",
  "video.scenes[].durationSec",
  "video.scenes[].title",
  "video.scenes[].visualDescription",
  "video.scenes[].voiceover",
  "video.scenes[].filmingGuide.method",
  "video.scenes[].filmingGuide.location",
  "video.scenes[].filmingGuide.posture",
  "video.scenes[].filmingGuide.tips"
]
```

### 不展示但运行时 / worker 需要的字段

这些字段最终 JSON 也要输出，但不要作为文字展示给中介。它们给前端逻辑、后台或剪辑 worker 使用：

```json
[
  "article.images[].role",
  "video.storyOutline",
  "video.estimatedDuration",
  "video.bgm",
  "video.toneOfVoice",
  "video.scenes[].sceneType",
  "video.scenes[].requiresUserUpload",
  "video.scenes[].purpose",
  "video.scenes[].taskDescription",
  "video.scenes[].subtitle",
  "video.scenes[].shotLanguage.framing",
  "video.scenes[].shotLanguage.cameraMovement",
  "video.scenes[].shotLanguage.orientation",
  "video.scenes[].shotLanguage.composition",
  "video.scenes[].editGuide.transition",
  "video.scenes[].editGuide.pacing",
  "video.scenes[].editGuide.minUsableSeconds",
  "video.scenes[].assetQuery",
  "quality.riskTerms"
]
```

关键解释：

- `video.scenes[].requiresUserUpload` 不展示成文字，但必须保留，因为它控制前端是否显示上传槽位。
- `article.images[].role` 不展示给用户，但必须保留，因为它帮助前端识别封面图 / 正文图排序。
- 图文不需要上传槽位，Dify 直接输出 `article.images[].cosPath`，前端直接渲染。
- 视频上传槽位由 `video.scenes[].requiresUserUpload` 控制。
- `hashtags` 不单独输出，直接拼进 `article.copyText`。

### 明确删除的字段

这些字段不要进入最终主业务 JSON：

```json
[
  "workflowVersion",
  "article.images[].assetId",
  "article.imageBriefIfMissing",
  "article.blocks[]",
  "video.scenes[].filmingGuide.props",
  "video.scenes[].fallbackVisual",
  "quality.status",
  "quality.pass",
  "quality.blockingReasons",
  "quality.missingInputs",
  "quality.scores",
  "debug.taskUnderstanding",
  "debug.creativeStrategy",
  "debug.usedKnowledgeRefs"
]
```

如果调试阶段非常需要 trace/debug，可以另存到 Dify 调试结果或数据库 `debug_payload`，不要放进主业务输出。

## 推荐修改路线

### 第一优先级：最终结果编译节点收敛

先找 YAML 里的最终编译 Code 节点，名称大概率是：

- `最终结果编译`
- 或类似 `final_compiler`

目标：

1. 仍然读取上游 rich outputs。
2. 只把最终主业务 JSON 输出给 workflow end。
3. 去掉主输出中的：
   - `workflowVersion`
   - `articlePackage`
   - `titleStrategy`
   - `videoScript`
   - `memberDelivery`
   - `workerDelivery`
   - `qualityReview`
   - `trace`
   - `saveHints`
4. 映射为：
   - `status`
   - `article`
   - `video`
   - `quality`

建议不要一上来大改所有 LLM 节点。先在 final compiler 做确定性字段映射，风险最低。

### 第二优先级：结构化输入修正

如果时间允许，再优化数据流：

- 下游 LLM 优先吃上游 `structured_output`。
- 如果 Dify 子变量容易丢，增加 Code 聚合节点，把 structured object 编译成短 JSON 字符串再喂给下游。
- `text` 只作为兜底，不作为主数据源。

注意：用户之前明确说，很多 LLM 节点的提示词不要被压缩，要原汁原味。若必须改 prompt，只改字段说明和输出 schema，不要删掉用户已经认可的大段创作规范。

### 第三优先级：Schema 对齐

需要确保 Dify 最终输出 schema 和最终 JSON 契约一致。

重点字段：

- `article.images[].cosPath`
- `article.images[].role`
- `video.scenes[].requiresUserUpload`
- `video.scenes[].visualDescription`
- `video.scenes[].filmingGuide.method`
- `video.scenes[].filmingGuide.location`
- `video.scenes[].filmingGuide.posture`
- `video.scenes[].filmingGuide.tips`
- `video.scenes[].shotLanguage.*`
- `video.scenes[].editGuide.*`

特别注意：

- `visualDescription` 之前因为非必填导致质量评审报缺失。后续 schema 中应继续要求所有视频 scenes 有 `visualDescription`。
- `requiresUserUpload` 是运行时字段，不是 UI 文本，但最终 JSON 必须有。

## 回归测试建议

已有测试用例：

- `docs/探索/2026-05-11-用dify来测试链路/testcases/case01_full_with_compliance_risk.json`
- `docs/探索/2026-05-11-用dify来测试链路/testcases/case02_no_images.json`
- `docs/探索/2026-05-11-用dify来测试链路/testcases/case03_weak_knowledge.json`

已有本地测试脚本：

- `docs/探索/2026-05-11-用dify来测试链路/run_content_calendar_dify_cases.py`

也可以使用 skill 脚本：

- `/Users/wy/.cc-switch/skills/adjust_the_yml_of_dify/scripts/run_dify_cases.py`

API key 由用户在新对话里提供。只放到环境变量或命令参数中使用，不要写入仓库。

回归至少检查：

1. 最终 JSON 可解析。
2. 最终 JSON 只有 `status/article/video/quality` 主结构。
3. `removedFields` 中的字段不在最终主输出里。
4. `article.copyText` 包含标题、正文和标签。
5. `article.images[].cosPath` 存在，图文不出现上传槽位字段。
6. 每个 `video.scenes[]` 都有：
   - `sceneNo`
   - `timeRange`
   - `durationSec`
   - `title`
   - `requiresUserUpload`
   - `visualDescription`
   - `voiceover` 或素材类可为空字符串
   - `filmingGuide.method/location/posture/tips`
7. `requiresUserUpload` 可用于前端判断上传框。
8. `quality.riskTerms` 存在，默认为数组。

## 已知不要做的事

- 不要把 API key 写进任何文件。
- 不要覆盖 V3.0 YAML。
- 不要把字段确认器里的 `fieldUsage` 放进 Dify 生产主输出，它只是契约说明。
- 不要把 `reasoning_content` 放进下游或最终输出。
- 不要为了最终 JSON 简化而删除 LLM 节点原提示词。
- 不要把 `requiresUserUpload` 当成没用字段删掉。
- 不要把 `article.images[].role` 展示给用户，它是运行时字段。
- 不要恢复 `trace/saveHints/titleStrategy` 到主业务输出。

## 交付建议

完成后建议产出：

1. 新 V3.1 YAML 文件。
2. 一份 progress 文档，记录：
   - 修改的 YAML 路径；
   - 主要修改点；
   - 最终 JSON 契约是否对齐；
   - 是否做了静态 YAML 校验；
   - 是否导入 Dify 测试；
   - 测试结果路径。
3. 如果只是本地改 YAML 未导入 Dify，要明确告诉用户“尚未导入/尚未 API 回归”。

## 新对话建议开场

用户可以这样把任务交给新 AI：

> 请读取 `docs/handoff/2026-05-13-dify-v3-1-final-json-yml-handoff.md`，再按里面的交接继续修改 Dify V3.0 YAML 到 V3.1。重点是根据最终 JSON 契约收敛最终输出，不要删减 LLM 提示词原文，生成新的带时间戳 V3.1 YAML。
