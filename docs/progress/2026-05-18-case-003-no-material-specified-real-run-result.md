# CASE-003 小院咖啡-无素材指定版 fresh run 结果

时间：2026-05-18 19:35 +08:00

## 结论

本轮按用户要求重新创建 fresh 云端 Supabase 任务，没有复用模板、旧失败任务、mock、skeleton、本地假生成或 all-clips fallback。

任务已按用户指令“等不了了，刚掉这个任务”取消。没有生成可交付成片，没有下载或落地本地产物包。

## Job

- job id: `98a6c59e-4355-4263-9113-cd2dc2fe8628`
- case id: `CASE-003`
- run label: `case-003-no-material-specified-original-audio-fresh-20260518-98a6c59e`
- 创建方式：`supabase db query --linked --file .tmp/case003_fresh_original_audio_job_98a6c59e.sql`
- 取消方式：`supabase db query --linked --file .tmp/case003_cancel_stalled_local_asr_98a6c59e.sql`
- 最终状态：`cancelled`
- current_stage: `cancelled_by_user`
- failure_reason: `cancelled by user on 2026-05-18 after CASE-003 fresh run stalled at openstoryline_subtitles/local_asr; no final artifacts generated; no fallback used`

## 本轮要求

- 使用云端 Supabase CLI。
- 不使用本地生成。
- 不复用模板。
- 不复用旧 CASE-003 失败任务。
- 不回退到 mock、skeleton、本地假生成或 all-clips fallback。
- 首尾真人口播使用用户上传视频原声。
- 中段 B-roll 使用 `pixelle_clone` 配音。
- 真人口播字幕使用原视频音轨 ASR。

## 已完成阶段

Supabase `runtime_payload.progress_modules` 最后状态：

- `material_preparation`: `succeeded`
- `material_match`: `succeeded`
- `voiceover`: `succeeded`
- `subtitles`: `running`
- `render`: `pending`
- `output_delivery`: `pending`

最后 OpenStoryline 事件：

```json
{
  "type": "tool_progress",
  "name": "local_asr",
  "server": "storyline",
  "message": "still working: tool_start",
  "is_error": null
}
```

## 卡住位置

任务卡在 `openstoryline_subtitles/local_asr`。在等待期间观察到 FireRed 首次下载 `funasr`/ASR 模型 `model.pt`，大小约 `944M`，下载日志最高观察到约 `99%`。随后 job 在 Supabase 中长时间没有新事件；取消前 `seconds_since_update` 约 `2476` 秒。

最后一次取消写入后的验证：

- status: `cancelled`
- current_stage: `cancelled_by_user`
- result_payload: `{}`
- render: 未开始
- output_delivery: 未开始

## 服务器状态观察

任务初期通过 SSH 验证：

- `/srv/jingjing-video-worker`
- `docker compose ps` 中 `firered-openstoryline`、`openstoryline-engine`、`video-worker` 已启动。
- worker 已认领新 job，并从 COS 下载 `口播1`、4 个商家素材、`口播2` 和个人录音。

卡住后 SSH 新连接异常：

- TCP 22 端口探针显示 open。
- `ssh -vvv` 和 Paramiko 均在 SSH banner exchange 阶段超时。
- 未能在取消前继续读取容器日志或停止远端容器内正在执行的 OpenStoryline 进程。

## 防止取消后被回写

由于 worker 代码的成功/失败写库逻辑不是条件更新，存在远端长跑进程之后返回并覆盖 `cancelled` 状态的风险。

已通过 Supabase CLI 创建一个仅针对本 job id 的窄保护触发器：

- trigger: `prevent_case003_cancelled_job_98a6c59e_reactivation`
- function: `public.prevent_case003_cancelled_job_98a6c59e_reactivation()`
- 作用：当该 job 已为 `cancelled` 时，阻止它被更新成其它状态。

## 产物

无可交付产物。

- final video: 无
- cover: 无
- subtitles: 无
- local package: 未创建
- 目标路径 `D:\Desktop\测试素材\cos素材库入库包_20260518\metadata\case_003_artifacts` 本轮未落新文件

## 风险和下一步

1. 需要等服务器 SSH banner 恢复后，进入 `/srv/jingjing-video-worker` 检查是否还有卡住的 OpenStoryline/FunASR 进程，并清理或重启 worker。
2. 如果重新跑 CASE-003，必须重新创建 fresh job，不要复用 `98a6c59e-4355-4263-9113-cd2dc2fe8628`。
3. 重新跑前建议先预热或修复 ASR 模型缓存，避免再次卡在 `local_asr`。
4. 本轮没有成片，不能作为验收成功案例。
