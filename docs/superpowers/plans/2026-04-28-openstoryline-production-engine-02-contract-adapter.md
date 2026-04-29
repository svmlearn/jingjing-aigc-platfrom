# OpenStoryline Production Contract And Adapter Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the structured `productionConfig` contract and map it from platform job creation through worker validation into FireRed OpenStoryline worker runs.

**Architecture:** The Next.js API creates a normalized `productionConfig` inside `video_edit_jobs.input_payload`. The Python worker validates and forwards that config to `openstoryline-engine`, and the FireRed adapter turns it into FireRed `service_config`, production prompt constraints, and render parameters.

**Tech Stack:** TypeScript, Zod, Node test runner, Python unittest, FastAPI, Pydantic, FireRed OpenStoryline.

---

## Scope

This file is execution slice 2 of 3. It covers the master plan's Task 2 through
Task 5. It should run after slice 1 because it relies on the runtime env surface
added there.

## Files

- Modify: `app/src/contracts/video.ts`
- Modify: `app/src/server/api/schemas.ts`
- Modify: `app/src/server/api/video-job-payload.ts`
- Modify: `app/src/server/api/video-job-payload.test.ts`
- Modify: `app/src/server/api/video-edit-jobs-service.ts`
- Modify: `workers/video-worker/worker/app/directive.py`
- Modify: `workers/video-worker/tests/test_directive_contract.py`
- Modify: `workers/video-worker/worker/app/openstoryline_client.py`
- Modify: `workers/video-worker/tests/test_openstoryline_contract_payload.py`
- Modify: `workers/video-worker/openstoryline/app/schemas.py`
- Modify: `workers/video-worker/openstoryline/app/config.py`
- Modify: `workers/video-worker/openstoryline/app/engine_adapters.py`
- Modify: `workers/video-worker/tests/test_openstoryline_engine_adapters.py`

---

### Task 1: Add Platform `productionConfig` Contract

**Files:**
- Modify: `app/src/contracts/video.ts`
- Modify: `app/src/server/api/schemas.ts`
- Modify: `app/src/server/api/video-job-payload.ts`
- Modify: `app/src/server/api/video-job-payload.test.ts`
- Modify: `app/src/server/api/video-edit-jobs-service.ts`

- [ ] **Step 1: Add failing payload tests**

Append tests to `app/src/server/api/video-job-payload.test.ts` covering:

```ts
test("buildVideoEditJobInputPayload adds default production config", () => {
  const payload = buildVideoEditJobInputPayload({
    draftId: "draft-1",
    variant: approvedVariant,
    materialReferences: [],
    assets: [],
    now: "2026-04-27T00:00:00.000Z",
  });

  assert.deepEqual(payload.productionConfig, {
    voiceover: { enabled: true, provider: "bytedance_bigtts", volume: 2 },
    bgm: { enabled: true, userRequest: "", include: {}, exclude: {}, volume: 0.25 },
    subtitles: { enabled: true, style: "platform_default" },
    render: { aspectRatio: "9:16", includeOriginalAudio: false },
  });
});
```

Also add override and invalid-provider tests matching the master plan. The
invalid-provider assertion must expect
`VIDEO_PRODUCTION_CONFIG_INVALID`.

- [ ] **Step 2: Run the failing app test**

Run:

```powershell
cd app
node --test src\server\api\video-job-payload.test.ts
```

Expected: failures mention missing `productionConfig` support.

- [ ] **Step 3: Add request types**

In `app/src/contracts/video.ts`, add:

```ts
export type VoiceoverProvider = "bytedance_bigtts" | "minimax" | "302";

export type ProductionConfig = {
  voiceover?: {
    enabled?: boolean;
    provider?: VoiceoverProvider;
    voiceStyle?: string | null;
    speed?: number | null;
    volume?: number | null;
  };
  bgm?: {
    enabled?: boolean;
    userRequest?: string | null;
    include?: Record<string, Array<string | number>>;
    exclude?: Record<string, Array<string | number>>;
    volume?: number | null;
  };
  subtitles?: {
    enabled?: boolean;
    style?: "platform_default" | "bold_caption";
  };
  render?: {
    aspectRatio?: "9:16";
    maxDurationSeconds?: number | null;
    includeOriginalAudio?: boolean;
  };
};
```

