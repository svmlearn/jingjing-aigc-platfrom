# 2026-05-20 真人口播口型替换分支进展

分支：`codex/lip-sync-script-alignment-no-asr`  
状态：本地验证通过，待推送，未合并，未发布服务器。

## 已完成

- 新增架构方案：`docs/架构规范/2026-05-20-真人口播口型替换与精准字幕架构方案.md`。
- 新增 `script_audio_alignment` 字幕源，真人口播新路径默认不使用 ASR。
- 保留 `asr_original_audio` 作为显式回退路径，未删除 ASR。
- 新增 `lipSync` production config，provider 暂定 `aliyun_videoretalk`。
- 成员端/商家端 voice_profile 路径启用：
  - `subtitles.talkingHeadSource = script_audio_alignment`
  - `lipSync.enabled = true`
  - `lipSync.requireVoiceProfile = true`
- 默认系统配音路径保持普通 TTS，不算音色克隆链路验证。
- worker 失败日志增加 `failure_diagnostic`：
  - `video_edit_job_id`
  - `daily_task_id`
  - `member_user_id`
  - `final_asset_id`
  - `object_key`
  - `fire_red_run_id`
  - `failure_summary`
  - `failure_stage`
  - `partial_artifacts`
- worker 增加 lip sync 输入合同校验：
  - 音频：`wav/mp3/aac`、`<=30MB`、`2s < duration < 120s`
  - 视频：`mp4/avi/mov`、`<=300MB`；若 metadata 存在则校验时长、分辨率、fps、codec
- 明确 VideoRetalk 范围只限 `talking_head_segments`，不处理整条视频、B-roll 或项目素材。
- 新增/调整测试，覆盖：
  - `script_audio_alignment` 不注入 ASR
  - `asr_original_audio` 仍可作为显式回退
  - lip sync 音频/视频不合规失败阶段归因到 `lip_sync`

## 当前事实

当前 FireRed `generate_voiceover` 节点最终 voiceover artifact 路径为 `.wav`。Pixelle/RunningHub 适配内部可能临时使用 `.mp3`，但 worker 汇总的克隆音频产物按 `.wav` 进入后续链路。

## 验证结果

- `git diff --check`：通过。
- `.\node_modules\.bin\tsc.cmd --noEmit`：通过。
- `node --test src/server/api/video-job-payload.test.ts`：21 passed；仅有 Node 对 package `"type": "module"` 的性能提示。
- `python -m pytest tests/test_directive_contract.py tests/test_openstoryline_engine_adapters.py tests/test_firered_node_interceptors.py tests/test_processor_contract.py tests/test_openstoryline_contract_payload.py`：96 passed。

## 未完成

- 尚未提交 commit。
- 尚未推送 Gitee。
- 尚未做真实 `voice_profile` 上传和真实成员端 `upload -> clone_tts -> lip_sync -> timeline -> render -> oss` 验证。
- 尚未实现真正的 VideoRetalk 调用适配器；当前是链路合同、配置和失败归因准备。
- 人脸质量探测还在探索项中，当前代码不伪造“清晰正脸已通过”。

## 风险与下一步

- 需要用真实样本验证 VideoRetalk 的供应商错误码，并映射到 `lip_sync`。
- 需要补适配器前人脸质量检测：正脸角度、单人脸、嘴部无遮挡、脸部占比、清晰度、运动模糊。
- 若克隆音频被切成多段，每段都必须满足 `2s < duration < 120s`；长视频需要切段 lip sync 后再拼 timeline。
- 本分支禁止热更新；验证通过后才推 Gitee，由 release 组发布。
