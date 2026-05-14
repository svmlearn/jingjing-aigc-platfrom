# 2026-05-11 Dify 内容日历生成图文与视频脚本 POC 调优记录

## 目标

验证第一段链路：

`内容日历 + 爆款内容 + txt 知识库 + 图片素材 -> 图文内容包 / 视频镜头脚本`

重点不是资讯平台选题，而是内容日历任务出来后，能否稳定生成可用图文内容包和视频镜头脚本，并明确质量门禁。

## 本轮产物

- Dify YAML：`docs/探索/2026-05-11-用dify来测试链路/内容日历生成图文与视频脚本 POC.yml`
- 本地回归脚本：`docs/探索/2026-05-11-用dify来测试链路/run_content_calendar_dify_cases.py`
- 测试用例目录：`docs/探索/2026-05-11-用dify来测试链路/testcases/`
- 结果目录：`docs/探索/2026-05-11-用dify来测试链路/results/`

## Dify Cloud 状态

- 使用入口：`https://cloud.dify.ai/apps`
- 最终发布测试应用 ID：`07429644-2211-4078-b091-3380980e4268`
- API Base URL：`https://api.dify.ai/v1`
- 已创建 API Key，但未写入仓库、未记录明文。
- 原 21:55 应用未删除；过程中由 Codex 创建的中间测试副本已删除，仅保留最终测试应用。

## 关键调整

1. 保留 Dify 知识库节点，绑定 `20260509_1.txt...` 项目知识库。
2. 生成节点增加风险表达净化，禁止把“租金、收益、回报、满租、价格趋势”等作为公开卖点输出。
3. 视频脚本节点强制输出：
   - 每个 scene 的 `assetQuery`
   - `uploadRequired=true` 对应的 `requiredUploads`
   - `assetSourceHint=team_video_asset` 对应的 `optionalTeamVideoAssets`
4. 原 LLM 质量评审节点会误判不存在的合规风险，已改为 Dify Code 节点做规则化质量评审。
5. 本地测试脚本只扫描公开成稿字段中的风险词，不再把 trace / 上游输入中的风险提示误判为成稿问题。

## 验证结果

第四版发布后：

- `case02_no_images`：通过。预期为 `quality_pass=false`，原因为缺图；合规分为 9。
- `case03_weak_knowledge`：通过。预期为 `quality_pass=false`，原因为知识不足；合规分为 9。
- `case01_full_with_compliance_risk`：整轮第一次因网络层 `SSL EOF` 未进入 workflow；单独重跑通过。

关键结果文件：

- 全量第四轮汇总：`docs/探索/2026-05-11-用dify来测试链路/results/测试汇总_20260511_230431.json`
- case01 重跑汇总：`docs/探索/2026-05-11-用dify来测试链路/results/测试汇总_20260511_230636.json`
- case01 通过结果：`docs/探索/2026-05-11-用dify来测试链路/results/case01_full_with_compliance_risk_run1_20260511_230504_505877.json`

## 阶段结论

这条链路可以打通，但质量门禁不适合完全交给 LLM 自评。

推荐迁移到 LangGraph.js / Node workflow 时采用：

1. LLM 节点负责理解、策略、图文生成、视频脚本生成。
2. 规则代码节点负责合规词、字段完整性、素材匹配、缺失输入判断。
3. `qualityReview.pass` 由代码 validator 决定，LLM 只补充解释性建议。

