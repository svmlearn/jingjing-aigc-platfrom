# 2026-05-19 阿里云云 ASR 迁移执行记录

## 目标

把服务器 FireRed/OpenStoryline 链路里的本地 FunASR 识别改为可使用阿里云 DashScope Paraformer 云 ASR，避免服务器在 `local_asr` 阶段下载/加载本地大模型导致卡住。

本轮不改节点名和节点类型，继续保留：

- node name: `local_asr`
- node kind: `asr`

原因是现有 `asr_original_audio` 原声字幕链路依赖 `asr` kind 和 `local_asr` 工具名。

## 已完成改动

### FireRed ASR 节点

- 修改 `workers/video-worker/openstoryline/firered/src/open_storyline/nodes/core_nodes/asr_node.py`
- 新增 provider 分流：
  - 本地：`local` / `local_funasr` / `funasr`
  - 阿里云：`aliyun` / `aliyun_paraformer` / `dashscope` / `dashscope_paraformer`
- 新增 DashScope `Recognition.call(audio_wav)` 调用，继续沿用节点原本的 ffmpeg 16k mono wav 临时音频抽取。
- 新增 `paraformer-v2 -> paraformer-realtime-v2` 模型别名。
- 新增 DashScope 句子结果归一化，输出仍兼容下游：
  - `text`
  - `timestamp`
  - `sentence_info`
  - `provider`
  - `request_id`
  - `model`

### 配置与透传

- 修改 `workers/video-worker/openstoryline/firered/src/open_storyline/config.py`
  - 新增 `[asr]` 配置模型。
- 修改：
  - `workers/video-worker/openstoryline/firered/config.toml`
  - `workers/video-worker/openstoryline/firered/config.video_edit_engine.toml`
  - 新增 `[asr]` 段。
- 修改 `workers/video-worker/openstoryline/app/config.py`
  - openstoryline-engine 读取 `OPENSTORYLINE_ASR_PROVIDER`、`ALIYUN_ASR_MODEL`、`ALIYUN_ASR_API_KEY`、`ALIYUN_ASR_WORKSPACE`。
  - `ALIYUN_ASR_API_KEY` 支持 fallback 到 `DASHSCOPE_API_KEY`。
- 修改 `workers/video-worker/openstoryline/app/engine_adapters.py`
  - 在 FireRed payload 的 `service_config.asr` 中加入 ASR provider 配置。
- 修改 `workers/video-worker/openstoryline/firered/agent_fastapi.py`
  - 解析 `service_config.asr`。
  - 挂到 session / client context 的 `asr_config`。
- 修改 `workers/video-worker/openstoryline/firered/src/open_storyline/mcp/hooks/node_interceptors.py`
  - 新增 `inject_asr_config`。
  - 保留 `sample_rate`、`language_hints` 等非字符串配置类型，不再统一转字符串。
- 修改 `workers/video-worker/openstoryline/firered/src/open_storyline/agent.py`
  - `ClientContext` 新增 `asr_config`。
- 修改 `workers/video-worker/openstoryline/firered/src/open_storyline/nodes/node_schema.py`
  - `LocalASRInput` 新增 provider/runtime config 字段。

### 依赖与部署示例

- 修改 `workers/video-worker/openstoryline/firered/requirements.txt`
  - 新增 `dashscope==1.25.17`。
- 修改 `workers/video-worker/docker-compose.yml`
  - `openstoryline-engine` 和 `firered-openstoryline` 均增加 ASR 环境变量。
- 修改 `workers/video-worker/firered.env.example`
  - 服务器 FireRed 示例默认 `OPENSTORYLINE_ASR_PROVIDER=aliyun_paraformer`。
- 修改 `workers/video-worker/.env.example`
  - 本地 skeleton 示例保留 `OPENSTORYLINE_ASR_PROVIDER=local_funasr`。

## 验证结果

已通过：

```bash
python -m py_compile workers/video-worker/openstoryline/firered/src/open_storyline/nodes/core_nodes/asr_node.py workers/video-worker/openstoryline/firered/src/open_storyline/mcp/hooks/node_interceptors.py workers/video-worker/openstoryline/firered/src/open_storyline/agent.py workers/video-worker/openstoryline/firered/agent_fastapi.py workers/video-worker/openstoryline/firered/cli.py workers/video-worker/openstoryline/app/config.py workers/video-worker/openstoryline/app/engine_adapters.py
```

已通过：

```bash
cd workers/video-worker
python -m pytest tests/test_firered_asr_node.py tests/test_firered_node_interceptors.py tests/test_openstoryline_engine_adapters.py
```

结果：

```text
34 passed
```

已验证 compose 配置结构：

```bash
cd workers/video-worker
# 临时复制 .env.example 为 .env，运行后已删除
docker compose -f docker-compose.yml -f docker-compose.firered.yml --profile firered config

# 临时复制 firered.env.example 为 .env，运行后已删除，并检查 ASR 相关环境变量
docker compose -f docker-compose.yml -f docker-compose.firered.yml --profile firered config
```

结论：

- 本地 `.env.example` 场景仍为 `OPENSTORYLINE_ASR_PROVIDER=local_funasr`。
- 服务器 `firered.env.example` 场景为 `OPENSTORYLINE_ASR_PROVIDER=aliyun_paraformer`。
- `ALIYUN_ASR_MODEL=paraformer-realtime-v2`。

## 未执行项

本轮没有发起真实阿里云 ASR 调用，原因：

- 当前本地没有可用于测试的真实 `ALIYUN_ASR_API_KEY`。
- 不应在记录里落地或输出真实云厂商密钥。

服务器实跑前必须在 `workers/video-worker/.env` 或部署环境中配置：

```env
OPENSTORYLINE_ASR_PROVIDER=aliyun_paraformer
ALIYUN_ASR_MODEL=paraformer-realtime-v2
ALIYUN_ASR_API_KEY=<DashScope/Bailian API Key>
ALIYUN_ASR_WORKSPACE=
```

如果已统一使用 `DASHSCOPE_API_KEY`，代码也支持作为 fallback，但推荐显式配置 `ALIYUN_ASR_API_KEY`，便于区分 ASR 与其他 DashScope 能力。

## 当前状态

- branch / worktree: `孟_5.13_5.14`
- base commit: `e5c8250`
- final commit: 未创建
- push / merge: 未执行
- 状态: 待用户验收后部署到服务器验证真实阿里云 ASR
