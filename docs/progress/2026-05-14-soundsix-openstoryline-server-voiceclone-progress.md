# 2026-05-14 SoundSix OpenStoryline 服务器成片与声音克隆验证

## 结论

本轮已按用户要求走服务器制作链路完成一次真实成片，没有上传到 Web 端。

- 服务器入口：`/srv/jingjing-video-worker`
- 制作链路：`openstoryline-engine /v1/runs -> firered-openstoryline /api/worker/runs`
- FireRed session_id：`1baabefff96e41c0b60b6ca3568db77e`
- Job id：`soundsix_voiceclone_20260514_1343`
- 本机回传目录：`D:\codexplan\personal\jingjing-content-platform\.tmp\server-videos\soundsix_voiceclone_20260514_1343`
- 本机成片：`D:\codexplan\personal\jingjing-content-platform\.tmp\server-videos\soundsix_voiceclone_20260514_1343\final.mp4`

## 输入素材

服务器输入包：

`/srv/jingjing-video-worker/tmp/soundsix-20260514-voiceclone`

使用文件：

- `inputs/media/01-storefront.mp4`
- `inputs/media/02-entrance.mp4`
- `inputs/media/03-yard.mp4`
- `inputs/media/04-drink.mp4`
- `inputs/ref_audio/voice-ref-20260513_164427.m4a`
- `inputs/2026-05-14-soundsix-space-video-script.json`
- `inputs/2026-05-14-soundsix-space-video-script.md`

本轮遵守用户约束：只使用用户提供素材，不搜索或引入外部素材。

## 服务端处理

发现服务器正在运行的 FireRed runtime 中，声音克隆相关逻辑不是最新版本；因此从本地 `D:\codexplan\openstoryline\FireRed-OpenStoryline` 同步了相关运行文件到服务器 FireRed 容器挂载目录，并重建/重启 `firered-openstoryline`。

同步涉及的关键文件：

- `agent_fastapi.py`
- `requirements.txt`
- `src/open_storyline/config.py`
- `src/open_storyline/mcp/hooks/node_interceptors.py`
- `src/open_storyline/nodes/core_nodes/generate_voiceover.py`
- `src/open_storyline/nodes/node_schema.py`
- `src/open_storyline/utils/pixelle_tts_adapter.py`

同时修复了服务端 FireRed `config.toml` 中 LLM/VLM 的 API key 配置，使容器内模型连通性恢复。

已验证：

- `zai-org/GLM-4.6 validation successful`
- `zai-org/GLM-4.6v validation successful`

## 声音克隆验证

声音克隆 smoke test 已在服务器 `firered-openstoryline` 容器内成功：

- Provider：`pixelle_clone`
- RunningHub workflow：`1983718528991862786`
- 参考音频：`voice-ref-20260513_164427.m4a`
- 生成 wav：`/app/.storyline/.server_cache/codex_soundsix_clone_smoke/artifact_soundsix_clone_smoke/voiceover_0001_1778736728605.wav`
- 文件大小：`238594`
- 时长：约 `4969 ms`

完整视频请求中的 `production_config_used.voiceover` 也记录为：

- `provider: pixelle_clone`
- `clone_enabled: true`
- `ref_audio: /srv/jingjing-video-worker/tmp/soundsix-20260514-voiceclone/inputs/ref_audio/voice-ref-20260513_164427.m4a`

注意：当前 engine response 的 `openstoryline.voiceover` 字段为空，完整视频响应没有把 voiceover artifact 展开返回；因此声音克隆能力以 smoke test 为确定通过，完整成片需人工听看确认音色表现。

## 输出文件

服务器输出：

- `/srv/jingjing-video-worker/outputs/soundsix_voiceclone_20260514_1343/final.mp4`
- `/srv/jingjing-video-worker/outputs/soundsix_voiceclone_20260514_1343/subtitles.srt`
- `/srv/jingjing-video-worker/outputs/soundsix_voiceclone_20260514_1343/firered-run-metadata.json`
- `/srv/jingjing-video-worker/outputs/soundsix_voiceclone_20260514_1343/openstoryline-engine-response.json`

已回传到本机：

- `D:\codexplan\personal\jingjing-content-platform\.tmp\server-videos\soundsix_voiceclone_20260514_1343\final.mp4`
- `D:\codexplan\personal\jingjing-content-platform\.tmp\server-videos\soundsix_voiceclone_20260514_1343\subtitles.srt`
- `D:\codexplan\personal\jingjing-content-platform\.tmp\server-videos\soundsix_voiceclone_20260514_1343\firered-run-metadata.json`
- `D:\codexplan\personal\jingjing-content-platform\.tmp\server-videos\soundsix_voiceclone_20260514_1343\openstoryline-engine-request.json`
- `D:\codexplan\personal\jingjing-content-platform\.tmp\server-videos\soundsix_voiceclone_20260514_1343\openstoryline-engine-response.json`

## 本机验证

`ffprobe` 验证结果：

- 时长：`50.523991s`
- 文件大小：`12728710`
- 视频：H.264，`608x1080`
- 音频：AAC，44.1 kHz，stereo

## 待人工验收

- 观看成片画面剪辑是否符合脚本节奏。
- 听口播是否接近用户声音样本。
- 检查字幕是否有乱码、过长、压画面或节奏不准的问题。
