# 2026-05-11 视频剪辑开源项目 knowhow 调研 Handoff

## 当前目标

把两个本地参考项目拆成产品经理能读懂的流程说明，并用 HTML 做成可浏览的流程展示，帮助后续判断如何把它们吸收进“小红书抖音矩阵获客平台”的视频工作台和 worker。

本轮研究的两个项目是：

- `references/open-source/Pixelle-Video`
- `references/open-source/小红书AI剪辑视频`

## 已完成内容

1. 已确认 `Pixelle-Video` 已放在既有 `references/open-source/` 目录下，没有再新建错误的 `opensoruse` 目录。
2. 已记录用户需求，明确本轮不是直接做代码合并，而是先输出“流程、knowhow、运行方式、素材理解、转场、剪辑、融合改造建议”。
3. 已阅读两个项目的 README、配置、启动脚本、核心 pipeline、核心 node、prompt、渲染相关代码。
4. 已结合本项目 V2.1 内容工作台 PRD 和当前架构规范，整理出两个开源项目与本项目 app / worker / Supabase / COS 的推荐融合方式。
5. 已产出一份深度 Markdown 报告，覆盖运行方式、素材链路、语义识别、剪辑时间线、转场、渲染、能力对比和改造路线。
6. 已产出一份单文件 HTML 流程展示，面向产品经理阅读，不要求读代码。

## 产物路径

- 需求记录：`docs/探索/2026-05-11-视频剪辑开源项目融合调研需求记录.md`
- 深度报告：`docs/探索/2026-05-11-两项目视频剪辑knowhow深度调研报告.md`
- HTML 展示：`docs/探索/2026-05-11-视频剪辑knowhow流程展示.html`
- 本 handoff：`docs/handoff/2026-05-11-video-open-source-knowhow-handoff.md`

## 验证结果

已做的验证：

- `Pixelle-Video` 报告章节已覆盖：总览、深度拆解、能力对比、可吸收 knowhow、融合建议、版本路线、证据索引。
- `小红书AI剪辑视频` 报告章节已覆盖：运行方式、Agent 编排、素材查找、语义理解、筛选分组、脚本、配音、BGM、转场、时间线、渲染。
- HTML 文件已覆盖关键词：`Pixelle-Video`、`小红书AI剪辑视频`、`素材链路`、`语义理解`、`剪辑时间线`、`融合改造路线`、`产品经理读法`。
- 本轮只做代码阅读和文档化调研，没有调用外部 LLM、VLM、TTS、ComfyUI、RunningHub、Pexels、DashScope、MiniMax 等真实服务。
- 因两个项目都依赖外部密钥、模型资源或较重的本地运行环境，本轮没有实际生成完整视频；报告中已把“从代码可确认的流程”和“需要真实资源才能验证的部分”区分开。

## 后续建议

1. 先按报告中的推荐路线做产品决策：`Pixelle-Video` 作为“无素材快速生成 / AI 补素材”能力，`小红书AI剪辑视频` 作为“有素材理解 + 自动剪辑计划”能力，不建议直接把两个仓库硬合并。
2. 若进入 MVP，实现重点应放在统一任务合同：`video_edit_jobs.input_payload`、素材清单、脚本分组、时间线 JSON、COS 回写和预览修订，而不是先追求所有 AI 转场和复杂特效。
3. 下一步可单独开一个任务，把报告里的“融合改造路线”改成正式 PRD 或 worker 技术任务书。
4. 如果要真实跑通样片，需要先补齐至少一套可用密钥和资源：LLM/VLM、TTS、FFmpeg、模型权重、BGM/字体资源，以及本项目侧的 COS/Supabase 测试环境。

## 分支与合并状态

- 当前分支：`main`
- 本轮未创建新 worktree。
- 本轮未提交 commit。
- 本轮未 push。
- 本轮未 merge。

## 改动文件

- `docs/探索/2026-05-11-视频剪辑开源项目融合调研需求记录.md`
- `docs/探索/2026-05-11-两项目视频剪辑knowhow深度调研报告.md`
- `docs/探索/2026-05-11-视频剪辑knowhow流程展示.html`
- `docs/handoff/2026-05-11-video-open-source-knowhow-handoff.md`
