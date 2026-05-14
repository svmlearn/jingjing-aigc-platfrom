# 2026-05-12 Dify 图文内容包节点拆分 V3.0 记录

## 目标

按 `docs/探索/2026-05-11-用dify来测试链路/2026-05-12-图文内容包节点拆分规划.md`，在 V2.0 视频脚本节点拆分基础上，继续把单个 `article_generator` 拆成：

1. `title_cover`：标题与封面策略 LLM。
2. `article_body`：正文与配图编排 LLM。
3. `article_compiler`：图文包编译 Code 节点。

## 文件版本

- 基线 V2.0：`docs/探索/2026-05-11-用dify来测试链路/2026-05-12-175032-内容日历生成图文与视频脚本-Dify工作流-V2.0-视频脚本节点拆分.yml`
- V3.0 修改版：`docs/探索/2026-05-11-用dify来测试链路/2026-05-12-183727-内容日历生成图文与视频脚本-Dify工作流-V3.0-图文视频节点拆分.yml`

## 关键修改

1. 删除旧 `article_generator` 节点。
2. 新增图文链路：`creative_strategy -> title_cover -> article_body -> article_compiler`。
3. 保持视频链路独立：`creative_strategy -> video_narrative -> scene_breakdown -> delivery_compiler`。
4. 图文链路和视频链路在 `quality_reviewer` 汇合。
5. `title_cover` 负责输出：
   - `titles`
   - `selectedTitle`
   - `selectedTitleReason`
   - `coverCopyOptions`
   - `selectedCoverCopy`
   - `hookAngle`
6. `article_body` 负责输出：
   - `contentBlocks`
   - `cta`
   - `hashtags`
   - `imageBriefsIfMissing`
   - `riskNotes`
7. `article_compiler` 负责编译：
   - `articlePackage`
   - `titleStrategy`
   - 拼接 `body`
   - 拼接 `copyReadyText`
   - 从 `contentBlocks` 提取 `imageMatches` / `imageBriefIfMissing`
8. `quality_reviewer` 已增加图文拆分后的检查：
   - 标题备选数量
   - 标题选择理由
   - 标题 20 字限制
   - `contentBlocks` 数量
   - CTA 块
   - 非 CTA 块配图策略
9. `content_risk_rewriter` 已支持：
   - `articlePackage.contentBlocks[].text`
   - `titleStrategy`
   - 改写后同步 `body` 和 `copyReadyText`
10. `final_compiler` 已输出：
   - `workflowVersion = content_calendar_generation_poc_v3_article_video_split`
   - 顶层 `titleStrategy`

## Prompt 原文规则

用户明确要求：不要压缩 LLM 提示词，原汁原味使用规划文档。

已执行：

- `title_cover` System Prompt 与规划文档第 7 章代码块逐字一致。
- `article_body` System Prompt 与规划文档第 7 章代码块逐字一致。
- 两个 User Prompt 保留规划文档模板结构，仅把概念占位符替换为 Dify 可识别变量。

变量适配示例：

- `{{calendar_task_json}}` -> `{{#start.calendar_task_json#}}`
- `{{creative_strategy.articlePlan}}` -> `{{#creative_strategy.structured_output.articlePlan#}}`
- `{{title_cover}}` -> `{{#title_cover.text#}}`
- `{{start.image_assets_json}}` -> `{{#start.image_assets_json#}}`

## 本地验证

已完成：

- V3.0 YAML 可被 `PyYAML` 解析。
- 节点数：17。
- 边数：18。
- 旧 `article_generator` 节点不存在。
- 图文链路存在：`creative_strategy -> title_cover -> article_body -> article_compiler`。
- 视频链路存在：`creative_strategy -> video_narrative -> scene_breakdown -> delivery_compiler`。
- 图文和视频都连接到 `quality_reviewer`，避免串行依赖。
- `article_compiler`、`delivery_compiler`、`quality_reviewer`、`final_compiler` 四个 Code 节点均可 `compile`。
- 脚本断言 `title_cover` / `article_body` 两个 System Prompt 与规划文档代码块逐字一致。
- 使用最小样例本地执行：
  - `article_compiler` 输出 `articlePackage/titleStrategy`
  - `delivery_compiler` 输出 `videoScript/memberDelivery/workerDelivery`
  - `quality_reviewer.pass = true`
  - `final_compiler` 输出包含 `articlePackage/titleStrategy/videoScript/memberDelivery/workerDelivery/workflowVersion`

## 2026-05-12 依赖关系修正

用户提醒：图文和视频整体流程应是独立的。

