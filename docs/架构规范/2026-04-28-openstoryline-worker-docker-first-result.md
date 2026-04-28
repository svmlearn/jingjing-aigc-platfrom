# 2026-04-28 OpenStoryline Worker Docker-first 检查结果与方案

## 1. 结论

当前项目的真实 OpenStoryline 接入应该走 Docker-first，不应该让主应用直接调用 FireRed，也不应该要求生产环境手工跑本机源码。

当前 worker 已经具备正确骨架：

```text
app video_edit_jobs
-> video-worker
-> openstoryline-engine
-> firered-openstoryline Docker service
-> outputs
-> COS
-> video_edit_jobs.result_payload
```

但当前主工作区还不能宣称“完整支持文字配音和 BGM 配置”。原因是：Docker 运行面已经可配置，FireRed worker API 也存在，但 `productionConfig -> service_config / TTS / BGM` 的 P1 合同映射还没有完整落到当前主工作区。

所以正确判断是：

```text
P0 可以保留：Docker 生产运行面成立。
P1 必须继续：平台 productionConfig 到 FireRed service_config 的映射还要补齐。
P2/P3 不要提前做假闭环：UI 和二次修改必须等 P1 合同稳定后接入。
```

## 2. 当前 worker 已具备的能力

### 2.1 Docker Compose 服务结构

`workers/video-worker/docker-compose.yml` 当前包含：

- `video-worker`
- `openstoryline-engine`
- `firered-openstoryline`，通过 `--profile firered` 启用

真实引擎运行方式是：

```bash
cp firered.env.example .env
docker compose --profile firered up --build
```

`firered-openstoryline` 不是主应用服务，它只在 worker 私有网络中被 `openstoryline-engine` 调用。

### 2.2 真实 FireRed worker API 存在

`workers/video-worker/openstoryline/firered/agent_fastapi.py` 已有：

```text
POST /api/worker/runs
```

该接口会：

1. 校验 worker shared key。
2. 创建 FireRed session。
3. 注册 worker 输入素材。
4. 执行 prompt。
5. 查找 `render_video` 结果。
6. 把最终视频复制到 worker 指定的 `output_dir`。
7. 返回 `session_id`、`final_video_path`、`metadata_path`。

这说明 Docker 路径不是设想，是真实存在的执行入口。

### 2.3 Worker 当前合同是稳定的

当前 worker 已经能：

- 从 `video_edit_jobs` claim pending job。
- 校验锁定脚本。
- 下载 COS 输入素材。
- 调用 `openstoryline-engine /v1/runs`。
- 校验最终视频、封面、字幕。
- 上传输出到 COS。
- 写回 `video_edit_jobs.result_payload` 和 `asset_objects`。
- 区分 `failed_manual` 和 `failed_retryable`。

### 2.4 Skeleton fallback 仍然可用

`OPENSTORYLINE_ENGINE_ADAPTER=skeleton` 仍然是本地安全 fallback。

这点要保留。它让开发机和 CI 不依赖真实 FireRed 资源，也能验证 worker 合同。

## 3. 已验证结果

本次检查已验证：

```text
docker compose -f workers/video-worker/docker-compose.yml config --quiet
```

使用 `firered.env.example` 临时生成 `.env` 后通过，退出码为 `0`。

```text
python -m unittest discover -s workers/video-worker/tests -v
```

worker 单测通过：

```text
Ran 39 tests
OK
```

密钥扫描通过：

```text
workers/video-worker/openstoryline/firered/config.toml
workers/video-worker/openstoryline/firered/config.video_edit_engine.toml
```

没有发现 `api_key = "sk-..."`、长明文 `api_key`、长明文 `access_key`。

## 4. 当前缺口

### 4.1 `productionConfig` 未完整进入 worker 主链路

当前 `workers/video-worker/worker/app/directive.py` 主要消费：

```text
productionDirective
script
input_assets
```

它还没有把平台侧的：

```text
productionConfig.voiceover
productionConfig.bgm
productionConfig.subtitles
productionConfig.render
```

标准化成 worker 内部合同。

### 4.2 `openstoryline-engine` 没有完整传递 TTS/BGM 配置

当前 `workers/video-worker/openstoryline/app/engine_adapters.py` 可以把任务转给 FireRed `/api/worker/runs`，但还没有稳定生成：

```json
{
  "production_config": {},
  "service_config": {
    "tts": {}
  }
}
```

FireRed 的 `/api/worker/runs` 支持 `service_config`，但 adapter 还没有把 `.env` 中的 TTS provider key 和平台 `productionConfig` 拼成可执行配置。

### 4.3 BGM 选择还没有从平台合同传到 FireRed

FireRed 源码中存在 `select_bgm` prompt 和 BGM 资源目录要求，但当前 worker 主链路还没有明确传入：

```text
bgm.enabled
bgm.userRequest
bgm.include
bgm.exclude
bgm.volume
```

因此现在不能对用户承诺“已可配置音乐”，只能说 Docker 和资源面已经准备好。

### 4.4 结果 metadata 还不够好用

当前成功结果主要把 engine response 放在：

```text
result_payload.engine_response
```

P3 二次修改需要更明确的：

```text
result_payload.openstoryline.session_id
result_payload.openstoryline.production_config_used
result_payload.openstoryline.selected_bgm
result_payload.openstoryline.voiceover
```

