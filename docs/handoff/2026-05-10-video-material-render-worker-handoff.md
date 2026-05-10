# 2026-05-10 视频素材上传后成片验证 handoff

## 当前目标

验证 staging 上“视频脚本生成后，上传视频素材，再创建 AI 剪辑任务，最终能否生成视频文件”。

## 已完成

1. 已在 staging 视频工作台使用今日视频任务生成视频脚本。
2. 已生成本地测试视频 `/tmp/jingjing-video-test/project-broll-test.mp4`。
3. 已通过页面第 1 个分镜上传该 mp4，页面提示素材已绑定到当前视频 draft。
4. 已创建带素材剪辑任务 `6fd28e7b-507c-400a-bee4-c81dd7c37556`。
5. 已确认应用侧 payload 正确：
   - `render_mode = asset_driven`
   - `inputPayload.input_assets.length = 1`
   - 输入素材为 `video/mp4`
   - `storage_provider = tencent_cos`
   - `materialContext.retrievalTarget = video_edit_asset`
   - `missingVideoAssetHints = []`
6. 已取消此前无素材测试任务 `da4c4290-747e-4f4c-bd48-baa6b072fadf`，该任务原本卡在 `running / openstoryline_rendering / 50%`。
7. 已把详细证据写入 `docs/test/2026-05-10-v2.4-retrieval-routing-click-test.md`。

## 当前未完成

2026-05-11 更新：带素材任务 `6fd28e7b-507c-400a-bee4-c81dd7c37556` 后续已被远端 `video-worker` 认领并下载输入素材，但没有生成成片。最终状态为：

- `status = failed_retryable`
- `currentStage = openstoryline_rendering_failed`
- `progressPct = 50`
- `resultAssets = []`
- `failureReason = engine_run_failed: failed to run OpenStoryline engine: Server error '500 Internal Server Error' for url 'http://openstoryline-engine:8000/v1/runs'`

这说明“上传素材 -> 创建 worker 输入 payload -> worker 认领 -> 下载 COS 输入素材”通过，但“OpenStoryline/FireRed 渲染 -> 回写成片资产”尚未通过。

## 当前判断

更像 FireRed/OpenStoryline 真实出片问题，而不是 app payload 或 COS 输入问题：

- `video-worker` 日志确认已领取 `6fd28e7b-507c-400a-bee4-c81dd7c37556`。
- `runtimePayload.input_assets[0].local_path` 确认输入视频曾被下载到 `/srv/jingjing-video-worker/tmp/jobs/.../inputs/...project-broll-test.mp4`。
- `openstoryline-engine` 对 `/v1/runs` 返回 500。
- `firered-openstoryline` 日志显示直接原因：`ValueError: timeline result has no video track`。
- 旧任务取消后又被 worker 写回 `failed_retryable`，暴露出取消终态可被 worker 后续失败覆盖的问题。

## 下一步建议

详见 `docs/handoff/2026-05-11-video-render-cloud-bugs-handoff.md`。明天优先：

1. 修 worker 状态写回 guard，防止 `cancelled` 被后续失败覆盖。
2. 增强 OpenStoryline / FireRed 失败错误透传。
3. 失败时保留 workspace/output 现场。
4. 修 FireRed `timeline result has no video track`，或做保底剪辑链路。
5. 预热约 1.05G 的 TransNetV2 模型，减少首次真实出片冷启动。

## 改动文件

- `docs/test/2026-05-10-v2.4-retrieval-routing-click-test.md`
- `docs/handoff/2026-05-10-video-material-render-worker-handoff.md`
- `docs/handoff/2026-05-11-video-render-cloud-bugs-handoff.md`

## Branch / commit

- Branch: `codex/rag-material-retrieval-prd`
- 测试文档提交：`5dfaf95 Document video material render smoke`
- Handoff 提交：见远端分支最新提交和本轮最终答复

## Push / merge 状态

- 测试文档提交已 push 到 `origin/codex/rag-material-retrieval-prd`
- 本 handoff 随本轮后续提交继续 push
- 未 merge
