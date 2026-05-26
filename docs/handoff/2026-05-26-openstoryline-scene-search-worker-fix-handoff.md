# 2026-05-26 OpenStoryline scene search worker fix handoff

## 当前目标

在本地分支 `codex/5.26.1.worker-fix` 上完成 worker scene search 修复，commit 后推送到 Gitee 远端 `5.23-worker-fix`，等待用户验证。不要直接热更新服务器，不要切 release。

## 已完成内容

- FireRed prompt 改为中文短调度 prompt，引导按分镜 `search_media.search_keyword` 检索后再 `load_media`。
- FireRed interceptor 增加锁定脚本 + `materialContext.sceneAssetQueries` 的 scene search coverage 门禁。
- `load_media` 合并同一 session 内全部 `search_media` 历史 payload。
- `search_media` 结果记录 `search_keyword` 和 `scene_search.result_count`，允许 0 结果也被识别为“已搜过”。
- `generate_script` 前校验商家 B-roll 分镜对应素材组数量，不足时抛 `scene_material_insufficient`。
- worker 将 `scene_material_insufficient` 映射为 `failed_manual` 和同名 failure code。
- `dailyTaskId` 从创建 job 请求进入 `input_payload.materialContext.dailyTaskId`，并做 merchant/user/draft/variant 校验。
- worker 进度态更新不覆盖终态 job。
- `.gitignore` 忽略 `/jingjing-*.tar`。
- 已补 progress 记录：`docs/progress/2026-05-26-openstoryline-scene-search-worker-fix.md`。

## 改动文件

- `.gitignore`
- `app/src/components/dashboard/draft-video-panels.tsx`
- `app/src/components/member/member-workspace.tsx`
- `app/src/contracts/video.ts`
- `app/src/lib/ui/video-workflow.ts`
- `app/src/server/api/schemas.ts`
- `app/src/server/api/video-edit-jobs-service.ts`
- `app/src/server/api/video-edit-jobs-service-contract.test.ts`
- `workers/video-worker/openstoryline/app/engine_adapters.py`
- `workers/video-worker/openstoryline/firered/src/open_storyline/mcp/hooks/node_interceptors.py`
- `workers/video-worker/openstoryline/firered/src/open_storyline/nodes/core_nodes/search_media.py`
- `workers/video-worker/openstoryline/firered/src/open_storyline/storage/agent_memory.py`
- `workers/video-worker/tests/test_firered_node_interceptors.py`
- `workers/video-worker/tests/test_openstoryline_engine_adapters.py`
- `workers/video-worker/tests/test_status_contract.py`
- `workers/video-worker/worker/app/db.py`
- `workers/video-worker/worker/app/processor.py`

## 验证结果

- Worker focused tests：`103 passed`。
- App contract tests：`6 passed`，使用本地测试密钥 `PRIVATE_MEDIA_DOWNLOAD_TOKEN_SECRET`。
- App typecheck：通过。

## 当前状态

- Worktree：`D:\codexplan\jingjingstart-codex-5.26.1-worker-fix`
- Branch：`codex/5.26.1.worker-fix`
- Commit：待本轮提交生成
- Push：待推送到 Gitee `5.23-worker-fix`
- Merge / release：未执行，等待用户验收后再由服务器组 release。

