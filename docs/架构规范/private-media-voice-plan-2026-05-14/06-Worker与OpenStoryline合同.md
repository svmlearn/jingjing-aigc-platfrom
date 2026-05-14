# 06 Worker 与 OpenStoryline 合同

## 摘要

app 负责权限和合同化；worker 负责稳定执行；OpenStoryline 负责剪辑和生成。不要把业务语义、权限判断、素材库检索全部塞进 OpenStoryline。

## 依据

项目依据：

- 当前主架构规定 `video_edit_jobs.input_payload` 是 app 和 worker 的稳定合同。
- 当前 worker 已支持 `production_config.voiceover.mode = voice_profile`。
- 当前 OpenStoryline `search_media` 仍按 Pexels 结构下载素材到 `media_dir`。
- Dify 是当前真正的单条内容生成 / 脚本制作链路；最终 JSON 字段以 `2026-05-13-Dify最终JSON字段确认器.html` 为准，主字段为 `article.*`、`video.*`、`quality.*`、`debug.*`。

外部依据：

- Pexels API 兼容层可以减少对 OpenStoryline 内部节点的改动。
- COS 签名 URL 或平台下载 URL 机制适合让 worker 下载私有对象；素材库下载 URL 按业务要求保持 60 天有效，voice ref audio 可按任务即时签发。
- GitHub / 开源工程常见做法是让 worker 阶段可回放、可重试、可定位；因此本方案要求保存 engine request / response 摘要和阶段日志。
- 对象存储下载、provider 调用、渲染输出都可能部分成功；因此 worker 必须有幂等输出 key 和分层失败状态。

## 专业社区经验落地规则

- Worker 不做多租户权限判断的最终来源；app 先校验，worker 再做 payload 自检，双层防错。
- 所有外部副作用都要有幂等 key：下载缓存、provider 调用、OpenStoryline request、结果上传、`asset_objects` 回写。
- 每个阶段都写结构化 stage log，失败要能定位到 `download`、`voice_ref`、`provider`、`openstoryline`、`upload`、`persistence`。
- OpenStoryline 只看 Pexels-like JSON 和本地文件；不要让它依赖 Supabase、COS SDK 或商家权限逻辑。
- engine request / response 摘要可回放，但不得保存永久密钥、provider secret 或不可撤销下载地址。

## Dify 脚本制作链路边界

这里的“content-generation-worker”指内容日历 / Dify 结果落库 worker，不是视频渲染 worker。Dify 是当前脚本制作链路；系统 worker 的职责是调度、解析、校验、落库和后续合同化，不是再把结果交给另一个脚本制作 Agent 重做。

推荐链路：

```text
Dify outputs.final_result_json
-> content-generation-worker 解析
-> article.* 落 note / 图文 variant
-> video.* 校验后落 video_script variant
-> quality.* 落质量状态和阻塞原因
-> debug.* / workflowVersion 落 trace / metadata
-> 视频工作台 / 成员端继续修订或确认
-> app 创建 video_edit_jobs.input_payload
-> 视频 worker / OpenStoryline 执行
```

硬边界：

- Dify 最终 JSON 是脚本制作来源，但不能原样作为 `video_edit_jobs.input_payload`；必须先落成 `content_variants`。
- 不再以另一套“脚本制作 Agent 原生 JSON”作为主合同；若历史代码仍有 `status + version.script` 结构，应由适配层从 Dify `video.*` 映射，不反向要求 Dify 遵守旧结构。
- `workflowVersion` 用于兼容和调试；`debug.*` 进入 trace / metadata，不进成员 UI 主输出。
- `quality.*` 决定前台状态、阻塞原因和是否允许继续创建视频任务。
- 只有 Dify `video.*` 经必填校验、质量 gate 和成员端确认后，才能创建 `video_edit_jobs`。

字段确认器当前推荐保留字段：

