# 2026-05-15 private-media-dify-full-run handoff

## 当前目标

继续 `docs/handoff/2026-05-14-cli-goal-private-media-dify-full-run.md` 的长任务，从当前 worktree diff 收口 Dify fixture、商家私有素材库、Pexels-compatible、60 天下载入口、个人克隆声音状态机、video worker / OpenStoryline 私有素材检索的本地可验证闭环。

## 已完成

- Dify `outputs.final_result_json` fixture adapter：
  - 解析 `article.*` / `video.*` / `quality.*`。
  - 映射 note + `video_script` variants。
  - blocked / schema failed 不创建可投产视频任务。
  - Dify 原始总包不直接进入 `video_edit_jobs.input_payload`。
  - `generateArticleDraftForUser` 已接 Dify fixture 主链路薄切片；feature flag on 时优先用 `DIFY_FINAL_RESULT_JSON_FIXTURE` / `DIFY_MOCK_FINAL_RESULT_JSON` / `DIFY_FINAL_RESULT_JSON`，feature flag off 或 provider/schema 失败时保留现有辅路。
  - Dify fixture 主链路复用现有 `createManualSourceItem` / `createDraftWithVariants`，不新增 Supabase 硬依赖。
- 商家素材上传完成合同：
  - COS provider / bucket / prefix / MIME 家族 / source 隔离。
  - voice profile audio 与 merchant media 分离。
- 商家素材处理 V1 合同：
  - 按 `ADR-MEDIA-SLICE-001` 使用确定性整段 clip。
  - MP4 raw merchant upload -> 1 条 `full_video` clip。
  - 图片 raw upload -> 1 条 `image` clip。
  - 不做自动分镜、不做固定窗口、不让 LLM / VLM 决定切点。
  - 标签 fixture / mock 必须显式 `tagSource`。
- 商家素材库 repository 合同：
  - 显式 `merchantId` 查询。
  - `assetId + clipIndex` V1 幂等。
  - 拒绝成员临时素材和 voice profile 音频进入 `merchant_media_*`。
- 商家素材库 migration 合同：
  - 新增 `merchant_media_assets` / `merchant_media_clips` migration。
  - `merchant_id` 索引、RLS、owner / active team member read policy。
  - `asset_id + clip_index` 唯一约束。
- Pexels-compatible fixture / route：
  - `/api/private-media/pexels/videos/search`
  - `/api/private-media/pexels/v1/search`
  - Pexels-like response，不暴露 COS key / bucket / internal tags / merchant_id。
  - `per_page` 上限和稳定分页。
- 60 天下载入口合同：
  - Pexels response 返回平台 download token URL。
  - token 有效不代表可下载；`archived` / `quarantined` / `missing_object` / 非 ready 会被拦截。
  - route 已改为服务端 302 重签入口。
- 私有素材 doctor 合同：
  - 检查 wrong_source、missing_thumbnail、missing_object、low_confidence_ready_clip、slice policy / boundary / duration gate、多 ready voice profile。
  - 追加等价阻断检查：public bucket、service role / COS secret 客户端泄漏、过期 pending upload、orphan COS object、COS object existence、provider cleanup backlog。
- 个人克隆声音本地状态机：
  - `pixelle_clone` 按当前代码作为 RunningHub clone 旧适配名。
  - mock provider success 后 swap，旧 profile 归档并生成 cleanup job。
  - mock provider failure 保留旧声音。
  - 跨用户拒绝。
- Worker / OpenStoryline：
  - OpenStoryline `search_media` 支持私有 Pexels-compatible base URL。
  - 私有 base URL 下不要求真实 Pexels API key。
  - RunningHub clone 语义继续使用 `pixelle_clone` 代码适配名，不当作第二个 provider。
  - 新增 app fixture-level workflow substitute：Dify fixture -> `video_script` -> shared worker payload builder -> private Pexels-compatible search -> 60 天 download token -> download 302 signer -> doctor clean gate。
- 成片预览 / 下载入口分离：
  - 平台内 preview 使用 `inline`。
  - 下载按钮使用 `attachment`。
- long-task gate 本地兼容：
  - 修复中文路径 / UTF-8 输出。
  - Windows 下 hard gate 命令优先用 PowerShell。
  - 本地 contract 从不可用 `pnpm` 改为当前机器可执行的 `npm` / 本地二进制 / Python 命令。
  - verifier prompt 改为 stdin 传入，避免 Windows 命令行过长。
  - hard gate app contract tests 已加入 Dify mainline helper / service 接线测试。

## 验证结果

已通过：

```powershell
cd app
node --test src/lib/dify-final-result-adapter.test.ts src/lib/private-media-pexels-adapter.test.ts src/server/api/private-media-pexels-service.test.ts src/lib/private-media-download-service-core.test.ts src/lib/media-upload-contract.test.ts src/lib/media-processing-contract.test.ts src/lib/merchant-media-library-contract.test.ts src/lib/merchant-media-repository-contract.test.ts src/lib/merchant-media-migration-contract.test.ts src/lib/private-media-doctor.test.ts src/lib/voice-profile-state-machine.test.ts src/lib/member-video-workflow.test.ts src/server/api/video-job-public-dto.test.ts src/server/api/video-job-payload.test.ts
.\node_modules\.bin\tsc --noEmit
npm run lint
npm run build
```

