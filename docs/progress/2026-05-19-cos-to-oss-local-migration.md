# 2026-05-19 COS to OSS local migration progress

## Scope

This note records the local-only migration from Tencent COS production assumptions to Aliyun OSS defaults.

No server deployment, service restart, database mutation, push, or merge was performed.

## Completed locally

- App object-storage default is now `aliyun_oss`.
- Domestic app/worker smoke script defaults now target Aliyun OSS when no explicit provider is supplied.
- `asset_objects.storage_provider` baseline migration default is now `aliyun_oss`.
- New media upload completion rejects `tencent_cos`; new uploads must use Aliyun OSS.
- COS remains accepted only where needed for legacy/reference reads, such as existing result asset signing and voice-profile reference audio lookup.
- Video job payloads accept Aliyun OSS input assets and no longer infer every `draft-inputs/...` video as talking-head material.
- Talking-head classification now uses explicit structured fields first: `role`, `sceneType`, `tags`, `labels`, and `metadata`.
- Talking-head jobs default to original video audio plus Aliyun ASR subtitles:
  - `productionConfig.subtitles.talkingHeadSource = "asr_original_audio"`
  - `productionConfig.render.preserveTalkingHeadOriginalAudio = true`
  - `productionConfig.render.includeOriginalAudio = true`
- Structured talking-head assets now also trigger the original-audio ASR default, even when they do not use the draft-input path heuristic.
- Worker input/output storage fallback now follows configured `WORKER_STORAGE_PROVIDER`, defaulting to Aliyun OSS.
- OpenStoryline/FireRed ASR defaults now use `aliyun_paraformer`.
- Talking-head original-audio ASR is gated at adapter and FireRed interceptor levels:
  - provider must normalize to `aliyun_paraformer`
  - `ALIYUN_ASR_API_KEY` or `DASHSCOPE_API_KEY` is required
  - local FunASR fallback is rejected for this branch

## Validation

Passed:

```powershell
node --test app/src/server/api/video-job-payload.test.ts app/src/lib/media-upload-contract.test.ts
```

Result: 25 tests passed.

```powershell
$env:PYTHONPATH='.;openstoryline;openstoryline/firered/src'; python -m unittest discover -s tests -p 'test_processor_contract.py'
```

Result: 27 tests passed.

```powershell
$env:PYTHONPATH='.;openstoryline;openstoryline/firered/src'; python -m unittest discover -s tests -p 'test_openstoryline_engine_adapters.py'
```

Result: 25 tests passed.

```powershell
$env:PYTHONPATH='.;openstoryline;openstoryline/firered/src'; python -m unittest discover -s tests -p 'test_firered_node_interceptors.py'
```

Result: 15 tests passed.

```powershell
$env:PYTHONPATH='.;openstoryline;openstoryline/firered/src'; python -m unittest discover -s tests
```

Result: 117 tests passed.

```powershell
python -m compileall workers/video-worker/worker workers/video-worker/openstoryline/app workers/video-worker/openstoryline/firered/src/open_storyline
```

Result: passed.

```powershell
npm run typecheck --prefix app
```

Result: passed.

```powershell
npm run lint --prefix app
```

Result: passed with 14 existing unused-import warnings and 0 errors.

```powershell
npm run build --prefix app
```

Result: passed.

```powershell
git diff --check
```

Result: passed. Git printed Windows LF-to-CRLF working-copy warnings only.

## Known caveats

- `npm test --prefix app` was not used because the app has no `test` script.
- No real OSS/RDS/worker server smoke was run in this round.
- No deployment or service restart was performed.
- No push or merge was performed.
- The local tree still contains unrelated pre-existing untracked investigation files; they were left untouched.