| 字段组 | 推荐保留字段 | 用途 |
| --- | --- |
| 元信息 | `workflowVersion`、`status` | 工作流兼容、任务状态。 |
| 图文 | `article.title`、`article.coverCopy`、`article.images[].cosPath`、`article.images[].role`、`article.copyText` | 落图文 variant 和成员端图文预览。 |
| 图文可选 | `article.images[].assetId`、`article.imageBriefIfMissing`、`article.blocks[]` | 素材回查、缺图提示、分段编辑。 |
| 视频整体 | `video.storyOutline`、`video.estimatedDuration`、`video.bgm`、`video.toneOfVoice` | 视频详情、剪辑口吻、worker 背景信息。 |
| 视频镜头 | `video.scenes[].sceneNo`、`timeRange`、`durationSec`、`sceneType`、`title`、`requiresUserUpload`、`purpose`、`taskDescription`、`visualDescription`、`voiceover`、`subtitle` | 视频工作台和 worker 的核心镜头脚本。 |
| 镜头语言 | `video.scenes[].shotLanguage.framing`、`cameraMovement`、`orientation`、`composition` | worker / 人工剪辑理解画面。 |
| 拍摄要求 | `video.scenes[].filmingGuide.method`、`location`、`posture`、`props`、`tips` | 成员端拍摄任务 UI。 |
| 剪辑要求 | `video.scenes[].editGuide.transition`、`pacing`、`minUsableSeconds` | worker / 人工剪辑，不一定展示给成员。 |
| 素材匹配 | `video.scenes[].assetQuery`、`fallbackVisual` | 私有素材库检索和兜底。 |
| 质量 | `quality.status`、`quality.pass`、`quality.blockingReasons`、`quality.missingInputs`、`quality.riskTerms`、`quality.scores` | 是否可继续、缺什么、风险记录。 |
| 调试 | `debug.taskUnderstanding`、`debug.creativeStrategy`、`debug.usedKnowledgeRefs` | 溯源和排查，不进成员端主 UI。 |

最终 JSON 草案示意：

```json
{
  "workflowVersion": "content_calendar_generation_poc_v3_1",
  "status": "needs_review",
  "article": {
    "title": "70平4米层高，总价友好",
    "coverCopy": "70平4米层高的家",
    "images": [
      {
        "cosPath": "cos://jingjing/project/2026/05/article-cover-70m-4m.jpg",
        "role": "cover"
      }
    ],
    "copyText": "70平4米层高，总价友好\n\n预算有限，但也想住得舒服...\n\n#买房 #小户型"
  },
  "video": {
    "storyOutline": "以预算有限的城市青年视角，从焦虑到发现舒适小面积产品...",
    "estimatedDuration": "60-90秒",
    "bgm": "轻盈、温暖、带一点节奏感",
    "toneOfVoice": "亲切共情、理性克制、专业引导",
    "scenes": [
      {
        "sceneNo": 1,
        "timeRange": "0-5s",
        "durationSec": 5,
        "sceneType": "口播",
        "title": "开场口播",
        "requiresUserUpload": true,
        "taskDescription": "围绕今日主题生成可拍摄口播脚本。",
        "visualDescription": "中介站在小区入口附近，面对镜头自然说话。",
        "voiceover": "70平的小户型，层高竟然有4米？",
        "subtitle": "70平4米层高，预算有限也能看",
        "assetQuery": "",
        "fallbackVisual": "小区入口平拍，显示门头和周边店铺"
      }
    ]
  },
  "quality": {
    "status": "needs_review",
    "pass": false,
    "blockingReasons": ["缺少可用图片素材"],
    "missingInputs": ["图文图片素材"],
    "riskTerms": []
  },
  "debug": {
    "taskUnderstanding": {},
    "creativeStrategy": {},
    "usedKnowledgeRefs": []
  }
}
```

兼容说明：

