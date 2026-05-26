# 2026-05-26 zhiluan1 CN material search handoff

## 当前目标

把 `zhiluan1` / `厂房宣传` 的视频任务跑通成片，并且满足本轮明确要求：

- 不热更新服务器。
- 先在本地分支修复和验证。
- commit 后 push 到 Gitee `5.26-worker-fix`。
- 再合并到本地 `main`，由本地 `main` 推 Gitee。
- 最后通过 clean release 发布到服务器组。
- FireRed/OpenStoryline 使用中文检索词找素材，不把中文标签翻译成英文。
- 只压短 2026-05-27 那天的脚本字幕/口播，降低视频时长和素材需求。

## 已完成内容

- app 侧不再把素材库候选、匹配计划或旧素材选择字段塞进 worker payload。
- worker payload 保留 `sceneAssetQueries`，检索词优先来自分镜里的中文 `materials` / `fallbackShot`。
- FireRed prompt 增加中文检索词规则，要求原样使用 `sceneAssetQueries[].query`。
- FireRed MCP hook 增加兜底：如果 agent 传了英文 query、tags、category 或 filter，会改回当前缺失分镜的中文检索词，并移除这些过滤参数。
- `patch-zhiluan1-restored-video-script-contract.mjs` 支持 `--task-date=2026-05-27`，用于只更新 5.27 那天的短字幕脚本。
- 测试已覆盖：
  - app payload 无 `merchantMediaMatches` / `assetMatchPlan`。
  - video job service 不再预选 merchant clips。
  - OpenStoryline prompt 包含中文检索词禁止翻译规则。
  - worker private `search_media` 会把英文 query 规范回中文 query。

## 改动文件

- `app/src/server/api/video-job-payload.ts`
- `app/src/server/api/video-edit-jobs-service.ts`
- `app/scripts/patch-zhiluan1-restored-video-script-contract.mjs`
- `app/src/server/api/video-job-payload.test.ts`
- `app/src/server/api/video-edit-jobs-service-contract.test.ts`
- `app/src/lib/private-media-workflow-fixture.test.ts`
- `workers/video-worker/openstoryline/app/engine_adapters.py`
- `workers/video-worker/openstoryline/firered/src/open_storyline/mcp/hooks/node_interceptors.py`
- `workers/video-worker/openstoryline/firered/src/open_storyline/nodes/node_schema.py`
- `workers/video-worker/tests/test_firered_node_interceptors.py`
- `workers/video-worker/tests/test_openstoryline_engine_adapters.py`
- `docs/progress/2026-05-26-zhiluan1-cn-material-search-release.md`
- `docs/handoff/2026-05-26-zhiluan1-cn-material-search-handoff.md`

## 验证结果

- App payload/service/private-media tests: `37` passed.
- App typecheck: passed.
- Worker/OpenStoryline/FireRed tests: `126` passed.
- Private media workflow fixture smoke test: `1` passed.
- Static no-prefetch scan: passed, no matches.
- `git diff --check`: passed.

## 当前状态

- Branch: `codex/merchant-material-prefetch-fix`.
- Commit: pending.
- Push: pending to Gitee `5.26-worker-fix`.
- Merge to local `main`: pending.
- Server clean release: pending.
- zhiluan1 2026-05-27 短字幕脚本应用: pending.
- zhiluan1 2026-05-27 成片验证: pending.

## 下一步

1. Commit current local branch.
2. Push to Gitee `5.26-worker-fix`.
3. Merge to local `main` and push `main`.
4. Do clean release, not hot update.
5. From the released code path, run `patch-zhiluan1-restored-video-script-contract.mjs --task-date=2026-05-27` dry-run and `--apply`.
6. Start a new `zhiluan1` / `厂房宣传` 2026-05-27 video job.
7. Verify logs show Chinese `search_media.search_keyword`.
8. Verify final output includes 成片 / `final_video`.
