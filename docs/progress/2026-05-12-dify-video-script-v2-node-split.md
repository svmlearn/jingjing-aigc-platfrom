# 2026-05-12 Dify 视频脚本节点拆分 V2.0 记录

## 目标

按 `docs/探索/2026-05-11-用dify来测试链路/2026-05-12-视频脚本节点拆分规划.md`，把当前 Dify 工作流里的单个 `video_script_generator` 节点拆成：

1. `video_narrative`：视频叙事结构 LLM。
2. `scene_breakdown`：分镜与素材策略 LLM。
3. `delivery_compiler`：视频交付物编译 Code 节点。

## 文件版本

- V1.0 备份：`docs/探索/2026-05-11-用dify来测试链路/2026-05-12-175032-内容日历生成图文与视频脚本-Dify工作流-V1.0-backup.yml`
- V2.0 修改版：`docs/探索/2026-05-11-用dify来测试链路/2026-05-12-175032-内容日历生成图文与视频脚本-Dify工作流-V2.0-视频脚本节点拆分.yml`
- 原始当前文件未覆盖：`docs/探索/2026-05-11-用dify来测试链路/内容日历生成图文与视频脚本 POC.yml`

## 关键修改

1. 删除旧 `video_script_generator` 节点。
2. 新增链路：`article_generator -> video_narrative -> scene_breakdown -> delivery_compiler -> quality_reviewer`。
3. `delivery_compiler` 输出三套结构：
   - `videoScript`
   - `memberDelivery`
   - `workerDelivery`
4. `quality_reviewer` 改为按 `sceneType` 检查：
   - 口播：`voiceover`、`filmingGuide`
   - 素材：`assetQuery`、`fallbackVisual`
   - 文字卡：`subtitle`
   - 同时检查 `hook`、`narrativeArc`、`bgmDirection`、`memberDelivery.tasks`、`workerDelivery.teamAssetQueries`
5. `content_risk_rewriter` 改为支持 `articlePackage + videoScript + memberDelivery + workerDelivery` 四段输出。
6. `final_compiler` 输出 `workflowVersion = content_calendar_generation_poc_v2_video_split`，并把 `memberDelivery`、`workerDelivery` 放到最终结果顶层。
7. V2.0 文件中顺手移除了 `creative_strategy.videoPlan` 里遗留的旧 `requiredUploads` 约束，避免上游继续诱导旧视频脚本结构。

## 本地验证

已完成：

- V2.0 YAML 可被 `PyYAML` 解析。
- 节点数：15。
- 边数：15。
- 旧 `video_script_generator` 节点不存在。
- 新链路四段边均存在。
- `delivery_compiler`、`quality_reviewer`、`final_compiler` 三个 Code 节点均可 `compile`。
- 使用最小样例本地执行三个 Code 节点：
  - `delivery_compiler` 输出 `videoScript/memberDelivery/workerDelivery`
  - `quality_reviewer.pass = true`
  - `final_compiler` 输出包含 `videoScript/memberDelivery/workerDelivery/workflowVersion`

## 2026-05-12 提示词原文修正

用户确认要求：LLM 对应提示词不要删减，按规划文档原文粘贴。

已修正 V2.0 YAML：

- `video_narrative` 的 System Prompt 已恢复为规划文档第 8 章代码块原文。
- `scene_breakdown` 的 System Prompt 已恢复为规划文档第 8 章代码块原文。
- 两个 User Prompt 保留规划文档模板结构，仅把概念占位符替换为 Dify 可识别变量：
  - `{{calendar_task_json}}` -> `{{#start.calendar_task_json#}}`
  - `{{creative_strategy.videoPlan}}` -> `{{#creative_strategy.structured_output.videoPlan#}}`
  - `{{creative_strategy.mustUseFacts}}` -> `{{#creative_strategy.structured_output.mustUseFacts#}}`
  - `{{creative_strategy.mustAvoidClaims}}` -> `{{#creative_strategy.structured_output.mustAvoidClaims#}}`
  - `{{article_generator.copyReadyText}}` -> `{{#article_generator.structured_output.copyReadyText#}}`
  - `{{video_narrative}}` -> `{{#video_narrative.text#}}`
  - `{{image_assets_json}}` -> `{{#start.image_assets_json#}}`

追加校验：

- `video_narrative` System Prompt 与规划文档对应代码块逐字一致。
- `scene_breakdown` System Prompt 与规划文档对应代码块逐字一致。
- YAML 仍可解析，三个 Code 节点仍可编译。

## 尚未做

- 尚未导入 Dify Cloud。
- 尚未发布新的 Dify 应用。
- 尚未用线上 Dify API 跑 `testcases/` 回归。

下一步建议：在 Dify UI 导入 V2.0 YAML，确认知识库节点绑定后发布，再用现有 `run_content_calendar_dify_cases.py` 或 skill 回归脚本跑至少 happy path、缺图片、弱知识库三类用例。
