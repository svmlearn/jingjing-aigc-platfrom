# 2026-05-13 Dify V3.1 最终 JSON 收敛执行记录

## 目标

基于已定稿的最终 JSON 契约，从 V3.0 YAML 生成一份新的 V3.1 YAML。

本轮边界：

- 不覆盖 V3.0 YAML。
- 不修改任何 LLM 节点的 `prompt_template`。
- 只调整 structured output schema、Code 节点 structured output 读取、最终 JSON 编译收敛。
- 最终主业务 JSON 只输出 `status`、`article`、`video`、`quality`。

## 产物

- 新 YAML：
  - `docs/探索/2026-05-11-用dify来测试链路/2026-05-13-142434-内容日历生成图文与视频脚本-Dify工作流-V3.1-最终JSON收敛.yml`
- 生成脚本：
  - `docs/探索/2026-05-11-用dify来测试链路/build_dify_v31_final_json_yml.py`
- 本地校验脚本：
  - `docs/探索/2026-05-11-用dify来测试链路/verify_dify_v31_final_json_yml.py`

## 主要修改点

1. `article_body.structured_output`
   - 在 `contentBlocks[].imageMatch` 中补充 `cosPath`、`role`。
   - 便于最终 `article.images[].cosPath` 和 `article.images[].role` 收敛。

2. `scene_breakdown.structured_output`
   - 对齐最终视频镜头字段：
     - `durationSec`
     - `title`
     - `requiresUserUpload`
     - `purpose`
     - `taskDescription`
     - `shotLanguage.*`
     - `filmingGuide.method/location/posture/tips`
     - `editGuide.*`
   - 移除最终主 JSON 不需要的 `fallbackVisual`、`filmingGuide.props`。

3. Code 节点 structured output 读取
   - `article_compiler` 改为读取 `title_cover.structured_output`、`article_body.structured_output`。
   - `delivery_compiler` 改为读取 `video_narrative.structured_output`、`scene_breakdown.structured_output`。
   - `final_compiler` 增加读取 `start.image_assets_json`，用于将 `imageMatches[].assetId` 映射为 `article.images[].cosPath`。

4. 最终结果编译
   - `final_compiler` 最终只输出：
     - `status`
     - `article.title`
     - `article.coverCopy`
     - `article.images[].cosPath`
     - `article.images[].role`
     - `article.copyText`
     - `video.storyOutline`
     - `video.estimatedDuration`
     - `video.bgm`
     - `video.toneOfVoice`
     - `video.scenes[]`
     - `quality.riskTerms`
   - 不再输出 `workflowVersion`、`articlePackage`、`videoScript`、`memberDelivery`、`workerDelivery`、`qualityReview`、`trace`、`saveHints`。

## Prompt 保留情况

已通过 `verify_dify_v31_final_json_yml.py` 对比 V3.0 与 V3.1：

- 所有 LLM 节点的 `prompt_template` 完全一致。
- 未修改 system prompt。
- 未修改 user prompt。

## 验证结果

已执行：

```bash
python3 docs/探索/2026-05-11-用dify来测试链路/verify_dify_v31_final_json_yml.py
```

结果：

```text
Dify V3.1 YAML final JSON contract verification passed.
```

该校验覆盖：

- V3.1 YAML 可被 PyYAML 解析。
- V3.0 YAML 未被覆盖。
- LLM `prompt_template` 与 V3.0 逐字一致。
- 关键 Code 节点优先读取 `structured_output`。
- `scene_breakdown` 和 `article_body` 的 structured output schema 对齐最终 JSON 契约。
- Code 节点代码可编译。
- `final_compiler` 本地样例输出顶层只有 `status/article/video/quality`。
- 最终样例输出不包含已删除字段。

## 尚未执行

- 尚未导入 Dify UI。
- 尚未发布 Dify 应用。
- 尚未使用 Dify API key 跑线上回归。

原因：本轮没有拿到 API key；按约定不把 key 写入文件或日志。

## 分支与状态

- worktree：
  - `/Users/wy/.codex/worktrees/dify-v31-final-json-yml`
- branch：
  - `codex/dify-v31-final-json-yml`
- commit：
  - 待本轮提交后回填
- push：
  - 未 push
- merge：
  - 未 merge，待用户验收后决定
