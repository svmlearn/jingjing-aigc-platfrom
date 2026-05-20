# 2026-05-16 CASE-003 真实链路 Handoff

## 当前目标

验证 `docs/test/2026-05-15-video-script-completeness-test-cases.md` 的 CASE-003，要求走真实远端链路：

- 不使用 skeleton / 占位产物。
- 不在本地用 FFmpeg 生成最终成片。
- 不 push、不 merge。
- 克隆配音必须走 RunningHub `pixelle_clone` 工作流。
- 口播素材原声必须静音，再叠加克隆配音。
- 最终真实产物落本地。

## 当前结果

已跑通。

- Job ID: `affac3f4-e4ab-4ea0-abad-29038dae4a60`
- Supabase status: `succeeded`
- Final stage: `completed`
- 完成时间：`2026-05-16 18:13:35 +08:00`
- 成片时长：`48.488s`
- 商家：`孟的小店`
- merchant_id: `20718e4e-2853-4dc8-bebe-30c0ace47857`

## 服务器运行时间摘要

处理耗时：36分31秒
成片时长：48.488秒
分辨率：608x1080
最终成片：output_9452c8de_1778926259435.mp4

## 本地结果目录

正式结果只认 2026-05-16 包：

```text
D:\Desktop\测试素材\cos素材库入库包_20260516\metadata\case_003_artifacts
```

关键文件：

- `cos\final.mp4`
- `cos\cover.jpg`
- `cos\subtitles.srt`
- `cache\render_output.mp4`
- `voiceover\voiceover_0001_1778924810782.wav` 到 `voiceover_0006_1778924810782.wav`
- `evidence\compose_logs_since_0935Z.txt`
- `evidence\filtered_route_logs.txt`
- `case_003_real_result_summary.md`

哈希重点：

- `cos\final.mp4`: `2E003564CECF1EDDEB7A4D1492C51E7BC9FFCFB5CC6872052CBE90C7392DDEEC`
- `cache\render_output.mp4`: `2E003564CECF1EDDEB7A4D1492C51E7BC9FFCFB5CC6872052CBE90C7392DDEEC`

两者一致，说明本地 COS 下载结果和远端 Firered 渲染缓存为同一个真实成片。

## 5.15 / 5.16 分离说明

20260515 和 20260516 是两个独立素材包。

过程中曾有一轮下载误把 25 个当前 5.16 job 文件写入：

```text
D:\Desktop\测试素材\cos素材库入库包_20260515\metadata\case_003_artifacts
```

已移动到 5.16 的审计目录，未删除：

```text
D:\Desktop\测试素材\cos素材库入库包_20260516\metadata\case_003_artifacts\_misdrop_removed_from_20260515
```

复核结论：

- 5.15 当前目录里当前 job id `affac3f4-e4ab-4ea0-abad-29038dae4a60` 引用数为 `0`。
- 5.15 当前目录剩余文件数为 `14`。
- 审计文件：`_misdrop_removed_from_20260515\cleanup_manifest.json`

## 素材来源结论

本次 job 归属商家为 `孟的小店`，但输入素材里有两类 owner / 前缀：

- 口播素材：`draft-inputs/00000000-0000-4000-8000-000000000001/case-003/intro-koubo-1.mp4` 和 `outro-koubo-2.mp4`
- 中间非口播 B-roll：`merchant-media/00000000-0000-4000-8000-000000000001/clips/...`
- 克隆参考音频：`voice-profiles/00000000-0000-4000-8000-000000000001/case-003/20260513_164427.m4a`

也就是说：job 的业务商家是 `孟的小店` / `20718e4e...`，但素材 COS key 使用 staging 测试 owner 前缀 `00000000-0000-4000-8000-000000000001`。这是测试数据归属不完全一致的问题，需要后续单独清理或在测试说明中固定解释。

## 克隆配音证据

输入配置：

- `voiceover.provider=pixelle_clone`
- `cloneEnabled=true`
- ref audio: `voice-profiles/00000000-0000-4000-8000-000000000001/case-003/20260513_164427.m4a`

运行日志：

- `storyline.generate_voiceover args` 使用 `provider='pixelle_clone'`
- RunningHub clone workflow ID: `1983718528991862786`
- 生成 `voiceover_0001` 到 `voiceover_0006`

## 口播静音证据

`evidence\render_video_1778926259.json` 与日志确认：