Extend `CreateVideoEditJobRequest` with:

```ts
productionConfig?: ProductionConfig | null;
```

- [ ] **Step 4: Accept `productionConfig` in API schema**

In `app/src/server/api/schemas.ts`, add schema objects for voiceover, BGM,
subtitles, and render, then add this field to `createVideoEditJobSchema`:

```ts
productionConfig: productionConfigSchema.nullish(),
```

Use these constraints:

- providers: `bytedance_bigtts`, `minimax`, `302`
- volume: `0` to `3`
- speed: `0.5` to `2`
- max duration: integer `15` to `180`
- render aspect ratio: literal `9:16`

- [ ] **Step 5: Normalize config in payload builder**

In `app/src/server/api/video-job-payload.ts`, add a
`normalizeProductionConfig` helper that returns:

```ts
{
  voiceover: { enabled: true, provider: "bytedance_bigtts", volume: 2 },
  bgm: { enabled: true, userRequest: "", include: {}, exclude: {}, volume: 0.25 },
  subtitles: { enabled: true, style: "platform_default" },
  render: { aspectRatio: "9:16", includeOriginalAudio: false },
}
```

when input is missing. It must throw `VideoJobPayloadValidationError` with
status `400` and code `VIDEO_PRODUCTION_CONFIG_INVALID` for unsupported
voiceover providers.

Extend `VideoEditJobInputPayload` with:

```ts
productionConfig: ReturnType<typeof normalizeProductionConfig>;
```

Extend `buildVideoEditJobInputPayload` input with:

```ts
productionConfig?: ProductionConfigInput | null;
```

Set the returned field:

```ts
productionConfig: normalizeProductionConfig(input.productionConfig),
```

- [ ] **Step 6: Pass config through service**

In `app/src/server/api/video-edit-jobs-service.ts`, pass
`input.request.productionConfig ?? null` into `buildServerManagedInputPayload`,
then into both branches of `buildVideoEditJobInputPayload`.

- [ ] **Step 7: Verify platform contract**

Run:

```powershell
cd app
node --test src\server\api\video-job-payload.test.ts
pnpm typecheck
```

Expected: test and typecheck pass.

- [ ] **Step 8: Commit**

Run:

```powershell
git add app\src\contracts\video.ts `
  app\src\server\api\schemas.ts `
  app\src\server\api\video-job-payload.ts `
  app\src\server\api\video-job-payload.test.ts `
  app\src\server\api\video-edit-jobs-service.ts
git commit -m "feat: add video production config contract"
```

---

### Task 2: Validate Production Config In The Worker

**Files:**
- Modify: `workers/video-worker/worker/app/directive.py`
- Modify: `workers/video-worker/tests/test_directive_contract.py`

- [ ] **Step 1: Add worker tests**

Append tests to `workers/video-worker/tests/test_directive_contract.py` that
verify:

- normalized provider `minimax`
- BGM `user_request`, `include`, `exclude`, and `volume`
- render `max_duration_seconds` and `include_original_audio`
- invalid provider `azure` raises `DirectiveValidationError` with
  `failure_code == "invalid_production_config"`

- [ ] **Step 2: Run the failing worker test**

Run:

```powershell
$env:PYTHONPATH='D:\codexplan\work\jingjing-content-platform-openstoryline-prod\workers\video-worker'
python -m unittest workers\video-worker\tests\test_directive_contract.py -v
```

Expected: failures mention missing `production_config`.

- [ ] **Step 3: Extend the directive**

In `workers/video-worker/worker/app/directive.py`, add allowed sets:

