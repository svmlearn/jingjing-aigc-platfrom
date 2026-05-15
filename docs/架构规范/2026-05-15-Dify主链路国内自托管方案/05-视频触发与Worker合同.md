# 05 视频触发与 Worker 合同

## 摘要

本分册定义 Dify 生成的视频脚本如何进入既有视频剪辑链路。

核心结论：

```text
Dify -> video_script variant
用户确认 -> approved
用户点击 AI 剪辑 -> video_edit_jobs
video-worker -> ProductionDirective
OpenStoryline / FireRed -> 成片
```

视频服务器只认 `video_edit_jobs`，不认 Dify job。

## 和以前链路的关系

保持不变：

- 用户必须看到脚本。
- 用户必须确认脚本。
- app 组装 `video_edit_jobs.input_payload`。
- video-worker 消费 `video_edit_jobs`。
- OpenStoryline/FireRed 只处理 worker 标准化合同。

变化：

- 脚本来源从旧脚本 agent / 手工草稿，增加 Dify。
- Dify 分镜要结构化持久化。
- Dify 成功后前台多一个可确认的脚本来源。

不变的硬边界：

- Dify 不直接触发视频服务器。
- Dify 不直接创建 `video_edit_jobs`。
- Dify JSON 不直接进入 worker。

## 用户触发流程

### 1. 用户查看脚本

页面读取：

- `content_drafts`
- `content_variants`
- `variant_type = video_script`
- `script_text`
- `production_scenes`

页面展示：

- 总脚本。
- 分镜。
- 口播。
- 字幕。
- 拍摄指导。
- 是否需要上传素材。

硬门禁：

- 缺 `script_text` 不允许确认。
- 缺关键分镜时提示需修复或重新生成。
- 不展示 Dify 原始 debug。

### 2. 用户确认脚本

当前已有能力：

```text
approveContentVariant
reviewStatus = approved
```

硬门禁：

- 只有 `video_script` variant 可以确认为可剪辑脚本。
- 非本人 / 非团队权限不可确认。
- 空脚本不可确认。

### 3. 用户点击 AI 剪辑

入口：

```text
POST /api/video-edit-jobs
```

请求只需要：

- `contentVariantId`
- `instructionText` 可选
- `productionConfig` 可选
- `sourceJobId` 可选，制作修订时使用

禁止：

- 前端传 `inputPayload`。
- 前端传 Dify 原始 JSON。
- 前端传 COS 永久密钥。

### 4. app 组装 input_payload

app 读取：

- `contentVariantId`
- 对应 `content_drafts`
- 对应 `content_variants`
- 绑定素材 / 上传素材 `asset_objects`
- production config
- voice profile，可选

生成：

- `script.locked = true`
- `productionDirective`
- `productionConfig`
- `materialContext`
- `input_assets`

硬门禁：

- `reviewStatus = approved`
- `scriptText` 非空。
- 已确认素材必须有可下载 COS asset。
- input assets 必须是 `tencent_cos`。
- bucket / storage key 非空。

## worker 合同

worker 只看：

```json
{
  "script": {
    "text": "...",
    "locked": true,
    "variantId": "..."
  },
  "productionDirective": {
    "targetPlatform": "douyin",
    "aspectRatio": "9:16",
    "desiredOutputs": ["final_video", "cover", "subtitles"]
  },
  "productionConfig": {},
  "materialContext": {},
  "input_assets": []
}
```

worker 不看：

- `difyFinalJson`
- `article`
- `video`
- `quality`
- `debug`
- `content_generation_jobs`

## ProductionDirective 边界

ProductionDirective 由 worker / engine adapter 标准化，不由 Dify 直接生成。

要求：

- 脚本已锁定。
- 目标平台明确。
- 输出类型明确。
- 输入素材可下载。
- production config 可校验。

失败分类：

- payload 错误：`failed_manual`
- COS 下载失败：`failed_retryable`
- OpenStoryline 暂时失败：`failed_retryable`
- 输出缺 final video：`failed_retryable` 或 `failed_manual`，按 engine 错误决定。

## 工作边界

app 负责：

- 用户权限。
- 脚本确认。
- 素材权限。
- payload 合同化。
- 创建 / 查询 / 重试 / 取消 video job。

video-worker 负责：

- claim job。
- 校验 payload。
- 下载 COS 输入。
- 调 engine。
- 上传输出。
- 回写状态。

OpenStoryline / FireRed 负责：

- 视频制作执行。
- 不判断用户权限。
- 不读业务数据库。
- 不理解 Dify 原始结构。

## 检查功能

合同测试：

- Dify 来源 `video_script` 创建 payload。
- 非 Dify 来源 `video_script` 创建 payload。
- 两者 payload 外壳一致。
- 未 approved 脚本被拒绝。
- 空脚本被拒绝。
- input assets 缺 bucket 被拒绝。
- Dify 原始字段进入 payload 时测试失败。

运行测试：

- Dify job 成功后无 `video_edit_jobs`。
- 点击 AI 剪辑后有 `video_edit_jobs`。
- worker 领取后状态推进。
- 成功后有 result payload 和 `asset_objects`。

## 纠错功能

- 用户没确认脚本：返回“请先确认脚本”。
- Dify 分镜缺失：返回“脚本结构不完整，请重新生成或修订”。
- 素材缺 COS key：阻断创建，不交给 worker。
- worker 失败：不删除 Dify draft / variant，用户可重试或修订。
- OpenStoryline 生成质量不满意：走制作修订或语义修订，不回写 Dify 原始 JSON。

## 板块验收

通过标准：

- Dify 到脚本落库和视频执行之间有用户确认门禁。
- 视频服务器只由 `video_edit_jobs` 驱动。
- Dify 来源和旧脚本来源共用同一 payload builder。
- worker 不需要知道脚本来自 Dify 还是旧链路。
