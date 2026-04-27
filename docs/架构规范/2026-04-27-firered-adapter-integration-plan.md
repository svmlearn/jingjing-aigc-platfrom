# 2026-04-27 FireRed Adapter 接入设计

## 1. 定位

FireRed 只能作为 `openstoryline-engine` 的内部 adapter 接入。

稳定外部入口保持不变：

```text
video-worker
-> openstoryline-engine /v1/runs
-> FireRedEngineAdapter
-> FireRed service
-> RunResponse
```

本文件只设计接入边界，不实施 FireRed adapter。

## 2. 当前状态

当前 adapter：

| adapter | 状态 | 说明 |
| --- | --- | --- |
| `skeleton` | 已可运行 | staging 默认，生成占位视频、封面、字幕、metadata |
| `fire_red` | 已预留，fail closed | 未完成映射前返回 HTTP 501 |

环境变量：

```text
OPENSTORYLINE_ENGINE_ADAPTER=skeleton
FIRERED_OPENSTORYLINE_BASE_URL=
```

未完成接入前，不允许把 `OPENSTORYLINE_ENGINE_ADAPTER` 切到 `fire_red` 用于正式作业。

## 3. 为什么不能直接覆盖

不允许把外部 `D:\codex work\FireRed-OpenStoryline` 直接覆盖进当前目录，原因：

1. 当前 worker 依赖同步作业接口 `/v1/runs`。
2. FireRed 更偏 session、chat、WebSocket 型应用。
3. 外部 FireRed 本地配置可能包含真实 provider key。
4. 直接覆盖会破坏现有 skeleton、Docker、worker 调用和测试。
5. FireRed 镜像、模型资源、冷启动和磁盘占用需要单独验收。

## 4. Adapter 输入

FireRed adapter 只接收 `RunRequest`：

```json
{
  "job_id": "uuid",
  "merchant_id": "uuid",
  "draft_id": "uuid",
  "content_variant_id": "uuid",
  "instruction_text": "用户补充要求",
  "workspace_dir": "/tmp/job",
  "output_dir": "/tmp/job/outputs",
  "execution_mode": "staging_worker",
  "script_text": "已锁定脚本",
  "production_directive": {
    "script_locked": true,
    "target_platform": "douyin",
    "aspect_ratio": "9:16",
    "desired_outputs": ["final_video", "cover", "subtitles"],
    "locked_fields": ["script", "cta", "target_user", "claims"]
  },
  "input_assets": []
}
```

Adapter 不允许向上游索要前端临时状态。

## 5. `/v1/runs` 到 FireRed 的映射

### 5.1 Session 创建

Adapter 负责创建 FireRed session，并绑定：

| FireRed 上下文 | 来源 |
| --- | --- |
| job id | `RunRequest.job_id` |
| script | `RunRequest.script_text` |
| platform | `production_directive.target_platform` |
| aspect ratio | `production_directive.aspect_ratio` |
| output dir | `RunRequest.output_dir` |
| input assets | `RunRequest.input_assets` |

### 5.2 素材上传或引用

Adapter 只能使用 worker 已下载到本地的素材文件，或 worker 提供的受控 COS 元数据。

不允许 FireRed 自行读取数据库或调用主应用 API 来找素材。

### 5.3 Prompt 生成

Prompt 必须包含：

1. 已锁定脚本。
2. 锁定字段说明。
3. 输出要求。
4. 目标平台和比例。
5. 输入素材清单。
6. 禁止改写脚本语义的约束。

Prompt 不得包含：

1. provider key。
2. Supabase service role key。
3. COS 临时密钥。
4. 本地绝对路径以外的敏感服务器配置。

### 5.4 运行等待

Adapter 必须有：

1. 总超时。
2. 阶段性日志。
3. 可诊断失败原因。
4. 输出文件存在性检查。
5. FireRed 未返回最终文件时不得伪造成功。

### 5.5 输出收集

FireRed 输出必须映射为 `RunResponse`：

```json
{
  "job_id": "uuid",
  "final_video_path": "/tmp/job/outputs/final.mp4",
  "cover_image_path": "/tmp/job/outputs/cover.jpg",
  "subtitle_path": "/tmp/job/outputs/subtitles.srt",
  "metadata_path": "/tmp/job/outputs/run-metadata.json",
  "engine": "firered-openstoryline",
  "raw_response": {
    "engine_adapter": "fire_red"
  }
}
```

## 6. 部署形态

推荐优先级：

| 形态 | 建议 | 原因 |
| --- | --- | --- |
| FireRed 独立容器服务 | 推荐 | 边界清楚，密钥和资源隔离更好 |
| vendor snapshot | 暂不推荐 | 仓库膨胀，密钥和资源风险高 |
| Git submodule | 二阶段评估 | 协作和部署复杂度更高 |

推荐 Compose 关系：

```text
video-worker
openstoryline-engine
firered-service
```

`openstoryline-engine` 调用 `firered-service`，主应用不直接调用 FireRed。

## 7. 配置和密钥

需要新增或明确的环境变量：

```text
OPENSTORYLINE_ENGINE_ADAPTER=fire_red
FIRERED_OPENSTORYLINE_BASE_URL=http://firered-service:port
FIRERED_RUN_TIMEOUT_SECONDS=900
FIRERED_PROVIDER_KEY=server-only-secret
```

规则：

1. provider key 只允许在服务器环境变量中出现。
2. `.env.example` 只能写占位名，不写真实 key。
3. 文档、日志、`run-metadata.json` 不得输出真实 key。
4. adapter 启动时必须校验必填配置，缺失则 fail closed。

## 8. 失败映射

| 场景 | 映射 |
| --- | --- |
| FireRed adapter 未实现 | HTTP 501，阻止正式启用 |
| FireRed 服务不可达 | `failed_retryable` |
| FireRed provider key 缺失 | 启动或运行时 fail closed |
| 输入素材上传失败 | `failed_retryable` 或 `failed_manual`，按错误性质区分 |
| Prompt 被拒绝或脚本结构不支持 | `failed_manual` |
| 运行超时 | `failed_retryable` |
| 输出文件缺失 | `failed_retryable` |
| 输出映射成功 | `succeeded` |

## 9. 验收标准

FireRed adapter 实现前：

1. `skeleton` adapter 继续可运行。
2. `fire_red` adapter 继续 fail closed。
3. `/health` 能显示当前 adapter。
4. 不允许主应用直接调用 FireRed。

FireRed adapter 实现后：

1. 不改变 worker 对 `/v1/runs` 的调用方式。
2. FireRed provider key 不进入仓库。
3. FireRed 能输出 final video、cover、subtitle、metadata。
4. `RunResponse` 字段完整。
5. 失败原因可诊断。
6. 记录镜像大小、冷启动时间、单任务耗时和磁盘占用。
7. worker 本地临时目录能在成功和失败后清理。

## 10. 下一步实现入口

后续真正实现时，优先改：

```text
workers/video-worker/openstoryline/app/engine_adapters.py
workers/video-worker/openstoryline/app/config.py
workers/video-worker/openstoryline/app/schemas.py
workers/video-worker/tests/
```

不要先改主应用业务流程。FireRed 只应该替换执行引擎内部 adapter，不改变上游作业合同。