```python
ALLOWED_VOICEOVER_PROVIDERS = frozenset({"bytedance_bigtts", "minimax", "302"})
ALLOWED_SUBTITLE_STYLES = frozenset({"platform_default", "bold_caption"})
ALLOWED_BGM_FILTER_KEYS = frozenset({"mood", "scene", "genre", "lang", "id"})
```

Add `production_config: dict[str, Any]` to `ProductionDirective`, add it to
`to_payload`, and set it in `build_production_directive`.

- [ ] **Step 4: Add normalization helpers**

Add helpers that normalize:

- `voiceover.enabled`, `provider`, optional `voice_style`, `speed`, `volume`
- `bgm.enabled`, `user_request`, `include`, `exclude`, `volume`
- `subtitles.enabled`, `style`
- `render.aspect_ratio`, optional `max_duration_seconds`,
  `include_original_audio`

Invalid type, out-of-range number, unsupported filter key, or unsupported
provider must raise `DirectiveValidationError(...,
failure_code="invalid_production_config")`.

- [ ] **Step 5: Verify worker directive**

Run:

```powershell
$env:PYTHONPATH='D:\codexplan\work\jingjing-content-platform-openstoryline-prod\workers\video-worker'
python -m unittest workers\video-worker\tests\test_directive_contract.py -v
```

Expected: directive tests pass.

- [ ] **Step 6: Commit**

Run:

```powershell
git add workers\video-worker\worker\app\directive.py workers\video-worker\tests\test_directive_contract.py
git commit -m "feat: validate video production config in worker"
```

---

### Task 3: Forward Config Through The Engine Contract

**Files:**
- Modify: `workers/video-worker/openstoryline/app/schemas.py`
- Modify: `workers/video-worker/worker/app/openstoryline_client.py`
- Modify: `workers/video-worker/tests/test_openstoryline_contract_payload.py`
- Modify: `workers/video-worker/tests/test_engine_run_contract.py`

- [ ] **Step 1: Add transport assertions**

In `workers/video-worker/tests/test_openstoryline_contract_payload.py`, extend
the fake job payload with `productionConfig` and assert the captured engine
request contains:

```python
self.assertEqual("minimax", captured_payload["production_config"]["voiceover"]["provider"])
self.assertEqual("轻快", captured_payload["production_config"]["bgm"]["user_request"])
self.assertEqual(0.35, captured_payload["production_config"]["bgm"]["volume"])
self.assertTrue(captured_payload["production_config"]["render"]["include_original_audio"])
```

- [ ] **Step 2: Run the failing transport test**

Run:

```powershell
$env:PYTHONPATH='D:\codexplan\work\jingjing-content-platform-openstoryline-prod\workers\video-worker'
python -m unittest workers\video-worker\tests\test_openstoryline_contract_payload.py -v
```

Expected: `production_config` is missing.

- [ ] **Step 3: Add engine schema and client field**

In `workers/video-worker/openstoryline/app/schemas.py`, add to `RunRequest`:

```python
production_config: dict[str, Any] = Field(default_factory=dict)
```

In `workers/video-worker/worker/app/openstoryline_client.py`, add to the
payload:

```python
"production_config": directive.production_config,
```

- [ ] **Step 4: Add engine schema test**

In `workers/video-worker/tests/test_engine_run_contract.py`, add a test that
constructs `RunRequest(..., production_config={...})` and asserts the nested
provider and BGM request are preserved.

- [ ] **Step 5: Verify transport**

Run:

```powershell
$env:PYTHONPATH='D:\codexplan\work\jingjing-content-platform-openstoryline-prod\workers\video-worker'
python -m unittest workers\video-worker\tests\test_openstoryline_contract_payload.py workers\video-worker\tests\test_engine_run_contract.py -v
```

Expected: tests pass.

- [ ] **Step 6: Commit**

Run:

```powershell
git add workers\video-worker\openstoryline\app\schemas.py `
  workers\video-worker\worker\app\openstoryline_client.py `
  workers\video-worker\tests\test_openstoryline_contract_payload.py `
  workers\video-worker\tests\test_engine_run_contract.py
