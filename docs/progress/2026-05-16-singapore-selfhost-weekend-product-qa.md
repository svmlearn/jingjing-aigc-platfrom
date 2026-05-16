# 2026-05-16 Singapore self-hosted weekend product QA

## 结论

本轮在新加坡 Tencent Cloud self-hosted staging 上完成了主产品链路 QA。核心商家端链路已经能在 PostgreSQL + Tencent COS + self-hosted worker 上闭环：

- owner login/session: PASS
- owner invite code + member accept: PASS
- 内容日历到 Dify mock 批量生成: PASS
- member weekly/today tasks: PASS
- COS upload intent + actual COS upload + media complete: PASS
- video_edit_jobs API contract: PASS
- worker fast path: PASS
- normal FireRed no-voiceover: PASS
- result preview / dynamic COS re-signing: PASS

不能声明完成的部分：

- 不能写 `DOMESTIC_PHASE1_E2E_PASS`。
- 不能声明 Aliyun OSS 已实现或已验证。
- 不能声明 TTS/voiceover 通过。
- 咨询、知识库、Agent 控制台在当前 self-hosted 上只是页面/API + in-memory fallback smoke，不是 PostgreSQL 持久化完成。
- 没有切 `ba-ba-ke.com`，没有启动 ICP。

## 环境

- Branch: `codex/domestic-infra-migration`
- Remote current release: `/srv/jingjing-selfhost-rehearsal/releases/20260516T054650Z-e28791c-clean`
- App public URL: `http://43.160.208.189`
- App service: `jingjing-selfhost-app.service`
- Worker service: `jingjing-worker-compose.service`
- App container: `jingjing-selfhost-app`
- DB container: `jingjing-selfhost-pg`
- Worker containers: `video-worker`, `openstoryline-engine`, `firered-openstoryline`

## 基础预检

`GET http://43.160.208.189/api/health`：

- app status: `ok`
- database status: `ok`
- database provider: `postgres`
- COS status: `configured`
- bucket: `jj-content-staging-1341668543`
- region: `ap-singapore`

`node scripts/check-domestic-app-env.mjs --require-video-chain-test-entrypoint`:

- status: `ok`
- `DATABASE_PROVIDER=postgres`
- `VIDEO_CHAIN_TEST_ENTRYPOINT_ENABLED=enabled`
- required app tables present: yes
- COS env present: yes

DB audit:

- public tables: 18 core tables
- extensions: `pgcrypto`, `plpgsql`
- no `vector`, no `knowledge_*`, no `consultation_*`, no `agent_*`

## Smoke Results

### COS roundtrip

Command path: `node scripts/check-domestic-cos-roundtrip.mjs --prefix codex-weekend-qa`

Result:

- status: `ok`
- key: `codex-weekend-qa/52bc601c-bf07-447f-bb5c-ee035b6b8887.txt`
- signed download status: `200`
- bytes: `32`
- deleted: `true`

### Owner/team/member/content-generation

Used temporary app container on `127.0.0.1:3003` with `DIFY_MOCK_FINAL_RESULT_JSON`.

Script: `node scripts/check-domestic-main-integration-smoke.mjs --base-url http://127.0.0.1:3003 --date 2026-05-16`

Result:

- status: `ok`
- team before: `200`
- invitation create: `201`
- member accept: `201`
- team after: `200`
- active member count: `1`
- batch status: `202`
- batch id: `866b26f0-2877-4ff1-a87e-5ac0e0e16805`
- batch DB status: `completed`
- total jobs: `4`
- succeeded jobs: `4`
- failed jobs: `0`
- member job id: `0d18c304-1eea-4ad8-895a-0293c416614c`
- member read: `200`
- member article generation: `succeeded`
- member video generation: `succeeded`

This verifies the owner invite, member accept, batch creation, Dify mock `run-next`, draft/variant writeback, and member task read path on PostgreSQL.

### Video API contract

Script: `node scripts/check-domestic-video-chain-api-smoke.mjs --base-url http://43.160.208.189 --with-upload-intent`

Result:

- status: `ok`
- login: `303`
- test draft: `201`
- upload intent: `201`
- upload credentials present: `true`
- media complete: `201`
- job create: `201`
- job id: `2ef87fe2-55c1-40d6-af1f-cbf3b18b37e6`
- render mode: `asset_driven`
- input asset count: `1`
- persisted payload inspected: `true`

Note: this API smoke intentionally does not upload bytes to COS. During this run, the worker briefly claimed the contract-only job before the manual marker step because the first parser command failed on the host. The worker saw COS `NoSuchResource`, which is expected for a no-bytes API-only job. Final DB state was corrected to:

- status: `failed_manual`
- current stage: `api_smoke_contract_only`
- failure reason: `API smoke contract-only job intentionally stopped before worker.`

### Worker fast path

Script: `node scripts/check-domestic-video-chain-worker-smoke.mjs --base-url http://43.160.208.189 --file /tmp/jingjing-worker-smoke.mp4 --timeout-seconds 180 --poll-seconds 3 --self-hosted-fast-path`