复核两份规划后确认：

- 视频拆分规划第 4 节写明：`video_narrative` 可与 `article_generator` 并行。
- 图文拆分规划第 4 节写明：`title_cover` 可与 `video_narrative` 并行，且二者都只依赖 `creative_strategy`。

已修正 V3.0：

- 移除 `article_compiler -> video_narrative`。
- 新增 `creative_strategy -> video_narrative`。
- 新增 `article_compiler -> quality_reviewer`，让图文分支与视频分支在质量评审处汇合。
- `video_narrative` User Prompt 已移除 `article_compiler.result` / 图文内容包引用。

修正后验证：

- `article_compiler` 不再指向 `video_narrative`。
- `video_narrative` User Prompt 不再包含图文内容包引用。
- YAML 仍可解析，四个 Code 节点仍可编译。

## 尚未做

- 尚未完成全量稳定回归。

下一步建议：在 Dify UI 导入 V3.0 YAML，确认知识库节点绑定后发布，再用现有 `testcases/` 跑 happy path、缺图片、弱知识库三类回归。

## 2026-05-12 线上 API 回归补充

用户提供测试应用 API Key 后，使用 Dify API 跑了两个补充用例。API Key 仅用于当前命令环境变量，未写入仓库和结果文件。

结果目录：

- `docs/探索/2026-05-11-用dify来测试链路/results/v3_manual/`

结果文件：

- case02：`docs/探索/2026-05-11-用dify来测试链路/results/v3_manual/case02_v3_no_images_20260512_212941.json`
- case03：`docs/探索/2026-05-11-用dify来测试链路/results/v3_manual/case03_v3_weak_knowledge_20260512_214144.json`
- 汇总：`docs/探索/2026-05-11-用dify来测试链路/results/v3_manual/summary_20260512_214144.json`

### case02_v3_no_images

- workflow run id：`0e8b3ee9-b147-472c-aeaf-3f9a1655dc3d`
- elapsed：约 `621s`
- final JSON：可解析
- `qualityReview.pass = false`
- 分数：`materialFit = 6`，`compliance = 9`
- 问题：`缺少可用图片素材`
- `missingInputs = ["图文图片素材"]`
- `articlePackage.contentBlocks` 数量：5
- `titleStrategy`：存在
- `videoScript.scenes` 数量：15
- 视频 scene 缺 `visualDescription`：无

结论：符合“无图片素材应降级、不应误判合规风险”的预期。

### case03_v3_weak_knowledge

- workflow run id：`ab08d4fb-9462-449f-930f-c4f55b0fd878`
- elapsed：约 `723s`
- final JSON：可解析
- `qualityReview.pass = false`
- 分数：`factAccuracy = 5`，`materialFit = 6`，`compliance = 8`
- 问题：
  - `项目知识不足，成稿仅适合内部预览`
  - `场景 1 缺少具体 visualDescription`
  - `场景 5 缺少具体 visualDescription`
  - `场景 8 缺少具体 visualDescription`
- `missingInputs = ["更完整的项目事实"]`
- `articlePackage.contentBlocks` 数量：6
- `titleStrategy`：存在
- `videoScript.scenes` 数量：10

结论：弱知识库降级符合预期；但 `scene_breakdown` 在弱资料场景下仍可能漏填部分口播/素材镜头的 `visualDescription`，后续需要修 prompt 或 schema/validator 的一致性。

## 2026-05-12 Flash 模型回归补充

用户将 Dify LLM 节点模型从 `deepseek-v4-pro` 调整为 flash 后，重新跑 V3 用例。

结果目录：

- `docs/探索/2026-05-11-用dify来测试链路/results/v3_flash_manual/`

结果文件：

- case01：`docs/探索/2026-05-11-用dify来测试链路/results/v3_flash_manual/case01_v3_full_with_compliance_risk_flash_20260512_215237.json`
- case02：`docs/探索/2026-05-11-用dify来测试链路/results/v3_flash_manual/case02_v3_no_images_flash_20260512_215604.json`
- case03：`docs/探索/2026-05-11-用dify来测试链路/results/v3_flash_manual/case03_v3_weak_knowledge_flash_20260512_215927.json`
- 汇总：`docs/探索/2026-05-11-用dify来测试链路/results/v3_flash_manual/summary_20260512_215927.json`

### case01_v3_full_with_compliance_risk_flash