结果：

- app focused contract tests：原 `72` passed；加入 Dify mainline 后为 `81` passed；加入 workflow fixture / doctor blocker 后 hard gate 为 `83` passed。
- app typecheck：通过。
- app lint：通过。
- app build：通过。

已通过：

```powershell
cd workers/video-worker
python -m pytest tests/test_firered_search_media_private_base_url.py tests/test_firered_node_interceptors.py tests/test_openstoryline_engine_adapters.py tests/test_directive_contract.py tests/test_processor_contract.py
python -m py_compile openstoryline/app/config.py openstoryline/app/engine_adapters.py openstoryline/firered/agent_fastapi.py openstoryline/firered/src/open_storyline/agent.py openstoryline/firered/src/open_storyline/config.py openstoryline/firered/src/open_storyline/mcp/hooks/node_interceptors.py openstoryline/firered/src/open_storyline/nodes/core_nodes/search_media.py
```

结果：

- worker focused pytest：`51` passed。
- py_compile：通过。

长任务 hard gates：

最新 long-task 状态：

- `check.py --skip-verifier`：hard gates 已通过。
- `check.py`：已修复 verifier 命令行过长问题；上一轮 verifier 要求补 Dify 主链路接线，现已补 `app/src/lib/dify-content-generation-mainline.ts`、`app/src/server/api/content-generation-service.ts` 接线和对应测试。
- gate report：`.codex/long-task/gate-report.json`

## Mock / Real 记录

- Dify：使用 `final_result_json` fixture / adapter / mainline helper，未调用真实 Dify API；缺 `DIFY_API_KEY` / `DIFY_WORKFLOW_ID` 不阻塞。
- Supabase：migration + in-memory repository / contract tests，未把 Supabase app keys / service role 当 blocker。
- COS：upload/download 逻辑使用合同和 injected signer fixture；未做真实 COS upload / 302 target smoke。
- RunningHub clone：本地使用 mock provider 状态机；真实 key 在服务器 worker 环境，未因本机缺 key 停住。
- OpenStoryline：本地 pytest 验证私有 Pexels-compatible base URL；app fixture-level workflow substitute 验证私有素材 Pexels-like JSON、60 天 token、download 302 signer 和 doctor clean gate；未做真实服务器端私有素材下载 / 渲染 smoke。
- 本地素材：未读取 `D:\Desktop\测试素材`，未复制二进制进 git。该目录下 MP4 仍只可作为 raw merchant upload 输入，M4A 仍只可作为 raw user voice recording / ref audio 输入。

## 主要改动文件

- `.codex/skills/long-task-gate/scripts/common.py`
- `.codex/skills/long-task-gate/scripts/check.py`
- `app/src/lib/dify-final-result-adapter.ts`
- `app/src/lib/dify-content-generation-mainline.ts`
- `app/src/server/api/dify-content-generation-mainline-contract.test.ts`
- `app/src/server/api/content-generation-service.ts`
- `app/src/lib/media-upload-contract.ts`
- `app/src/lib/media-processing-contract.ts`
- `app/src/lib/merchant-media-library-contract.ts`
- `app/src/lib/merchant-media-repository-contract.ts`
- `app/src/lib/private-media-pexels-adapter.ts`
- `app/src/lib/private-media-pexels-service-core.ts`
- `app/src/lib/private-media-download-token.ts`
- `app/src/lib/private-media-download-service-core.ts`
- `app/src/lib/private-media-doctor.ts`
- `app/src/lib/private-media-workflow-fixture.test.ts`
- `app/src/lib/voice-profile-state-machine.ts`
- `app/src/server/api/private-media-pexels-service.ts`
- `app/src/app/api/private-media/**`
- `app/supabase/migrations/202605150001_voice_profile_current_replacement.sql`
- `app/supabase/migrations/202605150002_merchant_media_library.sql`
- `workers/video-worker/openstoryline/**`
- `workers/video-worker/tests/test_firered_search_media_private_base_url.py`
- `docs/progress/2026-05-15-*.md`

## 未完成 / 后续 smoke

- 真实 Dify API / workflow smoke。
- 真实 Supabase / staging DB migration apply 与双租户 RLS smoke。
- 真实 COS upload / post-upload validation / 302 signed read URL smoke。
- 真实 ffprobe / thumbnail generation / VLM tagging worker。
- 真实 RunningHub clone server-side smoke。
- 真实 OpenStoryline 从 private Pexels-compatible 下载私有素材并出片。

这些后续项需要真实环境或服务器侧 smoke；按当前 goal 更新后的规则，本轮已用 fixture / mock / local repository/provider interface 覆盖对应业务合同，不因缺本机 Dify/Supabase/RunningHub key 停住。OpenStoryline 真实下载 / 出片 smoke 记录为后续真实环境验证，本轮已用私有 base URL、fixture-level workflow substitute、fixture Pexels-compatible response、60 天下载 token、download 302 signer、doctor clean gate 和 worker payload 合同作为替代证据。

## 分支 / worktree

- Worktree：`D:\codexplan\personal\jingjing-content-platform\.worktrees\孟_5.13_5.14`
- 当前状态：未提交，待验收 / 后续真实 smoke。

## Push / Merge

- 未 commit。
- 未 push。
- 未 merge。