- `include_video_audio=false`
- `video_volume_scale=0`
- `audio_policy=mute_source_for_talking_head_voiceover`

## 废弃链路检查

运行日志计数：

- `pixelle_clone`: `3`
- `1983718528991862786`: `36`
- `1983513964837543938`: `0`
- `minmax/minimax`: `0`
- `rhart`: `0`
- `voice-clone`: `0`
- `/voice-clone`: `0`
- `Deprecated/deprecated`: `0`

源码 grep 范围 `workers/video-worker/openstoryline`、`workers/video-worker/worker`、`workers/video-worker/tests` 未发现 `rhart-audio`、`/voice-clone`、`voice-clone` 旧链路引用。

## 已写文档

- `docs/progress/2026-05-16-case-003-real-chain-result.md`
- `docs/handoff/2026-05-16-case-003-real-chain-handoff.md`
- `D:\Desktop\测试素材\cos素材库入库包_20260516\metadata\case_003_artifacts\case_003_real_result_summary.md`

## 当前 worktree 状态

当前分支 / worktree：

```text
孟_5.13_5.14
```

未 push、未 merge、未 commit。

当前 worktree 有大量未提交改动，包含 app 侧和 worker 侧。注意：

- app 侧多项改动看起来不是本轮 CASE-003 验证直接产生的，不能在后续收口时简单归为本轮工作。
- worker/OpenStoryline/Firered 侧包含本轮远端恢复和 CASE-003 真实链路相关改动。
- 新增文档为本轮确认新增。

主要 worker/OpenStoryline 相关变更文件包括：

- `workers/video-worker/openstoryline/app/config.py`
- `workers/video-worker/openstoryline/app/engine_adapters.py`
- `workers/video-worker/openstoryline/firered/config.toml`
- `workers/video-worker/openstoryline/firered/config.video_edit_engine.toml`
- `workers/video-worker/openstoryline/firered/src/open_storyline/mcp/hooks/node_interceptors.py`
- `workers/video-worker/openstoryline/firered/src/open_storyline/nodes/core_nodes/generate_voiceover.py`
- `workers/video-worker/openstoryline/firered/src/open_storyline/nodes/core_nodes/render_video.py`
- `workers/video-worker/openstoryline/firered/src/open_storyline/utils/pixelle_tts_adapter.py`
- `workers/video-worker/worker/app/processor.py`
- `workers/video-worker/tests/test_firered_generate_voiceover_contract.py`
- `workers/video-worker/tests/test_firered_node_interceptors.py`
- `workers/video-worker/tests/test_openstoryline_engine_adapters.py`
- `workers/video-worker/tests/test_processor_contract.py`

## 远端状态

远端服务器：

```text
43.160.208.189 / mdeploy
cd /srv/jingjing-video-worker
```

容器在 CASE-003 成功时为健康状态：

- `video-worker`
- `openstoryline-engine`
- `firered-openstoryline`

本次没有 push。远端部署属于手工恢复/重建后的运行态，后续若再 `docker compose build/up` 或从旧镜像重建，仍需注意不要覆盖当前补丁。

## 验证命令摘要

关键 Supabase 查询：

```powershell
cd D:\codexplan\personal\jingjing-content-platform\.worktrees\孟_5.13_5.14\app\supabase
supabase db query "select id::text, status, progress_pct, current_stage, failure_reason, updated_at, finished_at, result_payload->'outputs' as outputs, log_payload->'openstoryline_progress' as openstoryline_progress from public.video_edit_jobs where id = 'affac3f4-e4ab-4ea0-abad-29038dae4a60'::uuid;" --linked -o json --agent=no
```

关键本地复核：

- `cos\final.mp4` 与 `cache\render_output.mp4` SHA256 一致。
- 5.15 当前 job 引用数为 `0`。
- 5.16 包包含最终成片、cover、字幕、voiceover wav、route logs、manifest。

## 后续建议

1. 将 20260516 包作为本次 CASE-003 唯一验收依据，不要再引用 20260515 包。
2. 单独处理测试数据归属：job merchant 是 `孟的小店`，但素材 COS key 仍是 staging 测试 owner 前缀。
3. 若要合并代码，先单独梳理 app 侧改动和 worker 侧改动的来源，避免把非本轮改动一起收进去。
4. 若要重新部署，先确认远端容器内关键标记仍存在，防止旧镜像覆盖 `pixelle_clone` 和静音链路补丁。
