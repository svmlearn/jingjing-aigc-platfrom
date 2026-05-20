# 2026-05-20 口型替换测试分支 Handoff

## 当前目标

在 `codex/lip-sync-script-alignment-no-asr` 分支验证真人口播新链路：字幕源不使用 ASR，改为锁定脚本 + 克隆音频对齐；使用克隆音频和真人口播视频做 VideoRetalk 口型替换。

## 分支与状态

- Branch：`codex/lip-sync-script-alignment-no-asr`
- Worktree：`D:\codexplan\personal\jingjing-content-platform`
- Push：待推送
- Merge：未合并
- Release：未发布服务器，禁止热更新

## 已完成内容

- 新增架构文档：`docs/架构规范/2026-05-20-真人口播口型替换与精准字幕架构方案.md`
- 新增进展记录：`docs/progress/2026-05-20-lip-sync-script-alignment-no-asr-progress.md`
- 明确 VideoRetalk 只处理 `talking_head_segments`，不处理整条视频、B-roll 或项目素材。
- App contract：
  - `script_audio_alignment` 作为真人口播新路径字幕源
  - `asr_original_audio` 保留显式回退
  - `lipSync` 配置增加 `aliyun_videoretalk` 和输入要求
- Worker contract：
  - production config 规范化 `lip_sync`
  - voice_profile clone TTS 仍必须生成可测量克隆音频
  - lip sync 音频/视频输入合同校验
- Failure logging：
  - 新增 `failure_diagnostic`
  - 阶段枚举覆盖 `upload/asr/clone_tts/lip_sync/timeline/render/oss`
- 测试补充：
  - 新路径不注入 ASR
  - ASR 回退仍保留
  - lip sync 输入不合规失败归因到 `lip_sync`

## 关键决策

- 真人口播新路径字幕源：`script_audio_alignment`
- 字幕文字来源：锁定脚本
- 时间戳来源：克隆音频/脚本对齐
- ASR：不能删除，只作为 `asr_original_audio` 显式回退
- 当前克隆音频结论：FireRed voiceover artifact 最终路径是 `.wav`；适配器内部可能临时处理 `.mp3`
- 默认配音不算音色克隆链路通过

## 必须继续遵守

- 不打印 secret
- 不改 DNS / ICP / RDS 公网 / OSS 公共权限
- 不恢复 Supabase/COS/Vercel 老配置
- 不把 worker output prefix 改回 smoke 临时路径
- 不把成员端主路径改回 `/dashboard/video`
- 不新建 `merchant_media_*` 表
- 不让成员端 Dify 主路径重新调用 `video-workbench-agent`
- 不做服务器热更新

## 已验证

- `git diff --check`：通过
- App typecheck：`.\node_modules\.bin\tsc.cmd --noEmit` 通过
- App targeted test：`node --test src/server/api/video-job-payload.test.ts`，21 passed
- Worker pytest：96 passed
  - `tests/test_directive_contract.py`
  - `tests/test_openstoryline_engine_adapters.py`
  - `tests/test_firered_node_interceptors.py`
  - `tests/test_processor_contract.py`
  - `tests/test_openstoryline_contract_payload.py`

## 待真实联调验证

- 真实 `voice_profile` 上传成功
- 真实成员端任务跑通 `upload -> clone_tts -> lip_sync -> timeline -> render -> oss`
- 失败样例能真实落日志并定位 `lip_sync`

## 下一步建议

1. 提交并推送 `codex/lip-sync-script-alignment-no-asr` 到 Gitee。
2. 实现或接入 VideoRetalk adapter 前置探测：
   - 音频清洁度
   - 单人脸/正脸/嘴部无遮挡/清晰度
   - 供应商错误码到 `lip_sync` 的映射
3. 由 release 组发布服务器验证，通过后再考虑合并回 `孟_5.13`。
