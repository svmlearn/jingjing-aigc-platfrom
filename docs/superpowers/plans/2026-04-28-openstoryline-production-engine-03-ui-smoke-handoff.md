# OpenStoryline Production UI Smoke And Handoff Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose basic production controls in the platform UI, add FireRed smoke verification, and write the final progress and handoff records for the first production-engine slice.

**Architecture:** Keep the UI compact and operational, not a marketing surface. The UI sends structured `productionConfig`; smoke tests verify adapter payload shape without requiring live provider calls; handoff records what is and is not server-verified.

**Tech Stack:** React, Next.js, TypeScript, Tailwind-style classes, Python unittest, Docker Compose, Markdown.

---

## Scope

This file is execution slice 3 of 3. It covers the master plan's Task 6 through
Task 8. It should run after slice 2 because the API and worker must already
accept `productionConfig`.

## Files

- Modify: `app/src/components/dashboard/draft-video-panels.tsx`
- Modify: `app/src/components/merchant/video-workbench.tsx`
- Modify: `app/src/lib/ui/video-workflow.ts`
- Modify: `workers/video-worker/README.md`
- Add: `workers/video-worker/tests/test_firered_payload_smoke.py`
- Add: `docs/progress/2026-04-28-openstoryline-production-engine-progress.md`
- Add: `docs/handoff/2026-04-28-openstoryline-production-engine-handoff.md`

---

### Task 1: Add Structured Production Controls

**Files:**
- Modify: `app/src/components/dashboard/draft-video-panels.tsx`
- Modify: `app/src/components/merchant/video-workbench.tsx`
- Modify: `app/src/lib/ui/video-workflow.ts`

- [ ] **Step 1: Add client payload support**

In `app/src/lib/ui/video-workflow.ts`, add a local
`ProductionConfigPayload` type with voiceover, BGM, subtitles, and render
fields. Extend `createVideoEditJob` params with:

```ts
productionConfig?: ProductionConfigPayload | null;
```

Add both request keys:

```ts
productionConfig: payload.productionConfig ?? null,
production_config: payload.productionConfig ?? null,
```

- [ ] **Step 2: Add draft panel state**

In `app/src/components/dashboard/draft-video-panels.tsx`, add state near
`instructionText`:

```tsx
const [voiceoverEnabled, setVoiceoverEnabled] = useState(true);
const [voiceoverProvider, setVoiceoverProvider] = useState<"bytedance_bigtts" | "minimax" | "302">("bytedance_bigtts");
const [bgmEnabled, setBgmEnabled] = useState(true);
const [bgmRequest, setBgmRequest] = useState("");
const [includeOriginalAudio, setIncludeOriginalAudio] = useState(false);
```

Add `buildProductionConfig()` returning:

```tsx
{
  voiceover: { enabled: voiceoverEnabled, provider: voiceoverProvider, volume: 2 },
  bgm: { enabled: bgmEnabled, userRequest: bgmRequest.trim(), include: {}, exclude: {}, volume: 0.25 },
  subtitles: { enabled: true, style: "platform_default" as const },
  render: { aspectRatio: "9:16" as const, includeOriginalAudio },
}
```

Pass it into `createVideoEditJob`.

- [ ] **Step 3: Add compact draft panel controls**

Place a compact bordered control group above the existing supplementary
instruction textarea. It should include:

- checkbox: generate voiceover
- select: `bytedance_bigtts`, `minimax`, `302`
- checkbox: configure BGM
- text input for BGM request
- checkbox: preserve original audio

Use restrained classes already present in the component, such as
`rounded-md`, `border-[#dde3ea]`, `text-sm`, and fixed `h-9` controls.

- [ ] **Step 4: Mirror minimal controls in video workbench**

In `app/src/components/merchant/video-workbench.tsx`, add:

```tsx
const [voiceoverProvider, setVoiceoverProvider] = useState<"bytedance_bigtts" | "minimax" | "302">("bytedance_bigtts");
const [bgmRequest, setBgmRequest] = useState("");
```

Pass this in `createVideoJob`:

```tsx
productionConfig: {
  voiceover: { enabled: true, provider: voiceoverProvider, volume: 2 },
  bgm: { enabled: true, userRequest: bgmRequest || extraRequirement, include: {}, exclude: {}, volume: 0.25 },
  subtitles: { enabled: true, style: "platform_default" },
  render: { aspectRatio: "9:16", includeOriginalAudio: false },
},
```

Add a small provider select and BGM input near the existing production
requirements fields.

- [ ] **Step 5: Run app checks**

Run:

```powershell
cd app
pnpm lint
pnpm typecheck
```

Expected: lint and typecheck pass.

- [ ] **Step 6: Commit**

Run:

