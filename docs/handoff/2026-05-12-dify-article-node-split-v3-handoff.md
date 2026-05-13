# 2026-05-12 Dify 图文内容包节点拆分 V3.0 Handoff

## 当前目标

在 V2.0 视频脚本节点拆分基础上，按 `2026-05-12-图文内容包节点拆分规划.md` 继续拆分图文内容包节点。

## 产物路径

- 基线 V2.0：`docs/探索/2026-05-11-用dify来测试链路/2026-05-12-175032-内容日历生成图文与视频脚本-Dify工作流-V2.0-视频脚本节点拆分.yml`
- V3.0 修改版：`docs/探索/2026-05-11-用dify来测试链路/2026-05-12-183727-内容日历生成图文与视频脚本-Dify工作流-V3.0-图文视频节点拆分.yml`
- Progress：`docs/progress/2026-05-12-dify-article-node-split-v3.md`

## 已完成

1. 删除旧 `article_generator`。
2. 新增 `title_cover`、`article_body`、`article_compiler`。
3. 保留 V2.0 的 `video_narrative`、`scene_breakdown`、`delivery_compiler`。
4. 按用户要求，`title_cover` / `article_body` 的 System Prompt 均与规划文档第 7 章代码块逐字一致。
5. User Prompt 只做 Dify 变量占位符适配。
6. `quality_reviewer`、`content_risk_rewriter`、`final_compiler` 已适配 `articlePackage + titleStrategy + videoScript + memberDelivery + workerDelivery`。
7. 已修正 Dify nested `structured_output.xxx` 子变量不稳定问题：下游 LLM 改用 `creative_strategy.text` 整包 JSON。
8. 已修正 TXT 知识库检索 query 类型问题：`kb_project_knowledge.query_variable_selector` 改为 `task_understanding.text`。
9. 已将 `scene_breakdown.scenes[].visualDescription` 加入 structured output schema required。

## 依赖关系修正

用户提醒图文和视频整体流程应独立。已复核并修正：

- 图文分支：`creative_strategy -> title_cover -> article_body -> article_compiler`
- 视频分支：`creative_strategy -> video_narrative -> scene_breakdown -> delivery_compiler`
- 汇合点：`quality_reviewer`

当前 V3.0 不再有 `article_compiler -> video_narrative`，`video_narrative` 也不再引用图文内容包。

## 验证结果

本地静态验证通过：

- YAML 可解析。
- 节点数：17。
- 边数：18。
- 旧 `article_generator` 不存在。
- `article_compiler`、`delivery_compiler`、`quality_reviewer`、`final_compiler` 四个 Code 节点可编译。
- `title_cover` 和 `article_body` System Prompt 与规划文档原文一致。
- 最小样例可跑通 `article_compiler -> quality_reviewer -> final_compiler` 相关结构。
- 当前 V3.0 YAML 中已搜不到 `creative_strategy.structured_output.xxx` 和 `task_understanding.structured_output.xxx` 下游变量引用。
- `scene_breakdown.scenes[].required` 包含 `visualDescription`。

线上验证：

- Flash 模型下，case01/case02 已跑通并产出可解析 final JSON。
- case03 曾失败在旧变量引用和知识库 query 类型问题；本地 V3.0 YAML 已针对这两个失败点修正，需重新导入/更新 Dify 后再回归。
- 新 API / flash 回归中，case01/case02/case03 均已走到 final JSON，变量缺失和 query 类型问题未复现，`visualDescription` 未缺失。
- 但质量门禁未全部通过：case01 出现标题/封面和视频叙事结构缺失，case02 缺 CTA 块，case03 按弱知识库预期降级。

## 后续优化点

JSON 严格度建议分层处理：

- LLM 到 LLM：优先传上游完整 `text` JSON，让模型从文本中读取需要字段，不强依赖 Dify 暴露的 nested `structured_output.xxx` 子路径。
- LLM 到 Code：继续要求严格 JSON，方便解析、兜底和确定性校验。
- Code 到 Final：继续保持最终输出 schema 稳定，避免前端、API、测试脚本接入时字段漂移。
- 知识库检索 query：当前先用 `task_understanding.text` 保证 string 类型；后续可加轻量 Code 节点抽取并兜底生成更短的检索 query。

当前可交付判断：用户可直接导入 V3.0 YAML 文件；如果 Dify 线上应用仍是旧版本，需要重新导入或在 UI 中同步这些节点改动后再测试。

## 最新接手提醒

如果明天要接入 Dify API 到代码中，建议把 V3.0 当作“链路连通性验证版”，不要把它当作“内容质量最终版”。

最新回归暴露的核心问题：

- `creative_strategy.text` 解决了 Dify nested 子变量启动失败，但它可能包含模型思考内容和完整上游 JSON。
- 下游 LLM 偶发直接复述上游结构，导致 `title_cover` 或 `video_narrative` 没按本节点 schema 输出。
- 解决方向是 V3.1：加 JSON normalizer Code 节点，把上游 LLM 的 `text` 清洗成纯 JSON 字符串，再传给下游；同时收紧 User Prompt，明确不得原样复述输入 JSON。
- 另需确认 `创作策略规划` 与 `违规内容改写 LLM` 是否已切到 flash，本轮这两个节点仍明显偏慢。

## Push / Merge

- 未 commit。
- 未 push。
- 未 merge。
