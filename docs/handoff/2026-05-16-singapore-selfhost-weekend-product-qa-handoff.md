# 2026-05-16 Singapore self-hosted weekend product QA handoff

## 当前目标

使用新加坡腾讯云 self-hosted staging 系统验证最新 main + domestic 改造后的产品主流程，并把 Supabase-only / TTS / OSS 风险分层记录清楚。

本轮不是 Aliyun OSS 实现，也不是国内化完成宣告。

## Branch / worktree

- Worktree: `/Users/wy/Desktop/静境/静境4.0/jingjing-domestic-infra-migration`
- Branch: `codex/domestic-infra-migration`
- Push: no
- Merge: no
- Final commit: `7bcfe46 docs: record singapore selfhost product qa`

## 已完成

1. 完成产品面兼容矩阵：
   - `docs/progress/2026-05-16-singapore-selfhost-product-surface-audit.md`
2. 完成 weekend product QA 记录：
   - `docs/progress/2026-05-16-singapore-selfhost-weekend-product-qa.md`
3. 完成 OSS adapter 设计稿：
   - `docs/架构规范/2026-05-16-storage-provider-adapter-plan.md`
4. 小幅扩展 worker smoke 脚本：
   - `app/scripts/check-domestic-video-chain-worker-smoke.mjs`
   - 新增 `--instruction-text`
   - 新增 `--production-config-json`
   - 用于验证 normal no-voiceover FireRed 路径

## 关键验证结果

远端当前 release：

- `/srv/jingjing-selfhost-rehearsal/releases/20260516T054650Z-e28791c-clean`
- public URL: `http://43.160.208.189`

通过项：

- `/api/health`: PostgreSQL + COS configured
- app env check: ok
- COS roundtrip: ok
- owner login/session: ok
- merchant team invite: ok
- member accept invite: ok
- Dify mock batch generation: batch `866b26f0-2877-4ff1-a87e-5ac0e0e16805`, 4/4 succeeded
- member daily/weekly task read: ok
- video API smoke: job `2ef87fe2-55c1-40d6-af1f-cbf3b18b37e6`
- worker fast path: job `6030106e-c6b5-481c-b69f-dc2d3843ea3b`, preview 200
- normal FireRed no-voiceover: job `3d5324b1-f79b-4615-bb82-d8e6b565768b`, non-fast-path, result assets 3, preview 200
- consultation/knowledge/agent pages and APIs: minimal smoke ok as in-memory fallback

未通过 / 未声明：

- TTS/voiceover not passed
- Aliyun OSS not implemented or verified
- consultation/knowledge/agent console PostgreSQL persistence not migrated
- vector search / pgvector not present
- real browser/mobile e2e not run
- real Dify provider not run

## Supabase-only / mock-only 分层

self-hosted PostgreSQL 当前只有 18 张核心表，没有：

- `consultation_*`
- `knowledge_*`
- `agent_*`
- `knowledge_sets`
- `vector` extension
- `match_knowledge_chunks`

因此：

- 咨询会话 smoke 成功只说明 route/runtime fallback 可打开。
- 用户知识库 memory 创建成功只说明 in-memory fallback 可用。
- Agent console API/page 成功只说明 demo/fallback surface 可打开。
- 这些不能写成 PostgreSQL durable done。

## TTS 状态

当前 worker env：

- `OPENSTORYLINE_TTS_PROVIDER=minimax`
- Minimax API key configured
- Minimax group/voice/model missing
- BigTTS appid/access/resource/speaker missing

既有 voiceover job：

- `c52a9c02-2e8c-4dbb-8699-2c6c5fca6dc5`
- `failed_manual`
- `normal_firered_tts_param_inference_timeout_observed`

结论：normal no-voiceover trunk 已通过；voiceover/TTS 仍是单独 blocker。

## OSS 状态

已验证：

- Tencent COS `ap-singapore`
- app direct upload intent
- actual COS upload
- worker COS download
- worker COS output upload
- result preview dynamic re-signing

未验证：

- Aliyun OSS
- mainland bucket
- provider switching

设计文档已写，代码未实现。

## 本轮改动文件

- `app/scripts/check-domestic-video-chain-worker-smoke.mjs`
- `docs/progress/2026-05-16-singapore-selfhost-product-surface-audit.md`
- `docs/progress/2026-05-16-singapore-selfhost-weekend-product-qa.md`
- `docs/架构规范/2026-05-16-storage-provider-adapter-plan.md`
- `docs/handoff/2026-05-16-singapore-selfhost-weekend-product-qa-handoff.md`

## 验证命令摘要

- `node --check app/scripts/check-domestic-video-chain-worker-smoke.mjs`
- remote `GET /api/health`
- remote `node scripts/check-domestic-app-env.mjs --require-video-chain-test-entrypoint`
- remote `node scripts/check-domestic-cos-roundtrip.mjs --prefix codex-weekend-qa`
- remote Dify mock `node scripts/check-domestic-main-integration-smoke.mjs --base-url http://127.0.0.1:3003 --date 2026-05-16`
- remote `node scripts/check-domestic-video-chain-api-smoke.mjs --base-url http://43.160.208.189 --with-upload-intent`
- remote `node scripts/check-domestic-video-chain-worker-smoke.mjs --self-hosted-fast-path`
- remote temporary no-voiceover script with `--production-config-json`
- remote consultation/knowledge/platform-admin minimal Node smoke

## 下一步建议

1. 若要继续国内化完成门禁，先补 consultation/knowledge/agent PostgreSQL schema + repositories，或明确这些能力暂不纳入 Phase 1。
2. TTS 单独处理 provider 配置和最小 voiceover smoke，不要影响 no-voiceover trunk。
3. Aliyun OSS 先按 adapter plan 实现 provider-neutral interface，再做 OSS roundtrip 和 worker e2e。
4. 真实浏览器/手机端上传和预览仍需补一次手动或 Playwright 验证。
5. 用户确认后再决定是否合并；本轮默认不 push、不 merge。

## 禁止事项确认

- 未 push。
- 未 merge。
- 未写 `DOMESTIC_PHASE1_E2E_PASS`。
- 未标记 `.codex/long-task` complete。
- 未切 `ba-ba-ke.com`。
- 未启动 ICP。
- 未使用真实敏感用户媒体、真人自拍或 voice clone 素材。