- 第一次 attempt 未拿到 final JSON，第二次成功。
- workflow run id：`3fcf5e69-eff9-45df-a6c8-effde230ef00`
- elapsed：约 `301s`
- final JSON：可解析
- `qualityReview.pass = true`
- 分数：`factAccuracy/projectFit/viralStructure/platformTone/materialFit/compliance = 8/8/8/8/8/8`
- `risk_hits = []`
- `articlePackage.contentBlocks` 数量：5
- `titleStrategy`：存在
- `videoScript.scenes` 数量：8
- 视频 scene 缺 `visualDescription`：无

### case02_v3_no_images_flash

- workflow run id：`21b93616-9c26-4ef4-adb1-0f5868380ccd`
- elapsed：约 `207s`
- final JSON：可解析
- `qualityReview.pass = false`
- 问题：`缺少可用图片素材`
- `missingInputs = ["图文图片素材"]`
- `articlePackage.contentBlocks` 数量：6
- `titleStrategy`：存在
- `videoScript.scenes` 数量：6
- 视频 scene 缺 `visualDescription`：无

### case03_v3_weak_knowledge_flash

- 两次 attempt 均未产出 final JSON。
- attempt 1 workflow run id：`51ffc610-7044-417c-a0cc-ecd15522ed48`
  - status：failed
  - error：`Variable #creative_strategy.structured_output.videoPlan# not found`
  - 失败节点：`video_narrative`
- attempt 2 workflow run id：`0a816aa2-fb90-4e5a-8842-22ef9823dd8b`
  - status：failed
  - error：`Query variable is not string type.`
  - 失败节点：`kb_project_knowledge`

结论：

1. Flash 后 case01/case02 耗时从约 10-12 分钟降到约 3.5-5 分钟量级。
2. case01/case02 本轮没有复现 `visualDescription` 缺失。
3. case03 暂时未能验证 `visualDescription`，因为 workflow 在更早节点失败。
4. 暴露出另一个稳定性问题：弱知识库/弱输入场景下，直接引用 `*.structured_output.xxx` 可能不稳定，后续可考虑改成传整个上游 `text` JSON，或加 Code 节点做字段兜底。

## 2026-05-12 变量引用与 visualDescription 修正

根据 Dify 日志截图和回归失败原因，确认两个独立问题：

1. `visualDescription` 缺失：`scene_breakdown.scenes[].visualDescription` 在 structured output schema 里不是必填，因此模型可合法省略。
2. `creative_strategy.structured_output.videoPlan` 缺失：`creative_strategy.videoPlan` 在 schema 中是必填，但 Dify 不稳定暴露 nested `structured_output.xxx` 子路径；下游节点直接引用子路径会在节点开始前失败。

已修正 V3.0 YAML：

- `kb_project_knowledge.query_variable_selector` 从 `task_understanding.structured_output.copySearchQuery` 改为 `task_understanding.text`，避免知识库检索报 `Query variable is not string type`。
- `title_cover` / `article_body` / `video_narrative` / `scene_breakdown` 的 User Prompt 不再引用 `creative_strategy.structured_output.xxx`，统一引用 `creative_strategy.text` 整包 JSON，并在提示中说明从 JSON 读取对应字段。
- `scene_breakdown.scenes[].visualDescription` 已加入 schema required。由于 Dify Visual Editor 不便表达按 `sceneType` 条件必填，当前采用全局必填；文字卡也可输出“纯文字卡画面说明”，比口播/素材镜头缺画面描述更可控。

本地校验：

- V3.0 YAML 可解析。
- 四个 Code 节点可编译。
- `scene_breakdown.scenes[].required` 当前为：`sceneNo, timeRange, sceneType, emotionalBeat, visualDescription, transition, pacing`。

## 后续优化点：JSON 严格度分层

这次问题说明：Dify 工作流里不是所有节点之间都需要依赖精确 nested JSON 子变量。

建议后续按边界分层：

- LLM -> LLM：优先传上游完整 `text` JSON，让下游模型从文本中读取需要的字段；不要强依赖 `structured_output.xxx` 子路径，避免 Dify 在弱输入、模型波动或字段暴露不稳定时节点启动失败。
- LLM -> Code：保持严格 JSON，Code 节点需要可解析、可兜底、可做确定性校验。
- Code -> Final：保持最终输出 schema 稳定，面向前端、API、测试脚本的字段不能漂。
- 知识库检索 query：需要保证输入一定是 string；如果后续不想用完整 `task_understanding.text` 检索，可以加一个轻量 Code 节点专门从任务理解 JSON 中抽取并兜底生成 `query` 字符串。

当前 V3.0 先采用保守修法：中间 LLM 输入改用整包 `text`，分镜关键字段 `visualDescription` 设为必填，代码与最终输出继续保持严格结构。