git commit -m "feat: forward production config to openstoryline engine"
```

---

### Task 4: Map Config Into FireRed Worker Runs

**Files:**
- Modify: `workers/video-worker/openstoryline/app/config.py`
- Modify: `workers/video-worker/openstoryline/app/engine_adapters.py`
- Modify: `workers/video-worker/tests/test_openstoryline_engine_adapters.py`

- [ ] **Step 1: Add adapter mapping assertions**

Extend `test_fire_red_adapter_posts_worker_run_payload_and_returns_outputs` with
a `production_config` object and assert:

```python
self.assertEqual("minimax", payload["production_config"]["voiceover"]["provider"])
self.assertEqual("minimax", payload["service_config"]["tts"]["provider"])
self.assertEqual("test-minimax-key", payload["service_config"]["tts"]["minimax"]["api_key"])
self.assertIn("generate_voiceover", payload["prompt"])
self.assertIn("select_bgm", payload["prompt"])
self.assertIn("render_video", payload["prompt"])
self.assertIn("轻快但不要吵", payload["prompt"])
```

- [ ] **Step 2: Run the failing adapter test**

Run:

```powershell
$env:PYTHONPATH='D:\codexplan\work\jingjing-content-platform-openstoryline-prod\workers\video-worker'
python -m unittest workers\video-worker\tests\test_openstoryline_engine_adapters.py -v
```

Expected: `service_config` or new `Settings` fields are missing.

- [ ] **Step 3: Add TTS settings**

In `workers/video-worker/openstoryline/app/config.py`, add fields for:

- `tts_provider`
- `tts_302_base_url`, `tts_302_api_key`
- `tts_minimax_base_url`, `tts_minimax_api_key`
- `tts_bytedance_bigtts_base_url`, `tts_bytedance_bigtts_uid`,
  `tts_bytedance_bigtts_appid`, `tts_bytedance_bigtts_access_key`,
  `tts_bytedance_bigtts_resource_id`, `tts_bytedance_bigtts_speaker`

Read them from the env names introduced in execution file 01.

- [ ] **Step 4: Build FireRed service config**

In `workers/video-worker/openstoryline/app/engine_adapters.py`, add
`_build_fire_red_service_config(settings, production_config)`. It must return:

- `{}` when voiceover is disabled
- `{"tts": {"provider": "minimax", "minimax": {...}}}` for `minimax`
- `{"tts": {"provider": "302", "302": {...}}}` for `302`
- `{"tts": {"provider": "bytedance_bigtts", "bytedance_bigtts": {...}}}` for
  default BigTTS

- [ ] **Step 5: Include production and service config in payload**

Change `_build_fire_red_run_payload` to accept `settings`, read
`request.production_config`, and set:

```python
"production_config": production_config,
"service_config": _build_fire_red_service_config(settings, production_config),
"prompt": _build_fire_red_prompt(request, desired_outputs, production_config),
```

Update the call site to pass `self._settings`.

- [ ] **Step 6: Strengthen prompt constraints**

Make `_build_fire_red_prompt` include:

```text
Required production nodes:
- Use generate_voiceover when productionConfig.voiceover.enabled is true.
- Use select_bgm when productionConfig.bgm.enabled is true.
- Use render_video as the final node and include BGM/TTS tracks according to productionConfig.

ProductionConfig:
<json>
```

- [ ] **Step 7: Verify adapter tests**

Run:

```powershell
$env:PYTHONPATH='D:\codexplan\work\jingjing-content-platform-openstoryline-prod\workers\video-worker'
python -m unittest workers\video-worker\tests\test_openstoryline_engine_adapters.py -v
```

Expected: tests pass.

- [ ] **Step 8: Commit**

Run:

```powershell
git add workers\video-worker\openstoryline\app\config.py `
  workers\video-worker\openstoryline\app\engine_adapters.py `
  workers\video-worker\tests\test_openstoryline_engine_adapters.py
git commit -m "feat: map production config to firered runs"
```

