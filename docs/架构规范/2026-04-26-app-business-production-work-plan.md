# 2026-04-26 主应用业务生产板块工作文档

## 1. 定位

本文件只定义 `app/` 负责的业务生产工作。

主应用业务生产板块的职责是：

```text
决定做什么内容，并生成可执行的视频作业。
```

它不负责视频渲染，不负责 OpenStoryline 或 FireRed 的内部执行。

## 2. 所属目录

```text
app/
  src/
    app/
    components/
    contracts/
    server/
    lib/db/
```

## 3. 负责范围

### 3.1 用户层

负责：

- 内容日历
- 视频工作台
- 脚本确认
- 素材确认
- 视频预览入口
- 审核入口
- 修订入口

产出：

- 用户确认后的脚本状态
- 用户确认后的素材选择
- 审核和修订意图

### 3.2 增长层

负责：

- `GrowthBrief`
- `HotspotMap`
- `ContentThemeSequence`
- `VideoStrategy`
- `ScriptDrafts`

产出：

- 面向获客目标的视频策略
- 候选脚本
- 目标平台、人群、卖点、CTA 等业务判断

### 3.3 素材层

负责：

- `AssetPlan`
- `AssetMatchReport`
- 素材候选
- 素材选择
- 素材绑定关系
- 用户上传素材的业务归属

产出：

- 已确认素材清单
- 可传给 worker 的 `input_assets`
- `materialContext`

### 3.4 审核层

负责：

- 展示 worker 产出的 Preview
- 人工审核
- 判断修订类型
- 语义修订回增长层
- 制作修订重新创建视频作业

产出：

- 审核结论
- Revision 记录
- 新一轮 `video_edit_jobs` 作业

### 3.5 作业创建

负责：

- 创建 `video_edit_jobs`
- 写入标准 `input_payload`
- 将作业置为 `pending`
- 记录作业和内容草稿、商家、门店、平台、素材的关系

产出：

```text
video_edit_jobs.pending
```

## 4. 输入

主应用业务生产板块的输入包括：

| 输入 | 来源 |
| --- | --- |
| 商家、门店、平台、账号目标 | 用户选择或业务配置 |
| 咨询记录、客户问题、业务背景 | 咨询 Agent 或业务数据 |
| 热点、卖点、人群判断 | 增长层生成或人工填写 |
| 素材库资产 | COS、`asset_objects`、用户上传 |
| 人工确认结果 | 视频工作台 |

## 5. 输出合同

主应用输出给视频执行工具板块的唯一核心对象是：

```text
video_edit_jobs.input_payload
```

标准形态：

```json
{
  "source": "video_workbench",
  "executionMode": "staging_worker",
  "script": {
    "text": "已确认的视频脚本或口播文案",
    "locked": true,
    "variantId": "content-variant-id"
  },
  "productionDirective": {
    "targetPlatform": "douyin",
    "aspectRatio": "9:16",
    "desiredOutputs": ["final_video", "cover", "subtitles"],
    "lockedFields": ["script", "cta", "target_user", "claims"]
  },
  "materialContext": {
    "assetPlanId": "asset-plan-id",
    "assetMatchReportId": "asset-match-report-id"
  },
  "input_assets": []
}
```

## 6. 必须保证

创建作业前必须保证：

1. `script.text` 存在。
2. `script.locked` 为 true。
3. `productionDirective.desiredOutputs` 包含 `final_video`。
4. 用户已经确认脚本。
5. 如果作业依赖素材，素材已经被选择或确认。
6. 作业目标平台、比例和输出要求清晰。

## 7. 不负责范围

主应用业务生产板块不负责：

1. 不 claim worker 作业。
2. 不下载 COS 输入素材到 worker workspace。
3. 不调用 `openstoryline-engine /v1/runs`。
4. 不直接调用 FireRed session/chat/WebSocket。
5. 不生成最终视频文件。
6. 不上传 worker 生成的 final video、cover、subtitles。
7. 不把 runtime 异常伪装成业务成功。
8. 不绕过 `video_edit_jobs` 直接驱动执行引擎。

## 8. 和视频执行工具板块的连接

唯一连接点：

```text
video_edit_jobs.input_payload
```

主应用只负责创建作业。作业创建后，执行权交给 `workers/video-worker/`。

主应用可以读取作业状态和结果，但不直接干预 worker 内部执行流程。

## 9. 任务清单

### 阶段 1：作业创建侧对齐

- 检查 `app/src/server/api/video-edit-jobs-service.ts`
- 对齐 `input_payload.script`
- 对齐 `input_payload.productionDirective`
- 对齐 `input_payload.input_assets`
- 增加服务端 schema 校验
- 增加 job 创建测试

### 阶段 2：工作台确认门禁

- 脚本未确认时不允许创建正式视频作业
- 素材未确认时不允许创建依赖素材的正式视频作业
- 提供明确错误提示

### 阶段 3：审核和修订分流

- Preview 页面读取 worker 结果
- 制作修订创建新视频作业
- 语义修订回增长层重新生成策略或脚本
- Revision 记录追加保存

## 10. 验收标准

验收时看：

1. 主应用创建的 `video_edit_jobs.input_payload` 符合合同。
2. 未锁定脚本不能创建正式作业。
3. 缺少 `final_video` 输出要求不能创建正式作业。
4. 创建作业后状态为 `pending`。
5. 主应用不直接调用 OpenStoryline 或 FireRed。
6. 用户可以看到作业状态和输出预览。
7. 语义修订和制作修订不会混到同一条路径。

## 11. 相关文档

- `docs/架构规范/2026-04-25-video-worker-openstoryline-main-implementation-plan.md`
- `docs/架构规范/2026-04-26-video-worker-execution-work-plan.md`
- `docs/产品文档/V2.1-内容日历到图文视频工作台协作PRD.md`