Result:

- status: `ok`
- job id: `6030106e-c6b5-481c-b69f-dc2d3843ea3b`
- final status: `succeeded`
- final stage: `completed`
- result asset count: `1`
- preview status: `200`
- preview bytes: `3693`
- self-hosted fast path: `true`

This verifies actual app upload intent, COS upload, `/api/media/complete`, worker download, worker output upload, `asset_objects` result writeback, and preview re-signing.

### Normal FireRed no-voiceover

Script extension added locally: `app/scripts/check-domestic-video-chain-worker-smoke.mjs` now accepts:

- `--instruction-text`
- `--production-config-json`

Remote run used a temporary copy of the script in the app container and removed it after completion.

Production config:

```json
{
  "voiceover": { "enabled": false },
  "bgm": { "enabled": false },
  "subtitles": { "enabled": false },
  "render": {
    "aspectRatio": "9:16",
    "includeOriginalAudio": true
  }
}
```

Result:

- status: `ok`
- job id: `3d5324b1-f79b-4615-bb82-d8e6b565768b`
- final status: `succeeded`
- final stage: `completed`
- result asset count: `3`
- preview status: `200`
- preview bytes: `29436`
- self-hosted fast path: `false`
- production config provided: `true`

This proves the normal FireRed/OpenStoryline rendering trunk can complete when voiceover/TTS, BGM, and subtitles are explicitly disabled.

### TTS / voiceover risk

Current worker TTS env evidence:

- `OPENSTORYLINE_TTS_PROVIDER=minimax`
- `TTS_MINIMAX_BASE_URL=https://api.minimax.chat/v1/t2a_v2`
- `TTS_MINIMAX_API_KEY=configured`
- `TTS_MINIMAX_GROUP_ID=missing`
- `TTS_MINIMAX_VOICE_ID=missing`
- `TTS_MINIMAX_MODEL=missing`
- `TTS_BYTEDANCE_BIGTTS_APPID=missing`
- `TTS_BYTEDANCE_BIGTTS_ACCESS_KEY=missing`
- `TTS_BYTEDANCE_BIGTTS_RESOURCE_ID=missing`

Existing voiceover evidence:

- job `c52a9c02-2e8c-4dbb-8699-2c6c5fca6dc5`
- status: `failed_manual`
- current stage: `normal_firered_tts_param_inference_timeout_observed`
- prior logs show BigTTS config incomplete, fallback to bytedance, and a bytedance 401/3001 grant error on an earlier run.

Conclusion: TTS/voiceover remains a separate blocker. It must not block the no-voiceover normal trunk result, but it also must not be marked passed.

### Consultation / RAG / knowledge / Agent console

Minimal smoke on `jingjing-selfhost-app`:

- login: `303`
- `/dashboard/consultation`: `200`
- `GET /api/consultation/sessions`: `200`, session count initially `0`
- `POST /api/consultation/sessions`: `201`
- `POST /api/consultation/sessions/[id]/messages`: `200`, processing `completed`, message count `3`, event count `11`
- `GET /api/consultation/experts`: `200`, count `1`
- `GET /api/merchant-knowledge/documents`: `200`
- `POST /api/merchant-knowledge/documents` with `action=memory`: `201`, status `indexed`, chunk count `1`
- `GET /api/platform-admin/agents`: `200`, agent count `1`, route binding count `1`
- `/platform-admin/agents`: `200`

Important classification:

- These surfaces open and work as a demo/in-memory path because Supabase is intentionally empty in domestic phase1.
- self-hosted PostgreSQL does not contain consultation, knowledge, Agent, or vector tables.
- Knowledge create/list success here is not PostgreSQL persistence; it is in-process fallback state.
- Vector search is not migrated: no `vector` extension and no `match_knowledge_chunks`.

## OSS / storage status

Verified:

- Tencent COS `ap-singapore` direct upload and signed read.
- Worker input download from Tencent COS.
- Worker output upload to Tencent COS.
- App dynamic re-signing for result preview.

Not verified:

- Aliyun OSS.
- Mainland bucket behavior.
- Multi-provider runtime selection.

Aliyun OSS work in this round is design-only and recorded in `docs/架构规范/2026-05-16-storage-provider-adapter-plan.md`.

## Remaining risks

1. Real browser/mobile e2e is still not covered by this round.
2. Real Dify provider was not called; Dify path used mock final JSON.
3. TTS/voiceover is blocked by incomplete provider credentials/runtime configuration.
4. Consultation/knowledge/Agent console need PostgreSQL schema + repository migration before they can be claimed self-hosted durable.
5. Vector RAG requires either self-hosted pgvector migration or a different vector store decision.
6. Aliyun OSS is not implemented; Tencent COS validation must not be treated as OSS validation.

## Push / merge / long-task

- Push: no.
- Merge to `main`: no.
- `DOMESTIC_PHASE1_E2E_PASS`: not written.
- `.codex/long-task`: not marked complete.
- Final commit: pending local commit at time of initial writing.