```powershell
git add app\src\components\dashboard\draft-video-panels.tsx `
  app\src\components\merchant\video-workbench.tsx `
  app\src\lib\ui\video-workflow.ts
git commit -m "feat: add video production controls"
```

---

### Task 2: Add FireRed Payload Smoke

**Files:**
- Modify: `workers/video-worker/README.md`
- Add: `workers/video-worker/tests/test_firered_payload_smoke.py`

- [ ] **Step 1: Add payload-only smoke test**

Create `workers/video-worker/tests/test_firered_payload_smoke.py`. It should
construct `Settings(engine_adapter="fire_red", tts_provider="minimax",
tts_minimax_api_key="minimax-secret", ...)`, call `adapter.run(RunRequest(...,
production_config={...}))` with `httpx.post` mocked, and assert:

```python
self.assertEqual("minimax", payload["service_config"]["tts"]["provider"])
self.assertEqual("minimax-secret", payload["service_config"]["tts"]["minimax"]["api_key"])
self.assertEqual("light upbeat", payload["production_config"]["bgm"]["user_request"])
```

This test must not start Docker or call real providers.

- [ ] **Step 2: Run smoke test**

Run:

```powershell
$env:PYTHONPATH='D:\codexplan\work\jingjing-content-platform-openstoryline-prod\workers\video-worker'
python -m unittest workers\video-worker\tests\test_firered_payload_smoke.py -v
```

Expected: test passes.

- [ ] **Step 3: Add manual server smoke instructions**

Append a `FireRed production smoke` section to `workers/video-worker/README.md`
with:

```bash
cp .env.example .env
# Fill SUPABASE_DB_URL, COS credentials, FIRERED_PROVIDER_KEY,
# OPENSTORYLINE_LLM_*, OPENSTORYLINE_VLM_*, and selected TTS_* fields.
docker compose --profile firered up --build
```

Then include health verification:

```bash
docker compose exec openstoryline-engine python - <<'PY'
import urllib.request, json
print(json.dumps(json.loads(urllib.request.urlopen("http://127.0.0.1:8000/health").read()), indent=2))
PY
```

Expected health values:

- `engine_adapter` is `fire_red`
- `fire_red_base_url_configured` is `true`
- `fire_red_provider_key_configured` is `true`

Add final audio verification:

```bash
ffprobe -v error -select_streams a -show_entries stream=codec_type -of csv=p=0 /srv/jingjing-video-worker/outputs/<job-id>/final.mp4
```

Expected output contains `audio`.

- [ ] **Step 4: Run worker tests**

Run:

```powershell
$env:PYTHONPATH='D:\codexplan\work\jingjing-content-platform-openstoryline-prod\workers\video-worker'
python -m unittest discover -s workers\video-worker\tests -v
```

Expected: all worker tests pass.

- [ ] **Step 5: Commit**

Run:

```powershell
git add workers\video-worker\README.md workers\video-worker\tests\test_firered_payload_smoke.py
git commit -m "test: add firered production payload smoke"
```

---

### Task 3: Final Verification And Handoff

**Files:**
- Add: `docs/progress/2026-04-28-openstoryline-production-engine-progress.md`
- Add: `docs/handoff/2026-04-28-openstoryline-production-engine-handoff.md`

- [ ] **Step 1: Run app verification**

Run:

```powershell
cd app
node --test src\server\api\video-job-payload.test.ts
pnpm lint
pnpm typecheck
```

Expected: all pass.

- [ ] **Step 2: Run worker verification**

Run from repo root:

```powershell
$env:PYTHONPATH='D:\codexplan\work\jingjing-content-platform-openstoryline-prod\workers\video-worker'
python -m unittest discover -s workers\video-worker\tests -v
```

Expected: all pass.

- [ ] **Step 3: Write progress record**

Create `docs/progress/2026-04-28-openstoryline-production-engine-progress.md`
with completed items, exact verification commands, pass/fail results, and a
section titled `Not Yet Verified` that lists:

- real FireRed provider call with live LLM/VLM/TTS credentials
- real BGM resource selection from mounted `resource/bgms`
- end-to-end COS upload from a live `video_edit_jobs` row

- [ ] **Step 4: Write handoff**

Create `docs/handoff/2026-04-28-openstoryline-production-engine-handoff.md`
with:

- goal
- branch and worktree
- changed files summary
- final commit hash
- tests run
- whether live FireRed smoke was run
- required server inputs
- explicit `push / merge` status

- [ ] **Step 5: Commit docs**

Run:

```powershell
git add docs\progress\2026-04-28-openstoryline-production-engine-progress.md `
  docs\handoff\2026-04-28-openstoryline-production-engine-handoff.md
git commit -m "docs: record openstoryline production integration"
```

- [ ] **Step 6: Report final status**

The final report must include:

- branch name
- final commit hash
- tests run and results
- files changed summary
- whether real FireRed server smoke was run
- remaining server-only prerequisites

