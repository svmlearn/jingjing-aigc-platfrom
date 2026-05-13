# 2026-05-13 Dify V3.1 最终 JSON YAML 冻结交接

## 当前目标

把 `内容日历生成图文与视频脚本 POC V3.0.yml` 基于已定稿的最终 JSON 契约收敛为 V3.1 YAML。

本轮已经达成的核心共识：

- 不改任何 LLM prompt。
- 不压缩、不删减 system prompt 中的方法论。
- 输出结构调整放在 structured output schema 和 Code 节点最终编译中完成。
- V3.0 YAML 保留，不覆盖。

## 已完成内容

1. 新增 V3.1 YAML：
   - `docs/探索/2026-05-11-用dify来测试链路/2026-05-13-142434-内容日历生成图文与视频脚本-Dify工作流-V3.1-最终JSON收敛.yml`

2. 调整 structured output schema：
   - `article_body.contentBlocks[].imageMatch` 增加 `cosPath`、`role`。
   - `scene_breakdown.scenes[]` 对齐最终视频镜头字段。
   - `scene_breakdown.scenes[]` 不再要求最终主 JSON 已删除的 `fallbackVisual`、`filmingGuide.props`。

3. 调整 Code 节点数据读取：
   - `article_compiler` 优先读取 `title_cover.structured_output`、`article_body.structured_output`。
   - `delivery_compiler` 优先读取 `video_narrative.structured_output`、`scene_breakdown.structured_output`。
   - `final_compiler` 增加读取 `start.image_assets_json`，用于生成 `article.images[].cosPath`。

4. 调整最终输出：
   - 顶层只输出 `status`、`article`、`video`、`quality`。
   - 删除原主输出里的 `workflowVersion`、`articlePackage`、`titleStrategy`、`videoScript`、`memberDelivery`、`workerDelivery`、`qualityReview`、`trace`、`saveHints`。

5. 新增本地验证：
   - `docs/探索/2026-05-11-用dify来测试链路/verify_dify_v31_final_json_yml.py`

## 当前验证结果

已通过：

```bash
python3 docs/探索/2026-05-11-用dify来测试链路/verify_dify_v31_final_json_yml.py
```

验证结论：

- YAML 可解析。
- LLM `prompt_template` 与 V3.0 完全一致。
- Code 节点可编译。
- `final_compiler` 本地样例输出只包含 `status/article/video/quality`。
- 已删除字段不会出现在最终样例主业务 JSON 中。

## 正在做什么

当前本地 YAML 和校验脚本已完成，处于待验收 / 待导入 Dify 回归状态。

## 下一步建议

1. 用户在 Dify UI 导入新 V3.1 YAML。
2. 发布测试应用。
3. 使用现有测试用例目录跑回归：
   - `docs/探索/2026-05-11-用dify来测试链路/testcases/`
4. 回归重点检查：
   - 最终 JSON 可解析。
   - 顶层只有 `status/article/video/quality`。
   - `article.images[].cosPath` 能从真实 COS 图片素材里正常输出。
   - `video.scenes[].requiresUserUpload` 能控制上传槽位。
   - 每个 `video.scenes[]` 都有 `visualDescription`、`filmingGuide.*`、`shotLanguage.*`、`editGuide.*`。

## 改动文件

- `docs/handoff/2026-05-13-dify-v3-1-final-json-yml-handoff.md`
- `docs/handoff/2026-05-13-dify-v3-1-final-json-yml-completion-handoff.md`
- `docs/progress/2026-05-13-dify-v3-1-final-json-yml-progress.md`
- `docs/探索/2026-05-11-用dify来测试链路/build_dify_v31_final_json_yml.py`
- `docs/探索/2026-05-11-用dify来测试链路/verify_dify_v31_final_json_yml.py`
- `docs/探索/2026-05-11-用dify来测试链路/2026-05-13-142434-内容日历生成图文与视频脚本-Dify工作流-V3.1-最终JSON收敛.yml`

## 分支 / Worktree

- branch：
  - `codex/dify-v31-final-json-yml`
- worktree：
  - `/Users/wy/.codex/worktrees/dify-v31-final-json-yml`

## 最终 Commit

待本轮提交后回填。

## Push / Merge

- push：未 push
- merge：未 merge

## 注意事项

- 本轮没有导入 Dify UI，也没有线上 API 回归。
- 如果下一位 Agent 要继续做自动闭环，需要用户提供 Dify API key；只能放在环境变量或命令参数里，不要写入仓库、日志、文档或最终回复。
- 如果导入 Dify 后发现某些平台素材字段实际不叫 `cosPath`，优先在 `final_compiler` 的 `image_path_from()` 中增加别名映射，不要改 LLM prompt。
