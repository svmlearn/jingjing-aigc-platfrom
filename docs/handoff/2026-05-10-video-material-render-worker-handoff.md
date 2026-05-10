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

带素材任务 `6fd28e7b-507c-400a-bee4-c81dd7c37556` 在约 4 分钟轮询内始终停留在：

- `status = pending`
- `currentStage = null`
- `progressPct = 0`
- `resultAssets = []`

这说明“上传素材 -> 创建 worker 输入 payload”通过，但“staging worker 认领任务 -> OpenStoryline 渲染 -> 回写成片资产”尚未通过。

## 当前判断

更像 worker 侧问题，而不是 app payload 问题：

- worker 代码的 `claim_next_job()` 会轮询 `status = pending` 的任务。
- 当前任务已是 `pending` 且具备合法视频输入素材。
- 旧任务曾长时间停在 `openstoryline_rendering / 50%`，可能导致远端 worker 阻塞。
- 本机尝试 `ssh -o BatchMode=yes mdeploy@43.160.208.189` 失败，返回 `Permission denied (publickey,password)`，因此本轮无法读取远端容器日志。

## 下一步建议

1. 登录轻量服务器 `openstoryline-test-sg`。
2. 进入 `/srv/jingjing-video-worker`。
3. 执行 `docker compose ps`，确认 `video-worker` 和 `openstoryline-engine` 是否运行。
4. 查看日志：
   - `docker compose logs --tail=200 video-worker`
   - `docker compose logs --tail=200 openstoryline-engine`
5. 如果 worker 仍卡旧任务或不再轮询，执行 `docker compose restart video-worker`。
6. 重启后继续观察 job `6fd28e7b-507c-400a-bee4-c81dd7c37556` 是否进入：
   - `claimed`
   - `downloading_inputs`
   - `openstoryline_rendering`
   - `uploading_outputs`
   - `succeeded`
7. 若任务失败，优先看 `failureReason` 和 `logPayload.steps`，再决定是 COS 下载、OpenStoryline 渲染、输出校验还是输出上传问题。

## 改动文件

- `docs/test/2026-05-10-v2.4-retrieval-routing-click-test.md`
- `docs/handoff/2026-05-10-video-material-render-worker-handoff.md`

## Branch / commit

- Branch: `codex/rag-material-retrieval-prd`
- 测试文档提交：`5dfaf95 Document video material render smoke`
- Handoff 提交：见远端分支最新提交和本轮最终答复

## Push / merge 状态

- 测试文档提交已 push 到 `origin/codex/rag-material-retrieval-prd`
- 本 handoff 随本轮后续提交继续 push
- 未 merge