这部分需要在 P1/P3 之间补。

## 5. 推荐方案

### 5.1 保留当前 Docker-first 结构

保留：

```text
video-worker
-> openstoryline-engine
-> firered-openstoryline
```

不要改成：

```text
app
-> firered-openstoryline
```

原因是主应用不应该承担 worker 执行、COS 上传、失败重试、资源清理和密钥隔离。

### 5.2 把 `firered.env.example` 作为真实生产模板

`workers/video-worker/firered.env.example` 是真实 FireRed Docker 模板。

使用方式：

```bash
cd workers/video-worker
cp firered.env.example .env
sudo mkdir -p /srv/jingjing-video-worker/{tmp,models,outputs}
sudo mkdir -p /srv/jingjing-video-worker/firered/{.storyline,resource/bgms,resource/tts,outputs}
docker compose --profile firered up --build
```

`.env.example` 继续保留 skeleton 默认值，用于本地和 CI。

### 5.3 P1 只补合同映射，不重做 Docker

P1 要补的不是 Docker，而是这条合同：

```text
app productionConfig
-> video_edit_jobs.input_payload.productionConfig
-> worker ProductionDirective/ProductionConfig
-> openstoryline-engine RunRequest.production_config
-> FireRed /api/worker/runs production_config + service_config
```

P1 完成后，才可以对外说：

```text
文字生成配音：可配置
BGM/音乐：可配置
字幕/原声/渲染参数：可配置
```

## 6. 下一步执行范围

### Task 1: 平台写入 `productionConfig`

目标文件：

- `app/src/contracts/video.ts`
- `app/src/server/api/schemas.ts`
- `app/src/server/api/video-job-payload.ts`
- `app/src/server/api/video-edit-jobs-service.ts`

结果：

`POST /api/video-edit-jobs` 创建的 `input_payload` 必须包含：

```json
{
  "productionConfig": {
    "voiceover": {
      "enabled": true,
      "provider": "bytedance_bigtts",
      "volume": 2
    },
    "bgm": {
      "enabled": true,
      "userRequest": "",
      "include": {},
      "exclude": {},
      "volume": 0.25
    },
    "subtitles": {
      "enabled": true,
      "style": "platform_default"
    },
    "render": {
      "aspectRatio": "9:16",
      "includeOriginalAudio": false
    }
  }
}
```

### Task 2: Worker 标准化 `productionConfig`

目标文件：

- `workers/video-worker/worker/app/directive.py`
- `workers/video-worker/worker/app/openstoryline_client.py`
- `workers/video-worker/tests/test_directive_contract.py`
- `workers/video-worker/tests/test_openstoryline_contract_payload.py`

结果：

worker 调用 `/v1/runs` 时必须带：

```json
{
  "production_config": {
    "voiceover": {},
    "bgm": {},
    "subtitles": {},
    "render": {}
  }
}
```

### Task 3: Adapter 生成 FireRed `service_config`

目标文件：

- `workers/video-worker/openstoryline/app/config.py`
- `workers/video-worker/openstoryline/app/schemas.py`
- `workers/video-worker/openstoryline/app/engine_adapters.py`
- `workers/video-worker/tests/test_openstoryline_engine_adapters.py`

结果：

FireRed payload 必须包含：

```json
{
  "production_config": {},
  "service_config": {
    "tts": {
      "provider": "bytedance_bigtts"
    }
  }
}
```

并且 prompt 必须显式要求：

```text
Use generate_voiceover when voiceover.enabled is true.
Use select_bgm when bgm.enabled is true.
Use render_video as the final node.
Do not rewrite the locked script.
```

### Task 4: 结果元数据变得可复用

目标文件：

- `workers/video-worker/worker/app/processor.py`
- `workers/video-worker/tests/test_processor_contract.py`

结果：

成功任务的 `result_payload` 必须包含：

```json
{
  "openstoryline": {
    "engine_adapter": "fire_red",
    "session_id": "session-id",
    "production_config_used": {},
    "selected_bgm": {},
    "voiceover": {}
  }
}
```

### Task 5: 真实 Docker smoke

服务器准备：

- `.env` 来自 `firered.env.example`
- `/srv/jingjing-video-worker/firered/resource/bgms`
- `/srv/jingjing-video-worker/firered/resource/tts/tts_providers.json`
- LLM/VLM/TTS provider secrets

验证：

```bash
docker compose --profile firered up --build
```

再提交一条短视频任务，验证：

```bash
ffprobe -v error -select_streams a -show_entries stream=codec_type -of csv=p=0 /srv/jingjing-video-worker/outputs/<job-id>/final.mp4
```

期望输出包含：

```text
audio
```

## 7. 最终可对外描述

在 P1 补齐前，准确说法是：

```text
当前项目已经具备真实 OpenStoryline Docker 运行面和 worker adapter 骨架。
worker 测试通过，compose 配置可解析，FireRed worker API 存在。
下一步需要补齐 productionConfig 到 TTS/BGM/service_config 的合同映射，之后才能对用户承诺文字配音和音乐配置可用。
```

P1 补齐并通过真实 smoke 后，才能改成：

```text
当前项目支持通过 Docker 运行真实 OpenStoryline/FireRed，并可由平台任务配置配音、BGM、字幕和渲染参数，最终产物会回传 COS 和 video_edit_jobs。
```