## 2026-05-12 新 API / Flash 回归

用户新建/切换 API Key 后，先启动了一轮仍疑似包含 pro 节点的测试，耗时过长，中途停止。用户随后将模型切到 flash 后重新跑 3 个核心 case。

结果目录：

- `docs/探索/2026-05-11-用dify来测试链路/results/v3_new_api_flash_20260512/`

汇总文件：

- `docs/探索/2026-05-11-用dify来测试链路/results/v3_new_api_flash_20260512/测试汇总_20260512_235121.json`

### 总体结果

- 3 个 case 均成功走到最终输出节点。
- 3 个 case 的 final JSON 均可解析。
- 未再复现 `Variable #creative_strategy.structured_output.videoPlan# not found`。
- 未再复现 `Query variable is not string type`。
- `videoScript.scenes[].visualDescription` 本轮均未缺失。
- 仍未全部通过质量门禁。

### case01_full_with_compliance_risk

- workflow run id：`f01e7ddf-2187-49f0-8314-4027e01c46d5`
- elapsed：约 `240s`
- final JSON：可解析
- `qualityReview.pass = false`
- 分数：`factAccuracy/projectFit/viralStructure/platformTone/materialFit/compliance = 8/8/6/6/6/9`
- 问题：
  - `titles 为空`
  - `缺少标题选择理由`
  - `缺少 CTA 块`
  - `Block 5 缺少配图策略`
  - `视频叙事缺少前 3 秒钩子 openingLine`
  - `视频叙事缺少 bgmDirection`
- 视频 scene 缺 `visualDescription`：无
- 测试脚本额外提示：口播场景 1、5 没有 `assetQuery`。这不一定是业务错误，后续可把测试脚本改成只要求素材类场景必须有 `assetQuery`。

节点观察：

- `标题与封面策略` 本轮输出成了创作策略结构，导致 `article_compiler` 拿不到 titles。
- `视频叙事结构` 本轮也输出成了创作策略结构，导致后续缺少 `hook.openingLine` 和 `bgmDirection`。
- 初步归因：上游 `creative_strategy.text` 中包含模型思考内容和完整 JSON，下游 LLM 偶发复制输入结构，而不是按本节点 schema 生成新结构。

### case02_no_images

- workflow run id：`10320e1d-c7b7-48d0-b1da-e25bef12ee51`
- elapsed：约 `269s`
- final JSON：可解析
- `qualityReview.pass = false`
- 问题：
  - `缺少 CTA 块`
  - `缺少可用图片素材`
- `missingInputs = ["图文图片素材"]`
- 视频 scene 缺 `visualDescription`：无

结论：无图片素材降级仍符合预期；CTA 块缺失需要继续收紧 `article_body` 输出或 `article_compiler` 兜底。

### case03_weak_knowledge

- workflow run id：`6064dcc3-cde9-4e0a-a992-0458cd1879c7`
- elapsed：约 `397s`
- final JSON：可解析
- `qualityReview.pass = false`
- 问题：
  - `项目知识不足，成稿仅适合内部预览`
  - `视频叙事弧线少于 3 个节拍`
- `missingInputs = ["更完整的项目事实"]`
- 视频 scene 缺 `visualDescription`：无

结论：弱知识库 case 已能走完整链路，并按预期降级；变量引用修复有效。

### 速度观察

- 大部分节点已呈现 flash 价格/速度。
- `创作策略规划` 与 `违规内容改写 LLM` 本轮仍像 pro 配置，耗时分别约 `128-151s` 和 `189s`；如果要压缩整体耗时，需要继续确认这两个节点模型配置。

### 下一步建议

V3.0 已验证“节点不再直接崩溃”，但还不建议直接作为最终质量版本接入主链路。建议先做 V3.1 稳定性修正：

1. 在关键 LLM 后增加 JSON normalizer Code 节点，把带 `<think>` / 多余文本的 `text` 清洗成纯 JSON 字符串，再传给下游 LLM。
2. 下游 LLM prompt 明确“输入 JSON 仅供读取，不得原样复述；必须输出本节点 schema”。
3. `article_compiler` 对标题/封面缺失做兜底：如果 title node 失败，至少从正文或策略中生成保守标题，而不是空数组。
4. 质量检查脚本调整 `assetQuery` 规则：口播/文字卡可不强制要求 `assetQuery`，素材类场景必须有。
5. 确认 `创作策略规划` 与 `违规内容改写 LLM` 是否也已切到 flash。
