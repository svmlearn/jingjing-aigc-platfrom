# 2026-05-12 Dify 视频脚本节点拆分 V2.0 Handoff

## 当前目标

根据视频脚本节点拆分规划，把 Dify 内容日历生成图文与视频脚本 POC 从单个视频脚本 LLM 节点升级为“叙事 -> 分镜 -> 交付物编译”的 V2.0 DSL。

## 已完成

1. 已备份当前 Dify YAML 为 V1.0。
2. 已生成 V2.0 YAML，不覆盖原 POC 文件。
3. V2.0 中已删除旧 `video_script_generator`，新增：
   - `video_narrative`
   - `scene_breakdown`
   - `delivery_compiler`
4. 已更新下游：
   - `quality_reviewer`
   - `content_risk_rewriter`
   - `video_script_aggregator`
   - `final_compiler`
5. 已补执行记录：`docs/progress/2026-05-12-dify-video-script-v2-node-split.md`

## 产物路径

- V1.0 备份：`docs/探索/2026-05-11-用dify来测试链路/2026-05-12-175032-内容日历生成图文与视频脚本-Dify工作流-V1.0-backup.yml`
- V2.0 修改版：`docs/探索/2026-05-11-用dify来测试链路/2026-05-12-175032-内容日历生成图文与视频脚本-Dify工作流-V2.0-视频脚本节点拆分.yml`

## 验证结果

本地静态验证通过：

- YAML 可解析。
- 三个 Code 节点可编译。
- 新 graph 链路存在：`article_generator -> video_narrative -> scene_breakdown -> delivery_compiler -> quality_reviewer`。
- 旧 `video_script_generator` 节点不存在。
- 最小样例可以跑通 `delivery_compiler -> quality_reviewer -> final_compiler`。

## 提示词修正

用户已明确要求“不要删减 LLM 对应提示词，原文粘贴”。

当前 V2.0 YAML 已按此修正：

- `video_narrative` System Prompt 与 `2026-05-12-视频脚本节点拆分规划.md` 第 8 章代码块逐字一致。
- `scene_breakdown` System Prompt 与 `2026-05-12-视频脚本节点拆分规划.md` 第 8 章代码块逐字一致。
- User Prompt 只做 Dify 变量语法适配，不再压缩提示词内容。

追加校验结果：

- 两个 System Prompt 已用脚本断言与规划文档代码块一致。
- YAML 仍可解析。
- 三个 Code 节点仍可编译。

未做线上验证：

- 未导入 Dify Cloud。
- 未发布 Dify 应用。
- 未跑线上 API 回归。

## 下一步建议

1. 在 Dify UI 导入 V2.0 YAML。
2. 确认 `txt 知识库检索` 节点仍绑定正确知识库。
3. 发布测试应用。
4. 用现有 `docs/探索/2026-05-11-用dify来测试链路/testcases/` 跑 happy path、缺图片、弱知识库三类回归。
5. 如果 V2.0 回归通过，再决定是否把 `内容日历生成图文与视频脚本 POC.yml` 更新为 V2.0。

## Push / Merge

- 未 commit。
- 未 push。
- 未 merge。
