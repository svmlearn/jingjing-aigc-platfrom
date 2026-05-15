# 2026-05-13 Dify SiliconFlow DeepSeek v3.2 回归测试记录

## 背景

本轮用户将 Dify 工作流中的 DeepSeek Flash 切换为硅基流动 DeepSeek v3.2，希望验证：

1. 最终 JSON 是否仍符合 V3.1 输出契约；
2. 三个既有测试用例是否能稳定跑完；
3. 运行时间是否较原 DeepSeek 链路改善；
4. 内容质量是否接近或优于 GPT-4o 版本。

本记录不保存 API key。

## 测试范围

- 测试脚本：`/tmp/dify_v31_poll_test.py`
- 测试用例：
  - `docs/探索/2026-05-11-用dify来测试链路/testcases/case01_full_with_compliance_risk.json`
  - `docs/探索/2026-05-11-用dify来测试链路/testcases/case02_no_images.json`
  - `docs/探索/2026-05-11-用dify来测试链路/testcases/case03_weak_knowledge.json`
- 结果目录：
  - `docs/探索/2026-05-11-用dify来测试链路/results/v31_api_siliconflow_deepseek_v32_20260513/`

## 运行结果

| case | workflow | JSON 契约校验 | final status | 耗时 | 图文图片数 | 视频分镜数 |
|---|---:|---:|---:|---:|---:|---:|
| case01_full_with_compliance_risk | succeeded | passed | passed | 635.54s | 2 | 10 |
| case02_no_images | succeeded | passed | needs_review | 278.34s | 0 | 9 |
| case03_weak_knowledge | succeeded | passed | needs_review | 543.92s | 1 | 9 |

## 与前两版粗略对比

| case | 原 DeepSeek 链路 | GPT-4o 链路 | 硅基流动 DeepSeek v3.2 |
|---|---:|---:|---:|
| case01 | 379.10s | 62.73s | 635.54s |
| case02 | 449.60s | 55.56s | 278.34s |
| case03 | 旧链路曾卡住 | 74.32s | 543.92s |

结论：

- 硅基流动 DeepSeek v3.2 三个 case 都能跑完，稳定性好于旧 DeepSeek 在 case03 的表现。
- 速度仍然远慢于 GPT-4o；case01 和 case03 接近 9-11 分钟，不适合前端同步等待。
- case02 比旧 DeepSeek 快，但仍是 4 分钟以上。

## 内容质量观察

硅基流动 DeepSeek v3.2 的图文内容明显比 GPT-4o 更接近“小红书/本地中介口吻”：

- case01 文案有真实带看感，能把“预算卡住、成熟社区、4米层高”串成自然叙事；
- case02 没有图片输入时，仍能生成可发布的生活半径/配套自检类内容；
- case03 在弱输入下会借用知识库检索内容，因此比 GPT-4o 更丰富，同时 final status 保持 `needs_review`。

需要注意：

- case01 生成了“这周带了三组客户”这类经验化表达，口吻好，但如果严格追求事实不扩写，需要后续增加“真实经历类句子不得编造”的规则。
- case03 使用了知识库召回到的 80 万方、4 米层高等事实，不属于纯 fallback 输入推断。

## 瓶颈节点

节点输出中的 LLM usage 显示，主要耗时集中在：

- `创作策略规划`：约 105-136s；
- `分镜与素材策略`：约 115-140s；
- `违规内容改写 LLM`：case01 约 320s，case03 约 266s。

其中 `违规内容改写 LLM` 是 case01 和 case03 接近 10 分钟的关键放大器。case02 没有触发该节点，整体耗时降到约 4 分 38 秒。

## 当前判断

如果优先追求内容质量，硅基流动 DeepSeek v3.2 可以继续作为内容生成主力；如果优先追求链路响应时间，不能直接用于前端同步生成。

下一步更合理的方向是混合模型与异步化：

1. 内容生成核心节点保留 DeepSeek 类模型；
2. 结构化、编译、合规改写、质量判定尽量用更快模型或 Code 节点；
3. 前端调用 Dify API 时采用任务队列/轮询/状态页，而不是同步等待 5-10 分钟。
