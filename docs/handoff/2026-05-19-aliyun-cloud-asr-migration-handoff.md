# 2026-05-19 阿里云云 ASR 迁移交接

## 当前目标

把服务器视频生成链路中的本地 ASR 改为阿里云 DashScope Paraformer 云 ASR，解决本地 FunASR 大模型下载/加载导致 `local_asr` 阶段卡住的问题。

## 已完成

- 保留 FireRed/OpenStoryline 节点名 `local_asr` 和节点 kind `asr`。
- `local_asr` 内部新增 provider 分流：
  - `local_funasr` 继续走原本 FunASR。
  - `aliyun_paraformer` 走 DashScope `Recognition.call(audio_wav)`。
- openstoryline-engine 已把 ASR 配置写入 FireRed payload 的 `service_config.asr`。
- FireRed `agent_fastapi.py` 已解析 `service_config.asr` 并保存到 session/client context。
- MCP tool interceptor 已新增 `inject_asr_config`，在调用 `local_asr` 工具前注入：
  - `provider`
  - `api_key`
  - `model`
  - `workspace`
  - `format`
  - `sample_rate`
  - `language_hints`
  - `provider_keys`
- ASR 输出已归一化为原下游兼容结构。
- 服务器 env 示例 `firered.env.example` 默认启用 `aliyun_paraformer`。

## 改动文件

- `workers/video-worker/openstoryline/firered/src/open_storyline/nodes/core_nodes/asr_node.py`
- `workers/video-worker/openstoryline/firered/src/open_storyline/config.py`
- `workers/video-worker/openstoryline/firered/config.toml`
- `workers/video-worker/openstoryline/firered/config.video_edit_engine.toml`
- `workers/video-worker/openstoryline/firered/requirements.txt`
- `workers/video-worker/openstoryline/firered/src/open_storyline/nodes/node_schema.py`
- `workers/video-worker/openstoryline/firered/src/open_storyline/mcp/hooks/node_interceptors.py`
- `workers/video-worker/openstoryline/firered/src/open_storyline/agent.py`
- `workers/video-worker/openstoryline/firered/agent_fastapi.py`
- `workers/video-worker/openstoryline/firered/cli.py`
- `workers/video-worker/openstoryline/app/config.py`
- `workers/video-worker/openstoryline/app/engine_adapters.py`
- `workers/video-worker/docker-compose.yml`
- `workers/video-worker/firered.env.example`
- `workers/video-worker/.env.example`
- `workers/video-worker/tests/test_firered_asr_node.py`
- `workers/video-worker/tests/test_firered_node_interceptors.py`
- `workers/video-worker/tests/test_openstoryline_engine_adapters.py`
- `docs/progress/2026-05-19-aliyun-cloud-asr-migration-progress.md`

## 验证结果

通过：

```bash
python -m py_compile workers/video-worker/openstoryline/firered/src/open_storyline/nodes/core_nodes/asr_node.py workers/video-worker/openstoryline/firered/src/open_storyline/mcp/hooks/node_interceptors.py workers/video-worker/openstoryline/firered/src/open_storyline/agent.py workers/video-worker/openstoryline/firered/agent_fastapi.py workers/video-worker/openstoryline/firered/cli.py workers/video-worker/openstoryline/app/config.py workers/video-worker/openstoryline/app/engine_adapters.py
```

通过：

```bash
cd workers/video-worker
python -m pytest tests/test_firered_asr_node.py tests/test_firered_node_interceptors.py tests/test_openstoryline_engine_adapters.py
```

结果：

```text
34 passed
```

通过 compose config 结构校验：

- 临时复制 `.env.example` 为 `.env` 后运行 `docker compose ... config`，运行后已删除临时 `.env`。
- 临时复制 `firered.env.example` 为 `.env` 后运行 `docker compose ... config` 并检查 ASR 变量，运行后已删除临时 `.env`。
- 服务器示例确认输出 `OPENSTORYLINE_ASR_PROVIDER=aliyun_paraformer`。

## 未完成 / 阻塞

未跑真实阿里云云 ASR 实调，因为本地没有真实 `ALIYUN_ASR_API_KEY`，且密钥不应写入文档或测试输出。

服务器部署前需要配置：

```env
OPENSTORYLINE_ASR_PROVIDER=aliyun_paraformer
ALIYUN_ASR_MODEL=paraformer-realtime-v2
ALIYUN_ASR_API_KEY=<DashScope/Bailian API Key>
ALIYUN_ASR_WORKSPACE=
```

如果服务器只配置了 `DASHSCOPE_API_KEY`，代码会作为 fallback 读取；但推荐显式配置 `ALIYUN_ASR_API_KEY`。

## 下一步建议

1. 在服务器 `workers/video-worker/.env` 填入真实 `ALIYUN_ASR_API_KEY`。
2. 重新 build FireRed 镜像，确保 `dashscope==1.25.17` 安装进容器。
3. 用一条包含口播/原声字幕的真实 video job 验证：
   - `local_asr` 不再触发 FunASR 模型下载。
   - 日志出现 `transcribing clip ... with aliyun_paraformer`。
   - `asr_infos[].asr_text` 有云 ASR 文本。
   - 后续字幕 / render 阶段能正常消费 `asr_sentence_info`。
4. 如果阿里云返回错误，优先检查：
   - API Key 是否属于 DashScope/百炼并已开通模型服务。
   - 服务器出网是否能访问 DashScope WebSocket。
   - `ALIYUN_ASR_MODEL` 是否为 `paraformer-realtime-v2`。

## 分支 / worktree

- branch / worktree: `孟_5.13_5.14`
- base commit: `e5c8250`
- final commit: 未创建
- push: 未执行
- merge: 未执行

## 注意事项

- 不要把真实 `ALIYUN_ASR_API_KEY` 写入仓库。
- 不要改名 `local_asr`，否则 `asr_original_audio` 的依赖补齐逻辑会受影响。
- 当前本地 `.env.example` 仍保留 `local_funasr`，避免普通 skeleton smoke 意外要求云 ASR key；服务器请使用 `firered.env.example` 的默认方向。