- 旧 POC 结果里如果仍出现 `articlePackage`、`videoScript`、`qualityReview`、`trace`、`saveHints`，应在接入层转换为字段确认器当前草案：`article`、`video`、`quality`、`debug`。
- `outputs.final_result_json` 可以作为原始包保存在 `content_generation_jobs.output_json`，但前台和视频工作台以转换后的 variant payload 为准。

## 工作边界

app：

- 校验脚本已确认。
- 校验素材归属。
- 校验 voice profile 归属。
- 只接受已由 Dify 生成、已按字段确认器校验、已确认的 `video_script` variant 创建视频任务。
- 组装 `video_edit_jobs.input_payload`。

worker：

- claim job。
- 校验 payload。
- 下载 COS 输入素材。
- 准备 voice profile ref audio。
- 调用 OpenStoryline engine。
- 上传结果并回写 `asset_objects` 和 `result_payload`。

OpenStoryline：

- 使用 Pexels-compatible 接口下载私有素材。
- 使用本地 `media_dir` 和 `ref_audio` 执行。
- 不直接访问数据库。
- 不判断用户权限。

## 硬门禁

payload 门禁：

- `script.locked = true`。
- `script` 必须来自 Dify `video.*` 落库后的 `video_script` variant，不得直接使用 `outputs.final_result_json` 原文。
- `input_assets.storage_provider = tencent_cos`。
- `input_assets.bucket_name` 非空。
- `input_assets.storage_key` 非空。
- `voice_profile` 模式必须有 `voice_profile_id`、`ref_audio_asset_id`、`ref_audio_asset`。

worker 门禁：

- 下载失败要分 retryable / manual。
- ref audio 缺失或 provider 不支持时，不继续渲染。
- OpenStoryline 返回缺失 final video 时，不标记 succeeded。
- `voiceover_artifacts` 缺失时，克隆声音 job 不算完全通过。
- 上传结果必须使用确定性 output key 或有去重策略，避免 retry 产生多份成品。
- 同一 job retry 不得重复插入不可区分的 `asset_objects`。
- stage log 不得记录永久密钥、完整 provider secret 或不可撤销下载 URL。

OpenStoryline 门禁：

- 私有 Pexels base URL 可配置。
- 不再硬依赖真实 Pexels key。
- Pexels-compatible 响应缺字段时，search node 应失败并可观测。
- OpenStoryline 收到的私有素材 URL 必须 60 天有效，避免生成后复查、重跑或人工验收时链接已过期。

## 检查功能

合同检查：

- app payload 单测覆盖 system voiceover 和 voice_profile voiceover。
- worker directive 测试覆盖 voice_profile 校验。
- OpenStoryline adapter 测试覆盖 `pixelle_clone` provider。
- Pexels-compatible fixture 测试覆盖 `videos` 和 `photos`。

运行检查：

- worker 日志记录下载的 input asset 数量。
- worker 日志记录是否准备 ref audio。
- result payload 记录 `voiceover_artifacts`。
- OpenStoryline engine request 可回放。
- replay fixture 中的 URL 必须可替换或可重新签发，不能依赖已过期签名硬编码。
- 每个阶段有 `current_stage`，失败时能定位到 download / voice_profile_reference / openstoryline / upload / asset_objects_persistence。

## 纠错功能

- input asset 下载失败：重试，超过阈值标记 `failed_retryable`。
- ref audio 权限或 key 错误：标记 `failed_manual`。
- OpenStoryline 兼容字段缺失：回到 Pexels-compatible 接口修复。
- voiceover artifact 缺失：标记 `voiceover_artifact_missing`，保留 final video 但提示需要复核。
- retry 产生重复结果：以 job_id + asset kind 做幂等 upsert 或归档重复 asset。

## 板块验收

- 不访问真实 Pexels 也能完成一次素材检索和下载。
- 使用 voice profile 的 job 能生成 voiceover 并回传摘要。
- 所有失败都能定位到 app payload、COS 下载、voice ref、OpenStoryline 执行或结果上传中的某一层。
